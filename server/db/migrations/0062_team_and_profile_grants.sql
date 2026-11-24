-- Phase 1 chunk C: the Team pages, the profile page and a coordinator adding its own partner agencies.
--
-- The tenant roles hold no grant on "user" (the email lives there) and a member policy that stops at their own organisation, so every list
-- of people here is a SECURITY DEFINER function that takes who is asking from the transaction settings and never looks upward: a client
-- sees its own organisation, a coordinator its own and its partner agencies', a partner agency its own.

-- 1. member.meeting_emails (0061): a client manager switches it for the people of their own client. The row policy of 0059 (own organisation, caller is
-- a manager) already limits which rows; this grants the one column. Tenants get no SELECT on it: the Team list reads it through app_my_team().
GRANT UPDATE ("meeting_emails") ON "member" TO leads_client;
--> statement-breakpoint

-- 2. The people of my side, with their email, phone and role, and the invites still open. `org_id` is null for the caller's own organisation (the
-- caller knows it already) and the partner agency's id for a coordinator's partner agency, which the coordinator needs to invite into it.
-- Open invites are listed to managers only, as the invite policies already do.
CREATE FUNCTION public.app_my_team() RETURNS TABLE (
  kind text, id uuid, org_id uuid, org_name text, name text, job_title text, email text, phone text, role text, status text, meeting_emails boolean, expires_at timestamptz
)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT 'member'::text, m.id, CASE WHEN o.id = public.app_current_org_id() THEN NULL ELSE o.id END, o.name, m.display_name, m.job_title, u.email, m.phone,
           m.role::text, m.status::text, m.meeting_emails, NULL::timestamptz
    FROM public.member m
    JOIN public.organisation o ON o.id = m.org_id
    JOIN public."user" u ON u.id = m.user_id
    WHERE public.app_current_org_id() IS NOT NULL AND (o.id = public.app_current_org_id() OR o.parent_org_id = public.app_current_org_id())
    UNION ALL
    SELECT 'invite'::text, i.id, CASE WHEN o.id = public.app_current_org_id() THEN NULL ELSE o.id END, o.name, i.name, i.job_title, i.email, i.phone,
           i.role::text, 'invited'::text, true, i.expires_at
    FROM public.invite i
    JOIN public.organisation o ON o.id = i.org_id
    WHERE public.app_current_org_id() IS NOT NULL AND public.app_caller_is_manager()
      AND (o.id = public.app_current_org_id() OR o.parent_org_id = public.app_current_org_id())
      AND i.redeemed_at IS NULL AND i.revoked_at IS NULL
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_my_team() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_my_team() TO leads_client, leads_agency;
--> statement-breakpoint

-- 3. Everybody changes their own name, job title and phone (the profile page), whatever their role and portal. The member row is found by the account
-- in app.user_id, never by an id the caller sends. It runs with the owner's rights, so the Fynix triggers (they look at current_user = leads_fynix)
-- do not fire: changing your own details is not set-up and needs no admin and no audit row.
CREATE FUNCTION public.app_update_own_details(p_display_name text, p_job_title text, p_phone text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF public.app_current_user_id() IS NULL THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  UPDATE public.member SET display_name = p_display_name, job_title = p_job_title, phone = p_phone
  WHERE user_id = public.app_current_user_id() AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_update_own_details(text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_update_own_details(text, text, text) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint

-- 4. A coordinator's manager adds a partner agency under their own coordinator. The refusals live here, because both the coordinator and the partner
-- agency portals sign in as leads_agency: the caller must be an active manager of an active agency with no parent. A client has no execute right.
CREATE FUNCTION public.app_add_partner_agency(p_name text, p_public_ref text) RETURNS TABLE (org_id uuid, org_ref text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_me public.organisation%ROWTYPE;
  v_id uuid;
  v_ref text;
BEGIN
  IF public.app_current_org_id() IS NULL OR NOT public.app_caller_is_manager() THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_me FROM public.organisation o WHERE o.id = public.app_current_org_id();
  IF NOT FOUND OR v_me.kind <> 'agency' OR v_me.parent_org_id IS NOT NULL THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  IF v_me.status <> 'active' THEN RAISE EXCEPTION 'domain:organisation-archived'; END IF;
  IF EXISTS (SELECT 1 FROM public.organisation o WHERE o.parent_org_id = v_me.id AND lower(btrim(o.name)) = lower(btrim(p_name))) THEN
    RAISE EXCEPTION 'domain:duplicate-name';
  END IF;
  INSERT INTO public.organisation (public_ref, kind, name, parent_org_id)
    VALUES (p_public_ref, 'agency', btrim(p_name), v_me.id)
    RETURNING organisation.id, organisation.public_ref INTO v_id, v_ref;
  RETURN QUERY SELECT v_id, v_ref;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_add_partner_agency(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_add_partner_agency(text, text) TO leads_agency;
--> statement-breakpoint

-- 5. The accept-invite page says "Coordinator" for a coordinator and "Agency" for a partner agency. leads_auth reads no organisation, so the one
-- fact comes from a function bound to the invite whose hash the transaction names (app.invite_hash), like the invite policy itself.
CREATE FUNCTION public.app_invite_org_is_partner() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT o.parent_org_id IS NOT NULL
    FROM public.invite i JOIN public.organisation o ON o.id = i.org_id
    WHERE i.token_hash = current_setting('app.invite_hash', true)
    LIMIT 1
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_invite_org_is_partner() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_invite_org_is_partner() TO leads_auth;
