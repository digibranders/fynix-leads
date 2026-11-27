-- The client team replaces campaign hosts (calendar spec of 2026-11-26, step B). Additive: nothing is dropped. `campaign_host` and
-- `app_campaign_host_names` stay for the process still running during a deploy, and go in the clean-up phase.

-- 1. Who an agency may choose for a lead: every active person of the campaign's client. A name and the client's time zone,
-- never a job title, an email or a phone. It answers only for a campaign the caller coordinates or has a share of.
CREATE FUNCTION public.app_campaign_team(p_campaign uuid) RETURNS TABLE (member_id uuid, display_name text, time_zone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT m.id, m.display_name, o.time_zone
    FROM public.campaign c
    JOIN public.organisation o ON o.id = c.client_org_id
    JOIN public.member m ON m.org_id = c.client_org_id
   WHERE c.id = p_campaign AND m.status = 'active'
     AND (c.agency_org_id = public.app_current_org_id()
       OR EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id()))
   ORDER BY m.display_name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_campaign_team(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_campaign_team(uuid) TO leads_agency;
--> statement-breakpoint
-- 2. The agency reads a person's hours and blocked times when that person belongs to a client it serves. The policies of 0032 asked
-- `campaign_host`. A policy runs as the caller, and an agency cannot read a client's `member` rows, so the question goes to a function.
CREATE FUNCTION public.app_agency_serves_member(p_member uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.member m
    JOIN public.campaign c ON c.client_org_id = m.org_id
    WHERE m.id = p_member AND m.status = 'active'
      AND (c.agency_org_id = public.app_current_org_id()
        OR EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id()))
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_agency_serves_member(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_agency_serves_member(uuid) TO leads_agency;
--> statement-breakpoint
DROP POLICY "host_hours_agency_read" ON "host_hours";
--> statement-breakpoint
CREATE POLICY "host_hours_agency_read" ON "host_hours" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (public.app_agency_serves_member("host_hours"."member_id"));
--> statement-breakpoint
DROP POLICY "host_block_agency_read" ON "host_block";
--> statement-breakpoint
CREATE POLICY "host_block_agency_read" ON "host_block" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (public.app_agency_serves_member("host_block"."member_id"));
--> statement-breakpoint
-- 3. Going live: "an active host" becomes "an active person of the client". The column keeps the name `has_host`, a code name.
CREATE OR REPLACE FUNCTION public.campaign_go_live_state(p_campaign uuid) RETURNS TABLE (agreed boolean, client_accepted boolean, supplier_accepted boolean, has_host boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    WITH versions AS (
      SELECT a.version,
        EXISTS (SELECT 1 FROM public.agreement_acceptance x WHERE x.agreement_id = a.id AND x.side = 'client') AS client_done,
        EXISTS (SELECT 1 FROM public.agreement_acceptance x WHERE x.agreement_id = a.id AND x.side = 'supplier') AS supplier_done
      FROM public.agreement a
      WHERE a.campaign_id = p_campaign AND a.party = 'client'
    ), forced AS (
      SELECT EXISTS (SELECT 1 FROM versions WHERE client_done AND supplier_done) AS yes
    ), newest AS (
      SELECT client_done, supplier_done FROM versions ORDER BY version DESC LIMIT 1
    )
    SELECT forced.yes,
           forced.yes OR COALESCE((SELECT client_done FROM newest), false),
           forced.yes OR COALESCE((SELECT supplier_done FROM newest), false),
           EXISTS (
             SELECT 1 FROM public.campaign c JOIN public.member m ON m.org_id = c.client_org_id
             WHERE c.id = p_campaign AND m.status = 'active'
           )
    FROM forced
  $$;
