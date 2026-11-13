-- Only a Fynix admin changes set-up: the database half of the phase 1D role rule (the service half is fynixWrite).
--
-- A statement level BEFORE trigger on every table leads_fynix can write, except audit_log and email_outbox (plumbing, see
-- AUDIT_EXEMPT_TABLES in server/db/testing/structure.ts). It only looks at leads_fynix: seeds, `pnpm admin:create`, the owner,
-- and the redemption of an invite (leads_auth inserts a member, an alias and an acceptance) are not Fynix set-up. For
-- leads_fynix the request's user (app.user_id) must be an active member of the Fynix organisation with the `manager` role,
-- the role `pnpm admin:create` gives; Fynix staff have `member`. The trigger runs once per statement, before any row changes,
-- and also for a statement that touches no row. It reads `member` as the caller, which leads_fynix may (0016).
-- A structural test (fynixWritableTablesWithoutAdminTrigger) fails for a Fynix writable table that lacks the trigger.
CREATE FUNCTION public.fynix_admin_required() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF current_user = 'leads_fynix' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member m
      WHERE m.user_id = public.app_current_user_id() AND m.org_kind = 'fynix' AND m.role = 'manager' AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Only a Fynix admin may change %', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fynix_admin_required() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER organisation_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "organisation" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER campaign_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "campaign" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER invite_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "invite" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER member_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "member" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER agency_alias_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "agency_alias" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER terms_document_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "terms_document" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER agreement_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "agreement" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER agreement_acceptance_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "agreement_acceptance" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER campaign_share_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "campaign_share" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER campaign_host_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "campaign_host" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER host_hours_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "host_hours" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER host_block_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "host_block" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
