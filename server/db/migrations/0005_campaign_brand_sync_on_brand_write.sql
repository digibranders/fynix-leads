-- Closes two gaps in 0004. The copy trigger fired only on INSERT and on UPDATE OF client_org_id, so a direct
-- UPDATE of campaign.client_brand_name was never corrected and the agency could be shown a wrong brand. It now also
-- fires when client_brand_name is written. The client's row is read FOR SHARE, so a concurrent rename of the brand
-- (which holds the row lock until it commits) is waited for and cannot be missed. FOR KEY SHARE would not do: it
-- does not conflict with an update of a non-key column such as brand_name. Still no SECURITY DEFINER; the caller
-- needs UPDATE on organisation for FOR SHARE, which leads_fynix and the owner have.
-- CREATE OR REPLACE keeps the function's existing REVOKE from PUBLIC.
CREATE OR REPLACE FUNCTION public.campaign_copy_client_brand() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
DECLARE
  client_brand text;
BEGIN
  SELECT o.brand_name INTO client_brand FROM public.organisation o WHERE o.id = NEW.client_org_id FOR SHARE;
  -- COALESCE so that a client id pointing at a non-client organisation (no brand) reaches the foreign key, which
  -- refuses it with a message that names the real problem, instead of failing here on a NOT NULL.
  NEW.client_brand_name := COALESCE(client_brand, '');
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER campaign_copy_client_brand ON "campaign";
--> statement-breakpoint
CREATE TRIGGER campaign_copy_client_brand BEFORE INSERT OR UPDATE OF client_org_id, client_brand_name ON "campaign"
  FOR EACH ROW EXECUTE FUNCTION public.campaign_copy_client_brand();
