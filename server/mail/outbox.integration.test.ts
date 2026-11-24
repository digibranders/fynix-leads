import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLAIM_LEASE_SECONDS, MAX_SEND_ATTEMPTS } from "@/lib/email/backoff";
import type { EmailContent } from "@/lib/email/templates";
import { emailOutbox, invite } from "@/server/db/schema";
import { captureErrorText, queryAs } from "@/server/db/testing";
import { fynixWrite } from "@/server/domain/fynix-write";
import { openDomainRig } from "@/server/domain/testing";
import { cancelInviteMail, drainOutbox, enqueueEmail, outboxOn, purgeExpiredLinks, type QueuedEmail } from "@/server/mail/outbox";
import { FakeTransport } from "@/server/mail/testing";

/** The outbox state machine: pending, sent, failed and cancelled, the retry backoff, the link that never outlives its use, and two senders at once. */

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const ORIGIN = "https://leads.example";
const authDb = () => rig.dbs.roles.leads_auth.db;
const RESET: EmailContent = { template: "password_reset", params: { expiresInMinutes: 60 } };
const queue = (to: string, link: string | null = `https://leads.example/reset-password?token=link-for-${to}`, extra: Partial<QueuedEmail> = {}) =>
  enqueueEmail(rig.dbs.roles.leads_public.db, { to, content: RESET, link, ...extra });
const rows = () =>
  rig.dbs.owner.db
    .select({ recipient: emailOutbox.recipient, status: emailOutbox.status, attempts: emailOutbox.attempts, link: emailOutbox.link, lastError: emailOutbox.lastError, providerId: emailOutbox.providerId, sentAt: emailOutbox.sentAt, nextAttemptAt: emailOutbox.nextAttemptAt })
    .from(emailOutbox)
    .orderBy(emailOutbox.recipient);
const only = async () => {
  const all = await rows();
  expect(all).toHaveLength(1);
  const [row] = all;
  if (row === undefined) throw new Error("no row");
  return row;
};
/**
 * The sender's clock, fixed per test and five seconds ahead of the database's: a row is queued with `next_attempt_at = now()`
 * from the database, and a run that starts in the same millisecond with a clock read from the application could see it as
 * a hair in the future. Production does not care (the next run takes it); a test would flake.
 */
let start = new Date();
beforeEach(() => {
  start = new Date(Date.now() + 5_000);
});
const at = (offsetSeconds: number): (() => Date) => () => new Date(start.getTime() + offsetSeconds * 1000);
const drain = (transport: FakeTransport | null, offsetSeconds = 0, batchSize?: number) => drainOutbox(authDb(), transport, { origin: ORIGIN, now: at(offsetSeconds), batchSize });

describe("queueing", () => {
  it("writes a pending row: the content, a stored copy without the link, and the link in its own column", async () => {
    await queue("a@example.com");
    const [row] = await rig.dbs.owner.db.select().from(emailOutbox);
    expect(row).toMatchObject({ recipient: "a@example.com", template: "password_reset", status: "pending", attempts: 0, params: { expiresInMinutes: 60 }, subject: "Reset your Fynix Leads password", link: "https://leads.example/reset-password?token=link-for-a@example.com" });
    expect(row?.body).toContain("within 60 minutes");
    expect(row?.body).not.toContain("http");
  });

  it("is written by leads_public, which can add a message and not read, change or remove one", async () => {
    const db = rig.dbs.roles.leads_public.db;
    await queue("a@example.com");
    for (const statement of ["select link from email_outbox", "select * from email_outbox", "update email_outbox set link = null", "delete from email_outbox"]) {
      expect(await captureErrorText(queryAs(db, null, statement)), statement).toContain("permission denied for table email_outbox");
    }
  });

  it("is written by Fynix inside a transaction, which can read the state of the queue and never the link", async () => {
    await fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
      await enqueueEmail(tx, { to: "b@example.com", content: RESET, link: "https://leads.example/reset-password?token=t" });
      await audit({ action: "organisation.update", subject: { table: "organisation", id: rig.actor.userId } });
    });
    const scope = { orgId: null, userId: rig.actor.userId };
    expect(await queryAs(rig.dbs.roles.leads_fynix.db, scope, "select recipient, status, attempts from email_outbox")).toEqual([{ recipient: "b@example.com", status: "pending", attempts: 0 }]);
    expect(await captureErrorText(queryAs(rig.dbs.roles.leads_fynix.db, scope, "select link from email_outbox"))).toContain("permission denied for table email_outbox");
  });

  it("keeps a link on a pending row only: a row that is sent, failed or cancelled with a link is refused", async () => {
    await queue("a@example.com");
    for (const status of ["sent", "failed", "cancelled"] as const) {
      const message = await captureErrorText(rig.dbs.owner.db.update(emailOutbox).set({ status }));
      expect(message, status).toContain("email_outbox_link_only_while_pending");
    }
  });
});

describe("sending", () => {
  it("sends a due message with its link, and records the provider id, the time and no link", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport([{ ok: true, providerId: "brevo-1" }]);
    const result = await drain(transport);
    expect(result).toEqual({ purged: 0, claimed: 1, sent: 1, retrying: 0, failed: 0 });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ to: "a@example.com", subject: "Reset your Fynix Leads password" });
    expect(transport.sent[0]?.text).toContain("https://leads.example/reset-password?token=link-for-a@example.com");
    expect(transport.sent[0]?.html).toContain('href="https://leads.example/reset-password?token=link-for-a@example.com"');
    const row = await only();
    expect(row).toMatchObject({ status: "sent", attempts: 1, link: null, lastError: null, providerId: "brevo-1" });
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  it("sends an alias code, which has no link, and does not fail it for the missing link", async () => {
    await enqueueEmail(rig.dbs.owner.db, { to: "alias@example.com", content: { template: "alias_code", params: { displayName: "Alex Croft", code: "042917" } }, link: null });
    const transport = new FakeTransport([{ ok: true, providerId: "brevo-alias" }]);
    expect(await drain(transport)).toEqual({ purged: 0, claimed: 1, sent: 1, retrying: 0, failed: 0 });
    expect(transport.sent[0]?.text).toContain("042917");
    expect(await only()).toMatchObject({ status: "sent", lastError: null });
  });

  it("sends nothing twice: a second run finds nothing due", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport();
    await drain(transport);
    expect(await drain(transport)).toEqual({ purged: 0, claimed: 0, sent: 0, retrying: 0, failed: 0 });
    expect(transport.sent).toHaveLength(1);
  });

  it("holds a claimed message for the lease while it is being sent, and counts the attempt", async () => {
    await queue("a@example.com");
    let midSend: Awaited<ReturnType<typeof rows>>[number] | undefined;
    const transport = new FakeTransport([{ ok: true, providerId: "x" }], async () => void (midSend = await only()));
    await drain(transport);
    expect(midSend).toMatchObject({ status: "pending", attempts: 1 });
    expect(midSend?.nextAttemptAt.getTime()).toBe(start.getTime() + CLAIM_LEASE_SECONDS * 1000);
  });

  it("is not offered to a second sender until the lease has run out: a crashed sender delays a message and does not lose it", async () => {
    await queue("a@example.com");
    // A sender that claims and then dies: simulate with a transport that never answers a run we abandon, by claiming through a first run that fails transiently with a long delay.
    const claimed = await rig.dbs.owner.db.update(emailOutbox).set({ attempts: 1, nextAttemptAt: at(CLAIM_LEASE_SECONDS)() }).returning({ id: emailOutbox.id });
    expect(claimed).toHaveLength(1);
    const early = new FakeTransport();
    expect((await drain(early, CLAIM_LEASE_SECONDS - 1)).claimed).toBe(0);
    const late = new FakeTransport();
    expect((await drain(late, CLAIM_LEASE_SECONDS + 1)).sent).toBe(1);
  });
});

describe("failing and retrying", () => {
  it("puts a transient failure back with the backoff, keeps the link, and sends it on the next due run", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport([{ ok: false, permanent: false, reason: "brevo answered 503" }, { ok: true, providerId: "later" }]);
    const first = await drain(transport);
    expect(first).toMatchObject({ claimed: 1, sent: 0, retrying: 1, failed: 0 });
    const afterFirst = await only();
    expect(afterFirst).toMatchObject({ status: "pending", attempts: 1, lastError: "brevo answered 503" });
    expect(afterFirst.link).not.toBeNull();
    expect(afterFirst.nextAttemptAt.getTime()).toBe(start.getTime() + 60_000);

    expect((await drain(transport, 59)).claimed).toBe(0);
    expect(await drain(transport, 61)).toMatchObject({ claimed: 1, sent: 1 });
    expect(await only()).toMatchObject({ status: "sent", attempts: 2, link: null, lastError: null, providerId: "later" });
  });

  it("waits longer after each failure and gives up after the last attempt, clearing the link", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport([{ ok: false, permanent: false, reason: "brevo answered 500" }]);
    let clock = 0;
    const waits: number[] = [];
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      clock += 3 * 60 * 60;
      const result = await drain(transport, clock);
      expect(result.claimed, `attempt ${attempt}`).toBe(1);
      const row = await only();
      if (attempt < MAX_SEND_ATTEMPTS) waits.push((row.nextAttemptAt.getTime() - (start.getTime() + clock * 1000)) / 1000);
    }
    expect(waits).toEqual([60, 300, 1800, 7200]);
    expect(await only()).toMatchObject({ status: "failed", attempts: MAX_SEND_ATTEMPTS, link: null, lastError: "brevo answered 500" });
    expect((await drain(transport, clock + 86_400)).claimed).toBe(0);
    expect(transport.sent).toHaveLength(MAX_SEND_ATTEMPTS);
  });

  it("fails a permanent refusal at once, clears the link and never retries", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport([{ ok: false, permanent: true, reason: "brevo answered 400 invalid_parameter" }]);
    expect(await drain(transport)).toMatchObject({ claimed: 1, failed: 1, retrying: 0 });
    expect(await only()).toMatchObject({ status: "failed", attempts: 1, link: null, lastError: "brevo answered 400 invalid_parameter" });
    expect((await drain(transport, 86_400)).claimed).toBe(0);
  });

  it("records a transport that throws as a transient failure, keeps its error text out of the row, and does not throw", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport(["throw"]);
    const result = await drain(transport);
    expect(result).toMatchObject({ claimed: 1, retrying: 1 });
    const row = await only();
    expect(row).toMatchObject({ status: "pending", lastError: "the transport threw" });
    expect(JSON.stringify(row)).not.toContain("SECRET");
  });

  it("never sends the stored copy that says the link is removed: a pending row with no link fails", async () => {
    await queue("a@example.com", null);
    const transport = new FakeTransport();
    expect(await drain(transport)).toMatchObject({ claimed: 1, failed: 1, sent: 0 });
    expect(transport.sent).toEqual([]);
    expect(await only()).toMatchObject({ status: "failed", lastError: "no link to send" });
  });

  it("sends a link on the configured origin, whatever its path and query", async () => {
    await queue("a@example.com", `${ORIGIN}/accept-invite?token=abc`);
    const transport = new FakeTransport();
    expect(await drain(transport)).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(transport.sent).toHaveLength(1);
  });

  it.each([
    ["another host", "https://evil.test/accept-invite?token=abc"],
    ["a lookalike host", "https://leads.example.evil.test/accept-invite?token=abc"],
    ["another scheme", "http://leads.example/accept-invite?token=abc"],
    ["another port", "https://leads.example:8443/accept-invite?token=abc"],
    ["a userinfo trick", "https://leads.example@evil.test/accept-invite?token=abc"],
    ["a link that is not a web address", "not a link"],
  ])("refuses %s: the row fails with a short reason, nothing is sent and no link is kept", async (_name, link) => {
    await queue("a@example.com", link);
    const transport = new FakeTransport();
    expect(await drain(transport)).toMatchObject({ claimed: 1, failed: 1, sent: 0 });
    expect(transport.sent).toEqual([]);
    const row = await only();
    expect(row).toMatchObject({ status: "failed", link: null, lastError: "the link is not on the application origin" });
    expect(JSON.stringify(row)).not.toContain("evil");
  });

  it("fails a row whose stored content cannot be rendered, without sending", async () => {
    await queue("a@example.com");
    await rig.dbs.owner.db.update(emailOutbox).set({ params: { wrong: true } });
    const transport = new FakeTransport();
    expect(await drain(transport)).toMatchObject({ failed: 1, sent: 0 });
    expect(transport.sent).toEqual([]);
    expect(await only()).toMatchObject({ status: "failed", lastError: "the stored content could not be rendered", link: null });
  });

  it("sends nothing and leaves every message pending when there is no transport, which is development without a Brevo key", async () => {
    await queue("a@example.com");
    expect(await drain(null)).toEqual({ purged: 0, claimed: 0, sent: 0, retrying: 0, failed: 0 });
    expect(await only()).toMatchObject({ status: "pending", attempts: 0 });
  });
});

describe("links never outlive their use", () => {
  const age = (recipient: string, hours: number) =>
    rig.dbs.owner.db.update(emailOutbox).set({ createdAt: sql`now() - make_interval(hours => ${hours})` }).where(eq(emailOutbox.recipient, recipient));

  it("purges a link that has gone unsent for a day: the message fails and the link is cleared", async () => {
    await queue("old@example.com");
    await queue("new@example.com");
    await age("old@example.com", 25);
    expect(await purgeExpiredLinks(authDb(), start)).toBe(1);
    const [old, fresh] = await rows();
    expect(old).toMatchObject({ recipient: "new@example.com", status: "pending" });
    expect(fresh).toMatchObject({ recipient: "old@example.com", status: "failed", link: null, lastError: "the link was not sent within a day" });
  });

  it("purges at the start of every run, before anything is claimed, so an old message is never sent", async () => {
    await queue("old@example.com");
    await age("old@example.com", 30);
    const transport = new FakeTransport();
    expect(await drain(transport)).toEqual({ purged: 1, claimed: 0, sent: 0, retrying: 0, failed: 0 });
    expect(transport.sent).toEqual([]);
  });

  it("leaves a sent message alone", async () => {
    await queue("a@example.com");
    await drain(new FakeTransport());
    await age("a@example.com", 48);
    expect(await purgeExpiredLinks(authDb(), start)).toBe(0);
    expect((await only()).status).toBe("sent");
  });

  it("cancels the unsent messages of a revoked invite and clears their links, and leaves other messages alone", async () => {
    const fynixOrg = rig.world().fynix;
    const [row] = await rig.dbs.owner.db
      .insert(invite)
      .values({ orgId: rig.world().kestrel.id, orgKind: "client", email: "i@example.com", name: "I", tokenHash: "a".repeat(43), expiresAt: new Date(Date.now() + 86_400_000), createdBy: rig.actor.userId })
      .returning({ id: invite.id });
    expect(fynixOrg.kind).toBe("fynix");
    if (row === undefined) throw new Error("no invite");
    await queue("i@example.com", undefined, { inviteId: row.id });
    await queue("other@example.com");
    await queue("sent@example.com", undefined, { inviteId: row.id });
    await rig.dbs.owner.db.update(emailOutbox).set({ status: "sent", link: null }).where(eq(emailOutbox.recipient, "sent@example.com"));
    const cancelled = await fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
      await audit({ action: "invite.revoke", subject: { table: "invite", id: row.id } });
      return cancelInviteMail(tx, row.id);
    });
    expect(cancelled).toBe(1);
    expect(await rows()).toMatchObject([
      { recipient: "i@example.com", status: "cancelled", link: null, lastError: "the invite was revoked" },
      { recipient: "other@example.com", status: "pending" },
      { recipient: "sent@example.com", status: "sent" },
    ]);
  });
});

describe("two senders at once", () => {
  it("send every message exactly once", async () => {
    for (let index = 0; index < 12; index += 1) await queue(`person${String(index).padStart(2, "0")}@example.com`);
    const transport = new FakeTransport([{ ok: true, providerId: "p" }], () => new Promise((resolve) => setTimeout(resolve, 20)));
    const results = await Promise.all([drain(transport, 0, 12), drain(transport, 0, 12)]);
    expect(results.reduce((total, result) => total + result.sent, 0)).toBe(12);
    expect(new Set(transport.sent.map((mail) => mail.to)).size).toBe(12);
    expect(transport.sent).toHaveLength(12);
    expect((await rows()).every((row) => row.status === "sent" && row.attempts === 1)).toBe(true);
  });
});

describe("outboxOn", () => {
  it("is what the reset mailer queues through", async () => {
    await outboxOn(rig.dbs.roles.leads_public.db).enqueue({ to: "a@example.com", content: RESET, link: "https://leads.example/x" });
    expect(await rows()).toHaveLength(1);
  });
});
