-- Meeting table schema, RLS, triggers and role grants (Phase 3).
-- Tracks scheduled meetings, Google Meet links, and meeting outcomes.

CREATE TABLE "meeting" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "public_ref" text NOT NULL,
  "lead_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "host_member_id" uuid NOT NULL,
  "scheduled_start_time" timestamp with time zone NOT NULL,
  "duration_minutes" integer DEFAULT 30 NOT NULL,
  "google_meet_url" text NOT NULL,
  "outcome" text DEFAULT 'scheduled' NOT NULL,
  "notes" text,
  "held_at" timestamp with time zone,
  "recorded_at" timestamp with time zone,
  "recorded_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_public_ref_unique" UNIQUE ("public_ref"),
  CONSTRAINT "meeting_lead_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "meeting_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "meeting_host_member_fk" FOREIGN KEY ("host_member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "meeting_recorded_by_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "meeting_public_ref_format" CHECK ("public_ref" ~ '^MTG-[0-9A-HJKMNP-TV-Z]{4}$'),
  CONSTRAINT "meeting_outcome_check" CHECK ("outcome" IN ('scheduled', 'held', 'client_no_show', 'prospect_no_show', 'rescheduled', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX "meeting_campaign_scheduled_idx" ON "meeting" USING btree ("campaign_id", "scheduled_start_time");
--> statement-breakpoint
CREATE INDEX "meeting_lead_idx" ON "meeting" USING btree ("lead_id");
--> statement-breakpoint
ALTER TABLE "meeting" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "meeting" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER meeting_audit_required AFTER INSERT OR UPDATE OR DELETE ON "meeting"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
GRANT ALL ON TABLE "meeting" TO leads_owner;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "meeting" TO leads_fynix;
--> statement-breakpoint
-- Client: reads and updates meetings for its campaigns
GRANT SELECT (
  "id", "public_ref", "lead_id", "campaign_id", "host_member_id",
  "scheduled_start_time", "duration_minutes", "google_meet_url",
  "outcome", "notes", "held_at", "created_at", "updated_at"
) ON "meeting" TO leads_client;
--> statement-breakpoint
GRANT UPDATE (
  "outcome", "notes", "held_at", "recorded_at", "recorded_by_user_id", "updated_at"
) ON "meeting" TO leads_client;
--> statement-breakpoint
GRANT INSERT (
  "public_ref", "lead_id", "campaign_id", "host_member_id",
  "scheduled_start_time", "duration_minutes", "google_meet_url",
  "outcome", "notes"
) ON "meeting" TO leads_client;
--> statement-breakpoint
-- Agency: reads and updates meetings for its campaigns and submitted leads
GRANT SELECT (
  "id", "public_ref", "lead_id", "campaign_id", "host_member_id",
  "scheduled_start_time", "duration_minutes", "google_meet_url",
  "outcome", "notes", "held_at", "created_at", "updated_at"
) ON "meeting" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE (
  "outcome", "notes", "held_at", "recorded_at", "recorded_by_user_id", "updated_at"
) ON "meeting" TO leads_agency;
--> statement-breakpoint
GRANT INSERT (
  "public_ref", "lead_id", "campaign_id", "host_member_id",
  "scheduled_start_time", "duration_minutes", "google_meet_url",
  "outcome", "notes"
) ON "meeting" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("stage", "delivered_at", "updated_at") ON "lead" TO leads_client;
--> statement-breakpoint
GRANT UPDATE ("stage", "delivered_at", "updated_at") ON "lead" TO leads_agency;
--> statement-breakpoint
-- RLS Policies
CREATE POLICY "meeting_fynix_all" ON "meeting" AS PERMISSIVE FOR ALL TO leads_fynix
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "meeting_client_select" ON "meeting" AS PERMISSIVE FOR SELECT TO leads_client
  USING (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.id = "meeting"."campaign_id" AND c.client_org_id = public.app_current_org_id()
  ));
--> statement-breakpoint
CREATE POLICY "meeting_client_update" ON "meeting" AS PERMISSIVE FOR UPDATE TO leads_client
  USING (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.id = "meeting"."campaign_id" AND c.client_org_id = public.app_current_org_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.id = "meeting"."campaign_id" AND c.client_org_id = public.app_current_org_id()
  ));
--> statement-breakpoint
CREATE POLICY "meeting_client_insert" ON "meeting" AS PERMISSIVE FOR INSERT TO leads_client
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaign c
    WHERE c.id = "meeting"."campaign_id" AND c.client_org_id = public.app_current_org_id()
  ));
--> statement-breakpoint
CREATE POLICY "meeting_agency_select" ON "meeting" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "meeting"."campaign_id" AND (
        c.agency_org_id = public.app_current_org_id() OR
        EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id())
      )
    ) OR
    EXISTS (
      SELECT 1 FROM public.lead l
      WHERE l.id = "meeting"."lead_id" AND l.source_org_id = public.app_current_org_id()
    )
  );
--> statement-breakpoint
CREATE POLICY "meeting_agency_update" ON "meeting" AS PERMISSIVE FOR UPDATE TO leads_agency
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "meeting"."campaign_id" AND (
        c.agency_org_id = public.app_current_org_id() OR
        EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id())
      )
    ) OR
    EXISTS (
      SELECT 1 FROM public.lead l
      WHERE l.id = "meeting"."lead_id" AND l.source_org_id = public.app_current_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "meeting"."campaign_id" AND (
        c.agency_org_id = public.app_current_org_id() OR
        EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id())
      )
    ) OR
    EXISTS (
      SELECT 1 FROM public.lead l
      WHERE l.id = "meeting"."lead_id" AND l.source_org_id = public.app_current_org_id()
    )
  );
--> statement-breakpoint
CREATE POLICY "meeting_agency_insert" ON "meeting" AS PERMISSIVE FOR INSERT TO leads_agency
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "meeting"."campaign_id" AND (
        c.agency_org_id = public.app_current_org_id() OR
        EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id())
      )
    ) OR
    EXISTS (
      SELECT 1 FROM public.lead l
      WHERE l.id = "meeting"."lead_id" AND l.source_org_id = public.app_current_org_id()
    )
  );
