-- Row-level security and grants for terms_document and terms_acceptance. See 0002 for the rules.
--
-- A published document is never edited: Fynix may insert one and change its `status` (a new version supersedes the old),
-- and no role may update the text. leads_auth reads the documents and records an acceptance during invite redemption,
-- and only for the current document of the party the user belongs to. The client and agency roles get a read of the
-- current document and their own acceptances in phase 1E, with the terms gate.
ALTER TABLE "terms_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "terms_acceptance" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "terms_document" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status") ON "terms_document" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "terms_document_fynix_all" ON "terms_document" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ON "terms_document" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "terms_document_auth_read" ON "terms_document" AS PERMISSIVE FOR SELECT TO leads_auth USING (true);
--> statement-breakpoint
GRANT SELECT ON "terms_acceptance" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "terms_acceptance_fynix_read" ON "terms_acceptance" AS PERMISSIVE FOR SELECT TO leads_fynix USING (true);
--> statement-breakpoint
GRANT INSERT ON "terms_acceptance" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "terms_acceptance_auth_insert" ON "terms_acceptance" AS PERMISSIVE FOR INSERT TO leads_auth
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.member m WHERE m.user_id = "terms_acceptance"."user_id" AND m.org_kind = "terms_acceptance"."party")
    AND EXISTS (SELECT 1 FROM public.terms_document d WHERE d.id = "terms_acceptance"."document_id" AND d.status = 'current')
  );
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER terms_document_audit_required AFTER INSERT OR UPDATE OR DELETE ON "terms_document"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
