import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { campaign, lead, member, organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";

/** One lead the client rejected after the meeting, with its note, for Fynix to read and, if it disagrees, change to accepted. */
export interface RejectionRow {
  readonly leadId: string;
  readonly leadRef: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly clientName: string;
  /** The agency or coordinator that sent the lead. */
  readonly agencyName: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly note: string;
  readonly rejectedAt: Date | null;
  readonly rejectedByName: string | null;
  readonly meetingTime: Date | null;
  /** When Fynix looked and left it, or changed it. Null while it waits. */
  readonly reviewedAt: Date | null;
}

/** `open` is what waits for Fynix and what the navigation counts; `reviewed` is what Fynix has looked at; `all` is both. */
export type RejectionState = "open" | "reviewed" | "all";

/**
 * Every rejection waiting for Fynix, newest first: the main queue, in place of the disputes list (the old dispute tables and code stay but nothing
 * new uses them). Only a rejection after the meeting is here; a rejection before it never counted and has nothing to change. Open to staff.
 */
export async function listRejections(deps: DomainDeps, actor: FynixActor, state: RejectionState = "open"): Promise<readonly RejectionRow[]> {
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const clientOrg = alias(organisation, "client_org");
    const agencyOrg = alias(organisation, "agency_org");
    const rows = await tx
      .select({
        leadId: lead.id,
        leadRef: lead.publicRef,
        campaignId: campaign.id,
        campaignName: campaign.name,
        clientName: clientOrg.name,
        agencyName: agencyOrg.name,
        prospectName: lead.prospectName,
        prospectCompany: lead.prospectCompany,
        note: lead.decisionNote,
        rejectedAt: lead.decisionAt,
        rejectedByName: member.displayName,
        meetingTime: lead.scheduledMeetingTime,
        reviewedAt: lead.rejectionReviewedAt,
      })
      .from(lead)
      .innerJoin(campaign, eq(lead.campaignId, campaign.id))
      .innerJoin(clientOrg, eq(clientOrg.id, campaign.clientOrgId))
      .innerJoin(agencyOrg, eq(agencyOrg.id, lead.sourceOrgId))
      .leftJoin(member, eq(member.userId, lead.decisionByUserId))
      .where(and(eq(lead.stage, "rejected"), state === "open" ? isNull(lead.rejectionReviewedAt) : state === "reviewed" ? isNotNull(lead.rejectionReviewedAt) : undefined))
      .orderBy(desc(lead.decisionAt), desc(lead.updatedAt));
    return rows.map((row): RejectionRow => ({ ...row, note: row.note ?? "" }));
  });
}
