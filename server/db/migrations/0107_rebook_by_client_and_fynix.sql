-- Calendar step G, second part: the client of the campaign and Fynix can also book a new time (the source agency already could). Same function, wider caller list.
CREATE OR REPLACE FUNCTION public.app_rebook_meeting(p_lead uuid, p_slot timestamp with time zone, p_due timestamp with time zone, p_members uuid[], p_hashes text[])
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
  v_org uuid := public.app_current_org_id();
  v_fynix boolean := COALESCE(session_user::text = 'leads_fynix', false);
  v_role text;
  v_meeting uuid;
  v_ref text;
  v_outcome text;
  v_start timestamp with time zone;
BEGIN
  IF p_slot IS NULL OR p_due IS NULL OR COALESCE(array_length(p_members, 1), 0) = 0 OR array_length(p_members, 1) IS DISTINCT FROM array_length(p_hashes, 1) THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;
  SELECT l.source_org_id, l.stage, l.campaign_id, c.client_org_id INTO v_source, v_stage, v_campaign, v_client
    FROM public.lead l JOIN public.campaign c ON c.id = l.campaign_id WHERE l.id = p_lead FOR UPDATE OF l;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'domain:not-found' USING ERRCODE = 'P0002';
  END IF;
  -- Who may move it: Fynix, the client of the campaign, or the organisation that sent the lead (when it still serves the campaign).
  IF v_fynix THEN
    v_role := 'fynix';
  ELSIF v_org IS NOT NULL AND v_client = v_org THEN
    v_role := 'client';
  ELSIF v_org IS NOT NULL AND v_source = v_org AND COALESCE(public.app_agency_sees_campaign(v_campaign), false) THEN
    v_role := 'agency';
  ELSE
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
  VALUES (p_lead, public.app_current_user_id(), v_role, 'lead.rebook', v_stage, 'awaiting_reply', 'A new time was booked and the client team was invited', now());
  meeting_id := v_meeting;
  meeting_ref := v_ref;
  from_stage := v_stage;
  RETURN NEXT;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_rebook_meeting(uuid, timestamp with time zone, timestamp with time zone, uuid[], text[]) TO leads_client, leads_fynix;
