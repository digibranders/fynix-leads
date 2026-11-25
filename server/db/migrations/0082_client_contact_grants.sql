-- The contact people of a client: Fynix reads and writes them (admin only, audited). No tenant role reads them: they are Fynix's own
-- notes on who to call, and a client or an agency has no grant and no policy on the table. A removed contact stays (removed_at).
ALTER TABLE "client_contact" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "client_contact" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("name", "email", "phone", "job_title", "updated_at", "removed_at") ON "client_contact" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "client_contact_fynix_all" ON "client_contact" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER client_contact_audit_required AFTER INSERT OR UPDATE OR DELETE ON "client_contact"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE TRIGGER client_contact_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "client_contact" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
