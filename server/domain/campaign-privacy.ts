import { eq } from "drizzle-orm";
import { z } from "zod";
import { campaign } from "@/server/db/schema";
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
}

const columns = { id: campaign.id, publicRef: campaign.publicRef, clientPrivacyUrl: campaign.clientPrivacyUrl, prospectEmailEnabled: campaign.prospectEmailEnabled } as const;

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
