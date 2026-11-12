import { eq } from "drizzle-orm";
import { campaignAuditAction, canMoveCampaign, type CampaignStatus } from "@/lib/domain/campaign-status";
import { campaign, organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { createCampaignSchema, updateCampaignSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";
import { snapshotCampaign, type CampaignRow } from "@/server/domain/snapshots";

export interface CampaignRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
}

const campaignColumns = {
  id: campaign.id,
  publicRef: campaign.publicRef,
  name: campaign.name,
  clientOrgId: campaign.clientOrgId,
  agencyOrgId: campaign.agencyOrgId,
  status: campaign.status,
  startDate: campaign.startDate,
  endDate: campaign.endDate,
  monthlyTarget: campaign.monthlyTarget,
  totalTarget: campaign.totalTarget,
  geography: campaign.geography,
  industries: campaign.industries,
  companySize: campaign.companySize,
  icp: campaign.icp,
  jobTitles: campaign.jobTitles,
  seniority: campaign.seniority,
  technologies: campaign.technologies,
  bantBudget: campaign.bantBudget,
  bantAuthority: campaign.bantAuthority,
  bantNeed: campaign.bantNeed,
  bantTimeline: campaign.bantTimeline,
  instructions: campaign.instructions,
  internalNotes: campaign.internalNotes,
};

const record = (row: CampaignRow & { readonly id: string; readonly status: CampaignStatus }): CampaignRecord => ({ id: row.id, publicRef: row.publicRef, name: row.name, status: row.status });

/** The organisation must exist, be of the right kind and be active. A client id that is really an agency is refused here and again by the database (`campaign_client_org_fk`). */
async function requireActiveOrganisation(tx: ScopedTransaction, id: string, kind: "client" | "agency"): Promise<void> {
  const [row] = await tx.select({ kind: organisation.kind, status: organisation.status }).from(organisation).where(eq(organisation.id, id)).limit(1);
  if (row === undefined || row.kind !== kind) throw new DomainError("not-found", `There is no such ${kind}.`);
  if (row.status !== "active") throw new DomainError("organisation-archived", `The ${kind} is archived.`);
}

/**
 * Creates a campaign for one client and one agency, both of which must exist and be active. `status` is not an input: a new
 * campaign is always a draft, and `updateCampaign` activates it. The reference (`CMP-` and four characters) is generated and
 * retried when taken.
 */
export async function createCampaign(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<CampaignRecord> {
  const parsed = parseInput(createCampaignSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    await requireActiveOrganisation(tx, parsed.clientOrgId, "client");
    await requireActiveOrganisation(tx, parsed.agencyOrgId, "agency");
    const created = await insertWithPublicRef(tx, { prefix: "CMP", constraint: "campaign_public_ref_unique", randomBytes: deps.randomBytes }, async (attempt, publicRef) => {
      const [row] = await attempt.insert(campaign).values({ ...parsed, publicRef }).returning(campaignColumns);
      if (row === undefined) throw new Error("The campaign insert returned no row");
      return row;
    });
    await audit({ action: "campaign.create", subject: { table: "campaign", id: created.id, ref: created.publicRef }, before: null, after: snapshotCampaign(created) });
    return record(created);
  });
}

/**
 * Changes a campaign's details or its status. The client and the agency are fixed at creation. A status change must be one
 * `canMoveCampaign` allows, and moving into or out of `archived` has its own audit action. The row is locked while it is read, so
 * two admins editing one campaign take turns and the second sees the first's result.
 */
export async function updateCampaign(deps: DomainDeps, actor: FynixActor, campaignId: string, input: unknown): Promise<CampaignRecord> {
  const id = parseInput(uuidSchema, campaignId);
  const parsed = parseInput(updateCampaignSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [before] = await tx.select(campaignColumns).from(campaign).where(eq(campaign.id, id)).limit(1).for("update");
    if (before === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const nextStatus = parsed.status ?? before.status;
    if (nextStatus !== before.status && !canMoveCampaign(before.status, nextStatus)) {
      throw new DomainError("invalid-transition", `A ${before.status} campaign cannot become ${nextStatus}.`);
    }
    const startDate = parsed.startDate ?? before.startDate;
    const endDate = parsed.endDate ?? before.endDate;
    if (endDate < startDate) throw new DomainError("invalid-input", "endDate must not be before the start date");
    const [after] = await tx.update(campaign).set(parsed).where(eq(campaign.id, id)).returning(campaignColumns);
    if (after === undefined) throw new Error("The campaign update returned no row");
    await audit({ action: campaignAuditAction(before.status, after.status), subject: { table: "campaign", id, ref: after.publicRef }, before: snapshotCampaign(before), after: snapshotCampaign(after) });
    return record(after);
  });
}
