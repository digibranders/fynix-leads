-- Calendar step E: inviting client people to a meeting, their replies, and the lapse of an unanswered invitation. The table has no runtime grants (0098), so each
-- of these is a SECURITY DEFINER function that checks who is asking. The first person to accept confirms the meeting; the others are released.

-- 1. An agency that serves the campaign invites people of the campaign's client to a meeting that is booked and not yet confirmed. One reply link hash for each.
CREATE FUNCTION public.app_invite_attendees(p_meeting uuid, p_members uuid[], p_hashes text[]) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_campaign uuid;
  v_client uuid;
BEGIN
  SELECT t.campaign_id INTO v_campaign FROM public.meeting t WHERE t.id = p_meeting AND t.outcome = 'scheduled' AND t.confirmed_at IS NULL;
  IF v_campaign IS NULL OR NOT public.app_agency_sees_campaign(v_campaign) THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(array_length(p_members, 1), 0) = 0 OR array_length(p_members, 1) IS DISTINCT FROM array_length(p_hashes, 1) THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;
  SELECT c.client_org_id INTO v_client FROM public.campaign c WHERE c.id = v_campaign;
  IF EXISTS (
    SELECT 1 FROM unnest(p_members) AS wanted(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.member m WHERE m.id = wanted.id AND m.org_id = v_client AND m.org_kind = 'client' AND m.status = 'active')
  ) THEN
    RAISE EXCEPTION 'domain:not-a-client-member' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.meeting_attendee (meeting_id, member_id, reply_token_hash)
  SELECT p_meeting, wanted.id, wanted.hash FROM unnest(p_members, p_hashes) AS wanted(id, hash);
END
$$;
--> statement-breakpoint

-- 2. The signed-in client person answers an invitation. Accepting first confirms the meeting: the room (if one was made), the chosen person and the lead's stage
-- are set, and everyone else still invited is released. Declining when nobody is left to go sends the lead back for a new time. Answering twice changes nothing.
CREATE FUNCTION public.app_reply_invitation(p_meeting uuid, p_reply text, p_room_url text, p_room_space text)
  RETURNS TABLE (confirmed_now boolean, rescheduled boolean, lead_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
#variable_conflict use_column
DECLARE
  v_member uuid;
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
  SELECT m.id INTO v_member FROM public.member m
   WHERE m.user_id = public.app_current_user_id() AND m.org_id = public.app_current_org_id() AND m.org_kind = 'client' AND m.status = 'active';
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  SELECT a.id, a.reply, t.lead_id, t.confirmed_at, t.outcome, t.scheduled_start_time, t.reply_due_at
    INTO v_attendee, v_reply, v_lead, v_confirmed, v_outcome, v_start, v_due
    FROM public.meeting_attendee a
    JOIN public.meeting t ON t.id = a.meeting_id
   WHERE a.meeting_id = p_meeting AND a.member_id = v_member
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
       SET confirmed_at = now(), host_member_id = v_member,
           google_meet_url = COALESCE(google_meet_url, p_room_url), google_space_id = COALESCE(google_space_id, p_room_space), updated_at = now()
     WHERE id = p_meeting;
    UPDATE public.meeting_attendee SET reply = 'released', replied_at = now() WHERE meeting_id = p_meeting AND reply = 'invited';
    UPDATE public.lead SET stage = 'scheduled', scheduled_meeting_time = v_start, scheduled_at = now(), host_member_id = v_member, updated_at = now()
     WHERE id = v_lead AND stage = 'awaiting_reply';
    INSERT INTO public.lead_history (lead_id, actor_user_id, actor_role, action, from_stage, to_stage, note, created_at)
    VALUES (v_lead, public.app_current_user_id(), 'client', 'lead.invitation_accept', 'awaiting_reply', 'scheduled', 'A client team member accepted the meeting', now());
    confirmed_now := true;
  ELSIF p_reply = 'declined' AND NOT EXISTS (SELECT 1 FROM public.meeting_attendee WHERE meeting_id = p_meeting AND reply IN ('invited', 'accepted')) THEN
    UPDATE public.meeting SET outcome = 'rescheduled', updated_at = now() WHERE id = p_meeting;
    UPDATE public.lead SET stage = 'reschedule_needed', updated_at = now() WHERE id = v_lead AND stage IN ('awaiting_reply', 'scheduled');
    INSERT INTO public.lead_history (lead_id, actor_user_id, actor_role, action, from_stage, to_stage, note, created_at)
    VALUES (v_lead, public.app_current_user_id(), 'client', 'lead.invitation_decline', NULL, 'reschedule_needed', 'Nobody on the client team could take the meeting', now());
    rescheduled := true;
  END IF;
  RETURN NEXT;
END
$$;
--> statement-breakpoint

-- 3. The invitations of the signed-in client person that still matter: waiting for their answer before the deadline, accepted, or released because someone
-- else accepted first (they can still accept).
CREATE FUNCTION public.app_my_invitations()
  RETURNS TABLE (meeting_id uuid, meeting_ref text, starts_at timestamp with time zone, minutes integer, reply text, reply_due_at timestamp with time zone, company text, campaign_name text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT t.id, t.public_ref, t.scheduled_start_time, t.duration_minutes, a.reply, t.reply_due_at, l.prospect_company, c.name
    FROM public.meeting_attendee a
    JOIN public.member m ON m.id = a.member_id
    JOIN public.meeting t ON t.id = a.meeting_id
    JOIN public.lead l ON l.id = t.lead_id
    JOIN public.campaign c ON c.id = t.campaign_id
   WHERE m.user_id = public.app_current_user_id() AND m.org_id = public.app_current_org_id() AND m.org_kind = 'client' AND m.status = 'active'
     AND t.outcome = 'scheduled' AND t.scheduled_start_time > now()
     AND (a.reply IN ('accepted', 'released') OR (a.reply = 'invited' AND (t.reply_due_at IS NULL OR t.reply_due_at > now())))
   ORDER BY t.scheduled_start_time, t.public_ref
$$;
--> statement-breakpoint

-- 4. The sweep: a meeting nobody accepted by its deadline is let go. The meeting is marked as needing a new time, the invitations are released and the lead goes
-- back to the agency. Idempotent: a meeting already let go is not found again.
CREATE FUNCTION public.app_expire_invitations(p_now timestamp with time zone) RETURNS TABLE (lead_id uuid, meeting_id uuid)
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  WITH due AS (
    UPDATE public.meeting t SET outcome = 'rescheduled', updated_at = p_now
     WHERE t.outcome = 'scheduled' AND t.confirmed_at IS NULL AND t.reply_due_at IS NOT NULL AND t.reply_due_at <= p_now
       AND EXISTS (SELECT 1 FROM public.lead l WHERE l.id = t.lead_id AND l.stage = 'awaiting_reply')
    RETURNING t.id, t.lead_id
  ), released AS (
    UPDATE public.meeting_attendee a SET reply = 'released', replied_at = p_now FROM due d WHERE a.meeting_id = d.id AND a.reply = 'invited' RETURNING a.id
  ), moved AS (
    UPDATE public.lead l SET stage = 'reschedule_needed', updated_at = p_now FROM due d WHERE l.id = d.lead_id AND l.stage = 'awaiting_reply' RETURNING l.id
  ), history AS (
    INSERT INTO public.lead_history (lead_id, actor_user_id, actor_role, action, from_stage, to_stage, note, created_at)
    SELECT d.lead_id, NULL, 'system', 'lead.invitations_lapsed', 'awaiting_reply', 'reschedule_needed', 'Nobody on the client team replied before the deadline', p_now FROM due d
    RETURNING lead_id
  )
  SELECT d.lead_id, d.id FROM due d
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_invite_attendees(uuid, uuid[], text[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_reply_invitation(uuid, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_my_invitations() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_expire_invitations(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_invite_attendees(uuid, uuid[], text[]) TO leads_agency;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_reply_invitation(uuid, text, text, text) TO leads_client;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_my_invitations() TO leads_client;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_expire_invitations(timestamp with time zone) TO leads_auth;
