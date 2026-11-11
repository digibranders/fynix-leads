import type { Campaign } from "@/lib/domain/types";

/** The fixed "now" of the prototype (a Wednesday). Every date in the sample leads is relative to it. */
export const SAMPLE_NOW = new Date("2026-11-11T10:00:00Z");

/** The zone the campaign months are read in. An open question beside the counting month (spec section 16, item 2). */
export const CAMPAIGN_ZONE = "Europe/London";

export const VIEWER_ZONES = { client: "Europe/London", agency: "Asia/Kolkata" } as const;

export const SAMPLE_CAMPAIGN: Campaign = {
  ref: "CMP-7Q2X",
  name: "UK mid-market finance teams",
  brand: "Kestrel Ledger",
  monthlyTarget: 12,
  totalTarget: 72,
  startsOn: "2026-09-01",
  endsOn: "2027-02-28",
};
