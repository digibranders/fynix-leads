import { desc, eq, like, or } from "drizzle-orm";
import { auditLog, campaign, lead, leadHistory, member } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import { uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/** One line of a campaign's Activity tab: a recorded Fynix change (audit log) or a step in the life of one of its leads (lead history). */
export interface CampaignActivityRow {
  readonly id: string;
  readonly at: Date;
  readonly source: "audit" | "lead";
  /** The audit action (`agreement.publish`) or the lead history action. */
  readonly action: string;
  /** Who did it, as the member's name; null when there is no member row. */
  readonly by: string | null;
  /** The lead's reference for a lead row. */
  readonly leadRef: string | null;
  readonly fromStage: string | null;
  readonly toStage: string | null;
  readonly note: string | null;
}

/**
 * Everything recorded about a campaign, newest first: audit rows whose subject is the campaign or carries its reference (its agreements,
 * acceptances, shares and hosts), and the history of every lead on it. Fynix read, open to staff.
 */
export async function readCampaignActivity(deps: DomainDeps, actor: FynixActor, campaignId: string, limit = 100): Promise<readonly CampaignActivityRow[]> {
  const id = parseInput(uuidSchema, campaignId);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx.select({ id: campaign.id, publicRef: campaign.publicRef }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (found === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const audits = await tx
      .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, by: member.displayName })
      .from(auditLog)
      .leftJoin(member, eq(member.userId, auditLog.actorUserId))
      .where(or(eq(auditLog.subjectId, id), eq(auditLog.subjectRef, found.publicRef), like(auditLog.subjectRef, `${found.publicRef} %`)))
      .orderBy(desc(auditLog.at))
      .limit(limit);
    const steps = await tx
      .select({ id: leadHistory.id, at: leadHistory.createdAt, action: leadHistory.action, by: member.displayName, leadRef: lead.publicRef, fromStage: leadHistory.fromStage, toStage: leadHistory.toStage, note: leadHistory.note })
      .from(leadHistory)
      .innerJoin(lead, eq(lead.id, leadHistory.leadId))
      .leftJoin(member, eq(member.userId, leadHistory.actorUserId))
      .where(eq(lead.campaignId, id))
      .orderBy(desc(leadHistory.createdAt))
      .limit(limit);
    const rows: CampaignActivityRow[] = [
      ...audits.map((row): CampaignActivityRow => ({ ...row, source: "audit", leadRef: null, fromStage: null, toStage: null, note: null })),
      ...steps.map((row): CampaignActivityRow => ({ ...row, source: "lead" })),
    ];
    return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  });
}
