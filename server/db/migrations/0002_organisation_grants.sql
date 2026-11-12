-- Row-level security and grants for organisation. Written by hand: drizzle-kit does not generate grants.
--
-- Rules for every table (server/db/structure.integration.test.ts checks them for all tables, present and future):
--   1. Row-level security is enabled.
--   2. A tenant role (leads_client, leads_agency) never holds a table-level grant, only SELECT on named columns, so a
--      `select *` fails with "permission denied" and a column added later is hidden until someone grants it.
--   3. Each role that holds any grant has a policy. leads_auth and leads_public hold none on this table.
ALTER TABLE "organisation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Fynix: every row, no DELETE. An organisation is archived (status), not removed.
GRANT SELECT, INSERT, UPDATE ON "organisation" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "organisation_fynix_all" ON "organisation" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Tenants: their own row, and not its `id`, `status` or `created_at`. The policy compares `id`, a column these roles
-- cannot read; Postgres evaluates a policy with its own privileges, so that works.
GRANT SELECT ("public_ref", "kind", "name", "brand_name") ON "organisation" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "organisation_client_own" ON "organisation" AS PERMISSIVE FOR SELECT TO leads_client USING ("id" = public.app_current_org_id());
--> statement-breakpoint
CREATE POLICY "organisation_agency_own" ON "organisation" AS PERMISSIVE FOR SELECT TO leads_agency USING ("id" = public.app_current_org_id());
