-- Slice 3 of the pending emails (docs/superpowers/specs/2026-11-25-pending-emails-design.md): targets that are met, leads still waiting for a time, and the
-- email of a new agreement version. Every email but the agreement's stays keyed on a lead and goes through app_email_enqueue (0075), so nothing here decides
-- who a person is; what is new is when a thing is due, and that it is said once.

-- 1. "This was sent" keys (0092). No runtime role touches the table.
ALTER TABLE "once_stamp" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "once_stamp" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "once_stamp" TO leads_owner;
--> statement-breakpoint
CREATE POLICY "once_stamp_owner_all" ON "once_stamp" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint

-- 2. The stages that count, for the database. The rule itself is `COUNTED_STAGES` in lib/domain/counting-month.ts; an integration test holds the two equal.
CREATE FUNCTION public.app_counted_stages() RETURNS text[]
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog, public
  AS $$ SELECT ARRAY['accepted', 'delivered', 'client_no_show']::text[] $$;
--> statement-breakpoint

-- 3. A time zone PostgreSQL knows: the first of the two it knows, else Europe/London (the campaign default). A zone is typed by a person, and a mistyped one
--    must never stop an acceptance or the sweep.
CREATE FUNCTION public.app_safe_zone(p_first text, p_second text) RETURNS text
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
  SELECT coalesce(
    (SELECT z.name FROM pg_timezone_names z WHERE z.name = btrim(p_first)),
    (SELECT z.name FROM pg_timezone_names z WHERE z.name = btrim(p_second)),
    'Europe/London')
$$;
--> statement-breakpoint

-- 4. The targets a lead has just completed. For a lead that counts: the campaign's count in the month of the lead's meeting (read in the campaign's zone, as
--    `countedMonth` does), the campaign's count in all, and the count of the organisation that sent the lead against its share. Each target that is met and has
--    not been said before is stamped, its notice is written in the app (to everyone it concerns, the person who acted included: it is news to them too) and a
--    row is returned, so the application can queue the email. A count can fall after a contest and be met again: the stamp keeps it to once per campaign and
--    month, once per campaign for the total, and once per agency, campaign and month for a share. A target or share of zero is never met. The campaign row is
--    locked first, so two leads counted at the same moment cannot both miss the target or both claim it.
CREATE FUNCTION public.app_claim_target_notices_core(p_lead uuid) RETURNS TABLE (scope text, campaign_name text, period text, reached integer, target integer)
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
  PERFORM 1 FROM public.campaign c WHERE c.id = v.campaign_id FOR NO KEY UPDATE;
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
--    The two ways in: by a person who just changed the lead's count (the same caller rule as the lead's emails), and by the sweep after an automatic acceptance.
CREATE FUNCTION public.app_claim_target_notices(p_lead uuid) RETURNS TABLE (scope text, campaign_name text, period text, reached integer, target integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  PERFORM public.app_email_assert_caller(p_lead);
  RETURN QUERY SELECT t.scope, t.campaign_name, t.period, t.reached, t.target FROM public.app_claim_target_notices_core(p_lead) t;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_claim_target_notices_system(p_lead uuid) RETURNS TABLE (scope text, campaign_name text, period text, reached integer, target integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  RETURN QUERY SELECT t.scope, t.campaign_name, t.period, t.reached, t.target FROM public.app_claim_target_notices_core(p_lead) t;
END
$$;
--> statement-breakpoint

-- 5. The client's daily reminder. A client is due when it has a lead that has waited more than 24 hours for it to pick a time (measured from the lead's last
--    change, so a lead that came back to the client last night is not chased this morning), it is 9 am or later in the client's own zone (the zone of the campaign
--    of its oldest waiting lead when the client has none), and it has not been reminded on that local day. Leads waiting for accept or reject are not counted:
--    they have the 12 hour reminders. The notice in the app is written here; a row comes back with the lead that has waited longest and how many wait, so the
--    application can queue the email, keyed on that lead.
CREATE FUNCTION public.app_claim_waiting_reminders(p_now timestamp with time zone) RETURNS TABLE (lead_id uuid, waiting integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v record;
  v_local timestamp;
BEGIN
  FOR v IN
    SELECT c.client_org_id AS org_id,
           count(*)::integer AS n,
           (array_agg(l.id ORDER BY l.updated_at, l.id))[1] AS oldest,
           public.app_safe_zone(max(o.time_zone), (array_agg(c.time_zone ORDER BY l.updated_at, l.id))[1]) AS zone
      FROM public.lead l
      JOIN public.campaign c ON c.id = l.campaign_id
      JOIN public.organisation o ON o.id = c.client_org_id
     WHERE l.released AND l.stage = 'awaiting_client' AND l.updated_at <= p_now - interval '24 hours'
     GROUP BY c.client_org_id
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

-- 6. Fynix's daily summary of the same: every client with leads waiting more than 24 hours and how many, the longest wait first, once per day after 9 am in the
--    Fynix organisation's zone. Nothing is claimed on a day with none, so a lead that starts to wait later that day is still reported that day.
CREATE FUNCTION public.app_claim_waiting_summary(p_now timestamp with time zone) RETURNS TABLE (client_name text, waiting integer, oldest_lead uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_zone text;
  v_local timestamp;
BEGIN
  SELECT public.app_safe_zone(max(o.time_zone), NULL) INTO v_zone FROM public.organisation o WHERE o.kind = 'fynix';
  v_local := p_now AT TIME ZONE v_zone;
  IF extract(hour FROM v_local) < 9
     OR NOT EXISTS (SELECT 1 FROM public.lead l WHERE l.released AND l.stage = 'awaiting_client' AND l.updated_at <= p_now - interval '24 hours') THEN
    RETURN;
  END IF;
  INSERT INTO public.once_stamp (key) VALUES ('waiting-summary:' || to_char(v_local, 'YYYY-MM-DD')) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT o.name, count(*)::integer, (array_agg(l.id ORDER BY l.updated_at, l.id))[1]
      FROM public.lead l
      JOIN public.campaign c ON c.id = l.campaign_id
      JOIN public.organisation o ON o.id = c.client_org_id
     WHERE l.released AND l.stage = 'awaiting_client' AND l.updated_at <= p_now - interval '24 hours'
     GROUP BY o.id, o.name
     ORDER BY min(l.updated_at), o.name;
END
$$;
--> statement-breakpoint

-- 7. An email about a campaign and no lead: a new agreement version, to the managers of the campaign's client and of its coordinator, each with the link to
--    the agreement in their own portal. Only Fynix publishes an agreement, so only Fynix may call this, and the person who published it is not emailed.
CREATE FUNCTION public.app_enqueue_campaign_email(p_campaign uuid, p_audience text[], p_template text, p_params jsonb, p_subject text, p_body text, p_origin text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_me uuid := public.app_current_user_id();
  v_count integer := 0;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.member m WHERE m.user_id = v_me AND m.status = 'active' AND m.org_kind = 'fynix') THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  IF p_template <> 'agreement_published_info'
     OR p_audience IS NULL OR cardinality(p_audience) = 0
     OR NOT (p_audience <@ ARRAY['client_managers', 'coordinator_managers'])
     OR jsonb_typeof(p_params) <> 'object' THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;
  WITH ctx AS (
    SELECT c.client_org_id, c.agency_org_id AS coordinator_org_id, c.public_ref AS campaign_ref FROM public.campaign c WHERE c.id = p_campaign
  ), people AS (
    SELECT DISTINCT ON (u.email) u.email, public.app_notice_path(m.org_kind::text, (o.parent_org_id IS NULL), 'agreement', NULL, ctx.campaign_ref) AS path
      FROM ctx
      JOIN public.member m ON m.status = 'active' AND m.role = 'manager'
      JOIN public.organisation o ON o.id = m.org_id
      JOIN public."user" u ON u.id = m.user_id
     WHERE m.user_id IS DISTINCT FROM v_me
       AND (
            ('client_managers' = ANY (p_audience) AND m.org_id = ctx.client_org_id)
         OR ('coordinator_managers' = ANY (p_audience) AND m.org_id = ctx.coordinator_org_id)
       )
  )
  INSERT INTO public.email_outbox (recipient, template, params, subject, body, link)
  SELECT p.email, p_template::public.email_template, p_params, p_subject, p_body, p_origin || p.path FROM people p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_counted_stages() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_safe_zone(text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_claim_target_notices_core(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_claim_target_notices(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_claim_target_notices_system(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_claim_waiting_reminders(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_claim_waiting_summary(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_enqueue_campaign_email(uuid, text[], text, jsonb, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_claim_target_notices(uuid) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_claim_target_notices_system(uuid), public.app_claim_waiting_reminders(timestamp with time zone), public.app_claim_waiting_summary(timestamp with time zone) TO leads_auth;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_enqueue_campaign_email(uuid, text[], text, jsonb, text, text, text) TO leads_fynix;
