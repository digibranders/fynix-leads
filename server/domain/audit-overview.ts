import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { AUDIT_PAGE_SIZE, escapeLike, type AuditFilter } from "@/lib/fynix/audit-filter";
import { auditSentence } from "@/lib/fynix/audit-text";
import { auditLog, member } from "@/server/db/schema";
import { AUDIT_ACTIONS } from "@/server/domain/audit";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import { parseInput } from "@/server/domain/parse";

/** One recorded change. `by` is the member's name, and null when the account has no member row. */
export interface AuditRow {
  readonly id: string;
  readonly at: Date;
  readonly by: string | null;
  readonly action: string;
  readonly subjectTable: string;
  readonly subjectRef: string | null;
}

export interface AuditPage {
  readonly rows: readonly AuditRow[];
  readonly total: number;
  /** 1-based, clamped into range. */
  readonly page: number;
  readonly pages: number;
  /** The Fynix people a change can be filtered by. */
  readonly people: readonly { readonly userId: string; readonly name: string }[];
  /** The parts of an action (before the dot) the filter offers. */
  readonly prefixes: readonly string[];
}

const filterSchema = z.object({
  prefix: z.string().regex(/^[a-z_]*$/).max(40),
  subject: z.string().max(40),
  person: z.union([z.uuid(), z.literal("")]),
  q: z.string().max(80),
  page: z.number().int().min(1).max(100_000),
});

export const AUDIT_PREFIXES: readonly string[] = [...new Set(AUDIT_ACTIONS.map((action) => action.slice(0, action.indexOf("."))))].sort();

/**
 * The audit log, newest first, 50 to a page. Admin only: it holds who changed what, so Fynix staff are refused here and not just by the page and the menu.
 * `fynixRead` is open to staff, so the role is checked inside the same transaction. A typed word matches the raw action, the sentence the screen shows for it,
 * the subject reference, the subject table and the person's name; the action prefix is matched with `starts_with`, never with LIKE, because `_` is a wildcard there.
 */
export async function listAuditLog(deps: DomainDeps, actor: FynixActor, filter: AuditFilter): Promise<AuditPage> {
  const parsed = parseInput(filterSchema, filter);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [self] = await tx.select({ role: member.role }).from(member).where(and(eq(member.userId, actor.userId), eq(member.orgKind, "fynix"), eq(member.status, "active"))).limit(1);
    if (self === undefined) throw new DomainError("not-authorised", "The signed-in user is not an active member of Fynix.");
    if (self.role !== "manager") throw new DomainError("admin-required", "Only a Fynix admin can read the audit log.");

    const conditions: SQL[] = [];
    if (parsed.prefix !== "") conditions.push(sql`starts_with(${auditLog.action}, ${`${parsed.prefix}.`})`);
    if (parsed.person !== "") conditions.push(eq(auditLog.actorUserId, parsed.person));
    if (parsed.subject !== "") conditions.push(ilike(auditLog.subjectRef, `${escapeLike(parsed.subject)}%`));
    if (parsed.q !== "") {
      const pattern = `%${escapeLike(parsed.q)}%`;
      const needle = parsed.q.toLowerCase();
      const byWording = AUDIT_ACTIONS.filter((action) => auditSentence(action).toLowerCase().includes(needle));
      const matches: SQL[] = [ilike(auditLog.action, pattern), ilike(auditLog.subjectRef, pattern), ilike(auditLog.subjectTable, pattern), ilike(member.displayName, pattern)];
      if (byWording.length > 0) matches.push(inArray(auditLog.action, byWording));
      const any = or(...matches);
      if (any !== undefined) conditions.push(any);
    }
    const where = conditions.length === 0 ? undefined : and(...conditions);

    const [counted] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(auditLog)
      .leftJoin(member, eq(member.userId, auditLog.actorUserId))
      .where(where);
    const total = counted?.value ?? 0;
    const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
    const page = Math.min(parsed.page, pages);
    const rows = await tx
      .select({ id: auditLog.id, at: auditLog.at, by: member.displayName, action: auditLog.action, subjectTable: auditLog.subjectTable, subjectRef: auditLog.subjectRef })
      .from(auditLog)
      .leftJoin(member, eq(member.userId, auditLog.actorUserId))
      .where(where)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE);
    const people = await tx.select({ userId: member.userId, name: member.displayName }).from(member).where(eq(member.orgKind, "fynix")).orderBy(member.displayName);
    return { rows, total, page, pages, people, prefixes: AUDIT_PREFIXES };
  });
}
