-- Calendar step E, the part that was left: the invitation email and the reply page that works without signing in. The email carries one link with a 32 byte token;
-- only the token's SHA-256 is stored (meeting_attendee.reply_token_hash, from 0102). The page runs as leads_auth, so these functions are the only way in.

-- 1. The hash the portal stores for a token: SHA-256 as base64url without padding, the same as `hashInviteToken` in code. Internal.
CREATE FUNCTION public.app_token_hash(p_token text) RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog, public
  AS $$ SELECT translate(rtrim(encode(sha256(convert_to(p_token, 'UTF8')), 'base64'), '='), '+/', '-_') $$;
--> statement-breakpoint

-- 2. May the caller act on this campaign's meetings: Fynix, the client of it, or an agency that serves it. Internal.
CREATE FUNCTION public.app_can_invite_for(p_campaign uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT COALESCE(session_user::text = 'leads_fynix', false)
      OR EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = p_campaign AND c.client_org_id = public.app_current_org_id())
      OR COALESCE(public.app_agency_sees_campaign(p_campaign), false)
$$;
--> statement-breakpoint

-- 3. What the invitation email says about a meeting that is booked and not yet confirmed.
CREATE FUNCTION public.app_invitation_email_context(p_meeting uuid)
  RETURNS TABLE (meeting_ref text, lead_ref text, company text, campaign_name text, starts_at timestamp with time zone, minutes integer, reply_due_at timestamp with time zone, time_zone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT t.public_ref, l.public_ref, l.prospect_company, c.name, t.scheduled_start_time, t.duration_minutes, t.reply_due_at, c.time_zone
    FROM public.meeting t
    JOIN public.lead l ON l.id = t.lead_id
    JOIN public.campaign c ON c.id = t.campaign_id
   WHERE t.id = p_meeting AND t.outcome = 'scheduled' AND t.confirmed_at IS NULL AND public.app_can_invite_for(t.campaign_id)
$$;
--> statement-breakpoint

-- 4. Queues one invitation email for each person invited. The caller hands over the tokens it just made; each must match the hash stored for that person, so
-- the function cannot be used to write a message for anyone who was not invited. The link is the reply page with the token.
CREATE FUNCTION public.app_enqueue_invitation_emails(p_meeting uuid, p_members uuid[], p_tokens text[], p_params jsonb, p_subject text, p_body text, p_origin text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_campaign uuid;
  v_count integer;
BEGIN
  IF COALESCE(array_length(p_members, 1), 0) = 0 OR array_length(p_members, 1) IS DISTINCT FROM array_length(p_tokens, 1) OR jsonb_typeof(p_params) <> 'object' OR p_origin !~ '^https?://[^/]+$' THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;
  SELECT t.campaign_id INTO v_campaign FROM public.meeting t WHERE t.id = p_meeting AND t.outcome = 'scheduled' AND t.confirmed_at IS NULL;
  IF v_campaign IS NULL OR NOT public.app_can_invite_for(v_campaign) THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.email_outbox (recipient, template, params, subject, body, link)
  SELECT u.email, 'meeting_invitation'::public.email_template, p_params, p_subject, p_body, p_origin || '/reply?token=' || x.token
    FROM unnest(p_members, p_tokens) AS x(member_id, token)
    JOIN public.meeting_attendee a ON a.meeting_id = p_meeting AND a.member_id = x.member_id AND a.reply = 'invited' AND a.reply_token_hash = public.app_token_hash(x.token)
    JOIN public.member m ON m.id = x.member_id AND m.status = 'active'
    JOIN public."user" u ON u.id = m.user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint

-- 5. What the reply page shows for a token: the meeting, the person's own reply, and whether the meeting is still open to an answer. No token is returned.
CREATE FUNCTION public.app_invitation_by_token(p_hash text)
  RETURNS TABLE (meeting_id uuid, meeting_ref text, company text, campaign_name text, starts_at timestamp with time zone, minutes integer, reply text, reply_due_at timestamp with time zone,
                 confirmed boolean, outcome text, time_zone text, has_room boolean, person_name text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT t.id, t.public_ref, l.prospect_company, c.name, t.scheduled_start_time, t.duration_minutes, a.reply, t.reply_due_at,
         t.confirmed_at IS NOT NULL, t.outcome, c.time_zone, t.google_meet_url IS NOT NULL, m.display_name
    FROM public.meeting_attendee a
    JOIN public.member m ON m.id = a.member_id AND m.status = 'active'
    JOIN public.meeting t ON t.id = a.meeting_id
    JOIN public.lead l ON l.id = t.lead_id
    JOIN public.campaign c ON c.id = t.campaign_id
   WHERE a.reply_token_hash = p_hash
$$;
--> statement-breakpoint

-- 6. The answer itself, for a person who is already known (by their session or by their token). This is the body of `app_reply_invitation` of 0102, with the person
-- and the account that acted passed in. Internal: only the two functions below call it.
CREATE FUNCTION public.app_answer_invitation(p_member uuid, p_user uuid, p_meeting uuid, p_reply text, p_room_url text, p_room_space text)
  RETURNS TABLE (confirmed_now boolean, rescheduled boolean, lead_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
#variable_conflict use_column
DECLARE
  v_attendee uuid;
  v_reply text;
  v_lead uuid;
  v_confirmed timestamp with time zone;
  v_outcome text;
  v_start timestamp with time zone;
  v_due timestamp with time zone;
BEGIN
  IF p_reply IS NULL OR p_reply NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;
  SELECT a.id, a.reply, t.lead_id, t.confirmed_at, t.outcome, t.scheduled_start_time, t.reply_due_at
    INTO v_attendee, v_reply, v_lead, v_confirmed, v_outcome, v_start, v_due
    FROM public.meeting_attendee a
    JOIN public.meeting t ON t.id = a.meeting_id
   WHERE a.meeting_id = p_meeting AND a.member_id = p_member
   FOR UPDATE OF a, t;
  IF v_attendee IS NULL THEN
    RAISE EXCEPTION 'domain:not-found' USING ERRCODE = 'P0002';
  END IF;
  IF v_outcome <> 'scheduled' OR (v_reply = 'invited' AND v_confirmed IS NULL AND v_due IS NOT NULL AND v_due <= now()) THEN
    RAISE EXCEPTION 'domain:invalid-transition' USING ERRCODE = '22023';
  END IF;
  confirmed_now := false;
  rescheduled := false;
  lead_id := v_lead;
  IF v_reply = p_reply THEN
    RETURN NEXT;
    RETURN;
  END IF;
  UPDATE public.meeting_attendee SET reply = p_reply, replied_at = now() WHERE id = v_attendee;
  IF p_reply = 'accepted' AND v_confirmed IS NULL THEN
    UPDATE public.meeting
       SET confirmed_at = now(), host_member_id = p_member,
           google_meet_url = COALESCE(google_meet_url, p_room_url), google_space_id = COALESCE(google_space_id, p_room_space), updated_at = now()
     WHERE id = p_meeting;
    UPDATE public.meeting_attendee SET reply = 'released', replied_at = now() WHERE meeting_id = p_meeting AND reply = 'invited';
    UPDATE public.lead SET stage = 'scheduled', scheduled_meeting_time = v_start, scheduled_at = now(), host_member_id = p_member, updated_at = now()
     WHERE id = v_lead AND stage = 'awaiting_reply';
    INSERT INTO public.lead_history (lead_id, actor_user_id, actor_role, action, from_stage, to_stage, note, created_at)
    VALUES (v_lead, p_user, 'client', 'lead.invitation_accept', 'awaiting_reply', 'scheduled', 'A client team member accepted the meeting', now());
    confirmed_now := true;
  ELSIF p_reply = 'declined' AND NOT EXISTS (SELECT 1 FROM public.meeting_attendee WHERE meeting_id = p_meeting AND reply IN ('invited', 'accepted')) THEN
    UPDATE public.meeting SET outcome = 'rescheduled', updated_at = now() WHERE id = p_meeting;
    UPDATE public.lead SET stage = 'reschedule_needed', updated_at = now() WHERE id = v_lead AND stage IN ('awaiting_reply', 'scheduled');
    INSERT INTO public.lead_history (lead_id, actor_user_id, actor_role, action, from_stage, to_stage, note, created_at)
    VALUES (v_lead, p_user, 'client', 'lead.invitation_decline', NULL, 'reschedule_needed', 'Nobody on the client team could take the meeting', now());
    rescheduled := true;
  END IF;
  RETURN NEXT;
END
$$;
--> statement-breakpoint

-- 7. The signed-in person's answer is the same function, with the person found from the session.
CREATE OR REPLACE FUNCTION public.app_reply_invitation(p_meeting uuid, p_reply text, p_room_url text, p_room_space text)
  RETURNS TABLE (confirmed_now boolean, rescheduled boolean, lead_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_member uuid;
BEGIN
  SELECT m.id INTO v_member FROM public.member m
   WHERE m.user_id = public.app_current_user_id() AND m.org_id = public.app_current_org_id() AND m.org_kind = 'client' AND m.status = 'active';
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT r.confirmed_now, r.rescheduled, r.lead_id FROM public.app_answer_invitation(v_member, public.app_current_user_id(), p_meeting, p_reply, p_room_url, p_room_space) r;
END
$$;
--> statement-breakpoint

-- 8. The answer from the email link. Runs as leads_auth with no session. The in-app notices are written here, because the portal's notice writer needs a tenant
-- scope; the words are the ones of `meeting_scheduled` and `reschedule_needed` in lib/leads/notices.ts, and a test holds them equal. The person who answered is
-- left out of them. Anything that is not a live, open invitation is refused: an unknown token the same as an expired one.
CREATE FUNCTION public.app_reply_by_token(p_hash text, p_reply text, p_room_url text, p_room_space text)
  RETURNS TABLE (confirmed_now boolean, rescheduled boolean, lead_id uuid, meeting_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
#variable_conflict use_column
DECLARE
  v_member uuid;
  v_user uuid;
  v_meeting uuid;
  v_confirmed boolean;
  v_rescheduled boolean;
  v_lead uuid;
BEGIN
  SELECT a.member_id, m.user_id, a.meeting_id INTO v_member, v_user, v_meeting
    FROM public.meeting_attendee a
    JOIN public.member m ON m.id = a.member_id AND m.status = 'active'
   WHERE a.reply_token_hash = p_hash;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'domain:not-found' USING ERRCODE = 'P0002';
  END IF;
  SELECT r.confirmed_now, r.rescheduled, r.lead_id INTO v_confirmed, v_rescheduled, v_lead
    FROM public.app_answer_invitation(v_member, v_user, v_meeting, p_reply, p_room_url, p_room_space) r;
  IF v_confirmed THEN
    PERFORM public.app_notice_insert(v_lead, NULL, v_meeting, ARRAY['client', 'source', 'coordinator', 'fynix'], 'meeting_scheduled', 'Meeting booked for {ref}', 'A meeting time was picked for {company}.', 'lead', v_user);
  END IF;
  IF v_rescheduled THEN
    PERFORM public.app_notice_insert(v_lead, NULL, v_meeting, ARRAY['source', 'coordinator', 'fynix'], 'general', 'A new time is needed for {ref}', 'Nobody at the client could take the meeting with {company}. Pick another time.', 'lead', v_user);
  END IF;
  confirmed_now := v_confirmed;
  rescheduled := v_rescheduled;
  lead_id := v_lead;
  meeting_id := v_meeting;
  RETURN NEXT;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_token_hash(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_can_invite_for(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_answer_invitation(uuid, uuid, uuid, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_invitation_email_context(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_enqueue_invitation_emails(uuid, uuid[], text[], jsonb, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_invitation_by_token(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_reply_by_token(text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_invitation_email_context(uuid) TO leads_agency, leads_client, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_enqueue_invitation_emails(uuid, uuid[], text[], jsonb, text, text, text) TO leads_agency, leads_client, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_invitation_by_token(text) TO leads_auth;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_reply_by_token(text, text, text, text) TO leads_auth;
