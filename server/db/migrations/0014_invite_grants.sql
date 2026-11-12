-- Row-level security and grants for invite. See 0002 for the rules.
--
-- Fynix issues invites and revokes them, and reads everything but the token hash. leads_auth redeems them, and it can see
-- a row only when the transaction names that row's token hash in `app.invite_hash` (set by withInviteHash in
-- server/db/scope.ts). A connection that has not been given a hash sees no invite at all, so a bug or an injected
-- statement on the identity pool cannot list the people who have been invited, and the hash is only ever known to the
-- holder of the link. The redeem policy lets the database itself refuse an invite that is used, revoked or expired.
ALTER TABLE "invite" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Plain LANGUAGE sql, STABLE, no SET clause, names qualified: the same shape as the two scope functions in 0000.
CREATE FUNCTION public.app_current_invite_hash() RETURNS pg_catalog.text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(pg_catalog.current_setting('app.invite_hash', true), '') $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_current_invite_hash() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_current_invite_hash() TO leads_auth;
--> statement-breakpoint
GRANT INSERT ON "invite" TO leads_fynix;
--> statement-breakpoint
GRANT SELECT ("id", "org_id", "org_kind", "email", "name", "role", "alias", "expires_at", "redeemed_at", "revoked_at", "created_by", "created_at") ON "invite" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("revoked_at") ON "invite" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "invite_fynix_all" ON "invite" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ("id", "org_id", "org_kind", "email", "name", "role", "alias", "token_hash", "expires_at", "redeemed_at", "revoked_at") ON "invite" TO leads_auth;
--> statement-breakpoint
GRANT UPDATE ("redeemed_at") ON "invite" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "invite_auth_read" ON "invite" AS PERMISSIVE FOR SELECT TO leads_auth USING ("token_hash" = public.app_current_invite_hash());
--> statement-breakpoint
CREATE POLICY "invite_auth_redeem" ON "invite" AS PERMISSIVE FOR UPDATE TO leads_auth
  USING ("token_hash" = public.app_current_invite_hash() AND "redeemed_at" IS NULL AND "revoked_at" IS NULL AND "expires_at" > now())
  WITH CHECK ("redeemed_at" IS NOT NULL);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invite_audit_required AFTER INSERT OR UPDATE OR DELETE ON "invite"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
