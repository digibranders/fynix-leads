-- The lead, meeting, agreement and message policies of 0032 to 0036 test `campaign.client_org_id` and `campaign.agency_org_id`.
-- A policy expression runs with the caller's privileges, so each role needs SELECT on the one column its own policies read.
-- Row access is unchanged: campaign RLS still shows a client only its own campaigns and an agency only its own, so the
-- value each role can now read is its own organisation's id. The other organisation's id stays ungranted.
GRANT SELECT ("client_org_id") ON "campaign" TO leads_client;
--> statement-breakpoint
GRANT SELECT ("agency_org_id") ON "campaign" TO leads_agency;
