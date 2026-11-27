-- Calendar step G: moving a meeting to a new slot, a reminder for an invitation nobody has answered, and two corrections to step E.

-- 1. Busy time. A meeting that is booked but not yet confirmed holds its time through the invitations only. Before, it also made the first person invited busy
-- through `meeting.host_member_id`, which stayed true after that person declined and after the deadline passed until the sweep ran. A scheduled meeting now counts
-- for its host when it is confirmed, or when it was booked the old way and has no invitations at all.
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

-- 2. The invitations of the signed-in person now say whether the meeting already has a room, so a moved meeting keeps its link and no second room is made.
DROP FUNCTION public.app_my_invitations();
--> statement-breakpoint
CREATE FUNCTION public.app_my_invitations()
  RETURNS TABLE (meeting_id uuid, meeting_ref text, starts_at timestamp with time zone, minutes integer, reply text, reply_due_at timestamp with time zone, company text, campaign_name text, has_room boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT t.id, t.public_ref, t.scheduled_start_time, t.duration_minutes, a.reply, t.reply_due_at, l.prospect_company, c.name, t.google_meet_url IS NOT NULL
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
REVOKE ALL ON FUNCTION public.app_my_invitations() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_my_invitations() TO leads_client;
--> statement-breakpoint

-- 3. The source of a lead moves its meeting to a new slot and invites the people free then. The meeting keeps its reference and its room; the lead goes back to
-- Waiting for reply. Allowed for a confirmed meeting that has not started (stage Scheduled) and for a meeting nobody could take (Reschedule needed). Anyone who
-- was invited before and is not invited now is released; anyone invited again starts afresh with a new reply link.
CREATE FUNCTION public.app_rebook_meeting(p_lead uuid, p_slot timestamp with time zone, p_due timestamp with time zone, p_members uuid[], p_hashes text[])
  RETURNS TABLE (meeting_id uuid, meeting_ref text, from_stage text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
#variable_conflict use_column
DECLARE
  v_source uuid;
  v_stage text;
  v_campaign uuid;
  v_client uuid;
  v_meeting uuid;
  v_ref text;
  v_outcome text;
  v_start timestamp with time zone;
BEGIN
  IF p_slot IS NULL OR p_due IS NULL OR COALESCE(array_length(p_members, 1), 0) = 0 OR array_length(p_members, 1) IS DISTINCT FROM array_length(p_hashes, 1) THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;
  SELECT l.source_org_id, l.stage, l.campaign_id INTO v_source, v_stage, v_campaign FROM public.lead l WHERE l.id = p_lead FOR UPDATE;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'domain:not-found' USING ERRCODE = 'P0002';
  END IF;
  IF v_source IS DISTINCT FROM public.app_current_org_id() OR NOT COALESCE(public.app_agency_sees_campaign(v_campaign), false) THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  IF v_stage NOT IN ('scheduled', 'reschedule_needed') THEN
    RAISE EXCEPTION 'domain:invalid-transition' USING ERRCODE = '22023';
  END IF;
  SELECT t.id, t.public_ref, t.outcome, t.scheduled_start_time INTO v_meeting, v_ref, v_outcome, v_start
    FROM public.meeting t WHERE t.lead_id = p_lead ORDER BY t.created_at DESC LIMIT 1 FOR UPDATE;
  IF v_meeting IS NULL THEN
    RAISE EXCEPTION 'domain:not-found' USING ERRCODE = 'P0002';
  END IF;
  IF (v_stage = 'scheduled' AND (v_outcome <> 'scheduled' OR v_start <= now())) OR (v_stage = 'reschedule_needed' AND v_outcome <> 'rescheduled') THEN
    RAISE EXCEPTION 'domain:invalid-transition' USING ERRCODE = '22023';
  END IF;
  SELECT c.client_org_id INTO v_client FROM public.campaign c WHERE c.id = v_campaign;
  IF EXISTS (
    SELECT 1 FROM unnest(p_members) AS wanted(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.member m WHERE m.id = wanted.id AND m.org_id = v_client AND m.org_kind = 'client' AND m.status = 'active')
  ) THEN
    RAISE EXCEPTION 'domain:not-a-client-member' USING ERRCODE = '42501';
  END IF;

  UPDATE public.meeting
     SET scheduled_start_time = p_slot, outcome = 'scheduled', confirmed_at = NULL, reply_due_at = p_due, host_member_id = p_members[1], updated_at = now()
   WHERE id = v_meeting;
  UPDATE public.meeting_reschedule SET status = 'superseded', resolved_at = now() WHERE meeting_id = v_meeting AND status = 'open';
  UPDATE public.meeting_attendee SET reply = 'released', replied_at = now() WHERE meeting_id = v_meeting AND member_id <> ALL (p_members) AND reply <> 'released';
  INSERT INTO public.meeting_attendee (meeting_id, member_id, reply_token_hash)
  SELECT v_meeting, wanted.id, wanted.hash FROM unnest(p_members, p_hashes) AS wanted(id, hash)
  ON CONFLICT (meeting_id, member_id) DO UPDATE
    SET reply = 'invited', replied_at = NULL, reply_token_hash = EXCLUDED.reply_token_hash, created_at = now();
  UPDATE public.lead
     SET stage = 'awaiting_reply', scheduled_meeting_time = NULL, host_member_id = p_members[1],
         proposed_times = jsonb_build_array(to_char(p_slot AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), updated_at = now()
   WHERE id = p_lead;
  INSERT INTO public.lead_history (lead_id, actor_user_id, actor_role, action, from_stage, to_stage, note, created_at)
  VALUES (p_lead, public.app_current_user_id(), 'agency', 'lead.rebook', v_stage, 'awaiting_reply', 'A new time was booked and the client team was invited', now());
  meeting_id := v_meeting;
  meeting_ref := v_ref;
  from_stage := v_stage;
  RETURN NEXT;
END
$$;
--> statement-breakpoint

-- 4. The sweep reminds a person once, a day after their invitation, while it is still waiting and before the deadline. A notice in the app for that person alone
-- (the notice writer of 0071 sends to whole sides). Idempotent: a person who already has the reminder for this round of invitations is left out.
CREATE FUNCTION public.app_remind_invitations(p_now timestamp with time zone) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
#variable_conflict use_column
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.notification (user_id, org_id, kind, title, body, link, lead_id, meeting_id, campaign_id)
  SELECT m.user_id, m.org_id, 'general', 'A meeting is waiting for your reply',
         left('Accept or decline the meeting with ' || l.prospect_company || ' in your calendar before the deadline.', 500),
         '/client/calendar', l.id, t.id, t.campaign_id
    FROM public.meeting_attendee a
    JOIN public.member m ON m.id = a.member_id AND m.status = 'active'
    JOIN public.meeting t ON t.id = a.meeting_id
    JOIN public.lead l ON l.id = t.lead_id
   WHERE a.reply = 'invited' AND t.outcome = 'scheduled' AND t.confirmed_at IS NULL AND l.stage = 'awaiting_reply'
     AND a.created_at <= p_now - interval '24 hours'
     AND (t.reply_due_at IS NULL OR t.reply_due_at > p_now)
     AND NOT EXISTS (
       SELECT 1 FROM public.notification n
        WHERE n.user_id = m.user_id AND n.meeting_id = t.id AND n.title = 'A meeting is waiting for your reply' AND n.created_at >= a.created_at
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_rebook_meeting(uuid, timestamp with time zone, timestamp with time zone, uuid[], text[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_remind_invitations(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_rebook_meeting(uuid, timestamp with time zone, timestamp with time zone, uuid[], text[]) TO leads_agency;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_remind_invitations(timestamp with time zone) TO leads_auth;
