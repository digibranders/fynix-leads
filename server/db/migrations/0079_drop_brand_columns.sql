-- Release 2 of retiring the brand columns (owner decision, 2026-11-24: "client and brand are the same thing"). Release 1 (0078) stopped the application reading
-- organisation.brand_name, campaign.client_brand_name and alias_identity.client_brand_name and kept them valid with triggers. This drops the three columns and
-- everything that existed only for them. A column's own grants go with the column. Every statement can run again after a partial run.
--
-- NOT additive: the release-1 process names all three columns in its INSERTs into organisation, campaign and alias_identity (Drizzle writes every column of the schema
-- table, with DEFAULT for the ones left out), so those inserts fail between this migration and the start of the release that removes the columns from the schema files.

-- 1. The triggers and functions that maintained the columns. The triggers that fire on a write of the columns would also block the DROP COLUMN.
DROP TRIGGER IF EXISTS organisation_default_brand ON "organisation";
--> statement-breakpoint
DROP TRIGGER IF EXISTS organisation_push_brand ON "organisation";
--> statement-breakpoint
DROP TRIGGER IF EXISTS campaign_copy_client_brand ON "campaign";
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.organisation_default_brand();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.organisation_push_brand();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.campaign_copy_client_brand();
--> statement-breakpoint

-- 2. The one-off backfill of 0078 (its body reads both old columns; it has run).
DROP FUNCTION IF EXISTS public.app_backfill_alias_clients();
--> statement-breakpoint

-- 3. An alias is for a client picked from the clients of the campaigns the agency sees (0064). Same checks as 0078, without the write into client_brand_name. The trigger
--    (BEFORE INSERT OR UPDATE OF client_org_id) stays; CREATE OR REPLACE keeps the function's REVOKE from PUBLIC.
CREATE OR REPLACE FUNCTION public.alias_identity_set_client() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NEW.client_org_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organisation o WHERE o.id = NEW.client_org_id AND o.kind = 'client') THEN
    RAISE EXCEPTION 'alias_client_unknown: an alias is for a client' USING ERRCODE = '23514';
  END IF;
  IF session_user = 'leads_agency' AND NOT EXISTS (
    SELECT 1 FROM public.campaign c WHERE c.client_org_id = NEW.client_org_id AND public.app_agency_sees_campaign(c.id)
  ) THEN
    RAISE EXCEPTION 'alias_client_not_assigned: an alias is for a client of a campaign your organisation is assigned to' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- 4. The checks and the index that used the columns. One alias per member, client and alias address: the index keeps its name (the domain code and the previous release
--    look for it) and now uses client_org_id, as lower(client_brand_name) did. An alias with no client yet (null) never collides, as an unmatched text never did.
ALTER TABLE "organisation" DROP CONSTRAINT IF EXISTS "organisation_client_has_brand";
--> statement-breakpoint
ALTER TABLE "alias_identity" DROP CONSTRAINT IF EXISTS "alias_identity_brand_length";
--> statement-breakpoint
DROP INDEX IF EXISTS "alias_identity_member_brand_email_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alias_identity_member_brand_email_unique" ON "alias_identity" USING btree ("member_id", "client_org_id", "alias_email");
--> statement-breakpoint

-- 5. The columns.
ALTER TABLE "organisation" DROP COLUMN IF EXISTS "brand_name";
--> statement-breakpoint
ALTER TABLE "campaign" DROP COLUMN IF EXISTS "client_brand_name";
--> statement-breakpoint
ALTER TABLE "alias_identity" DROP COLUMN IF EXISTS "client_brand_name";
