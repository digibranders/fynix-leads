-- Corrections from the code review of the pending emails (0088 to 0094), made before anything of it was deployed.

-- 1. A prospect letter's opening paragraph comes from the campaign and from nowhere else. app_email_enqueue added the campaign's paragraph on top of the params
--    it was given, so a caller that put a `letterOpening` of its own into the params kept it whenever the campaign had none or the campaign's failed the name
--    check. The key is now taken out of the caller's params first. The application never sets it; this closes the door for a raw call on a tenant connection.
--    The definition is read back and one expression is changed, as in 0085, 0088 and 0090.
DO $$
DECLARE
  v_old text := pg_get_functiondef('public.app_email_enqueue(uuid, text[], text, jsonb, text, text, text, uuid)'::regprocedure);
  v_needle text := $n$p_params || jsonb_build_object('prospectName'$n$;
BEGIN
  IF (length(v_old) - length(replace(v_old, v_needle, ''))) / length(v_needle) <> 1 THEN
    RAISE EXCEPTION 'expected app_email_enqueue to build the prospect letter fields once';
  END IF;
  EXECUTE replace(v_old, v_needle, $r$(p_params - 'letterOpening') || jsonb_build_object('prospectName'$r$);
END
$$;
--> statement-breakpoint

-- 2. The target check took a row lock on the campaign while the caller already held the lead's row. A path that locks a campaign and then its leads could
--    have met it head on. It now takes an advisory lock named after the campaign, which no other code takes, so two leads counted at the same moment still take
--    turns and nothing else can be in the way. Otherwise the function is as in 0093.
CREATE OR REPLACE FUNCTION public.app_claim_target_notices_core(p_lead uuid) RETURNS TABLE (scope text, campaign_name text, period text, reached integer, target integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v record;
  v_zone text;
  v_month text;
  v_label text;
  v_count integer;
  v_share integer;
BEGIN
  SELECT l.campaign_id, l.source_org_id, l.scheduled_meeting_time AS meeting_at, c.name AS cname, c.monthly_target, c.total_target, c.time_zone
    INTO v
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
   WHERE l.id = p_lead AND l.released AND l.scheduled_meeting_time IS NOT NULL AND l.stage = ANY (public.app_counted_stages());
  IF NOT FOUND THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('fynix-leads:target:' || v.campaign_id::text, 0));
  v_zone := public.app_safe_zone(v.time_zone, NULL);
  v_month := to_char(v.meeting_at AT TIME ZONE v_zone, 'YYYY-MM');
  v_label := to_char(v.meeting_at AT TIME ZONE v_zone, 'FMMonth YYYY');

  IF v.monthly_target > 0 THEN
    SELECT count(*)::integer INTO v_count
      FROM public.lead x
     WHERE x.campaign_id = v.campaign_id AND x.released AND x.scheduled_meeting_time IS NOT NULL AND x.stage = ANY (public.app_counted_stages())
       AND to_char(x.scheduled_meeting_time AT TIME ZONE v_zone, 'YYYY-MM') = v_month;
    IF v_count >= v.monthly_target THEN
      INSERT INTO public.once_stamp (key) VALUES ('target:month:' || v.campaign_id || ':' || v_month) ON CONFLICT DO NOTHING;
      IF FOUND THEN
        PERFORM public.app_notice_insert(p_lead, NULL, NULL, ARRAY['client', 'coordinator', 'fynix'], 'general',
          v.cname || ' reached its target for ' || v_label,
          CASE WHEN v_count = 1 THEN '1 lead now counts' ELSE v_count || ' leads now count' END || ' for ' || v_label || '. The target is ' || v.monthly_target || '. Lead {ref} completed it.',
          'lead', NULL);
        scope := 'campaign_month'; campaign_name := v.cname; period := v_label; reached := v_count; target := v.monthly_target;
        RETURN NEXT;
      END IF;
    END IF;
  END IF;

  IF v.total_target > 0 THEN
    SELECT count(*)::integer INTO v_count
      FROM public.lead x
     WHERE x.campaign_id = v.campaign_id AND x.released AND x.scheduled_meeting_time IS NOT NULL AND x.stage = ANY (public.app_counted_stages());
    IF v_count >= v.total_target THEN
      INSERT INTO public.once_stamp (key) VALUES ('target:total:' || v.campaign_id) ON CONFLICT DO NOTHING;
      IF FOUND THEN
        PERFORM public.app_notice_insert(p_lead, NULL, NULL, ARRAY['client', 'coordinator', 'fynix'], 'general',
          v.cname || ' reached its total target',
          CASE WHEN v_count = 1 THEN '1 lead now counts' ELSE v_count || ' leads now count' END || ' in total. The target is ' || v.total_target || '. Lead {ref} completed it.',
          'lead', NULL);
        scope := 'campaign_total'; campaign_name := v.cname; period := v_label; reached := v_count; target := v.total_target;
        RETURN NEXT;
      END IF;
    END IF;
  END IF;

  SELECT s.monthly_share INTO v_share FROM public.campaign_share s WHERE s.campaign_id = v.campaign_id AND s.agency_org_id = v.source_org_id;
  IF FOUND AND v_share > 0 THEN
    SELECT count(*)::integer INTO v_count
      FROM public.lead x
     WHERE x.campaign_id = v.campaign_id AND x.source_org_id = v.source_org_id AND x.released AND x.scheduled_meeting_time IS NOT NULL
       AND x.stage = ANY (public.app_counted_stages())
       AND to_char(x.scheduled_meeting_time AT TIME ZONE v_zone, 'YYYY-MM') = v_month;
    IF v_count >= v_share THEN
      INSERT INTO public.once_stamp (key) VALUES ('share:' || v.campaign_id || ':' || v.source_org_id || ':' || v_month) ON CONFLICT DO NOTHING;
      IF FOUND THEN
        PERFORM public.app_notice_insert(p_lead, NULL, NULL, ARRAY['source'], 'general',
          'You reached your share for ' || v_label,
          v_count || ' of your leads for ' || v.cname || ' now count for ' || v_label || '. Your share is ' || v_share || '. Lead {ref} completed it.',
          'lead', NULL);
        scope := 'agency_share'; campaign_name := v.cname; period := v_label; reached := v_count; target := v_share;
        RETURN NEXT;
      END IF;
    END IF;
  END IF;
END
$$;
--> statement-breakpoint

-- 3. A company's name as people say it (0094) now also reads runs of white space inside the name as one space, as the paragraph it is compared with does.
CREATE OR REPLACE FUNCTION public.app_name_core(p_name text) RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog, public
  AS $$
  SELECT CASE WHEN char_length(x.core) >= 3 THEN x.core ELSE x.whole END
    FROM (
      SELECT y.whole,
             btrim(regexp_replace(y.whole, '([\s,.]+(ltd|limited|llc|llp|inc|incorporated|plc|gmbh|pvt|private|pty|co|corp|corporation|company|bv|sa|ag|sarl|srl))+[\s.]*$', ''), E' \t\n\r') AS core
        FROM (SELECT lower(btrim(regexp_replace(p_name, '\s+', ' ', 'g'), E' \t\n\r')) AS whole) y
    ) x
$$;
--> statement-breakpoint

-- 4. Whose turn it is (0094) was read from the latest step of the lead alone, so any later step (Fynix correcting a detail) put the client back in the list.
--    Once a client has asked for other times the next move is never its own again while the lead keeps this stage, so such a lead is left out for good.
CREATE OR REPLACE FUNCTION public.app_leads_waiting(p_now timestamp with time zone) RETURNS TABLE (waiting_lead uuid, client_org uuid, since timestamp with time zone, campaign_zone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT l.id, c.client_org_id, l.updated_at, c.time_zone
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
   WHERE l.released AND l.stage = 'awaiting_client' AND l.updated_at <= p_now - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.lead_history h WHERE h.lead_id = l.id AND h.action = 'lead.propose_times')
$$;
--> statement-breakpoint

-- 5. The daily reminder and Fynix's summary went out at any hour from 9 am, so a lead that passed its 24 hours at 22:40 was chased at 22:40. They now go out
--    between 9 am and 8 pm local time, and a lead that becomes due later waits for the next morning. Otherwise the two functions are as in 0094.
CREATE OR REPLACE FUNCTION public.app_claim_waiting_reminders(p_now timestamp with time zone) RETURNS TABLE (lead_id uuid, waiting integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v record;
  v_local timestamp;
BEGIN
  FOR v IN
    SELECT w.client_org AS org_id,
           count(*)::integer AS n,
           (array_agg(w.waiting_lead ORDER BY w.since, w.waiting_lead))[1] AS oldest,
           public.app_safe_zone(max(o.time_zone), (array_agg(w.campaign_zone ORDER BY w.since, w.waiting_lead))[1]) AS zone
      FROM public.app_leads_waiting(p_now) w
      JOIN public.organisation o ON o.id = w.client_org
     GROUP BY w.client_org
  LOOP
    v_local := p_now AT TIME ZONE v.zone;
    CONTINUE WHEN extract(hour FROM v_local) NOT BETWEEN 9 AND 19;
    INSERT INTO public.once_stamp (key) VALUES ('waiting:' || v.org_id || ':' || to_char(v_local, 'YYYY-MM-DD')) ON CONFLICT DO NOTHING;
    CONTINUE WHEN NOT FOUND;
    PERFORM public.app_notice_insert(v.oldest, NULL, NULL, ARRAY['client'], 'general',
      CASE WHEN v.n = 1 THEN '1 lead is waiting for a time' ELSE v.n || ' leads are waiting for a time' END,
      'More than 24 hours have passed. The oldest is {ref} from {company}. Pick one of the proposed times or propose others.',
      'lead', NULL);
    lead_id := v.oldest;
    waiting := v.n;
    RETURN NEXT;
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_claim_waiting_summary(p_now timestamp with time zone) RETURNS TABLE (client_name text, waiting integer, oldest_lead uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_zone text;
  v_local timestamp;
BEGIN
  SELECT public.app_safe_zone(max(o.time_zone), NULL) INTO v_zone FROM public.organisation o WHERE o.kind = 'fynix';
  v_local := p_now AT TIME ZONE v_zone;
  IF extract(hour FROM v_local) NOT BETWEEN 9 AND 19 OR NOT EXISTS (SELECT 1 FROM public.app_leads_waiting(p_now)) THEN
    RETURN;
  END IF;
  INSERT INTO public.once_stamp (key) VALUES ('waiting-summary:' || to_char(v_local, 'YYYY-MM-DD')) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT o.name, count(*)::integer, (array_agg(w.waiting_lead ORDER BY w.since, w.waiting_lead))[1]
      FROM public.app_leads_waiting(p_now) w
      JOIN public.organisation o ON o.id = w.client_org
     GROUP BY o.id, o.name
     ORDER BY min(w.since), o.name;
END
$$;
