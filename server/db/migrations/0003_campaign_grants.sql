-- Row-level security and grants for campaign. See 0002 for the rules.
ALTER TABLE "campaign" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "campaign" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "campaign_fynix_all" ON "campaign" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
-- The client reads its own campaigns and the agency reads its own. Neither gets either organisation id, the kind
-- columns or `internal_notes`, so the client learns nothing about the agency and the agency nothing about the client's
-- identity. `client_brand_name` is the one piece of the client the agency may know.
GRANT SELECT ("id", "public_ref", "name", "client_brand_name", "status", "start_date", "end_date", "monthly_target", "total_target")
  ON "campaign" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "campaign_client_own" ON "campaign" AS PERMISSIVE FOR SELECT TO leads_client USING ("client_org_id" = public.app_current_org_id());
--> statement-breakpoint
CREATE POLICY "campaign_agency_own" ON "campaign" AS PERMISSIVE FOR SELECT TO leads_agency USING ("agency_org_id" = public.app_current_org_id());
