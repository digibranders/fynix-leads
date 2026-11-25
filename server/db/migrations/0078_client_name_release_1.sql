-- Release 1 of retiring the brand columns (owner decision, 2026-11-24: "client and brand are the same thing"). The client's one name is organisation.name.
-- Nothing below drops or revokes anything: organisation.brand_name, campaign.client_brand_name and alias_identity.client_brand_name stay, valid and populated
-- (with the client's name), for the process that still runs the old code while this release deploys. The application stops reading them; release 2 drops them.

-- 1. alias_identity.client_brand_name takes a default, so the application can leave it out of an insert. The trigger in step 5 fills it from the client before the
--    NOT NULL and the length check apply; an insert with no client still fails the length check.
ALTER TABLE "alias_identity" ALTER COLUMN "client_brand_name" SET DEFAULT '';
--> statement-breakpoint

-- 2. Aliases made before phase 2 have no client_org_id. Match each by its old brand text to the one client whose brand or name it equals (case-insensitive); a text that
--    matches no client, or more than one, is left null (the application then asks for the client to be picked). Returns the number still unmatched. The update fires the
--    trigger of step 5, which rewrites client_brand_name to the client's name.
CREATE FUNCTION public.app_backfill_alias_clients() RETURNS integer
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_left integer;
BEGIN
  UPDATE public.alias_identity ai SET client_org_id = hit.client_id
    FROM (
      SELECT a.id AS alias_id, min(o.id::text)::uuid AS client_id
        FROM public.alias_identity a
        JOIN public.organisation o ON o.kind = 'client'
         AND (lower(btrim(o.brand_name)) = lower(btrim(a.client_brand_name)) OR lower(btrim(o.name)) = lower(btrim(a.client_brand_name)))
       WHERE a.client_org_id IS NULL
       GROUP BY a.id
      HAVING count(DISTINCT o.id) = 1
    ) hit
   WHERE ai.id = hit.alias_id;
  SELECT count(*) INTO v_left FROM public.alias_identity WHERE client_org_id IS NULL;
  RETURN v_left;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_backfill_alias_clients() FROM PUBLIC;
--> statement-breakpoint

-- 3. The client's name, for the people who may know it: Fynix, a client for its own, an agency or coordinator for a client of a campaign it serves (like
--    app_agency_sees_client, 0059) and for nobody else. One by campaign, for the reads that start from a campaign or a lead; one by client, for the reads that
--    start from an alias.
CREATE FUNCTION public.app_client_name(p_client uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT o.name FROM public.organisation o
     WHERE o.id = p_client AND o.kind = 'client'
       AND (session_user IN ('leads_fynix', 'leads_owner') OR o.id = public.app_current_org_id() OR public.app_agency_sees_client(o.id))
  $$;
--> statement-breakpoint
CREATE FUNCTION public.app_campaign_client_name(p_campaign uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT o.name FROM public.campaign c JOIN public.organisation o ON o.id = c.client_org_id
     WHERE c.id = p_campaign
       AND (session_user IN ('leads_fynix', 'leads_owner') OR c.client_org_id = public.app_current_org_id() OR public.app_agency_sees_campaign(c.id))
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_client_name(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_campaign_client_name(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_client_name(uuid) TO leads_fynix, leads_client, leads_agency;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_campaign_client_name(uuid) TO leads_fynix, leads_client, leads_agency;
--> statement-breakpoint

-- 4. The old columns follow the name. A client's brand_name is its name (the check "organisation_client_has_brand" stays and still holds), and a rename of the client
--    reaches campaign.client_brand_name, as a rename of the brand did. The push runs as the owner: an agency that renames its own organisation fires no push
--    (only a client's name does), but a Fynix rename must not depend on the caller's grants.
CREATE FUNCTION public.organisation_default_brand() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF NEW.kind = 'client' THEN
    NEW.brand_name := NEW.name;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.organisation_default_brand() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER organisation_default_brand BEFORE INSERT OR UPDATE OF name, brand_name ON "organisation"
  FOR EACH ROW EXECUTE FUNCTION public.organisation_default_brand();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.organisation_push_brand() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  UPDATE public.campaign SET client_brand_name = NEW.name WHERE client_org_id = NEW.id;
  RETURN NULL;
END
$$;
--> statement-breakpoint
DROP TRIGGER organisation_push_brand ON "organisation";
--> statement-breakpoint
CREATE TRIGGER organisation_push_brand AFTER UPDATE OF name ON "organisation"
  FOR EACH ROW WHEN (NEW.kind = 'client' AND OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION public.organisation_push_brand();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.campaign_copy_client_brand() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
DECLARE
  client_name text;
BEGIN
  SELECT o.name INTO client_name FROM public.organisation o WHERE o.id = NEW.client_org_id FOR SHARE;
  -- COALESCE so that a client id pointing at a missing organisation reaches the foreign key, which refuses it with a message that names the real problem.
  NEW.client_brand_name := COALESCE(client_name, '');
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- 5. An alias is for a client picked from the clients of the campaigns the agency sees (0064); the trigger still refuses any other and now writes the client's
--    name (at most 100 characters, as the column's check allows) into client_brand_name.
CREATE OR REPLACE FUNCTION public.alias_identity_set_client() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.client_org_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT left(btrim(o.name), 100) INTO v_name FROM public.organisation o WHERE o.id = NEW.client_org_id AND o.kind = 'client';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'alias_client_unknown: an alias is for a client' USING ERRCODE = '23514';
  END IF;
  IF session_user = 'leads_agency' AND NOT EXISTS (
    SELECT 1 FROM public.campaign c WHERE c.client_org_id = NEW.client_org_id AND public.app_agency_sees_campaign(c.id)
  ) THEN
    RAISE EXCEPTION 'alias_client_not_assigned: an alias is for a client of a campaign your organisation is assigned to' USING ERRCODE = '42501';
  END IF;
  NEW.client_brand_name := v_name;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- 6. The prospect letter names the client by its name (the parameter keeps its key, clientBrand, which the templates read). Same function as 0075 otherwise;
--    CREATE OR REPLACE keeps its REVOKE from PUBLIC.
CREATE OR REPLACE FUNCTION public.app_email_enqueue(p_lead uuid, p_audience text[], p_template text, p_params jsonb, p_subject text, p_body text, p_origin text, p_exclude uuid) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_count integer := 0;
  v_prospect boolean := p_template LIKE 'prospect\_%';
BEGIN
  IF p_template NOT IN ('lead_waiting', 'lead_submitted_info', 'times_proposed_info', 'meeting_booked', 'meeting_moved', 'meeting_cancelled', 'outcome_nudge', 'outcome_held_client',
                        'outcome_held_info', 'decision_reminder', 'lead_accepted_info', 'lead_rejected_info', 'lead_auto_accepted_info', 'rejection_overturned_info', 'no_show_info',
                        'prospect_confirmed', 'prospect_moved', 'prospect_cancelled', 'prospect_reminder_24h', 'prospect_reminder_1h')
     OR p_audience IS NULL OR cardinality(p_audience) = 0
     OR NOT (p_audience <@ ARRAY['client', 'client_meeting', 'source', 'coordinator', 'partner_coordinator', 'fynix', 'prospect'])
     OR (v_prospect AND p_audience <> ARRAY['prospect'])
     OR (NOT v_prospect AND 'prospect' = ANY (p_audience))
     OR jsonb_typeof(p_params) <> 'object' THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;

  IF v_prospect THEN
    INSERT INTO public.email_outbox (recipient, template, params, subject, body, sender_name, reply_to)
    SELECT l.prospect_email, p_template::public.email_template,
           p_params || jsonb_build_object('prospectName', l.prospect_name, 'clientBrand', o.name, 'privacyUrl', c.client_privacy_url, 'signerName', ai.display_name, 'signerTitle', ai.job_title),
           p_subject, p_body, ai.display_name, ai.alias_email
      FROM public.lead l
      JOIN public.campaign c ON c.id = l.campaign_id
      JOIN public.organisation o ON o.id = c.client_org_id
      JOIN public.alias_identity ai ON ai.id = l.alias_identity_id
     WHERE l.id = p_lead AND l.released AND c.prospect_email_enabled AND c.client_privacy_url IS NOT NULL
       AND l.prospect_email <> '' AND ai.status = 'active' AND ai.verified_at IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END IF;

  WITH ctx AS (
    SELECT c.client_org_id, c.agency_org_id AS supplier_org_id, l.source_org_id, l.public_ref AS lead_ref, c.public_ref AS campaign_ref
      FROM public.lead l JOIN public.campaign c ON c.id = l.campaign_id
     WHERE l.id = p_lead AND l.released
  ), people AS (
    SELECT DISTINCT ON (u.email) u.email, public.app_notice_path(m.org_kind::text, (o.parent_org_id IS NULL), 'lead', ctx.lead_ref, ctx.campaign_ref) AS path
      FROM ctx
      JOIN public.member m ON m.status = 'active'
      JOIN public.organisation o ON o.id = m.org_id
      JOIN public."user" u ON u.id = m.user_id
     WHERE m.user_id IS DISTINCT FROM p_exclude
       AND (
            ('client' = ANY (p_audience) AND m.org_id = ctx.client_org_id)
         OR ('client_meeting' = ANY (p_audience) AND m.org_id = ctx.client_org_id AND m.meeting_emails)
         OR ('source' = ANY (p_audience) AND m.org_id = ctx.source_org_id)
         OR ('coordinator' = ANY (p_audience) AND m.org_id = ctx.supplier_org_id)
         OR ('partner_coordinator' = ANY (p_audience) AND ctx.source_org_id <> ctx.supplier_org_id AND m.org_id = ctx.supplier_org_id)
         OR ('fynix' = ANY (p_audience) AND m.org_kind = 'fynix')
       )
  )
  INSERT INTO public.email_outbox (recipient, template, params, subject, body, link)
  SELECT p.email, p_template::public.email_template, p_params, p_subject, p_body, p_origin || p.path FROM people p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint

-- 7. Match the old aliases now, and say how many could not be matched.
DO $$
DECLARE
  v_left integer := public.app_backfill_alias_clients();
BEGIN
  RAISE NOTICE 'alias_identity rows without a client after the backfill: %', v_left;
END
$$;
