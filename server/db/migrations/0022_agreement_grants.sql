-- Row-level security and grants for agreement and agreement_acceptance. See 0002 for the rules every table follows.
--
-- Fynix reads and inserts agreements and may change `status` (a new version supersedes the old one); no role may change the
-- terms of a published version. Fynix reads and inserts acceptances and may not change or remove one. Nobody else holds
-- any privilege: phase 1E decides which agreement the client reads and which the supplier reads (nobody reads the other's,
-- spec 5.1, D21) and how a client or supplier manager accepts from their own session.
ALTER TABLE "agreement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agreement_acceptance" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "agreement" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status") ON "agreement" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "agreement_fynix_all" ON "agreement" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT ON "agreement_acceptance" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "agreement_acceptance_fynix_all" ON "agreement_acceptance" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
-- A superseded version is final. The column grant lets Fynix write `status`, which would also let a superseded version become
-- current again whenever no other version is current; this trigger closes that.
CREATE FUNCTION public.agreement_refuse_revival() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'agreement_superseded_is_final: a superseded agreement version cannot become current again' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.agreement_refuse_revival() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER agreement_refuse_revival BEFORE UPDATE OF status ON "agreement"
  FOR EACH ROW EXECUTE FUNCTION public.agreement_refuse_revival();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agreement_audit_required AFTER INSERT OR UPDATE OR DELETE ON "agreement"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agreement_acceptance_audit_required AFTER INSERT OR UPDATE OR DELETE ON "agreement_acceptance"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
