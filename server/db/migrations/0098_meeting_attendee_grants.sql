-- Calendar step C: invitations to a meeting and the reads of who is free. Additive.

-- 1. The table. No runtime role holds a grant: the functions below (owned by the owner role, which has the one policy) are the only way in and out.
ALTER TABLE "meeting_attendee" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "meeting_attendee" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "meeting_attendee" TO leads_owner;
--> statement-breakpoint
CREATE POLICY "meeting_attendee_owner_all" ON "meeting_attendee" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint

-- 2. Who may read the team of a client: the client itself, an agency that has a campaign with it (as coordinator or by a share), and Fynix.
-- Fynix connects as leads_fynix, so the login role tells it apart. Not granted to any runtime role: only the two functions below call it.
CREATE FUNCTION public.app_may_read_team(p_client uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT COALESCE(session_user::text = 'leads_fynix', false)
      OR COALESCE(public.app_current_org_id() = p_client, false)
      OR COALESCE(public.app_agency_sees_client(p_client), false)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_may_read_team(uuid) FROM PUBLIC;
--> statement-breakpoint

-- 3. The people of a client: a name and the client's time zone. Never a job title, an email or a phone. Empty for a client the caller may not read.
CREATE FUNCTION public.app_team_people(p_client uuid) RETURNS TABLE (member_id uuid, display_name text, time_zone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT m.id, m.display_name, o.time_zone
    FROM public.member m
    JOIN public.organisation o ON o.id = m.org_id
   WHERE m.org_id = p_client AND m.org_kind = 'client' AND m.status = 'active'
     AND public.app_may_read_team(p_client)
   ORDER BY m.display_name, m.id
$$;
--> statement-breakpoint

-- 4. When each person of a client is busy between two moments, as bare start and end times with nothing to say why. A blocked time, a meeting and an invitation
-- all look the same. The range is at most 62 days. Step F adds time synced from Google and Outlook by replacing this function.
CREATE FUNCTION public.app_team_busy(p_client uuid, p_from timestamp with time zone, p_to timestamp with time zone)
  RETURNS TABLE (member_id uuid, display_name text, starts_at timestamp with time zone, ends_at timestamp with time zone)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
#variable_conflict use_column
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '62 days' THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH people AS (
    SELECT m.id AS pid, m.display_name AS pname
      FROM public.member m
     WHERE m.org_id = p_client AND m.org_kind = 'client' AND m.status = 'active'
       AND public.app_may_read_team(p_client)
  ), spans AS (
    SELECT b.member_id AS pid, b.starts_at AS s, b.ends_at AS e
      FROM public.host_block b
    UNION ALL
    SELECT t.host_member_id, t.scheduled_start_time, t.scheduled_start_time + make_interval(mins => t.duration_minutes)
      FROM public.meeting t
     WHERE t.outcome = 'scheduled'
    UNION ALL
    SELECT a.member_id, t.scheduled_start_time, t.scheduled_start_time + make_interval(mins => t.duration_minutes)
      FROM public.meeting_attendee a
      JOIN public.meeting t ON t.id = a.meeting_id
     WHERE t.outcome = 'scheduled'
       AND (a.reply = 'accepted' OR (a.reply = 'invited' AND (t.reply_due_at IS NULL OR t.reply_due_at > now())))
  )
  SELECT DISTINCT p.pid, p.pname, x.s, x.e
    FROM people p
    JOIN spans x ON x.pid = p.pid
   WHERE x.s < p_to AND x.e > p_from
   ORDER BY p.pname, p.pid, x.s, x.e;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_team_people(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_team_busy(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_team_people(uuid) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_team_busy(uuid, timestamp with time zone, timestamp with time zone) TO leads_client, leads_agency, leads_fynix;
