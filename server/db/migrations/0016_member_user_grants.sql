-- What phase 1C adds on member and user. Replaces the "Fynix holds nothing on these tables" rule of phase 1B (decision B5).
--
-- member: Fynix reads every column and may change `status` (suspend, reactivate) and `display_name`; it cannot move a
-- member to another organisation or change a role. leads_auth may INSERT a row, and only the row an invite just redeemed
-- entitles: the user's address, the organisation, its kind, the role and the name must all match a redeemed invite, and
-- the invite is visible only because this transaction named its hash. It gets `id` to read back what it wrote.
-- user: Fynix reads the four columns it needs to list and invite people. It never reads a password hash, a token or a session.
GRANT SELECT ON "member" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status", "display_name") ON "member" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "member_fynix_all" ON "member" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ("id") ON "member" TO leads_auth;
--> statement-breakpoint
GRANT INSERT ON "member" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "member_auth_insert" ON "member" AS PERMISSIVE FOR INSERT TO leads_auth
  WITH CHECK (
    "status" = 'active'
    AND EXISTS (
      SELECT 1 FROM public."user" u
        JOIN public.invite i ON i.email = u.email
      WHERE u.id = "member"."user_id" AND i.org_id = "member"."org_id" AND i.org_kind = "member"."org_kind"
        AND i.role = "member"."role" AND i.name = "member"."display_name" AND i.redeemed_at IS NOT NULL
    )
  );
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER member_audit_required AFTER INSERT OR UPDATE OR DELETE ON "member"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
GRANT SELECT ("id", "name", "email", "created_at") ON "user" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "user_fynix_read" ON "user" AS PERMISSIVE FOR SELECT TO leads_fynix USING (true);
