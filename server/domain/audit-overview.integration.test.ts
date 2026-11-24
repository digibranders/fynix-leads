import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUDIT_PAGE_SIZE, type AuditFilter } from "@/lib/fynix/audit-filter";
import { auditLog } from "@/server/db/schema";
import type { AuditAction } from "@/server/domain/audit";
import { listAuditLog } from "@/server/domain/audit-overview";
import { refusal } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/** The audit log screen's read, on the real test database: admin only, filtered, paged. */

const rig = openDomainRig();
const NONE: AuditFilter = { prefix: "", subject: "", person: "", q: "", page: 1 };
const BASE_TIME = Date.parse("2026-11-20T09:00:00Z");

beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

/** Appends audit rows as the owner, one minute apart, oldest first. */
async function record(rows: readonly { readonly action: AuditAction; readonly ref: string | null; readonly table?: "campaign" | "member" | "lead" }[]): Promise<void> {
  const subjectId = rig.world().users[0]?.id ?? "";
  await rig.dbs.owner.db.insert(auditLog).values(
    rows.map((row, index) => ({ actorUserId: rig.actor.userId, at: new Date(BASE_TIME + index * 60_000), action: row.action, subjectTable: row.table ?? "campaign", subjectId, subjectRef: row.ref })),
  );
}

describe("listAuditLog", () => {
  it("lists newest first with who, the action and the subject reference", async () => {
    await record([{ action: "campaign.create", ref: "CMP-AAAA" }, { action: "campaign.close", ref: "CMP-BBBB" }]);
    const page = await listAuditLog(rig.deps(), rig.actor, NONE);
    expect(page.rows.map((row) => row.action).slice(0, 2)).toEqual(["campaign.close", "campaign.create"]);
    expect(page.rows[0]).toMatchObject({ subjectRef: "CMP-BBBB" });
    expect(page.rows[0]?.by).not.toBeNull();
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect(page.people.length).toBeGreaterThan(0);
  });

  it("is refused to Fynix staff, in the domain and not only on the page", async () => {
    expect((await refusal(listAuditLog(rig.deps(), rig.staffActor, NONE))).code).toBe("admin-required");
  });

  it("filters by the part of the action before the dot, with no underscore wildcard: 'lead_' does not match everything", async () => {
    await record([{ action: "campaign.create", ref: "CMP-AAAA" }, { action: "lead.mark_lost", ref: "LD-1111", table: "lead" }, { action: "member.suspend", ref: null, table: "member" }]);
    expect((await listAuditLog(rig.deps(), rig.actor, { ...NONE, prefix: "lead" })).rows.map((row) => row.action)).toEqual(["lead.mark_lost"]);
    expect((await listAuditLog(rig.deps(), rig.actor, { ...NONE, prefix: "lea_" })).rows).toEqual([]);
  });

  it("filters by the start of the subject reference and by person", async () => {
    await record([{ action: "campaign.create", ref: "CMP-AAAA" }, { action: "lead.mark_lost", ref: "LD-1111", table: "lead" }]);
    expect((await listAuditLog(rig.deps(), rig.actor, { ...NONE, subject: "ld-" })).rows.map((row) => row.subjectRef)).toEqual(["LD-1111"]);
    expect((await listAuditLog(rig.deps(), rig.actor, { ...NONE, subject: "LD_" })).rows).toEqual([]);
    expect((await listAuditLog(rig.deps(), rig.actor, { ...NONE, person: rig.actor.userId })).total).toBeGreaterThanOrEqual(2);
    expect((await listAuditLog(rig.deps(), rig.actor, { ...NONE, person: "99999999-9999-4999-8999-999999999999" })).rows).toEqual([]);
  });

  it("searches the action, its wording on screen, the reference and the person's name, with LIKE characters taken literally", async () => {
    await record([{ action: "lead.mark_lost", ref: "LD-1111", table: "lead" }, { action: "campaign.close", ref: "CMP-BBBB" }]);
    const search = async (q: string) => (await listAuditLog(rig.deps(), rig.actor, { ...NONE, q })).rows.map((row) => row.action);
    expect(await search("mark_lost")).toEqual(["lead.mark_lost"]);
    expect(await search("Campaign closed")).toEqual(["campaign.close"]);
    expect(await search("cmp-bb")).toEqual(["campaign.close"]);
    expect(await search("%")).toEqual([]);
    expect(await search("mark%lost")).toEqual([]);
  });

  it("pages 50 at a time, and clamps a page past the end", async () => {
    await record(Array.from({ length: AUDIT_PAGE_SIZE + 5 }, (_, index) => ({ action: "campaign.update" as const, ref: `CMP-${String(index).padStart(4, "0")}` })));
    const first = await listAuditLog(rig.deps(), rig.actor, NONE);
    expect(first.rows).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first.pages).toBeGreaterThanOrEqual(2);
    const last = await listAuditLog(rig.deps(), rig.actor, { ...NONE, page: 999 });
    expect(last.page).toBe(last.pages);
    expect(last.rows.length).toBeGreaterThan(0);
    expect(last.rows.length).toBeLessThanOrEqual(AUDIT_PAGE_SIZE);
  });

  it("refuses an input that is not valid rather than running it", async () => {
    expect((await refusal(listAuditLog(rig.deps(), rig.actor, { ...NONE, prefix: "lead.%" }))).code).toBe("invalid-input");
  });
});
