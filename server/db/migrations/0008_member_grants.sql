-- Row-level security and grants for member. See 0002 for the rules.
--
-- leads_auth reads the five columns session resolution needs (who, which organisation, what kind, what role, active or
-- not), and cannot write the table: a compromised sign-in code path cannot move a user into another organisation or
-- reactivate a suspended one. Nobody else holds a grant yet. Fynix gets its write grant in phase 1C with the admin
-- screens; the client and agency roles get a column-limited read of their organisation-mates in phase 1E.
ALTER TABLE "member" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ("user_id", "org_id", "org_kind", "role", "status") ON "member" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "member_auth_read" ON "member" AS PERMISSIVE FOR SELECT TO leads_auth USING (true);
