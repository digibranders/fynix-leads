-- Calendar step D: the team reads are keyed by campaign. Tenants never read an organisation id, so an agency cannot name a client by its id, but it knows its
-- campaigns. The three functions below take a campaign the caller may see (the client of it, an agency that serves it, or Fynix) and answer for that campaign's
-- client. The id versions of 0098 stay as the inner helpers and are no longer granted to any runtime role.

-- 1. The client of a campaign the caller may read, or nothing. Never granted: only the two functions below call it, so no tenant is ever told an id.
CREATE FUNCTION public.app_team_client(p_campaign uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT c.client_org_id
    FROM public.campaign c
   WHERE c.id = p_campaign
     AND (COALESCE(session_user::text = 'leads_fynix', false)
       OR COALESCE(c.client_org_id = public.app_current_org_id(), false)
       OR COALESCE(public.app_agency_sees_campaign(p_campaign), false))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_team_client(uuid) FROM PUBLIC;
--> statement-breakpoint

-- 2. The people of that campaign's client: a name and the client's time zone.
CREATE FUNCTION public.app_team_people_for_campaign(p_campaign uuid) RETURNS TABLE (member_id uuid, display_name text, time_zone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT p.member_id, p.display_name, p.time_zone FROM public.app_team_people(public.app_team_client(p_campaign)) p
$$;
--> statement-breakpoint

-- 3. When each of them is busy between two moments, with the same limit of 62 days.
CREATE FUNCTION public.app_team_busy_for_campaign(p_campaign uuid, p_from timestamp with time zone, p_to timestamp with time zone)
  RETURNS TABLE (member_id uuid, display_name text, starts_at timestamp with time zone, ends_at timestamp with time zone)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT b.member_id, b.display_name, b.starts_at, b.ends_at FROM public.app_team_busy(public.app_team_client(p_campaign), p_from, p_to) b
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_team_people_for_campaign(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_team_busy_for_campaign(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_team_people_for_campaign(uuid) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_team_busy_for_campaign(uuid, timestamp with time zone, timestamp with time zone) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.app_team_people(uuid) FROM leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.app_team_busy(uuid, timestamp with time zone, timestamp with time zone) FROM leads_client, leads_agency, leads_fynix;
