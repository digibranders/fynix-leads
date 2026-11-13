-- The organisation hierarchy rules that a CHECK or a foreign key cannot say, and the rule that a campaign's agency is a supplier.
-- Both run with the privileges of the caller (no SECURITY DEFINER): the callers are leads_fynix and the owner, which can
-- read both tables. Rows they look at are locked FOR SHARE, like the brand copy trigger of 0005, so a concurrent change that
-- would break the rule waits for this statement and is then checked against it. Messages start with a stable name that the
-- tests match. 0024 adds a third rule (a campaign share blocks a change of parent) once campaign_share exists.
--
-- organisation_check_parent runs when a row is inserted or its parent_org_id is written, and only does anything when the
-- parent actually changes:
--   1. The parent must not itself have a parent (two levels at most).
--   2. An existing organisation that is given a parent must not have partner agencies of its own and must not be the
--      supplier of any campaign: a partner agency does not run campaigns, and a supplier with partners would make three levels.
-- That the parent is an agency, is not the organisation itself, and that only an agency has one, are constraints (0019).
CREATE FUNCTION public.organisation_check_parent() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
DECLARE
  parents_parent uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.parent_org_id IS NOT DISTINCT FROM NEW.parent_org_id THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_org_id IS NOT NULL THEN
    SELECT p.parent_org_id INTO parents_parent FROM public.organisation p WHERE p.id = NEW.parent_org_id FOR SHARE;
    IF parents_parent IS NOT NULL THEN
      RAISE EXCEPTION 'organisation_two_levels_only: the parent organisation is itself a partner agency' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.parent_org_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.organisation c WHERE c.parent_org_id = NEW.id) THEN
      RAISE EXCEPTION 'organisation_has_partner_agencies: an organisation with partner agencies cannot be given a parent' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.campaign k WHERE k.agency_org_id = NEW.id) THEN
      RAISE EXCEPTION 'organisation_is_a_campaign_supplier: the supplier of a campaign cannot be given a parent' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.organisation_check_parent() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER organisation_check_parent BEFORE INSERT OR UPDATE OF parent_org_id ON "organisation"
  FOR EACH ROW EXECUTE FUNCTION public.organisation_check_parent();
--> statement-breakpoint
-- campaign.agency_org_id is the supplier: an agency with no parent. The campaign's foreign key already insists it is an
-- agency (0001); this adds "and not a partner agency". The organisation row is read FOR SHARE, so a concurrent change that
-- gives it a parent waits (and organisation_check_parent then sees this campaign).
CREATE FUNCTION public.campaign_check_supplier() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
DECLARE
  supplier_parent uuid;
BEGIN
  SELECT o.parent_org_id INTO supplier_parent FROM public.organisation o WHERE o.id = NEW.agency_org_id FOR SHARE;
  IF supplier_parent IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_supplier_has_parent: a campaign needs a supplier, and a partner agency is not one' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.campaign_check_supplier() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER campaign_check_supplier BEFORE INSERT OR UPDATE OF agency_org_id ON "campaign"
  FOR EACH ROW EXECUTE FUNCTION public.campaign_check_supplier();
