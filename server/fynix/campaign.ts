import "server-only";
import { cache } from "react";
import { getDomain } from "@/server/domain";
import { readCampaignHeader, type CampaignHeader } from "@/server/domain/campaign-overview";
import { orNotFound } from "@/server/fynix/session";

/** The campaign a page is about, found by the reference in the address. The layout and the tab share one read per request. An unknown reference is the not-found page. */
export const loadCampaign = cache((reference: string, userId: string): Promise<CampaignHeader> => orNotFound(readCampaignHeader(getDomain(), { userId }, reference)));
