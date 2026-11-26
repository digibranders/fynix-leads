-- Calendar step E: the lapse of an unanswered invitation also tells the agency, the coordinator and Fynix, in the app. The notice writer is internal to database
-- functions, so the sweep's function writes it. The words are the ones of the `reschedule_needed` event in lib/leads/notices.ts, and a test holds them equal.
CREATE OR REPLACE FUNCTION public.app_expire_invitations(p_now timestamp with time zone) RETURNS TABLE (lead_id uuid, meeting_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
#variable_conflict use_column
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    WITH due AS (
      UPDATE public.meeting t SET outcome = 'rescheduled', updated_at = p_now
       WHERE t.outcome = 'scheduled' AND t.confirmed_at IS NULL AND t.reply_due_at IS NOT NULL AND t.reply_due_at <= p_now
         AND EXISTS (SELECT 1 FROM public.lead l WHERE l.id = t.lead_id AND l.stage = 'awaiting_reply')
      RETURNING t.id AS mid, t.lead_id AS lid
    ), released AS (
      UPDATE public.meeting_attendee a SET reply = 'released', replied_at = p_now FROM due d WHERE a.meeting_id = d.mid AND a.reply = 'invited' RETURNING a.id
    ), moved AS (
      UPDATE public.lead l SET stage = 'reschedule_needed', updated_at = p_now FROM due d WHERE l.id = d.lid AND l.stage = 'awaiting_reply' RETURNING l.id
    ), history AS (
      INSERT INTO public.lead_history (lead_id, actor_user_id, actor_role, action, from_stage, to_stage, note, created_at)
      SELECT d.lid, NULL, 'system', 'lead.invitations_lapsed', 'awaiting_reply', 'reschedule_needed', 'Nobody on the client team replied before the deadline', p_now FROM due d
      RETURNING lead_id
    )
    SELECT d.lid, d.mid FROM due d
  LOOP
    PERFORM public.app_notice_insert(
      v_row.lid, NULL, v_row.mid, ARRAY['source', 'coordinator', 'fynix'], 'general',
      'A new time is needed for {ref}', 'Nobody at the client could take the meeting with {company}. Pick another time.', 'lead', NULL
    );
    lead_id := v_row.lid;
    meeting_id := v_row.mid;
    RETURN NEXT;
  END LOOP;
END
$$;
