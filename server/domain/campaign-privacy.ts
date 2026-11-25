import { eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { checkLetterOpening, tidyLetterOpening } from "@/lib/email/letter-opening";
import { campaign, campaignShare, organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/**
 * The client's privacy page for a campaign and the switch that lets the portal email prospects of that campaign (phase 6, "The privacy line" in the Meet note).
 * Only a Fynix admin changes either (`fynixWrite` refuses staff, and so does a statement trigger in the database). The client reads both; no agency reads either:
 * the prospect letter takes the link from the database when the letter is queued (`app_email_enqueue`), not from a screen. Prospect email cannot be switched on
 * without a link, in the domain (`privacy-link-missing`) and in the database (a check constraint), and removing the link switches it off.
 */
const privacyUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.username === "" && url.password === "" && url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "must be a full https:// link to a web page")
  .nullable();

export interface CampaignPrivacy {
  readonly id: string;
  readonly publicRef: string;
  readonly clientPrivacyUrl: string | null;
  readonly prospectEmailEnabled: boolean;
  /** The campaign's own opening paragraph for the confirmation letter to prospects, or null for the default wording. */
  readonly prospectLetterOpening: string | null;
}

const columns = {
  id: campaign.id,
  publicRef: campaign.publicRef,
  clientPrivacyUrl: campaign.clientPrivacyUrl,
  prospectEmailEnabled: campaign.prospectEmailEnabled,
  prospectLetterOpening: campaign.prospectLetterOpening,
} as const;

/** What the audit row keeps of a link: whether there is one and on which site, never the address itself. */
const linkSummary = (url: string | null): { readonly privacyLink: boolean; readonly privacyHost: string | null } => ({ privacyLink: url !== null, privacyHost: url === null ? null : new URL(url).hostname });

/** Sets, replaces or (with null) removes the client's privacy link. Removing it while prospect email is on switches prospect email off in the same write. */
export async function setCampaignPrivacy(deps: DomainDeps, actor: FynixActor, campaignId: string, url: string | null): Promise<CampaignPrivacy> {
  const id = parseInput(uuidSchema, campaignId);
  const link = parseInput(privacyUrlSchema, url);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [before] = await tx.select(columns).from(campaign).where(eq(campaign.id, id)).limit(1).for("update");
    if (before === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [after] = await tx
      .update(campaign)
      .set({ clientPrivacyUrl: link, ...(link === null ? { prospectEmailEnabled: false } : {}) })
      .where(eq(campaign.id, id))
      .returning(columns);
    if (after === undefined) throw new Error("The campaign update returned no row");
    await audit({
      action: "campaign.set_privacy",
      subject: { table: "campaign", id, ref: after.publicRef },
      before: { ...linkSummary(before.clientPrivacyUrl), prospectEmail: before.prospectEmailEnabled },
      after: { ...linkSummary(after.clientPrivacyUrl), prospectEmail: after.prospectEmailEnabled },
    });
    return after;
  });
}

/** Switches prospect email for the campaign on or off. On is refused until the privacy link is set. This is the per-campaign half; `LAUNCH_EMAILS_ENABLED` is the other. */
export async function setProspectEmail(deps: DomainDeps, actor: FynixActor, campaignId: string, enabled: boolean): Promise<CampaignPrivacy> {
  const id = parseInput(uuidSchema, campaignId);
  const on = parseInput(z.boolean(), enabled);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [before] = await tx.select(columns).from(campaign).where(eq(campaign.id, id)).limit(1).for("update");
    if (before === undefined) throw new DomainError("not-found", "There is no such campaign.");
    if (on && before.clientPrivacyUrl === null) throw new DomainError("privacy-link-missing", "Prospect email cannot be switched on until the client's privacy link is set.");
    const [after] = await tx.update(campaign).set({ prospectEmailEnabled: on }).where(eq(campaign.id, id)).returning(columns);
    if (after === undefined) throw new Error("The campaign update returned no row");
    await audit({
      action: "campaign.set_prospect_email",
      subject: { table: "campaign", id, ref: after.publicRef },
      before: { prospectEmail: before.prospectEmailEnabled },
      after: { prospectEmail: after.prospectEmailEnabled },
    });
    return after;
  });
}

/**
 * Sets, replaces or (with null) removes the campaign's opening paragraph for the confirmation letter to prospects. The rules are `checkLetterOpening`: the
 * paragraph is tidied into one, may hold no address and no name of Fynix, and may not name the campaign's coordinator or an agency holding a share of it. The
 * database checks the names again when a letter is queued (`app_prospect_letter_opening`), because an agency can join later.
 */
export async function setProspectLetterOpening(deps: DomainDeps, actor: FynixActor, campaignId: string, text: string | null): Promise<CampaignPrivacy> {
  const id = parseInput(uuidSchema, campaignId);
  const raw = parseInput(z.string().max(5000).nullable(), text);
  const opening = raw === null ? null : tidyLetterOpening(raw);
  if (opening !== null) {
    const rules = checkLetterOpening(opening);
    if (!rules.ok) throw new DomainError("invalid-input", rules.problems.join(" "));
  }
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [before] = await tx.select({ ...columns, coordinatorOrgId: campaign.agencyOrgId }).from(campaign).where(eq(campaign.id, id)).limit(1).for("update");
    if (before === undefined) throw new DomainError("not-found", "There is no such campaign.");
    if (opening !== null) {
      const sharing = tx.select({ id: campaignShare.agencyOrgId }).from(campaignShare).where(eq(campaignShare.campaignId, id));
      const names = await tx.select({ name: organisation.name }).from(organisation).where(or(eq(organisation.id, before.coordinatorOrgId), inArray(organisation.id, sharing)));
      if (!checkLetterOpening(opening, names.map((row) => row.name)).ok) {
        throw new DomainError("letter-names-supply-side", "The paragraph names the coordinator or an agency of this campaign. A prospect must never read it.");
      }
    }
    const [after] = await tx.update(campaign).set({ prospectLetterOpening: opening }).where(eq(campaign.id, id)).returning(columns);
    if (after === undefined) throw new Error("The campaign update returned no row");
    await audit({
      action: "campaign.set_letter_opening",
      subject: { table: "campaign", id, ref: after.publicRef },
      before: { letterOpening: before.prospectLetterOpening },
      after: { letterOpening: after.prospectLetterOpening },
    });
    return after;
  });
}

const CAMPAIGN_REF = /^CMP-[0-9A-HJKMNP-TV-Z]{4}$/;

/** The privacy link and the prospect email switch of one campaign, by its public reference, for the Fynix campaign page. */
export async function readCampaignPrivacy(deps: DomainDeps, actor: FynixActor, publicRef: string): Promise<CampaignPrivacy> {
  if (!CAMPAIGN_REF.test(publicRef)) throw new DomainError("not-found", "There is no such campaign.");
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [row] = await tx.select(columns).from(campaign).where(eq(campaign.publicRef, publicRef)).limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such campaign.");
    return row;
  });
}
