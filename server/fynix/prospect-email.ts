import "server-only";
import { getDomain } from "@/server/domain";
import { readCampaignPrivacy, type CampaignPrivacy } from "@/server/domain/campaign-privacy";
import { launchEmailsEnabled } from "@/server/mail/launch";
import { orNotFound } from "@/server/fynix/session";

/** What the Prospect email panel shows. The launch switch is a yes or no: no value from the environment ever reaches the screen. */
export async function loadProspectEmail(reference: string, userId: string): Promise<{ readonly privacy: CampaignPrivacy; readonly launchEmailsOn: boolean }> {
  return { privacy: await orNotFound(readCampaignPrivacy(getDomain(), { userId }, reference)), launchEmailsOn: launchEmailsEnabled() };
}
