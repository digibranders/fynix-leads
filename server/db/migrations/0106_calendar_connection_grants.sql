-- Calendar step F: who may touch the two calendar tables, and how busy time from a connected calendar reaches the screens. Only leads_auth reads or writes the tables
-- (the sync and the connect and disconnect routes run on it, outside any tenant connection). A person's own connections, Fynix's warnings and the busy time
-- are read through functions that return no token.

-- 1. calendar_connection: the encrypted refresh token and the state of the sync.
ALTER TABLE "calendar_connection" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "calendar_connection" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "calendar_connection" TO leads_owner;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "calendar_connection" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "calendar_connection_owner_all" ON "calendar_connection" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "calendar_connection_auth_all" ON "calendar_connection" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
--> statement-breakpoint

-- 2. member_busy: bare start and end times. The sync replaces a connection's rows, so it needs no UPDATE.
ALTER TABLE "member_busy" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "member_busy" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "member_busy" TO leads_owner;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "member_busy" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "member_busy_owner_all" ON "member_busy" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "member_busy_auth_all" ON "member_busy" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
--> statement-breakpoint

-- 3. Busy time now includes what a connected calendar says. Same shape as before; a span from a calendar looks like any other.
CREATE OR REPLACE FUNCTION public.app_team_busy(p_client uuid, p_from timestamp with time zone, p_to timestamp with time zone)
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
    SELECT y.member_id, y.starts_at, y.ends_at
      FROM public.member_busy y
    UNION ALL
    SELECT t.host_member_id, t.scheduled_start_time, t.scheduled_start_time + make_interval(mins => t.duration_minutes)
      FROM public.meeting t
     WHERE t.outcome = 'scheduled'
       AND (t.confirmed_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public.meeting_attendee x WHERE x.meeting_id = t.id))
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

-- 4. The signed-in client person reads their own connections: which provider, whether it works, when it last synced. Never a token.
CREATE FUNCTION public.app_my_calendar_connections() RETURNS TABLE (provider text, status text, last_synced_at timestamp with time zone)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT c.provider, c.status, c.last_synced_at
    FROM public.calendar_connection c
    JOIN public.member m ON m.id = c.member_id
   WHERE m.user_id = public.app_current_user_id() AND m.org_id = public.app_current_org_id() AND m.org_kind = 'client' AND m.status = 'active'
   ORDER BY c.provider
$$;
--> statement-breakpoint

-- 5. Fynix sees which connections are broken, by person and client, to warn on the calendar. Nobody else does.
CREATE FUNCTION public.app_calendar_warnings() RETURNS TABLE (member_name text, client_name text, provider text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT m.display_name, o.name, c.provider
    FROM public.calendar_connection c
    JOIN public.member m ON m.id = c.member_id
    JOIN public.organisation o ON o.id = m.org_id
   WHERE c.status = 'broken' AND session_user::text = 'leads_fynix'
   ORDER BY o.name, m.display_name, c.provider
$$;
--> statement-breakpoint

-- 6. A connection that stopped working tells its owner, in the app, once. The notice writer of 0071 sends to whole sides, so this one writes the single notice.
CREATE FUNCTION public.app_calendar_connection_broken(p_member uuid, p_provider text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  INSERT INTO public.notification (user_id, org_id, kind, title, body, link)
  SELECT m.user_id, m.org_id, 'general', 'Your calendar needs to be connected again',
         'The connection to your ' || CASE p_provider WHEN 'google' THEN 'Google' ELSE 'Microsoft' END || ' calendar stopped working. Connect it again on your profile page so your free times stay right.',
         '/client/profile'
    FROM public.member m
   WHERE m.id = p_member AND m.status = 'active';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_my_calendar_connections() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_calendar_warnings() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_calendar_connection_broken(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_my_calendar_connections() TO leads_client;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_calendar_warnings() TO leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_calendar_connection_broken(uuid, text) TO leads_auth;
