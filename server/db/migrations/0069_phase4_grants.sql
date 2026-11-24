-- Phase 4, the rest of the lead flow: drafts, postponing, contesting an outcome, review of a rejection, host names for the lead form.
-- Grants, policies, triggers and functions for the columns and tables of 0068. Policies are replaced in place; nothing is dropped that data lives in.

-- 1. Drafts. `lead.released` is false while a lead is a draft and stays false when the draft is discarded: only the organisation that wrote it, and Fynix,
--    read such a row. The client and the coordinator of a partner agency never do, so the policies below add `released` to every branch but the source's own.
GRANT SELECT ("released") ON "lead" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT SELECT ("rejection_reviewed_at") ON "lead" TO leads_agency;
--> statement-breakpoint
-- Drizzle names every column in an INSERT (see 0067), so the agency holds INSERT on each new column.
GRANT INSERT ("released", "rejection_reviewed_at") ON "lead" TO leads_agency;
--> statement-breakpoint
-- A draft is edited and submitted by its source organisation: the prospect, the qualification, the alias, the host and the flags. A trigger below
-- limits those columns to a lead that is still a draft, so the wider grant does not let an agency rewrite a lead the client is already reading.
GRANT UPDATE ("prospect_name", "prospect_title", "prospect_company", "prospect_domain", "prospect_linkedin_url", "prospect_email", "prospect_phone", "prospect_notes",
  "bant_budget", "bant_authority", "bant_need", "bant_timeline", "alias_identity_id", "host_member_id", "over_share", "duplicate_override", "submitted_at", "released",
  "scheduled_meeting_time") ON "lead" TO leads_agency;
--> statement-breakpoint

CREATE FUNCTION public.lead_agency_draft_only() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF current_user = 'leads_agency' AND OLD.stage <> 'draft' AND (
       NEW.prospect_name IS DISTINCT FROM OLD.prospect_name OR NEW.prospect_title IS DISTINCT FROM OLD.prospect_title
    OR NEW.prospect_company IS DISTINCT FROM OLD.prospect_company OR NEW.prospect_domain IS DISTINCT FROM OLD.prospect_domain
    OR NEW.prospect_linkedin_url IS DISTINCT FROM OLD.prospect_linkedin_url OR NEW.prospect_email IS DISTINCT FROM OLD.prospect_email
    OR NEW.prospect_phone IS DISTINCT FROM OLD.prospect_phone OR NEW.prospect_notes IS DISTINCT FROM OLD.prospect_notes
    OR NEW.bant_budget IS DISTINCT FROM OLD.bant_budget OR NEW.bant_authority IS DISTINCT FROM OLD.bant_authority
    OR NEW.bant_need IS DISTINCT FROM OLD.bant_need OR NEW.bant_timeline IS DISTINCT FROM OLD.bant_timeline
    OR NEW.alias_identity_id IS DISTINCT FROM OLD.alias_identity_id OR NEW.host_member_id IS DISTINCT FROM OLD.host_member_id
    OR NEW.over_share IS DISTINCT FROM OLD.over_share OR NEW.duplicate_override IS DISTINCT FROM OLD.duplicate_override
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.released IS DISTINCT FROM OLD.released
  ) THEN
    RAISE EXCEPTION 'lead_draft_only: only a draft can be edited by an agency' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.lead_agency_draft_only() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER lead_agency_draft_only BEFORE UPDATE ON "lead" FOR EACH ROW EXECUTE FUNCTION public.lead_agency_draft_only();
--> statement-breakpoint

DROP POLICY "lead_client_select" ON "lead";
--> statement-breakpoint
CREATE POLICY "lead_client_select" ON "lead" AS PERMISSIVE FOR SELECT TO leads_client
  USING ("released" AND EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.client_org_id = public.app_current_org_id()));
--> statement-breakpoint
DROP POLICY "lead_client_update" ON "lead";
--> statement-breakpoint
CREATE POLICY "lead_client_update" ON "lead" AS PERMISSIVE FOR UPDATE TO leads_client
  USING ("released" AND EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.client_org_id = public.app_current_org_id()))
  WITH CHECK ("released" AND EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.client_org_id = public.app_current_org_id()));
--> statement-breakpoint
DROP POLICY "lead_agency_select" ON "lead";
--> statement-breakpoint
CREATE POLICY "lead_agency_select" ON "lead" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (
    "source_org_id" = public.app_current_org_id() OR
    ("released" AND EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.agency_org_id = public.app_current_org_id()))
  );
--> statement-breakpoint
DROP POLICY "lead_agency_update" ON "lead";
--> statement-breakpoint
CREATE POLICY "lead_agency_update" ON "lead" AS PERMISSIVE FOR UPDATE TO leads_agency
  USING (
    "source_org_id" = public.app_current_org_id() OR
    ("released" AND EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.agency_org_id = public.app_current_org_id()))
  )
  WITH CHECK (
    "source_org_id" = public.app_current_org_id() OR
    ("released" AND EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.agency_org_id = public.app_current_org_id()))
  );
--> statement-breakpoint
DROP POLICY "lead_history_client_select" ON "lead_history";
--> statement-breakpoint
CREATE POLICY "lead_history_client_select" ON "lead_history" AS PERMISSIVE FOR SELECT TO leads_client
  USING (EXISTS (
    SELECT 1 FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
    WHERE l.id = "lead_history"."lead_id" AND l.released AND c.client_org_id = public.app_current_org_id()
  ));
--> statement-breakpoint
DROP POLICY "lead_history_client_insert" ON "lead_history";
--> statement-breakpoint
CREATE POLICY "lead_history_client_insert" ON "lead_history" AS PERMISSIVE FOR INSERT TO leads_client
  WITH CHECK (
    "actor_user_id" = public.app_current_user_id() AND
    "actor_role" = 'client' AND
    EXISTS (
      SELECT 1 FROM public.lead l
      JOIN public.campaign c ON c.id = l.campaign_id
      WHERE l.id = "lead_history"."lead_id" AND l.released AND c.client_org_id = public.app_current_org_id()
    )
  );
--> statement-breakpoint
DROP POLICY "lead_history_agency_select" ON "lead_history";
--> statement-breakpoint
CREATE POLICY "lead_history_agency_select" ON "lead_history" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (EXISTS (
    SELECT 1 FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
    WHERE l.id = "lead_history"."lead_id" AND (
      l.source_org_id = public.app_current_org_id() OR
      (l.released AND c.agency_org_id = public.app_current_org_id())
    )
  ));
--> statement-breakpoint
DROP POLICY "lead_history_agency_insert" ON "lead_history";
--> statement-breakpoint
CREATE POLICY "lead_history_agency_insert" ON "lead_history" AS PERMISSIVE FOR INSERT TO leads_agency
  WITH CHECK (
    "actor_user_id" = public.app_current_user_id() AND
    "actor_role" = 'agency' AND
    EXISTS (
      SELECT 1 FROM public.lead l
      JOIN public.campaign c ON c.id = l.campaign_id
      WHERE l.id = "lead_history"."lead_id" AND (
        l.source_org_id = public.app_current_org_id() OR
        (l.released AND c.agency_org_id = public.app_current_org_id())
      )
    )
  );
--> statement-breakpoint

-- A draft is nobody else's duplicate, and nobody learns that one exists.
CREATE OR REPLACE FUNCTION public.app_find_duplicate_lead(p_client uuid, p_email text, p_linkedin text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT CASE WHEN l.source_org_id = public.app_current_org_id() THEN l.public_ref ELSE 'OTHER' END
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
    WHERE c.client_org_id = p_client
      AND (l.prospect_email = p_email OR l.prospect_linkedin_url = p_linkedin)
      AND l.stage NOT IN ('draft', 'withdrawn', 'lost', 'rejected', 'declined')
    ORDER BY (l.source_org_id = public.app_current_org_id()) DESC
    LIMIT 1
  $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_lead_alias_name(p_lead uuid) RETURNS TABLE (display_name text, job_title text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT a.display_name, a.job_title
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
    JOIN public.alias_identity a ON a.id = l.alias_identity_id
   WHERE l.id = p_lead AND l.released AND c.client_org_id = public.app_current_org_id()
$$;
--> statement-breakpoint

-- 2. Postponing. A meeting keeps its row and link; a proposal moves only `scheduled_start_time`, so both tenant roles may update it (and the agency the lead's copy).
GRANT SELECT ("contested_at", "contest_note", "contested_by_role") ON "meeting" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT UPDATE ("scheduled_start_time", "contested_at", "contest_note", "contested_by_role") ON "meeting" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT INSERT ("contested_at", "contest_note", "contested_by_role") ON "meeting" TO leads_client, leads_agency;
--> statement-breakpoint

CREATE FUNCTION public.app_reschedule_visible_to_client(p_meeting uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT EXISTS (SELECT 1 FROM public.meeting m JOIN public.campaign c ON c.id = m.campaign_id WHERE m.id = p_meeting AND c.client_org_id = public.app_current_org_id())
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_reschedule_visible_to_supply(p_meeting uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting m
      JOIN public.lead l ON l.id = m.lead_id
      JOIN public.campaign c ON c.id = l.campaign_id
     WHERE m.id = p_meeting AND l.released AND (l.source_org_id = public.app_current_org_id() OR c.agency_org_id = public.app_current_org_id())
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_reschedule_visible_to_client(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_reschedule_visible_to_supply(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_reschedule_visible_to_client(uuid) TO leads_client;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_reschedule_visible_to_supply(uuid) TO leads_agency;
--> statement-breakpoint

ALTER TABLE "meeting_reschedule" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "meeting_reschedule" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER meeting_reschedule_audit_required AFTER INSERT OR UPDATE OR DELETE ON "meeting_reschedule"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
GRANT ALL ON TABLE "meeting_reschedule" TO leads_owner;
--> statement-breakpoint
GRANT SELECT ON TABLE "meeting_reschedule" TO leads_fynix;
--> statement-breakpoint
-- Fynix closes an open proposal when it cancels the meeting (marking a lead lost, or answering for the client).
GRANT UPDATE ("status", "resolved_at") ON TABLE "meeting_reschedule" TO leads_fynix;
--> statement-breakpoint
GRANT SELECT ("id", "meeting_id", "proposed_by_side", "proposed_times", "status", "picked_time", "created_at", "resolved_at") ON "meeting_reschedule" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "meeting_id", "proposed_by_side", "proposed_by_user_id", "proposed_times", "status", "picked_time", "created_at", "resolved_at") ON "meeting_reschedule" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT UPDATE ("status", "picked_time", "resolved_at") ON "meeting_reschedule" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "meeting_reschedule_owner_all" ON "meeting_reschedule" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "meeting_reschedule_fynix_all" ON "meeting_reschedule" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "meeting_reschedule_client_select" ON "meeting_reschedule" AS PERMISSIVE FOR SELECT TO leads_client USING (public.app_reschedule_visible_to_client("meeting_id"));
--> statement-breakpoint
CREATE POLICY "meeting_reschedule_client_insert" ON "meeting_reschedule" AS PERMISSIVE FOR INSERT TO leads_client
  WITH CHECK ("proposed_by_side" = 'client' AND "proposed_by_user_id" = public.app_current_user_id() AND public.app_reschedule_visible_to_client("meeting_id"));
--> statement-breakpoint
CREATE POLICY "meeting_reschedule_client_update" ON "meeting_reschedule" AS PERMISSIVE FOR UPDATE TO leads_client
  USING (public.app_reschedule_visible_to_client("meeting_id")) WITH CHECK (public.app_reschedule_visible_to_client("meeting_id"));
--> statement-breakpoint
CREATE POLICY "meeting_reschedule_agency_select" ON "meeting_reschedule" AS PERMISSIVE FOR SELECT TO leads_agency USING (public.app_reschedule_visible_to_supply("meeting_id"));
--> statement-breakpoint
CREATE POLICY "meeting_reschedule_agency_insert" ON "meeting_reschedule" AS PERMISSIVE FOR INSERT TO leads_agency
  WITH CHECK ("proposed_by_side" = 'supply' AND "proposed_by_user_id" = public.app_current_user_id() AND public.app_reschedule_visible_to_supply("meeting_id"));
--> statement-breakpoint
CREATE POLICY "meeting_reschedule_agency_update" ON "meeting_reschedule" AS PERMISSIVE FOR UPDATE TO leads_agency
  USING (public.app_reschedule_visible_to_supply("meeting_id")) WITH CHECK (public.app_reschedule_visible_to_supply("meeting_id"));
--> statement-breakpoint

-- 3. Contesting an outcome. A decided contest recomputes the reminders: the old due times belong to the outcome that was set aside.
CREATE OR REPLACE FUNCTION public.lead_schedule_reminders() RETURNS trigger
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  INSERT INTO public.lead_reminder (lead_id, kind, due_at) VALUES
    (NEW.id, '12h', NEW.outcome_recorded_at + interval '12 hours'),
    (NEW.id, '24h', NEW.outcome_recorded_at + interval '24 hours'),
    (NEW.id, '36h', NEW.outcome_recorded_at + interval '36 hours')
  ON CONFLICT (lead_id, kind) DO UPDATE SET due_at = EXCLUDED.due_at, sent_at = NULL
    WHERE public.lead_reminder.due_at IS DISTINCT FROM EXCLUDED.due_at;
  RETURN NULL;
END
$$;
--> statement-breakpoint

-- 4. A request for Fynix to review a rejection. The coordinator writes it; no client role reads it.
CREATE FUNCTION public.app_lead_served_by_me(p_lead uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT EXISTS (SELECT 1 FROM public.lead l JOIN public.campaign c ON c.id = l.campaign_id WHERE l.id = p_lead AND l.released AND c.agency_org_id = public.app_current_org_id())
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_lead_served_by_me(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_lead_served_by_me(uuid) TO leads_agency;
--> statement-breakpoint
ALTER TABLE "rejection_review" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rejection_review" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER rejection_review_audit_required AFTER INSERT OR UPDATE OR DELETE ON "rejection_review"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
GRANT ALL ON TABLE "rejection_review" TO leads_owner;
--> statement-breakpoint
GRANT SELECT ON TABLE "rejection_review" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status", "resolved_at") ON TABLE "rejection_review" TO leads_fynix;
--> statement-breakpoint
GRANT SELECT ("id", "lead_id", "note", "requested_at", "status", "resolved_at") ON "rejection_review" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "lead_id", "requested_by_user_id", "note", "requested_at", "status", "resolved_at") ON "rejection_review" TO leads_agency;
--> statement-breakpoint
CREATE POLICY "rejection_review_owner_all" ON "rejection_review" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "rejection_review_fynix_all" ON "rejection_review" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "rejection_review_agency_select" ON "rejection_review" AS PERMISSIVE FOR SELECT TO leads_agency USING (public.app_lead_served_by_me("lead_id"));
--> statement-breakpoint
CREATE POLICY "rejection_review_agency_insert" ON "rejection_review" AS PERMISSIVE FOR INSERT TO leads_agency
  WITH CHECK ("requested_by_user_id" = public.app_current_user_id() AND "status" = 'open' AND public.app_lead_served_by_me("lead_id"));
--> statement-breakpoint

-- 5. The lead form shows the names of a campaign's hosts to the supply side (owner decision, 2026-11-24): a name and a job title, never an email or a phone.
CREATE FUNCTION public.app_campaign_host_names(p_campaign uuid) RETURNS TABLE (member_id uuid, display_name text, job_title text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT ch.member_id, m.display_name, ch.job_title
    FROM public.campaign_host ch
    JOIN public.member m ON m.id = ch.member_id
    JOIN public.campaign c ON c.id = ch.campaign_id
   WHERE ch.campaign_id = p_campaign AND ch.active
     AND (c.agency_org_id = public.app_current_org_id()
       OR EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id()))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_campaign_host_names(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_campaign_host_names(uuid) TO leads_agency;
