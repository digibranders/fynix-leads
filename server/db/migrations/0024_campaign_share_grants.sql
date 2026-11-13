-- Row-level security, grants and triggers for campaign_share. See 0002 for the rules every table follows.
--
-- Fynix reads, adds and removes shares and may change the amount. A share is a setting, not a record anyone relied on, so
-- Fynix holds DELETE here (the audit row keeps what was removed): this is one of three configuration tables with that
-- grant (see also host_hours and host_block, 0028). No other role holds anything; phase 1E gives an agency its own share.
ALTER TABLE "campaign_share" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "campaign_share" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("monthly_share", "updated_at") ON "campaign_share" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "campaign_share_fynix_all" ON "campaign_share" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER campaign_share_audit_required AFTER INSERT OR UPDATE OR DELETE ON "campaign_share"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
-- A share goes to the campaign's supplier or to a partner agency of that supplier. Both rows are read FOR SHARE, so a
-- concurrent change of the campaign's supplier or of the agency's parent waits for this statement (and the second
-- trigger below blocks a change of parent once a share exists). If the campaign does not exist the comparison below
-- passes and the foreign key reports it with its own message.
CREATE FUNCTION public.campaign_share_check_agency() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
DECLARE
  supplier uuid;
  agency_parent uuid;
BEGIN
  SELECT c.agency_org_id INTO supplier FROM public.campaign c WHERE c.id = NEW.campaign_id FOR SHARE;
  SELECT o.parent_org_id INTO agency_parent FROM public.organisation o WHERE o.id = NEW.agency_org_id FOR SHARE;
  IF NEW.agency_org_id IS DISTINCT FROM supplier AND agency_parent IS DISTINCT FROM supplier THEN
    RAISE EXCEPTION 'campaign_share_agency_not_in_supplier_tree: a share goes to the campaign''s supplier or one of its partner agencies' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.campaign_share_check_agency() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER campaign_share_check_agency BEFORE INSERT OR UPDATE OF campaign_id, agency_org_id ON "campaign_share"
  FOR EACH ROW EXECUTE FUNCTION public.campaign_share_check_agency();
--> statement-breakpoint
-- The third hierarchy rule (the first two are in 0020): an organisation that holds a share cannot change its parent, because
-- it would stop being a partner of the supplier whose campaign the share is on.
CREATE FUNCTION public.organisation_check_parent_shares() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.campaign_share s WHERE s.agency_org_id = NEW.id) THEN
    RAISE EXCEPTION 'organisation_has_shares: an organisation that holds a campaign share cannot change its parent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.organisation_check_parent_shares() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER organisation_check_parent_shares BEFORE UPDATE OF parent_org_id ON "organisation"
  FOR EACH ROW WHEN (OLD.parent_org_id IS DISTINCT FROM NEW.parent_org_id) EXECUTE FUNCTION public.organisation_check_parent_shares();
