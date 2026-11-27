-- A person of any organisation can connect a calendar (their own events show on their own calendar page). Two functions of 0106 still spoke of clients alone.

-- 1. Fynix's warning is about the people of clients, whose free time depends on the connection. A broken connection of an agency or Fynix person is that person's own business.
CREATE OR REPLACE FUNCTION public.app_calendar_warnings() RETURNS TABLE (member_name text, client_name text, provider text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT m.display_name, o.name, c.provider
    FROM public.calendar_connection c
    JOIN public.member m ON m.id = c.member_id
    JOIN public.organisation o ON o.id = m.org_id
   WHERE c.status = 'broken' AND m.org_kind = 'client' AND session_user::text = 'leads_fynix'
   ORDER BY o.name, m.display_name, c.provider
$$;
--> statement-breakpoint

-- 2. The notice that a connection stopped working points at the profile page of the person's own portal.
CREATE OR REPLACE FUNCTION public.app_calendar_connection_broken(p_member uuid, p_provider text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  INSERT INTO public.notification (user_id, org_id, kind, title, body, link)
  SELECT m.user_id, m.org_id, 'general', 'Your calendar needs to be connected again',
         'The connection to your ' || CASE p_provider WHEN 'google' THEN 'Google' ELSE 'Microsoft' END || ' calendar stopped working. Connect it again on your profile page.',
         CASE m.org_kind WHEN 'client' THEN '/client/profile' WHEN 'agency' THEN '/agency/profile' ELSE '/fynix/profile' END
    FROM public.member m
   WHERE m.id = p_member AND m.status = 'active';
END
$$;
