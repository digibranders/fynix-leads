-- The client decides after the meeting (lead flow decision, 2026-11-24). Grants and functions for the columns of 0065. All additive.
--
-- 1. What each tenant role reads and writes of the new lead columns. `decision_by_user_id` goes to the client alone: the coordinator and the
--    agencies see the client's note as from "Client" and never a person's name or id. The agency role cannot write a decision column at all
--    (it records an outcome, which sets `outcome_recorded_at`, and closes a lead on a prospect no-show, which sets `closed_at`).
GRANT SELECT ("outcome_recorded_at", "decision_note", "decision_at", "decision_by_user_id", "decision_source") ON "lead" TO leads_client;
--> statement-breakpoint
GRANT UPDATE ("outcome_recorded_at", "decision_note", "decision_at", "decision_by_user_id", "decision_source") ON "lead" TO leads_client;
--> statement-breakpoint
GRANT SELECT ("outcome_recorded_at", "decision_note", "decision_at", "decision_source") ON "lead" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("closed_at", "outcome_recorded_at") ON "lead" TO leads_agency;
--> statement-breakpoint
-- Who recorded the outcome is a side ("client", "agency", "coordinator", "fynix"), never a person: the person's id stays ungranted.
GRANT SELECT ("recorded_at", "recorded_by_role") ON "meeting" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT UPDATE ("recorded_by_role") ON "meeting" TO leads_client, leads_agency;
--> statement-breakpoint

-- 2. Reminders. No runtime role touches the table; the trigger writes it and the two functions below read it.
ALTER TABLE "lead_reminder" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lead_reminder" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "lead_reminder" TO leads_owner;
--> statement-breakpoint
CREATE POLICY "lead_reminder_owner_all" ON "lead_reminder" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint

-- When a lead reaches `awaiting_decision` with its outcome time stamped, three reminders are due: 12, 24 and 36 hours later. A trigger, not
-- application code, so no way of recording an outcome (client, agency, coordinator or Fynix) can forget them. Re-running it changes nothing.
CREATE FUNCTION public.lead_schedule_reminders() RETURNS trigger
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  INSERT INTO public.lead_reminder (lead_id, kind, due_at) VALUES
    (NEW.id, '12h', NEW.outcome_recorded_at + interval '12 hours'),
    (NEW.id, '24h', NEW.outcome_recorded_at + interval '24 hours'),
    (NEW.id, '36h', NEW.outcome_recorded_at + interval '36 hours')
  ON CONFLICT (lead_id, kind) DO NOTHING;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.lead_schedule_reminders() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER lead_schedule_reminders AFTER INSERT OR UPDATE OF "stage", "outcome_recorded_at" ON "lead"
  FOR EACH ROW WHEN (NEW.stage = 'awaiting_decision' AND NEW.outcome_recorded_at IS NOT NULL)
  EXECUTE FUNCTION public.lead_schedule_reminders();
--> statement-breakpoint

-- 3. The scheduled sweep (`pnpm leads:sweep`, run as leads_auth like the outbox). Accepts every lead still waiting for the client 48 hours
--    after its outcome was recorded, counts it (delivered_at is the counted-at moment) and writes the history row. A second run finds nothing
--    to do, because the lead is no longer `awaiting_decision`. It depends on time alone: no email, no session.
CREATE FUNCTION public.app_sweep_leads(p_now timestamp with time zone) RETURNS TABLE (swept_id uuid, swept_ref text)
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
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
  SELECT s.id, s.public_ref FROM swept s
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_sweep_leads(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_sweep_leads(timestamp with time zone) TO leads_auth;
--> statement-breakpoint

-- The reminders that are due and still useful: not yet sent, and the client has not answered. Phase 5 turns each into a notice and an email.
CREATE FUNCTION public.app_due_lead_reminders(p_now timestamp with time zone)
  RETURNS TABLE (reminder_id uuid, lead_id uuid, lead_ref text, campaign_id uuid, kind text, due_at timestamp with time zone, hours_left integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT r.id, l.id, l.public_ref, l.campaign_id, r.kind, r.due_at,
         GREATEST(0, pg_catalog.ceil(extract(epoch FROM (l.outcome_recorded_at + interval '48 hours' - p_now)) / 3600))::integer
    FROM public.lead_reminder r
    JOIN public.lead l ON l.id = r.lead_id
   WHERE r.sent_at IS NULL
     AND r.due_at <= p_now
     AND l.stage = 'awaiting_decision'
   ORDER BY r.due_at, r.kind
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_due_lead_reminders(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_due_lead_reminders(timestamp with time zone) TO leads_auth;
--> statement-breakpoint

-- 4. The client reads the alias that wrote to the prospect: its name and title, as the spec allows ("the client never sees the supply side,
--    only alias identities"). Nothing else of the alias, and never the member behind it. Only for a lead on one of the caller's own campaigns.
CREATE FUNCTION public.app_lead_alias_name(p_lead uuid) RETURNS TABLE (display_name text, job_title text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT a.display_name, a.job_title
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
    JOIN public.alias_identity a ON a.id = l.alias_identity_id
   WHERE l.id = p_lead AND c.client_org_id = public.app_current_org_id()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_lead_alias_name(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_lead_alias_name(uuid) TO leads_client;
