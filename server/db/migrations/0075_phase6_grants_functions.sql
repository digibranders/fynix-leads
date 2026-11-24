-- Phase 6 chunk A: the launch emails, the Meet room and the join record. Grants, policies, triggers and functions for the columns and tables of 0074.
-- The enum values used below were added in 0073 (a value added in a migration can only be used from the next one).
-- Nothing here changes what the app sends today: the functions only run when the application calls them, and it calls them only when LAUNCH_EMAILS_ENABLED is true.

-- 1. The campaign's privacy link and the prospect email switch. Fynix has the table-level grant already; a client reads both (it is named as the holder of the
--    prospect's details and agrees to that); an agency and a coordinator read neither. The prospect letter is written by the database functions below.
GRANT SELECT ("client_privacy_url", "prospect_email_enabled") ON "campaign" TO leads_client;
--> statement-breakpoint

-- 2. A new meeting row names every column in its INSERT (the ORM lists them all, see 0067), so the two tenant roles that book meetings hold INSERT on the new
--    columns. They hold no SELECT or UPDATE on any of them: the space behind the room, the sequence of the calendar file and the import stamp are read and
--    changed by triggers and database functions only.
GRANT INSERT ("google_space_id", "ics_sequence", "join_imported_at") ON "meeting" TO leads_client, leads_agency;
--> statement-breakpoint

-- 3. The calendar file's SEQUENCE rises whenever a meeting moves or is cancelled, whichever code does it, so a calendar program always accepts the update.
CREATE FUNCTION public.meeting_bump_ics_sequence() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NEW.scheduled_start_time IS DISTINCT FROM OLD.scheduled_start_time OR (NEW.outcome = 'cancelled' AND OLD.outcome <> 'cancelled') THEN
    NEW.ics_sequence := OLD.ics_sequence + 1;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.meeting_bump_ics_sequence() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER meeting_bump_ics_sequence BEFORE UPDATE ON "meeting" FOR EACH ROW EXECUTE FUNCTION public.meeting_bump_ics_sequence();
--> statement-breakpoint

-- 4. Reminders that depend on the meeting's time. A trigger writes the four rows when a meeting is booked and moves them (and re-arms the sent ones) when its start
--    or length changes. No runtime role touches the table.
ALTER TABLE "meeting_reminder" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "meeting_reminder" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "meeting_reminder" TO leads_owner;
--> statement-breakpoint
CREATE POLICY "meeting_reminder_owner_all" ON "meeting_reminder" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE FUNCTION public.meeting_schedule_reminders() RETURNS trigger
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_end timestamp with time zone := NEW.scheduled_start_time + make_interval(mins => NEW.duration_minutes);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.meeting_reminder (meeting_id, kind, due_at) VALUES
      (NEW.id, 'prospect_24h', NEW.scheduled_start_time - interval '24 hours'),
      (NEW.id, 'prospect_1h', NEW.scheduled_start_time - interval '1 hour'),
      (NEW.id, 'nudge_end', v_end),
      (NEW.id, 'nudge_24h', v_end + interval '24 hours')
    ON CONFLICT (meeting_id, kind) DO NOTHING;
  ELSE
    UPDATE public.meeting_reminder r
       SET due_at = CASE r.kind
             WHEN 'prospect_24h' THEN NEW.scheduled_start_time - interval '24 hours'
             WHEN 'prospect_1h' THEN NEW.scheduled_start_time - interval '1 hour'
             WHEN 'nudge_end' THEN v_end
             ELSE v_end + interval '24 hours' END,
           sent_at = NULL
     WHERE r.meeting_id = NEW.id;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.meeting_schedule_reminders() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER meeting_schedule_reminders_insert AFTER INSERT ON "meeting" FOR EACH ROW EXECUTE FUNCTION public.meeting_schedule_reminders();
--> statement-breakpoint
CREATE TRIGGER meeting_schedule_reminders_update AFTER UPDATE OF "scheduled_start_time", "duration_minutes" ON "meeting"
  FOR EACH ROW WHEN (NEW.scheduled_start_time IS DISTINCT FROM OLD.scheduled_start_time OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes)
  EXECUTE FUNCTION public.meeting_schedule_reminders();
--> statement-breakpoint
-- Meetings that are booked and not yet held get their rows now.
INSERT INTO "meeting_reminder" ("meeting_id", "kind", "due_at")
  SELECT m.id, k.kind, CASE k.kind
           WHEN 'prospect_24h' THEN m.scheduled_start_time - interval '24 hours'
           WHEN 'prospect_1h' THEN m.scheduled_start_time - interval '1 hour'
           WHEN 'nudge_end' THEN m.scheduled_start_time + make_interval(mins => m.duration_minutes)
           ELSE m.scheduled_start_time + make_interval(mins => m.duration_minutes) + interval '24 hours' END
    FROM "meeting" m CROSS JOIN (VALUES ('prospect_24h'), ('prospect_1h'), ('nudge_end'), ('nudge_24h')) AS k (kind)
   WHERE m.outcome = 'scheduled'
ON CONFLICT ("meeting_id", "kind") DO NOTHING;
--> statement-breakpoint

-- 5. The join record. The client, the agencies and Fynix read the rows of the meetings they can read (the subquery runs under the meeting's own row policy);
--    nobody writes them directly. The id and the creation time are not granted, so `select *` fails by design like every other table with a column list.
ALTER TABLE "meeting_join" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "meeting_join" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "meeting_join" TO leads_owner;
--> statement-breakpoint
CREATE POLICY "meeting_join_owner_all" ON "meeting_join" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ("meeting_id", "display_name", "joined_at", "left_at", "duration_seconds") ON "meeting_join" TO leads_fynix, leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "meeting_join_fynix_select" ON "meeting_join" AS PERMISSIVE FOR SELECT TO leads_fynix USING (true);
--> statement-breakpoint
CREATE POLICY "meeting_join_client_select" ON "meeting_join" AS PERMISSIVE FOR SELECT TO leads_client
  USING (EXISTS (SELECT 1 FROM public.meeting m WHERE m.id = "meeting_join"."meeting_id"));
--> statement-breakpoint
CREATE POLICY "meeting_join_agency_select" ON "meeting_join" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (EXISTS (SELECT 1 FROM public.meeting m WHERE m.id = "meeting_join"."meeting_id"));
--> statement-breakpoint

-- 6. Writing an email for people of a lead. Internal: no runtime role may call it. The recipients are resolved here from the lead, so a caller never names an
--    address and never learns one. `p_audience` holds fixed words: client (every active person), client_meeting (those who asked for meeting emails),
--    source, coordinator, partner_coordinator, fynix, or prospect on its own. A prospect letter is written only when the campaign has the switch on and a privacy
--    link, the lead has a prospect address and a verified alias, and the database adds what only it may read (the client's brand and privacy link, the alias
--    name and title) to the letter's params, sets the display name to the alias and the reply address to the alias mailbox. One row per recipient, never two.
--    A message to people of the portal carries a link to the lead in that person's own portal (`p_origin` is the application's origin; the sender refuses a link
--    that is anywhere else). A prospect letter carries no link.
CREATE FUNCTION public.app_email_enqueue(p_lead uuid, p_audience text[], p_template text, p_params jsonb, p_subject text, p_body text, p_origin text, p_exclude uuid) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_count integer := 0;
  v_prospect boolean := p_template LIKE 'prospect\_%';
BEGIN
  IF p_template NOT IN ('lead_waiting', 'lead_submitted_info', 'times_proposed_info', 'meeting_booked', 'meeting_moved', 'meeting_cancelled', 'outcome_nudge', 'outcome_held_client',
                        'outcome_held_info', 'decision_reminder', 'lead_accepted_info', 'lead_rejected_info', 'lead_auto_accepted_info', 'rejection_overturned_info', 'no_show_info',
                        'prospect_confirmed', 'prospect_moved', 'prospect_cancelled', 'prospect_reminder_24h', 'prospect_reminder_1h')
     OR p_audience IS NULL OR cardinality(p_audience) = 0
     OR NOT (p_audience <@ ARRAY['client', 'client_meeting', 'source', 'coordinator', 'partner_coordinator', 'fynix', 'prospect'])
     OR (v_prospect AND p_audience <> ARRAY['prospect'])
     OR (NOT v_prospect AND 'prospect' = ANY (p_audience))
     OR jsonb_typeof(p_params) <> 'object' THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;

  IF v_prospect THEN
    INSERT INTO public.email_outbox (recipient, template, params, subject, body, sender_name, reply_to)
    SELECT l.prospect_email, p_template::public.email_template,
           p_params || jsonb_build_object('prospectName', l.prospect_name, 'clientBrand', c.client_brand_name, 'privacyUrl', c.client_privacy_url, 'signerName', ai.display_name, 'signerTitle', ai.job_title),
           p_subject, p_body, ai.display_name, ai.alias_email
      FROM public.lead l
      JOIN public.campaign c ON c.id = l.campaign_id
      JOIN public.alias_identity ai ON ai.id = l.alias_identity_id
     WHERE l.id = p_lead AND l.released AND c.prospect_email_enabled AND c.client_privacy_url IS NOT NULL
       AND l.prospect_email <> '' AND ai.status = 'active' AND ai.verified_at IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END IF;

  WITH ctx AS (
    SELECT c.client_org_id, c.agency_org_id AS supplier_org_id, l.source_org_id, l.public_ref AS lead_ref, c.public_ref AS campaign_ref
      FROM public.lead l JOIN public.campaign c ON c.id = l.campaign_id
     WHERE l.id = p_lead AND l.released
  ), people AS (
    SELECT DISTINCT ON (u.email) u.email, public.app_notice_path(m.org_kind::text, (o.parent_org_id IS NULL), 'lead', ctx.lead_ref, ctx.campaign_ref) AS path
      FROM ctx
      JOIN public.member m ON m.status = 'active'
      JOIN public.organisation o ON o.id = m.org_id
      JOIN public."user" u ON u.id = m.user_id
     WHERE m.user_id IS DISTINCT FROM p_exclude
       AND (
            ('client' = ANY (p_audience) AND m.org_id = ctx.client_org_id)
         OR ('client_meeting' = ANY (p_audience) AND m.org_id = ctx.client_org_id AND m.meeting_emails)
         OR ('source' = ANY (p_audience) AND m.org_id = ctx.source_org_id)
         OR ('coordinator' = ANY (p_audience) AND m.org_id = ctx.supplier_org_id)
         OR ('partner_coordinator' = ANY (p_audience) AND ctx.source_org_id <> ctx.supplier_org_id AND m.org_id = ctx.supplier_org_id)
         OR ('fynix' = ANY (p_audience) AND m.org_kind = 'fynix')
       )
  )
  INSERT INTO public.email_outbox (recipient, template, params, subject, body, link)
  SELECT p.email, p_template::public.email_template, p_params, p_subject, p_body, p_origin || p.path FROM people p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint

-- 7. What the application needs to know about a lead to write its emails: the reference, the prospect's company (already on every notice), the campaign's time
--    zone, the lead's latest meeting with its link, the sequence of its calendar file and whether a prospect letter can be written at all. No address, no privacy
--    link, no alias. Internal; the two wrappers below check the caller.
CREATE FUNCTION public.app_lead_email_context_core(p_lead uuid)
  RETURNS TABLE (lead_ref text, company text, time_zone text, meeting_id uuid, meeting_ref text, starts_at timestamp with time zone, duration_minutes integer, meet_url text, ics_sequence integer, meeting_outcome text, prospect_ready boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  RETURN QUERY
  SELECT l.public_ref, l.prospect_company, c.time_zone, m.id, m.public_ref, m.scheduled_start_time, m.duration_minutes, m.google_meet_url, m.ics_sequence, m.outcome,
         (l.released AND c.prospect_email_enabled AND c.client_privacy_url IS NOT NULL AND l.prospect_email <> ''
           AND EXISTS (SELECT 1 FROM public.alias_identity ai WHERE ai.id = l.alias_identity_id AND ai.status = 'active' AND ai.verified_at IS NOT NULL))
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
    LEFT JOIN LATERAL (SELECT mt.* FROM public.meeting mt WHERE mt.lead_id = l.id ORDER BY mt.created_at DESC LIMIT 1) m ON true
   WHERE l.id = p_lead AND l.released;
END
$$;
--> statement-breakpoint

-- 8. The caller of the wrappers must be Fynix, or belong to the lead's client, to the organisation that submitted it or to the campaign's coordinator. A lead
--    that does not exist and a lead that is not the caller's get the same refusal.
CREATE FUNCTION public.app_email_assert_caller(p_lead uuid) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_me uuid := public.app_current_user_id();
  v_allowed boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
           SELECT 1 FROM public.member m
            WHERE m.user_id = v_me AND m.status = 'active'
              AND (m.org_kind = 'fynix' OR (m.org_id = public.app_current_org_id() AND m.org_id IN (c.client_org_id, l.source_org_id, c.agency_org_id)))
         )
    INTO v_allowed
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
   WHERE l.id = p_lead;
  IF NOT FOUND OR NOT v_allowed THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
END
$$;
--> statement-breakpoint

CREATE FUNCTION public.app_lead_email_context(p_lead uuid)
  RETURNS TABLE (lead_ref text, company text, time_zone text, meeting_id uuid, meeting_ref text, starts_at timestamp with time zone, duration_minutes integer, meet_url text, ics_sequence integer, meeting_outcome text, prospect_ready boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  PERFORM public.app_email_assert_caller(p_lead);
  RETURN QUERY SELECT * FROM public.app_lead_email_context_core(p_lead);
END
$$;
--> statement-breakpoint

CREATE FUNCTION public.app_lead_email_context_system(p_lead uuid)
  RETURNS TABLE (lead_ref text, company text, time_zone text, meeting_id uuid, meeting_ref text, starts_at timestamp with time zone, duration_minutes integer, meet_url text, ics_sequence integer, meeting_outcome text, prospect_ready boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.app_lead_email_context_core(p_lead);
END
$$;
--> statement-breakpoint

-- 9. The two ways in: by a person who just did something to the lead (never emailed themselves), and by the sweep (no actor).
CREATE FUNCTION public.app_enqueue_lead_email(p_lead uuid, p_audience text[], p_template text, p_params jsonb, p_subject text, p_body text, p_origin text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  PERFORM public.app_email_assert_caller(p_lead);
  RETURN public.app_email_enqueue(p_lead, p_audience, p_template, p_params, p_subject, p_body, p_origin, public.app_current_user_id());
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_enqueue_lead_email_system(p_lead uuid, p_audience text[], p_template text, p_params jsonb, p_subject text, p_body text, p_origin text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  RETURN public.app_email_enqueue(p_lead, p_audience, p_template, p_params, p_subject, p_body, p_origin, NULL);
END
$$;
--> statement-breakpoint

-- 10. The sweep's claims. Each stamps what it returns in the same call, so a row is handed out once; the application writes the emails in the same
--     transaction, so a failure undoes the stamp too.
--     Reminders to the client: every one that is due for a lead still waiting for an answer gets its email stamp (`email_sent_at`, separate from `sent_at` of the
--     notice in the app); one row per lead comes back, the latest, with the whole hours left before the automatic acceptance.
CREATE FUNCTION public.app_claim_reminder_emails(p_now timestamp with time zone) RETURNS TABLE (lead_id uuid, kind text, hours_left integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    UPDATE public.lead_reminder r
       SET email_sent_at = p_now
      FROM public.lead l
     WHERE l.id = r.lead_id AND r.email_sent_at IS NULL AND r.due_at <= p_now AND l.stage = 'awaiting_decision'
    RETURNING l.id AS lid, r.kind AS rkind, r.due_at AS rdue,
              GREATEST(0, pg_catalog.ceil(extract(epoch FROM (l.outcome_recorded_at + interval '48 hours' - p_now)) / 3600))::integer AS hours
  )
  SELECT DISTINCT ON (d.lid) d.lid, d.rkind, d.hours FROM due d ORDER BY d.lid, d.rdue DESC;
END
$$;
--> statement-breakpoint
--     Reminders that depend on the meeting's time. A reminder is handed out only while it still means something: the prospect's ones for a meeting that has not
--     started and no more than two hours after they were due (a meeting booked three hours ahead gets no "a day before"), the nudges for a meeting still without an
--     outcome and no more than two days after they were due. Every due row is stamped, handed out or not.
CREATE FUNCTION public.app_claim_meeting_reminders(p_now timestamp with time zone) RETURNS TABLE (meeting_id uuid, lead_id uuid, kind text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    UPDATE public.meeting_reminder r
       SET sent_at = p_now
      FROM public.meeting m
      JOIN public.lead l ON l.id = m.lead_id
     WHERE m.id = r.meeting_id AND r.sent_at IS NULL AND r.due_at <= p_now
       AND m.outcome = 'scheduled' AND l.stage IN ('scheduled', 'outcome_due') AND l.released
    RETURNING m.id AS mid, l.id AS lid, r.kind AS rkind, r.due_at AS rdue, m.scheduled_start_time AS starts
  )
  SELECT d.mid, d.lid, d.rkind FROM due d
   WHERE (d.rkind LIKE 'prospect\_%' AND d.starts > p_now AND p_now - d.rdue <= interval '2 hours')
      OR (d.rkind LIKE 'nudge\_%' AND p_now - d.rdue <= interval '48 hours')
   ORDER BY d.rdue, d.rkind;
END
$$;
--> statement-breakpoint
--     The join record: the meetings whose room has been read for nobody yet, 30 minutes or more after they ended, and the one call that stores what was read
--     and stamps the meeting. The names, times and lengths are all that is kept: the function takes only those keys from the JSON, whatever else it is given.
CREATE FUNCTION public.app_meetings_for_join_import(p_now timestamp with time zone) RETURNS TABLE (meeting_id uuid, space_id text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT m.id, m.google_space_id
      FROM public.meeting m
     WHERE m.google_space_id IS NOT NULL AND m.join_imported_at IS NULL AND m.outcome <> 'cancelled'
       AND m.scheduled_start_time + make_interval(mins => m.duration_minutes) + interval '30 minutes' <= p_now
     ORDER BY m.scheduled_start_time
     LIMIT 50
  $$;
--> statement-breakpoint
CREATE FUNCTION public.app_store_meeting_joins(p_meeting uuid, p_joins jsonb, p_now timestamp with time zone) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.meeting SET join_imported_at = p_now WHERE id = p_meeting AND join_imported_at IS NULL;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF jsonb_typeof(p_joins) = 'array' THEN
    INSERT INTO public.meeting_join (meeting_id, display_name, joined_at, left_at, duration_seconds)
    SELECT p_meeting, left(btrim(j ->> 'displayName'), 120), (j ->> 'joinedAt')::timestamp with time zone, nullif(j ->> 'leftAt', '')::timestamp with time zone,
           GREATEST(0, (j ->> 'durationSeconds')::integer)
      FROM jsonb_array_elements(p_joins) AS j
     WHERE char_length(btrim(coalesce(j ->> 'displayName', ''))) > 0;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN v_count;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_email_enqueue(uuid, text[], text, jsonb, text, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_lead_email_context_core(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_email_assert_caller(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_lead_email_context(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_lead_email_context_system(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_enqueue_lead_email(uuid, text[], text, jsonb, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_enqueue_lead_email_system(uuid, text[], text, jsonb, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_claim_reminder_emails(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_claim_meeting_reminders(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_meetings_for_join_import(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_store_meeting_joins(uuid, jsonb, timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_lead_email_context(uuid), public.app_enqueue_lead_email(uuid, text[], text, jsonb, text, text, text) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_lead_email_context_system(uuid), public.app_enqueue_lead_email_system(uuid, text[], text, jsonb, text, text, text),
  public.app_claim_reminder_emails(timestamp with time zone), public.app_claim_meeting_reminders(timestamp with time zone),
  public.app_meetings_for_join_import(timestamp with time zone), public.app_store_meeting_joins(uuid, jsonb, timestamp with time zone) TO leads_auth;
