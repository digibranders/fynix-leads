import { and, asc, eq, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { CLAIM_LEASE_SECONDS, LINK_RETENTION_SECONDS, retryDelaySeconds } from "@/lib/email/backoff";
import { parseEmailContent, renderEmail, type EmailContent } from "@/lib/email/templates";
import type { Database } from "@/server/db/pool";
import { emailOutbox } from "@/server/db/schema";
import type { MailTransport } from "@/server/mail/transport";

/**
 * The outbox: every email is written here first and sent after, so a message survives a crash, a provider outage and a
 * bug in the request that queued it. Three parts:
 * - `enqueueEmail` writes a row (any role with INSERT: `leads_public` for a reset, `leads_fynix` inside the invite's transaction).
 * - `drainOutbox` is the sender (`leads_auth`): claim, send, record. `pnpm outbox:run` runs it once; phase 6 runs it on a timer.
 * - `purgeExpiredLinks` and `cancelInviteMail` keep a link from outliving its use.
 * The columns and the state machine are described in server/db/schema/email-outbox.ts.
 */

/** A message to queue. The link is separate from the content: the row keeps a copy without it, and the link only until the message is sent. */
export interface QueuedEmail {
  readonly to: string;
  readonly content: EmailContent;
  readonly link: string | null;
  /** The invite this message carries the link of, so revoking the invite can cancel it. */
  readonly inviteId?: string;
}

/** Anything that can insert a row: a pooled database or a transaction. */
export type OutboxWriter = Pick<Database, "insert">;

/** The one thing a producer needs. The reset mailer takes this, so it does not know whether it is writing a table. */
export interface Outbox {
  enqueue(email: QueuedEmail): Promise<void>;
}

export function outboxOn(db: OutboxWriter): Outbox {
  return { enqueue: (email) => enqueueEmail(db, email) };
}

/**
 * Writes one pending row: the content, a copy of the text with the link removed, and the link. A failed insert is rethrown
 * with only the error's name and code: drizzle-orm puts the SQL and its parameters (the recipient and the live link) in the
 * message, and a caller or Better Auth may log it.
 */
export async function enqueueEmail(db: OutboxWriter, email: QueuedEmail): Promise<void> {
  const stored = renderEmail(email.content, null);
  try {
    await db.insert(emailOutbox).values({
      recipient: email.to,
      template: email.content.template,
      params: email.content.params,
      subject: stored.subject,
      body: stored.text,
      link: email.link,
      inviteId: email.inviteId ?? null,
    });
  } catch (error) {
    const code = typeof (error as { code?: unknown } | null)?.code === "string" ? ` ${(error as { code: string }).code}` : "";
    const name = error instanceof Error ? error.name : "non-error";
    throw new Error(`Could not write the outbox message (${name}${code})`);
  }
}

export interface DrainOptions {
  /** The application's own origin (`APP_ORIGIN`). A message whose link is anywhere else is failed, never sent. */
  readonly origin: string;
  readonly now?: () => Date;
  /** How many messages one run sends at most. */
  readonly batchSize?: number;
}

export interface DrainResult {
  /** Messages whose link had gone unsent for a day and were failed before the run began. */
  readonly purged: number;
  readonly claimed: number;
  readonly sent: number;
  /** Failed this time and put back to try again later. */
  readonly retrying: number;
  /** Failed for good: refused for good, or out of attempts. */
  readonly failed: number;
}

const DEFAULT_BATCH_SIZE = 20;
const seconds = (from: Date, count: number): Date => new Date(from.getTime() + count * 1000);

/**
 * Fails every pending message whose link has been waiting longer than a day, and clears the link: master plan section 3,
 * "link emails ... are purged after one day". Returns how many.
 */
export async function purgeExpiredLinks(db: Database, now: Date): Promise<number> {
  const purged = await db
    .update(emailOutbox)
    .set({ status: "failed", link: null, lastError: "the link was not sent within a day" })
    .where(and(eq(emailOutbox.status, "pending"), isNotNull(emailOutbox.link), lt(emailOutbox.createdAt, seconds(now, -LINK_RETENTION_SECONDS))))
    .returning({ id: emailOutbox.id });
  return purged.length;
}

/** Cancels the messages of a revoked invite that have not gone out, clearing their links. Runs in the revoking transaction. */
export async function cancelInviteMail(db: Pick<Database, "update">, inviteId: string): Promise<number> {
  const cancelled = await db
    .update(emailOutbox)
    .set({ status: "cancelled", link: null, lastError: "the invite was revoked" })
    .where(and(eq(emailOutbox.inviteId, inviteId), eq(emailOutbox.status, "pending")))
    .returning({ id: emailOutbox.id });
  return cancelled.length;
}

/**
 * Claims due messages, one short statement: `FOR UPDATE SKIP LOCKED` so two runners never take the same row, and the claim
 * pushes `next_attempt_at` out by the lease and counts the attempt. A runner that dies mid-send therefore delays a message
 * by the lease and never loses it. Delivery is at least once: a message that was sent but whose result could not be
 * recorded is sent again after the lease.
 */
async function claimDue(db: Database, now: Date, limit: number) {
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, now)))
    .orderBy(asc(emailOutbox.nextAttemptAt))
    .limit(limit)
    .for("update", { skipLocked: true });
  return db
    .update(emailOutbox)
    .set({ attempts: sql`${emailOutbox.attempts} + 1`, nextAttemptAt: seconds(now, CLAIM_LEASE_SECONDS) })
    .where(inArray(emailOutbox.id, due))
    .returning({ id: emailOutbox.id, recipient: emailOutbox.recipient, template: emailOutbox.template, params: emailOutbox.params, link: emailOutbox.link, attempts: emailOutbox.attempts });
}

type Claimed = Awaited<ReturnType<typeof claimDue>>[number];
type Outcome = "sent" | "retrying" | "failed";

/** True when the link's origin (scheme, host and port, after URL parsing, so userinfo and lookalike hosts do not count) is the application's. */
function isOnOrigin(link: string, origin: string): boolean {
  try {
    return new URL(link).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

async function settle(db: Database, row: Claimed, transport: MailTransport, now: Date, origin: string): Promise<Outcome> {
  const fail = async (reason: string, permanent: boolean): Promise<Outcome> => {
    const delay = permanent ? null : retryDelaySeconds(row.attempts);
    if (delay === null) {
      await db.update(emailOutbox).set({ status: "failed", link: null, lastError: reason }).where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "pending")));
      return "failed";
    }
    await db.update(emailOutbox).set({ nextAttemptAt: seconds(now, delay), lastError: reason }).where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "pending")));
    return "retrying";
  };

  // Every template carries a link, so a pending row without one has nothing to send (it was cleared by a purge or a cancel
  // that raced this claim). Never send the copy that says "the link is removed".
  if (row.link === null) return fail("no link to send", true);
  // A public pool queues these rows, so a link is data until it is checked: one that points elsewhere is a phishing link. The reason never carries it.
  if (!isOnOrigin(row.link, origin)) return fail("the link is not on the application origin", true);
  let rendered;
  try {
    rendered = renderEmail(parseEmailContent(row.template, row.params), row.link);
  } catch {
    return fail("the stored content could not be rendered", true);
  }

  let result;
  try {
    result = await transport.send({ to: row.recipient, subject: rendered.subject, text: rendered.text, html: rendered.html });
  } catch {
    // A transport is meant to return a value. One that throws is a bug; treat it as a transient failure and keep the error out of the row.
    return fail("the transport threw", false);
  }
  if (!result.ok) return fail(result.reason, result.permanent);
  await db
    .update(emailOutbox)
    .set({ status: "sent", sentAt: now, providerId: result.providerId, link: null, lastError: null })
    .where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "pending")));
  return "sent";
}

/**
 * One run of the sender, as `leads_auth`: purge old links, claim a batch, send each message and record the outcome.
 * Nothing in it throws for a delivery problem; a database fault does propagate, to the script or the cron call.
 * With no transport (no Brevo key in development) it purges and sends nothing, so rows stay pending.
 */
export async function drainOutbox(db: Database, transport: MailTransport | null, options: DrainOptions): Promise<DrainResult> {
  const now = options.now?.() ?? new Date();
  const purged = await purgeExpiredLinks(db, now);
  if (transport === null) return { purged, claimed: 0, sent: 0, retrying: 0, failed: 0 };
  const batch = await claimDue(db, now, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const tally = { sent: 0, retrying: 0, failed: 0 };
  for (const row of batch) tally[await settle(db, row, transport, now, options.origin)] += 1;
  return { purged, claimed: batch.length, ...tally };
}
