-- Row-level security and grants for agency_alias. See 0002 for the rules.
--
-- Fynix reads, creates and renames aliases (never removes one). leads_auth inserts the alias of a person who has just
-- redeemed an invite that carried it, and nothing else. No tenant role holds a grant: the client sees an alias only as a
-- copy stored on the rows it reads (phase 2), and an agency user reads its own alias in phase 1E.
ALTER TABLE "agency_alias" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "agency_alias" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("alias", "updated_at") ON "agency_alias" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "agency_alias_fynix_all" ON "agency_alias" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT INSERT ON "agency_alias" TO leads_auth;
--> statement-breakpoint
-- The subquery sees one invite at most: leads_auth reads invites only by the hash its transaction names.
CREATE POLICY "agency_alias_auth_insert" ON "agency_alias" AS PERMISSIVE FOR INSERT TO leads_auth
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.member m
        JOIN public."user" u ON u.id = m.user_id
        JOIN public.invite i ON i.email = u.email
      WHERE m.id = "agency_alias"."member_id" AND i.alias = "agency_alias"."alias" AND i.redeemed_at IS NOT NULL
    )
  );
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agency_alias_audit_required AFTER INSERT OR UPDATE OR DELETE ON "agency_alias"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
