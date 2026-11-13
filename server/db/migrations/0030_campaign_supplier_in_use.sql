-- A campaign's supplier is fixed once anything has been set up under it. campaign_share_check_agency (0024) and the
-- supplier agreement are only checked against the supplier at the moment they are written, so changing campaign.agency_org_id
-- afterwards would leave shares outside the new supplier's tree and a supplier agreement with the wrong party. The update is
-- refused while any campaign_share, or any agreement with party supplier, exists for the campaign. The message names no row
-- values. Publishing an agreement locks the campaign row FOR UPDATE and a share reads it FOR SHARE (0024), so a write that is
-- still in flight waits for this update, or this update waits for it and then sees it.
CREATE FUNCTION public.campaign_supplier_in_use() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF NEW.agency_org_id IS DISTINCT FROM OLD.agency_org_id AND (
    EXISTS (SELECT 1 FROM public.campaign_share s WHERE s.campaign_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.agreement a WHERE a.campaign_id = OLD.id AND a.party = 'supplier')
  ) THEN
    RAISE EXCEPTION 'campaign_supplier_in_use: a campaign with shares or a supplier agreement keeps its supplier' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.campaign_supplier_in_use() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER campaign_supplier_in_use BEFORE UPDATE OF agency_org_id ON "campaign"
  FOR EACH ROW EXECUTE FUNCTION public.campaign_supplier_in_use();
