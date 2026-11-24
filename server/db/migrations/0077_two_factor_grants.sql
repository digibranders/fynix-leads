-- Gate G1: the second sign-in step. Only leads_auth touches `two_factor` (the encrypted authenticator secret and backup codes), like the other auth
-- tables (0007). DELETE is there because turning the step off removes the row. The `user.two_factor_enabled` column needs nothing: leads_auth holds
-- a table-level grant on `user`, and leads_fynix keeps its four-column read.
ALTER TABLE "two_factor" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "two_factor" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "two_factor_auth_all" ON "two_factor" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
