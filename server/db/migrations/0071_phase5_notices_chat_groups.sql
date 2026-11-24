-- Phase 5 chunk A: notices in the app, reminders, unread counts and chat groups of one side.
--
-- 1. Nobody but a database function writes a notice for another person. Until now `leads_client` and `leads_agency` could insert a row into
--    "notification" for any user (the insert policies said `WITH CHECK (true)`), so a tenant could put a notice in front of anyone. The grants and the
--    two policies go; every notice is written by a SECURITY DEFINER function that works out the recipients itself from the lead, campaign or
--    conversation it is given and checks the caller belongs to it. (This takes INSERT away from the two roles: code from before this migration that
--    inserted notices directly stops working, which is why the message notices move into `app_notify_conversation` in the same release.)
REVOKE INSERT ON "notification" FROM leads_client;
--> statement-breakpoint
REVOKE INSERT ON "notification" FROM leads_agency;
--> statement-breakpoint
DROP POLICY "notification_client_insert" ON "notification";
--> statement-breakpoint
DROP POLICY "notification_agency_insert" ON "notification";
--> statement-breakpoint
GRANT SELECT ("lead_id", "meeting_id", "campaign_id") ON "notification" TO leads_client, leads_agency;
--> statement-breakpoint

-- 2. The page a notice opens, for the portal of the person it is for. Only routes that exist.
CREATE FUNCTION public.app_notice_path(p_org_kind text, p_supplier boolean, p_target text, p_lead_ref text, p_campaign_ref text) RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT CASE p_org_kind
      WHEN 'fynix' THEN CASE p_target
        WHEN 'lead' THEN '/fynix/leads/' || p_lead_ref
        WHEN 'agreement' THEN '/fynix/campaigns/' || p_campaign_ref || '/agreements'
        ELSE '/fynix/campaigns/' || p_campaign_ref END
      WHEN 'client' THEN CASE p_target
        WHEN 'lead' THEN '/client/leads/' || p_lead_ref
        WHEN 'agreement' THEN '/client/agreement'
        ELSE '/client/campaigns' END
      ELSE CASE WHEN p_supplier THEN '/supplier' ELSE '/agency' END || CASE p_target
        WHEN 'lead' THEN '/leads/' || p_lead_ref
        WHEN 'agreement' THEN CASE WHEN p_supplier THEN '/agreement' ELSE '/campaigns' END
        ELSE '/campaigns' END
    END
  $$;
--> statement-breakpoint

-- 3. The one place a lead or campaign notice is written. Internal: no runtime role may call it (the two functions below and the sweep do). The audience
--    is a list of sides, resolved from the lead or campaign: active people only, and never `p_exclude`, the person who acted. `{ref}` and `{company}`
--    in the title and body are filled in from the lead (the campaign's reference when no lead is named).
CREATE FUNCTION public.app_notice_insert(p_lead uuid, p_campaign uuid, p_meeting uuid, p_audience text[], p_kind text, p_title text, p_body text, p_target text, p_exclude uuid) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_count integer;
BEGIN
  WITH ctx AS (
    SELECT c.id AS campaign_id, c.public_ref AS campaign_ref, c.client_org_id, c.agency_org_id AS supplier_org_id,
           l.id AS lead_id, l.public_ref AS lead_ref, l.prospect_company, l.source_org_id
      FROM public.campaign c
      LEFT JOIN public.lead l ON l.id = p_lead
     WHERE c.id = coalesce(p_campaign, l.campaign_id) AND (l.id IS NULL OR l.campaign_id = c.id)
  ), people AS (
    SELECT m.user_id, m.org_id, m.org_kind::text AS org_kind, (o.parent_org_id IS NULL) AS supplier, ctx.*
      FROM ctx
      JOIN public.member m ON m.status = 'active'
      JOIN public.organisation o ON o.id = m.org_id
     WHERE m.user_id IS DISTINCT FROM p_exclude
       AND (
            ('client' = ANY (p_audience) AND m.org_id = ctx.client_org_id)
         OR ('client_managers' = ANY (p_audience) AND m.org_id = ctx.client_org_id AND m.role = 'manager')
         OR ('source' = ANY (p_audience) AND m.org_id = ctx.source_org_id)
         OR ('coordinator' = ANY (p_audience) AND m.org_id = ctx.supplier_org_id)
         OR ('partner_coordinator' = ANY (p_audience) AND ctx.source_org_id IS NOT NULL AND ctx.source_org_id <> ctx.supplier_org_id AND m.org_id = ctx.supplier_org_id)
         OR ('coordinator_managers' = ANY (p_audience) AND m.org_id = ctx.supplier_org_id AND m.role = 'manager')
         OR ('shared_agencies' = ANY (p_audience) AND m.org_id IN (SELECT s.agency_org_id FROM public.campaign_share s WHERE s.campaign_id = ctx.campaign_id))
         OR ('fynix' = ANY (p_audience) AND m.org_kind = 'fynix')
       )
  )
  INSERT INTO public.notification (user_id, org_id, kind, title, body, link, lead_id, meeting_id, campaign_id)
  SELECT p.user_id,
         CASE WHEN p.org_kind = 'fynix' THEN NULL ELSE p.org_id END,
         p_kind,
         left(replace(replace(p_title, '{ref}', coalesce(p.lead_ref, p.campaign_ref)), '{company}', coalesce(p.prospect_company, 'the prospect')), 200),
         left(replace(replace(p_body, '{ref}', coalesce(p.lead_ref, p.campaign_ref)), '{company}', coalesce(p.prospect_company, 'the prospect')), 500),
         public.app_notice_path(p.org_kind, p.supplier, p_target, p.lead_ref, p.campaign_ref),
         p.lead_id, p_meeting, p.campaign_id
    FROM people p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint

-- 4. A notice about a lead, written by the person who did something to it. The caller must be Fynix, or belong to the lead's client, to the organisation
--    that submitted it or to the campaign's coordinator, and the lead must be released (a draft has no audience). A lead that does not exist and a lead
--    that is not the caller's get the same refusal. It answers nothing, so a caller learns nothing about who is on the other side.
CREATE FUNCTION public.app_notify_lead(p_lead uuid, p_audience text[], p_kind text, p_title text, p_body text, p_meeting uuid DEFAULT NULL) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_me uuid := public.app_current_user_id();
  v_released boolean;
  v_allowed boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  SELECT l.released,
         EXISTS (
           SELECT 1 FROM public.member m
            WHERE m.user_id = v_me AND m.status = 'active'
              AND (m.org_kind = 'fynix' OR (m.org_id = public.app_current_org_id() AND m.org_id IN (c.client_org_id, l.source_org_id, c.agency_org_id)))
         )
    INTO v_released, v_allowed
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
   WHERE l.id = p_lead;
  IF NOT FOUND OR NOT v_allowed THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  IF NOT v_released THEN
    RETURN;
  END IF;
  IF p_meeting IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.meeting mt WHERE mt.id = p_meeting AND mt.lead_id = p_lead) THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  PERFORM public.app_notice_insert(p_lead, NULL, p_meeting, p_audience, p_kind, p_title, p_body, 'lead', v_me);
END
$$;
--> statement-breakpoint

-- 5. A notice about a campaign (it went active or closed, an agreement version was published). The caller is Fynix or belongs to the campaign's client or coordinator.
CREATE FUNCTION public.app_notify_campaign(p_campaign uuid, p_audience text[], p_kind text, p_title text, p_body text, p_target text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_me uuid := public.app_current_user_id();
  v_allowed boolean;
BEGIN
  IF v_me IS NULL OR p_target NOT IN ('campaign', 'agreement') THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
           SELECT 1 FROM public.member m
            WHERE m.user_id = v_me AND m.status = 'active'
              AND (m.org_kind = 'fynix' OR (m.org_id = public.app_current_org_id() AND m.org_id IN (c.client_org_id, c.agency_org_id)))
         )
    INTO v_allowed
    FROM public.campaign c
   WHERE c.id = p_campaign;
  IF NOT FOUND OR NOT v_allowed THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  PERFORM public.app_notice_insert(NULL, p_campaign, NULL, p_audience, p_kind, p_title, p_body, p_target, v_me);
END
$$;
--> statement-breakpoint

-- 6. The notice of a new message in a one-to-one thread (client with Fynix, coordinator with Fynix, coordinator with an agency), for the people on the
--    other side of the caller. Replaces the inserts the application made itself, which the tenant roles can no longer do. A group has its own
--    (`app_notify_group`, 0051). The link opens the thread in the recipient's own portal.
CREATE FUNCTION public.app_notify_conversation(p_conversation uuid, p_title text, p_body text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_me uuid := public.app_current_user_id();
  v_org uuid := public.app_current_org_id();
  v_kind text;
  v_conv public.conversation%ROWTYPE;
BEGIN
  IF v_me IS NULL OR NOT public.app_can_see_conversation(p_conversation) THEN
    RETURN;
  END IF;
  SELECT * INTO v_conv FROM public.conversation c WHERE c.id = p_conversation AND c.side <> 'group';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT m.org_kind::text INTO v_kind FROM public.member m WHERE m.user_id = v_me AND m.status = 'active' LIMIT 1;
  INSERT INTO public.notification (user_id, org_id, kind, title, body, link, lead_id, campaign_id)
  SELECT m.user_id,
         CASE WHEN m.org_kind = 'fynix' THEN NULL ELSE m.org_id END,
         'message_received',
         left(p_title, 200),
         left(p_body, 500),
         CASE WHEN m.org_kind = 'fynix' THEN '/fynix/inbox'
              WHEN m.org_kind = 'client' THEN '/client/messages'
              WHEN o.parent_org_id IS NULL THEN '/supplier/messages'
              ELSE '/agency/messages' END || '?conv=' || v_conv.id::text,
         v_conv.lead_id, v_conv.campaign_id
    FROM public.member m
    JOIN public.organisation o ON o.id = m.org_id
   WHERE m.status = 'active' AND m.user_id <> v_me
     AND (
          (v_conv.side = 'client_fynix' AND ((v_kind = 'client' AND m.org_kind = 'fynix') OR (v_kind = 'fynix' AND m.org_id = v_conv.client_org_id)))
       OR (v_conv.side = 'supplier_fynix' AND ((v_kind = 'agency' AND m.org_kind = 'fynix') OR (v_kind = 'fynix' AND m.org_id = v_conv.supplier_org_id)))
       OR (v_conv.side = 'supplier_agency' AND ((v_org = v_conv.supplier_org_id AND m.org_id = v_conv.agency_org_id) OR (v_org = v_conv.agency_org_id AND m.org_id = v_conv.supplier_org_id)))
     );
END
$$;
--> statement-breakpoint

-- 7. The sweep, now writing the notices of an automatic acceptance in the same call (and so the same transaction) as the acceptance. Same signature and
--    same answer as 0066. It is plpgsql now so each accepted lead can be followed by its notices; a second run finds nothing, because an accepted
--    lead is no longer awaiting a decision. Everyone on the lead is told (there is no actor to leave out).
CREATE OR REPLACE FUNCTION public.app_sweep_leads(p_now timestamp with time zone) RETURNS TABLE (swept_id uuid, swept_ref text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    WITH swept AS (
      UPDATE public.lead l
         SET stage = 'accepted',
             decision_source = 'auto',
             decision_note = 'Accepted automatically after 48 hours with no answer',
             decision_at = p_now,
             delivered_at = p_now,
             updated_at = p_now
       WHERE l.stage = 'awaiting_decision'
         AND l.outcome_recorded_at IS NOT NULL
         AND l.outcome_recorded_at <= p_now - interval '48 hours'
      RETURNING l.id, l.public_ref
    ), history AS (
      INSERT INTO public.lead_history (lead_id, actor_user_id, actor_role, action, from_stage, to_stage, note, created_at)
      SELECT s.id, NULL, 'system', 'lead.auto_accept', 'awaiting_decision', 'accepted', 'Accepted automatically after 48 hours with no answer', p_now
        FROM swept s
      RETURNING lead_id
    )
    SELECT s.id AS lead_id, s.public_ref AS lead_ref FROM swept s
  LOOP
    PERFORM public.app_notice_insert(
      v_row.lead_id, NULL, NULL, ARRAY['client', 'source', 'coordinator', 'fynix'], 'lead_auto_accepted',
      'Lead {ref} was accepted automatically',
      'The client did not answer within 48 hours, so the lead counts as one. Note: Accepted automatically after 48 hours with no answer',
      'lead', NULL);
    swept_id := v_row.lead_id;
    swept_ref := v_row.lead_ref;
    RETURN NEXT;
  END LOOP;
END
$$;
--> statement-breakpoint

-- 8. The reminders to the client after the meeting (12, 24 and 36 hours after the outcome), in the app. Each reminder that is due for a lead still waiting
--    for an answer is stamped sent in the same call that writes the notice, so a second run writes nothing. When several are due at once (the job was
--    down) every one is stamped and only the latest is turned into a notice. The notice goes to every active person of the client of the campaign and says
--    how many whole hours are left before the automatic acceptance. `app_due_lead_reminders` (0066) stays a read-only list for the email half; once the
--    notices are sent it lists nothing for those reminders, because their `sent_at` is stamped here.
CREATE FUNCTION public.app_send_lead_reminders(p_now timestamp with time zone)
  RETURNS TABLE (reminder_id uuid, lead_id uuid, lead_ref text, campaign_id uuid, kind text, hours_left integer, notified integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    UPDATE public.lead_reminder r
       SET sent_at = p_now
      FROM public.lead l
     WHERE l.id = r.lead_id AND r.sent_at IS NULL AND r.due_at <= p_now AND l.stage = 'awaiting_decision'
    RETURNING r.id AS rid, l.id AS lid, l.public_ref AS lref, l.campaign_id AS cid, r.kind AS rkind, r.due_at AS rdue,
              GREATEST(0, pg_catalog.ceil(extract(epoch FROM (l.outcome_recorded_at + interval '48 hours' - p_now)) / 3600))::integer AS hours
  ), latest AS (
    SELECT DISTINCT ON (d.lid) d.lid, d.lref, d.cid, d.hours FROM due d ORDER BY d.lid, d.rdue DESC
  ), written AS (
    INSERT INTO public.notification AS n (user_id, org_id, kind, title, body, link, lead_id, campaign_id)
    SELECT m.user_id, m.org_id, 'decision_reminder',
           'Reminder: accept or reject lead ' || t.lref,
           CASE WHEN t.hours = 1 THEN '1 hour left' ELSE t.hours::text || ' hours left' END
             || ' before this lead is accepted automatically. Accept or reject it with a note.',
           '/client/leads/' || t.lref, t.lid, t.cid
      FROM latest t
      JOIN public.campaign c ON c.id = t.cid
      JOIN public.member m ON m.org_id = c.client_org_id AND m.status = 'active'
    RETURNING n.lead_id AS written_lead
  )
  SELECT d.rid, d.lid, d.lref, d.cid, d.rkind, d.hours,
         (SELECT count(*)::integer FROM written w WHERE w.written_lead = d.lid)
    FROM due d
   ORDER BY d.rdue, d.rkind;
END
$$;
--> statement-breakpoint

-- 9. Unread messages, one cheap query: the number of conversations the caller can see in which someone else wrote after the caller last opened it
--    (`conversation_read`, 0049, which no role reads directly). Notices are counted by the application from the person's own rows in "notification".
CREATE FUNCTION public.app_unread_conversation_count() RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT count(*)::integer
      FROM public.conversation c
     WHERE public.app_can_see_conversation(c.id)
       AND EXISTS (
         SELECT 1 FROM public.conversation_message cm
          WHERE cm.conversation_id = c.id
            AND cm.sender_user_id <> public.app_current_user_id()
            AND cm.created_at > coalesce(
              (SELECT r.read_at FROM public.conversation_read r WHERE r.conversation_id = c.id AND r.user_id = public.app_current_user_id()),
              '-infinity'::timestamp with time zone)
       )
  $$;
--> statement-breakpoint

-- 10. Chat groups of one side. The side of a person is their root: a client's own organisation, the coordinator at the top of an agency's tree, and
--     nothing for Fynix. A group holds Fynix people and the people of at most one root: one client, or one coordinator with its agencies. The
--     client side and the supply side never share a chat, and two clients never do.
CREATE FUNCTION public.app_side_root(p_user uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT CASE m.org_kind::text WHEN 'client' THEN m.org_id WHEN 'agency' THEN coalesce(o.parent_org_id, o.id) END
      FROM public.member m
      JOIN public.organisation o ON o.id = m.org_id
     WHERE m.user_id = p_user AND m.status = 'active'
     LIMIT 1
  $$;
--> statement-breakpoint
CREATE FUNCTION public.app_group_assert_one_side(p_group uuid) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_roots integer;
BEGIN
  SELECT count(DISTINCT public.app_side_root(gm.user_id)) INTO v_roots
    FROM public.chat_group_member gm
   WHERE gm.group_id = p_group AND gm.left_at IS NULL;
  IF v_roots > 1 THEN
    RAISE EXCEPTION 'A group holds Fynix and one side only: one client, or one coordinator with its agencies';
  END IF;
END
$$;
--> statement-breakpoint
-- The same bodies as 0051, each ending with the check above. The check runs after the members are in, so a refusal undoes the whole change.
CREATE OR REPLACE FUNCTION public.app_create_group(p_group_ref text, p_conversation_ref text, p_name text, p_members uuid[]) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_name text := btrim(p_name);
  v_group uuid;
  v_conversation uuid;
  v_member uuid;
  v_me uuid := public.app_current_user_id();
BEGIN
  IF NOT public.app_can_create_group() THEN
    RAISE EXCEPTION 'You cannot create a group';
  END IF;
  IF char_length(v_name) < 1 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'A group name is 1 to 80 characters';
  END IF;
  IF coalesce(array_length(p_members, 1), 0) > 200 THEN
    RAISE EXCEPTION 'A group has at most 200 people';
  END IF;
  FOREACH v_member IN ARRAY coalesce(p_members, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.app_group_candidates() c WHERE c.user_id = v_member) THEN
      RAISE EXCEPTION 'You cannot add that person to a group';
    END IF;
  END LOOP;
  INSERT INTO public.chat_group (public_ref, name, created_by_user_id) VALUES (p_group_ref, v_name, v_me) RETURNING id INTO v_group;
  INSERT INTO public.chat_group_member (group_id, user_id, added_by_user_id) VALUES (v_group, v_me, v_me);
  INSERT INTO public.chat_group_member (group_id, user_id, added_by_user_id)
    SELECT v_group, u, v_me FROM (SELECT DISTINCT unnest(coalesce(p_members, ARRAY[]::uuid[])) AS u) s WHERE u <> v_me;
  PERFORM public.app_group_assert_one_side(v_group);
  INSERT INTO public.conversation (public_ref, side, group_id, subject) VALUES (p_conversation_ref, 'group', v_group, v_name) RETURNING id INTO v_conversation;
  RETURN v_conversation;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_group_add_members(p_group uuid, p_members uuid[]) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_member uuid;
  v_count integer := 0;
BEGIN
  IF NOT public.app_group_can_manage(p_group) THEN
    RAISE EXCEPTION 'You cannot change this group';
  END IF;
  FOREACH v_member IN ARRAY coalesce(p_members, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.app_group_candidates() c WHERE c.user_id = v_member) THEN
      RAISE EXCEPTION 'You cannot add that person to a group';
    END IF;
    INSERT INTO public.chat_group_member (group_id, user_id, added_by_user_id)
    VALUES (p_group, v_member, public.app_current_user_id())
    ON CONFLICT (group_id, user_id) DO UPDATE SET left_at = NULL, joined_at = CASE WHEN chat_group_member.left_at IS NULL THEN chat_group_member.joined_at ELSE now() END;
    v_count := v_count + 1;
  END LOOP;
  PERFORM public.app_group_assert_one_side(p_group);
  UPDATE public.chat_group SET updated_at = now() WHERE id = p_group;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- The pool of `app_group_candidates()` narrowed to what fits: given the people already chosen (and, for a group the caller manages, the people already in
-- it), Fynix people and the people of the one side already present. With nobody from a side yet, the whole pool.
CREATE FUNCTION public.app_group_candidates_scoped(p_group uuid, p_chosen uuid[]) RETURNS TABLE (user_id uuid, display_name text, org_name text, role_label text, side_root uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    WITH present AS (
      SELECT public.app_side_root(s.u) AS root
        FROM (
          SELECT gm.user_id AS u FROM public.chat_group_member gm WHERE p_group IS NOT NULL AND gm.group_id = p_group AND gm.left_at IS NULL AND public.app_group_can_manage(p_group)
          UNION
          SELECT unnest(coalesce(p_chosen, ARRAY[]::uuid[]))
        ) s
    )
    SELECT c.user_id, c.display_name, c.org_name, c.role_label, public.app_side_root(c.user_id)
      FROM public.app_group_candidates() c
     WHERE public.app_side_root(c.user_id) IS NULL
        OR NOT EXISTS (SELECT 1 FROM present WHERE present.root IS NOT NULL)
        OR public.app_side_root(c.user_id) IN (SELECT present.root FROM present WHERE present.root IS NOT NULL)
  $$;
--> statement-breakpoint
-- Groups that already hold more than one side (made before this migration): for the owner to look at and repair. Nothing is changed or removed.
-- Fynix only.
CREATE FUNCTION public.app_mixed_groups() RETURNS TABLE (group_id uuid, public_ref text, name text, kind text, member_count integer, sides text[], created_at timestamp with time zone)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT g.id, g.public_ref, g.name, g.kind, count(*)::integer,
           coalesce(array_agg(DISTINCT CASE m.org_kind::text WHEN 'client' THEN 'Client: ' || o.name ELSE 'Coordinator side: ' || coalesce(po.name, o.name) END)
                      FILTER (WHERE m.org_kind::text <> 'fynix'), ARRAY[]::text[]),
           g.created_at
      FROM public.chat_group g
      JOIN public.chat_group_member gm ON gm.group_id = g.id AND gm.left_at IS NULL
      JOIN public.member m ON m.user_id = gm.user_id AND m.status = 'active'
      JOIN public.organisation o ON o.id = m.org_id
      LEFT JOIN public.organisation po ON po.id = o.parent_org_id
     WHERE g.status = 'active'
       AND EXISTS (SELECT 1 FROM public.member me WHERE me.user_id = public.app_current_user_id() AND me.status = 'active' AND me.org_kind::text = 'fynix')
     GROUP BY g.id
    HAVING count(DISTINCT public.app_side_root(gm.user_id)) > 1
     ORDER BY g.created_at, g.public_ref
  $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_notice_path(text, boolean, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_notice_insert(uuid, uuid, uuid, text[], text, text, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_notify_lead(uuid, text[], text, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_notify_campaign(uuid, text[], text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_notify_conversation(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_send_lead_reminders(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_unread_conversation_count() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_side_root(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_assert_one_side(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_candidates_scoped(uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_mixed_groups() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_notify_lead(uuid, text[], text, text, text, uuid), public.app_notify_campaign(uuid, text[], text, text, text, text), public.app_notify_conversation(uuid, text, text), public.app_unread_conversation_count(), public.app_group_candidates_scoped(uuid, uuid[]) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_mixed_groups() TO leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_send_lead_reminders(timestamp with time zone) TO leads_auth;
