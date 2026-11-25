-- Two corrections to the pending emails (0090, 0093), found in review before anything was deployed.

-- 1. A company's name as people say it: lower case, without its legal ending ("Brightpath Marketing Ltd" is "brightpath marketing"). A name that would be
--    shorter than three characters without the ending keeps it. The same rule as `nameCore` in lib/email/letter-opening.ts; an integration test holds them equal.
CREATE FUNCTION public.app_name_core(p_name text) RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog, public
  AS $$
  SELECT CASE WHEN char_length(x.core) >= 3 THEN x.core ELSE x.whole END
    FROM (
      SELECT lower(btrim(p_name, E' \t\n\r')) AS whole,
             btrim(regexp_replace(lower(btrim(p_name, E' \t\n\r')), '([\s,.]+(ltd|limited|llc|llp|inc|incorporated|plc|gmbh|pvt|private|pty|co|corp|corporation|company|bv|sa|ag|sarl|srl))+[\s.]*$', ''), E' \t\n\r') AS core
    ) x
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_name_core(text) FROM PUBLIC;
--> statement-breakpoint

-- 2. The opening paragraph of a prospect letter (0090) was left out only when it held an organisation's full registered name. It is now left out when it
--    holds the name as people say it, so "Brightpath Marketing" is caught as well as "Brightpath Marketing Ltd". Otherwise the function is as in 0090.
CREATE OR REPLACE FUNCTION public.app_prospect_letter_opening(p_lead uuid, p_template text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('letterOpening', c.prospect_letter_opening)
      FROM public.lead l
      JOIN public.campaign c ON c.id = l.campaign_id
     WHERE l.id = p_lead
       AND p_template = 'prospect_confirmed'
       AND c.prospect_letter_opening IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.organisation o
          WHERE (o.id IN (c.agency_org_id, l.source_org_id) OR o.id IN (SELECT s.agency_org_id FROM public.campaign_share s WHERE s.campaign_id = c.id))
            AND btrim(o.name) <> ''
            AND position(public.app_name_core(o.name) IN lower(c.prospect_letter_opening)) > 0)
  ), '{}'::jsonb)
$$;
--> statement-breakpoint

-- 3. The leads a client is chased for: waiting more than 24 hours for it to pick a time, and its turn. When the client asks for other times the lead keeps
--    its stage (`awaiting_client`), but the next move is not the client's, so a lead whose latest step is the client's own proposal is left out.
CREATE FUNCTION public.app_leads_waiting(p_now timestamp with time zone) RETURNS TABLE (waiting_lead uuid, client_org uuid, since timestamp with time zone, campaign_zone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT l.id, c.client_org_id, l.updated_at, c.time_zone
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
   WHERE l.released AND l.stage = 'awaiting_client' AND l.updated_at <= p_now - interval '24 hours'
     AND (SELECT h.action FROM public.lead_history h WHERE h.lead_id = l.id ORDER BY h.created_at DESC LIMIT 1) IS DISTINCT FROM 'lead.propose_times'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_leads_waiting(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint

-- 4. The two claims of 0093, reading that one list. Nothing else in them changes.
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
    CONTINUE WHEN extract(hour FROM v_local) < 9;
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
  IF extract(hour FROM v_local) < 9 OR NOT EXISTS (SELECT 1 FROM public.app_leads_waiting(p_now)) THEN
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
