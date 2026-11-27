-- 1. A notice can go to one named agency: the audience word `agency:<organisation id>`. It is how an agency is told that a share of a campaign was given to it or
--    taken from it. The word is built by server code and the caller is checked by app_notify_campaign (Fynix, or a member of the campaign's client or coordinator).
--    The word only reaches the campaign's coordinator or one of its partner agencies, so no caller can aim a notice at any other organisation.
CREATE OR REPLACE FUNCTION public.app_notice_insert(p_lead uuid, p_campaign uuid, p_meeting uuid, p_audience text[], p_kind text, p_title text, p_body text, p_target text, p_exclude uuid) RETURNS integer
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
         OR (('agency:' || m.org_id::text) = ANY (p_audience) AND (m.org_id = ctx.supplier_org_id OR o.parent_org_id = ctx.supplier_org_id))
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
-- 2. The email of a campaign update (made active, assigned, shared, unshared). Fynix may send any of the three audiences; a member of the campaign's coordinator may
--    send only to the managers of an agency inside its own hierarchy (itself or a partner agency), which is how a coordinator's own share reaches its agency.
CREATE FUNCTION public.app_enqueue_campaign_update_email(p_campaign uuid, p_audience text[], p_template text, p_params jsonb, p_subject text, p_body text, p_origin text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_me uuid := public.app_current_user_id();
  v_fynix boolean;
  v_supplier uuid;
  v_count integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  SELECT c.agency_org_id INTO v_supplier FROM public.campaign c WHERE c.id = p_campaign;
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'domain:not-found' USING ERRCODE = '22023';
  END IF;
  v_fynix := EXISTS (SELECT 1 FROM public.member m WHERE m.user_id = v_me AND m.status = 'active' AND m.org_kind = 'fynix');
  IF NOT v_fynix AND NOT EXISTS (SELECT 1 FROM public.member m WHERE m.user_id = v_me AND m.status = 'active' AND m.org_id = v_supplier AND m.org_id = public.app_current_org_id()) THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  IF p_template <> 'campaign_update_info'
     OR p_audience IS NULL OR cardinality(p_audience) = 0
     OR EXISTS (SELECT 1 FROM unnest(p_audience) AS a WHERE a !~ '^(client_managers|coordinator_managers|agency_managers:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
     OR (NOT v_fynix AND EXISTS (SELECT 1 FROM unnest(p_audience) AS a WHERE a NOT LIKE 'agency_managers:%'))
     OR jsonb_typeof(p_params) <> 'object' THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;
  WITH ctx AS (
    SELECT c.client_org_id, c.agency_org_id AS coordinator_org_id, c.public_ref AS campaign_ref FROM public.campaign c WHERE c.id = p_campaign
  ), people AS (
    SELECT DISTINCT ON (u.email) u.email, public.app_notice_path(m.org_kind::text, (o.parent_org_id IS NULL), 'campaign', NULL, ctx.campaign_ref) AS path
      FROM ctx
      JOIN public.member m ON m.status = 'active' AND m.role = 'manager'
      JOIN public.organisation o ON o.id = m.org_id
      JOIN public."user" u ON u.id = m.user_id
     WHERE m.user_id IS DISTINCT FROM v_me
       AND (
            ('client_managers' = ANY (p_audience) AND m.org_id = ctx.client_org_id)
         OR ('coordinator_managers' = ANY (p_audience) AND m.org_id = ctx.coordinator_org_id)
         OR (('agency_managers:' || m.org_id::text) = ANY (p_audience) AND (m.org_id = ctx.coordinator_org_id OR o.parent_org_id = ctx.coordinator_org_id))
       )
  )
  INSERT INTO public.email_outbox (recipient, template, params, subject, body, link)
  SELECT p.email, p_template::public.email_template, p_params, p_subject, p_body, p_origin || p.path FROM people p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_enqueue_campaign_update_email(uuid, text[], text, jsonb, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_enqueue_campaign_update_email(uuid, text[], text, jsonb, text, text, text) TO leads_fynix, leads_agency;
