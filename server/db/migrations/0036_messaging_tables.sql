-- Messaging and notification tables, RLS policies, and role grants (Phase 4).
-- Multi-hop messaging: client_fynix, supplier_fynix, supplier_agency.
-- Enforces strict boundary isolation: Fynix cannot access supplier_agency conversations (spec D5).

CREATE TABLE "conversation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "public_ref" text NOT NULL,
  "campaign_id" uuid NOT NULL,
  "lead_id" uuid,
  "side" text NOT NULL,
  "client_org_id" uuid,
  "supplier_org_id" uuid,
  "agency_org_id" uuid,
  "subject" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_public_ref_unique" UNIQUE ("public_ref"),
  CONSTRAINT "conversation_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "conversation_lead_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "conversation_client_org_fk" FOREIGN KEY ("client_org_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "conversation_supplier_org_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "conversation_agency_org_fk" FOREIGN KEY ("agency_org_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "conversation_public_ref_format" CHECK ("public_ref" ~ '^MSG-[0-9A-HJKMNP-TV-Z]{4}$'),
  CONSTRAINT "conversation_side_check" CHECK ("side" IN ('client_fynix', 'supplier_fynix', 'supplier_agency'))
);
--> statement-breakpoint
CREATE INDEX "conversation_campaign_idx" ON "conversation" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX "conversation_lead_idx" ON "conversation" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX "conversation_client_org_idx" ON "conversation" USING btree ("client_org_id");
--> statement-breakpoint
CREATE INDEX "conversation_supplier_org_idx" ON "conversation" USING btree ("supplier_org_id");
--> statement-breakpoint
CREATE INDEX "conversation_agency_org_idx" ON "conversation" USING btree ("agency_org_id");
--> statement-breakpoint
CREATE TABLE "conversation_message" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "sender_user_id" uuid NOT NULL,
  "sender_org_id" uuid,
  "sender_role" text NOT NULL,
  "sender_name" text NOT NULL,
  "body" text NOT NULL,
  "forward_of_message_id" uuid,
  "scrubbed_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_message_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "conversation_message_sender_user_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "conversation_message_sender_org_fk" FOREIGN KEY ("sender_org_id") REFERENCES "public"."organisation"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "conversation_message_forward_of_fk" FOREIGN KEY ("forward_of_message_id") REFERENCES "public"."conversation_message"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "conversation_message_role_check" CHECK ("sender_role" IN ('client', 'supplier', 'agency', 'fynix'))
);
--> statement-breakpoint
CREATE INDEX "conversation_message_conv_created_idx" ON "conversation_message" USING btree ("conversation_id", "created_at");
--> statement-breakpoint
CREATE INDEX "conversation_message_sender_user_idx" ON "conversation_message" USING btree ("sender_user_id");
--> statement-breakpoint
CREATE TABLE "notification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "org_id" uuid,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "link" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "notification_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisation"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "notification_kind_check" CHECK ("kind" IN ('lead_submitted', 'lead_reviewed', 'meeting_scheduled', 'outcome_recorded', 'dispute_raised', 'message_received', 'general'))
);
--> statement-breakpoint
CREATE INDEX "notification_user_read_idx" ON "notification" USING btree ("user_id", "read_at");
--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" USING btree ("user_id", "created_at");
--> statement-breakpoint
ALTER TABLE "conversation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversation_message" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversation_message" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER conversation_audit_required AFTER INSERT OR UPDATE OR DELETE ON "conversation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER conversation_message_audit_required AFTER INSERT OR UPDATE OR DELETE ON "conversation_message"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER notification_audit_required AFTER INSERT OR UPDATE OR DELETE ON "notification"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
GRANT ALL ON TABLE "conversation", "conversation_message", "notification" TO leads_owner;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "conversation", "conversation_message", "notification" TO leads_fynix;
--> statement-breakpoint
-- Client role column grants
GRANT SELECT (
  "id", "public_ref", "campaign_id", "lead_id", "side", "client_org_id",
  "subject", "created_at", "updated_at"
) ON "conversation" TO leads_client;
--> statement-breakpoint
GRANT INSERT (
  "public_ref", "campaign_id", "lead_id", "side", "client_org_id", "subject"
) ON "conversation" TO leads_client;
--> statement-breakpoint
GRANT SELECT (
  "id", "conversation_id", "sender_user_id", "sender_role", "sender_name",
  "body", "forward_of_message_id", "scrubbed_count", "created_at"
) ON "conversation_message" TO leads_client;
--> statement-breakpoint
GRANT INSERT (
  "conversation_id", "sender_user_id", "sender_org_id", "sender_role", "sender_name", "body"
) ON "conversation_message" TO leads_client;
--> statement-breakpoint
GRANT SELECT (
  "id", "user_id", "org_id", "kind", "title", "body", "link", "read_at", "created_at"
) ON "notification" TO leads_client;
--> statement-breakpoint
GRANT UPDATE ("read_at") ON "notification" TO leads_client;
--> statement-breakpoint
GRANT INSERT (
  "user_id", "org_id", "kind", "title", "body", "link"
) ON "notification" TO leads_client;
--> statement-breakpoint
-- Agency role column grants
GRANT SELECT (
  "id", "public_ref", "campaign_id", "lead_id", "side", "supplier_org_id", "agency_org_id",
  "subject", "created_at", "updated_at"
) ON "conversation" TO leads_agency;
--> statement-breakpoint
GRANT INSERT (
  "public_ref", "campaign_id", "lead_id", "side", "supplier_org_id", "agency_org_id", "subject"
) ON "conversation" TO leads_agency;
--> statement-breakpoint
GRANT SELECT (
  "id", "conversation_id", "sender_user_id", "sender_role", "sender_name",
  "body", "forward_of_message_id", "scrubbed_count", "created_at"
) ON "conversation_message" TO leads_agency;
--> statement-breakpoint
GRANT INSERT (
  "conversation_id", "sender_user_id", "sender_org_id", "sender_role", "sender_name", "body"
) ON "conversation_message" TO leads_agency;
--> statement-breakpoint
GRANT SELECT (
  "id", "user_id", "org_id", "kind", "title", "body", "link", "read_at", "created_at"
) ON "notification" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("read_at") ON "notification" TO leads_agency;
--> statement-breakpoint
GRANT INSERT (
  "user_id", "org_id", "kind", "title", "body", "link"
) ON "notification" TO leads_agency;
--> statement-breakpoint
-- Owner policies
CREATE POLICY "conversation_owner_all" ON "conversation" AS PERMISSIVE FOR ALL TO leads_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "conversation_message_owner_all" ON "conversation_message" AS PERMISSIVE FOR ALL TO leads_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "notification_owner_all" ON "notification" AS PERMISSIVE FOR ALL TO leads_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Conversation RLS policies
CREATE POLICY "conversation_fynix_all" ON "conversation" AS PERMISSIVE FOR ALL TO leads_fynix
  USING ("side" IN ('client_fynix', 'supplier_fynix'))
  WITH CHECK ("side" IN ('client_fynix', 'supplier_fynix'));
--> statement-breakpoint
CREATE POLICY "conversation_client_select" ON "conversation" AS PERMISSIVE FOR SELECT TO leads_client
  USING ("client_org_id" = public.app_current_org_id() AND "side" = 'client_fynix');
--> statement-breakpoint
CREATE POLICY "conversation_client_insert" ON "conversation" AS PERMISSIVE FOR INSERT TO leads_client
  WITH CHECK ("client_org_id" = public.app_current_org_id() AND "side" = 'client_fynix');
--> statement-breakpoint
CREATE POLICY "conversation_agency_select" ON "conversation" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (
    ("supplier_org_id" = public.app_current_org_id() AND "side" IN ('supplier_fynix', 'supplier_agency')) OR
    ("agency_org_id" = public.app_current_org_id() AND "side" = 'supplier_agency')
  );
--> statement-breakpoint
CREATE POLICY "conversation_agency_insert" ON "conversation" AS PERMISSIVE FOR INSERT TO leads_agency
  WITH CHECK (
    ("supplier_org_id" = public.app_current_org_id() AND "side" IN ('supplier_fynix', 'supplier_agency')) OR
    ("agency_org_id" = public.app_current_org_id() AND "side" = 'supplier_agency')
  );
--> statement-breakpoint
-- Conversation Message RLS policies
CREATE POLICY "conversation_message_fynix_all" ON "conversation_message" AS PERMISSIVE FOR ALL TO leads_fynix
  USING (EXISTS (
    SELECT 1 FROM public.conversation c
    WHERE c.id = "conversation_message"."conversation_id" AND c.side IN ('client_fynix', 'supplier_fynix')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversation c
    WHERE c.id = "conversation_message"."conversation_id" AND c.side IN ('client_fynix', 'supplier_fynix')
  ));
--> statement-breakpoint
CREATE POLICY "conversation_message_client_select" ON "conversation_message" AS PERMISSIVE FOR SELECT TO leads_client
  USING (EXISTS (
    SELECT 1 FROM public.conversation c
    WHERE c.id = "conversation_message"."conversation_id"
      AND c.client_org_id = public.app_current_org_id()
      AND c.side = 'client_fynix'
  ));
--> statement-breakpoint
CREATE POLICY "conversation_message_client_insert" ON "conversation_message" AS PERMISSIVE FOR INSERT TO leads_client
  WITH CHECK (
    "sender_user_id" = public.app_current_user_id() AND
    EXISTS (
      SELECT 1 FROM public.conversation c
      WHERE c.id = "conversation_message"."conversation_id"
        AND c.client_org_id = public.app_current_org_id()
        AND c.side = 'client_fynix'
    )
  );
--> statement-breakpoint
CREATE POLICY "conversation_message_agency_select" ON "conversation_message" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (EXISTS (
    SELECT 1 FROM public.conversation c
    WHERE c.id = "conversation_message"."conversation_id" AND (
      (c.supplier_org_id = public.app_current_org_id() AND c.side IN ('supplier_fynix', 'supplier_agency')) OR
      (c.agency_org_id = public.app_current_org_id() AND c.side = 'supplier_agency')
    )
  ));
--> statement-breakpoint
CREATE POLICY "conversation_message_agency_insert" ON "conversation_message" AS PERMISSIVE FOR INSERT TO leads_agency
  WITH CHECK (
    "sender_user_id" = public.app_current_user_id() AND
    EXISTS (
      SELECT 1 FROM public.conversation c
      WHERE c.id = "conversation_message"."conversation_id" AND (
        (c.supplier_org_id = public.app_current_org_id() AND c.side IN ('supplier_fynix', 'supplier_agency')) OR
        (c.agency_org_id = public.app_current_org_id() AND c.side = 'supplier_agency')
      )
    )
  );
--> statement-breakpoint
-- Notification RLS policies
CREATE POLICY "notification_fynix_select" ON "notification" AS PERMISSIVE FOR SELECT TO leads_fynix
  USING ("user_id" = public.app_current_user_id());
--> statement-breakpoint
CREATE POLICY "notification_fynix_update" ON "notification" AS PERMISSIVE FOR UPDATE TO leads_fynix
  USING ("user_id" = public.app_current_user_id())
  WITH CHECK ("user_id" = public.app_current_user_id());
--> statement-breakpoint
CREATE POLICY "notification_fynix_insert" ON "notification" AS PERMISSIVE FOR INSERT TO leads_fynix
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "notification_client_select" ON "notification" AS PERMISSIVE FOR SELECT TO leads_client
  USING ("user_id" = public.app_current_user_id() AND ("org_id" = public.app_current_org_id() OR "org_id" IS NULL));
--> statement-breakpoint
CREATE POLICY "notification_client_update" ON "notification" AS PERMISSIVE FOR UPDATE TO leads_client
  USING ("user_id" = public.app_current_user_id() AND ("org_id" = public.app_current_org_id() OR "org_id" IS NULL))
  WITH CHECK ("user_id" = public.app_current_user_id() AND ("org_id" = public.app_current_org_id() OR "org_id" IS NULL));
--> statement-breakpoint
CREATE POLICY "notification_client_insert" ON "notification" AS PERMISSIVE FOR INSERT TO leads_client
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "notification_agency_select" ON "notification" AS PERMISSIVE FOR SELECT TO leads_agency
  USING ("user_id" = public.app_current_user_id() AND ("org_id" = public.app_current_org_id() OR "org_id" IS NULL));
--> statement-breakpoint
CREATE POLICY "notification_agency_update" ON "notification" AS PERMISSIVE FOR UPDATE TO leads_agency
  USING ("user_id" = public.app_current_user_id() AND ("org_id" = public.app_current_org_id() OR "org_id" IS NULL))
  WITH CHECK ("user_id" = public.app_current_user_id() AND ("org_id" = public.app_current_org_id() OR "org_id" IS NULL));
--> statement-breakpoint
CREATE POLICY "notification_agency_insert" ON "notification" AS PERMISSIVE FOR INSERT TO leads_agency
  WITH CHECK (true);
