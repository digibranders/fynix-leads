-- Keeps campaign.client_brand_name equal to the client organisation's brand name, so the agency can read the brand
-- of its own campaigns without any grant on organisation. Two triggers: one when a campaign is written, one when a
-- client's brand name changes. Both run with the privileges of the caller, which is leads_fynix (or the owner),
-- the only roles that write these tables. No SECURITY DEFINER, so no function here can be used to read more
-- than its caller could.
CREATE FUNCTION public.campaign_copy_client_brand() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  -- COALESCE so that a client id pointing at a non-client organisation (no brand) reaches the foreign key, which
  -- refuses it with a message that names the real problem, instead of failing here on a NOT NULL.
  NEW.client_brand_name := COALESCE((SELECT o.brand_name FROM public.organisation o WHERE o.id = NEW.client_org_id), '');
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.organisation_push_brand() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  UPDATE public.campaign SET client_brand_name = NEW.brand_name WHERE client_org_id = NEW.id;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.campaign_copy_client_brand() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.organisation_push_brand() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER campaign_copy_client_brand BEFORE INSERT OR UPDATE OF client_org_id ON "campaign"
  FOR EACH ROW EXECUTE FUNCTION public.campaign_copy_client_brand();
--> statement-breakpoint
CREATE TRIGGER organisation_push_brand AFTER UPDATE OF brand_name ON "organisation"
  FOR EACH ROW WHEN (OLD.brand_name IS DISTINCT FROM NEW.brand_name) EXECUTE FUNCTION public.organisation_push_brand();
