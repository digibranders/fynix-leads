-- Leads and lead history schema, RLS, triggers and role grants (Phase 2).
-- Enforces strict role isolation: clients never see supplier/agency source identity; agencies never see client emails/phones.

CREATE TABLE "lead" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "public_ref" text NOT NULL,
  "campaign_id" uuid NOT NULL,
  "source_org_id" uuid NOT NULL,
  "submitted_by_user_id" text NOT NULL,
  "alias_identity_id" uuid NOT NULL,
  "host_member_id" uuid NOT NULL,
  "prospect_name" text NOT NULL,
  "prospect_title" text NOT NULL,
  "prospect_company" text NOT NULL,
  "prospect_domain" text NOT NULL,
  "prospect_linkedin_url" text NOT NULL,
  "prospect_email" text NOT NULL,
  "prospect_phone" text,
  "prospect_notes" text,
  "bant_budget" text NOT NULL,
  "bant_authority" text NOT NULL,
  "bant_need" text NOT NULL,
  "bant_timeline" text NOT NULL,
  "stage" text DEFAULT 'awaiting_client' NOT NULL,
  "decline_reason" text,
  "dispute_reason" text,
  "proposed_times" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scheduled_meeting_time" timestamp with time zone,
  "over_share" boolean DEFAULT false NOT NULL,
  "duplicate_override" boolean DEFAULT false NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "scheduled_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "disputed_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lead_public_ref_unique" UNIQUE ("public_ref"),
  CONSTRAINT "lead_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lead_source_org_fk" FOREIGN KEY ("source_org_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lead_submitted_by_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lead_alias_identity_fk" FOREIGN KEY ("alias_identity_id") REFERENCES "public"."alias_identity"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lead_host_member_fk" FOREIGN KEY ("host_member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lead_public_ref_format" CHECK ("public_ref" ~ '^LD-[0-9A-HJKMNP-TV-Z]{4}$'),
  CONSTRAINT "lead_stage_check" CHECK ("stage" IN ('draft', 'awaiting_client', 'scheduled', 'outcome_due', 'reschedule_needed', 'held', 'client_no_show', 'prospect_no_show', 'delivered', 'disputed', 'declined', 'withdrawn', 'lost', 'rejected')),
  CONSTRAINT "lead_prospect_name_length" CHECK (char_length(btrim("prospect_name")) BETWEEN 1 AND 120 AND "prospect_name" = btrim("prospect_name")),
  CONSTRAINT "lead_prospect_title_length" CHECK (char_length(btrim("prospect_title")) BETWEEN 1 AND 120 AND "prospect_title" = btrim("prospect_title")),
  CONSTRAINT "lead_prospect_company_length" CHECK (char_length(btrim("prospect_company")) BETWEEN 1 AND 120 AND "prospect_company" = btrim("prospect_company")),
  CONSTRAINT "lead_prospect_domain_length" CHECK (char_length(btrim("prospect_domain")) BETWEEN 1 AND 255 AND "prospect_domain" = lower(btrim("prospect_domain"))),
  CONSTRAINT "lead_prospect_email_check" CHECK ("prospect_email" = lower(btrim("prospect_email")) AND "prospect_email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
--> statement-breakpoint
CREATE INDEX "lead_campaign_stage_idx" ON "lead" USING btree ("campaign_id", "stage");
--> statement-breakpoint
CREATE INDEX "lead_prospect_email_idx" ON "lead" USING btree ("campaign_id", "prospect_email");
--> statement-breakpoint
CREATE TABLE "lead_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "actor_user_id" text NOT NULL,
  "actor_role" text NOT NULL,
  "action" text NOT NULL,
  "from_stage" text,
  "to_stage" text,
  "note" text,
  "snapshot" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lead_history_lead_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lead_history_user_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lead_history_role_check" CHECK ("actor_role" IN ('client', 'agency', 'fynix'))
);
--> statement-breakpoint
CREATE INDEX "lead_history_lead_created_idx" ON "lead_history" USING btree ("lead_id", "created_at");
--> statement-breakpoint
ALTER TABLE "lead" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lead" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lead_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lead_history" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER lead_audit_required AFTER INSERT OR UPDATE OR DELETE ON "lead"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER lead_history_audit_required AFTER INSERT OR UPDATE OR DELETE ON "lead_history"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
GRANT ALL ON TABLE "lead" TO leads_owner;
--> statement-breakpoint
GRANT ALL ON TABLE "lead_history" TO leads_owner;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "lead" TO leads_fynix;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "lead_history" TO leads_fynix;
--> statement-breakpoint
-- Agency: reads and submits leads, views history
GRANT SELECT (
  "id", "public_ref", "campaign_id", "source_org_id", "alias_identity_id", "host_member_id",
  "prospect_name", "prospect_title", "prospect_company", "prospect_domain", "prospect_linkedin_url",
  "prospect_email", "prospect_phone", "prospect_notes", "bant_budget", "bant_authority", "bant_need",
  "bant_timeline", "stage", "decline_reason", "dispute_reason", "proposed_times", "scheduled_meeting_time",
  "over_share", "duplicate_override", "submitted_at", "scheduled_at", "delivered_at", "disputed_at",
  "closed_at", "created_at", "updated_at"
) ON "lead" TO leads_agency;
--> statement-breakpoint
GRANT INSERT (
  "public_ref", "campaign_id", "source_org_id", "submitted_by_user_id", "alias_identity_id", "host_member_id",
  "prospect_name", "prospect_title", "prospect_company", "prospect_domain", "prospect_linkedin_url",
  "prospect_email", "prospect_phone", "prospect_notes", "bant_budget", "bant_authority", "bant_need",
  "bant_timeline", "proposed_times", "stage", "over_share", "duplicate_override"
) ON "lead" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("stage", "proposed_times", "updated_at") ON "lead" TO leads_agency;
--> statement-breakpoint
GRANT SELECT ("id", "lead_id", "actor_user_id", "actor_role", "action", "from_stage", "to_stage", "note", "snapshot", "created_at") ON "lead_history" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ("lead_id", "actor_user_id", "actor_role", "action", "from_stage", "to_stage", "note", "snapshot") ON "lead_history" TO leads_agency;
--> statement-breakpoint
-- Client: reads leads for its campaigns (without sourceOrgId or aliasIdentityId), accepts/declines/disputes
GRANT SELECT (
  "id", "public_ref", "campaign_id", "host_member_id",
  "prospect_name", "prospect_title", "prospect_company", "prospect_domain", "prospect_linkedin_url",
  "prospect_email", "prospect_phone", "prospect_notes", "bant_budget", "bant_authority", "bant_need",
  "bant_timeline", "stage", "decline_reason", "dispute_reason", "proposed_times", "scheduled_meeting_time",
  "submitted_at", "scheduled_at", "delivered_at", "disputed_at", "closed_at", "created_at", "updated_at"
) ON "lead" TO leads_client;
--> statement-breakpoint
GRANT UPDATE ("stage", "decline_reason", "dispute_reason", "scheduled_meeting_time", "scheduled_at", "disputed_at", "proposed_times", "updated_at") ON "lead" TO leads_client;
--> statement-breakpoint
GRANT SELECT ("id", "lead_id", "actor_role", "action", "from_stage", "to_stage", "note", "created_at") ON "lead_history" TO leads_client;
--> statement-breakpoint
GRANT INSERT ("lead_id", "actor_user_id", "actor_role", "action", "from_stage", "to_stage", "note", "snapshot") ON "lead_history" TO leads_client;
--> statement-breakpoint
-- RLS Policies
CREATE POLICY "lead_fynix_all" ON "lead" AS PERMISSIVE FOR ALL TO leads_fynix
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "lead_history_fynix_all" ON "lead_history" AS PERMISSIVE FOR ALL TO leads_fynix
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "lead_client_select" ON "lead" AS PERMISSIVE FOR SELECT TO leads_client
  USING (EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.client_org_id = public.app_current_org_id()));
--> statement-breakpoint
CREATE POLICY "lead_client_update" ON "lead" AS PERMISSIVE FOR UPDATE TO leads_client
  USING (EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.client_org_id = public.app_current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.client_org_id = public.app_current_org_id()));
--> statement-breakpoint
CREATE POLICY "lead_agency_select" ON "lead" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (
    "source_org_id" = public.app_current_org_id() OR
    EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.agency_org_id = public.app_current_org_id())
  );
--> statement-breakpoint
CREATE POLICY "lead_agency_insert" ON "lead" AS PERMISSIVE FOR INSERT TO leads_agency
  WITH CHECK (
    "source_org_id" = public.app_current_org_id() AND
    "submitted_by_user_id" = public.app_current_user_id() AND
    EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "lead"."campaign_id" AND (
        c.agency_org_id = public.app_current_org_id() OR
        EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id())
      )
    )
  );
--> statement-breakpoint
CREATE POLICY "lead_agency_update" ON "lead" AS PERMISSIVE FOR UPDATE TO leads_agency
  USING (
    "source_org_id" = public.app_current_org_id() OR
    EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.agency_org_id = public.app_current_org_id())
  )
  WITH CHECK (
    "source_org_id" = public.app_current_org_id() OR
    EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = "lead"."campaign_id" AND c.agency_org_id = public.app_current_org_id())
  );
--> statement-breakpoint
CREATE POLICY "lead_history_client_select" ON "lead_history" AS PERMISSIVE FOR SELECT TO leads_client
  USING (EXISTS (
    SELECT 1 FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
    WHERE l.id = "lead_history"."lead_id" AND c.client_org_id = public.app_current_org_id()
  ));
--> statement-breakpoint
CREATE POLICY "lead_history_client_insert" ON "lead_history" AS PERMISSIVE FOR INSERT TO leads_client
  WITH CHECK (
    "actor_user_id" = public.app_current_user_id() AND
    "actor_role" = 'client' AND
    EXISTS (
      SELECT 1 FROM public.lead l
      JOIN public.campaign c ON c.id = l.campaign_id
      WHERE l.id = "lead_history"."lead_id" AND c.client_org_id = public.app_current_org_id()
    )
  );
--> statement-breakpoint
CREATE POLICY "lead_history_agency_select" ON "lead_history" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (EXISTS (
    SELECT 1 FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
    WHERE l.id = "lead_history"."lead_id" AND (
      l.source_org_id = public.app_current_org_id() OR
      c.agency_org_id = public.app_current_org_id()
    )
  ));
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
        c.agency_org_id = public.app_current_org_id()
      )
    )
  );
