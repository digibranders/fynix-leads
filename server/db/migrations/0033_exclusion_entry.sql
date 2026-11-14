-- Exclusion entry schema, RLS, triggers and role grants (Phase 2).
-- Enables clients and Fynix to manage exclusion rules (domain, email, company).

CREATE TABLE "exclusion_entry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_org_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "value" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "exclusion_entry_client_fk" FOREIGN KEY ("client_org_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "exclusion_entry_kind_check" CHECK ("kind" IN ('domain', 'email', 'company')),
  CONSTRAINT "exclusion_entry_value_length" CHECK (char_length(btrim("value")) BETWEEN 1 AND 255 AND "value" = btrim("value"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "exclusion_entry_client_kind_value_unique" ON "exclusion_entry" USING btree ("client_org_id", "kind", lower("value"));
--> statement-breakpoint
ALTER TABLE "exclusion_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "exclusion_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER exclusion_entry_audit_required AFTER INSERT OR UPDATE OR DELETE ON "exclusion_entry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE TRIGGER exclusion_entry_fynix_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "exclusion_entry"
  FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
GRANT ALL ON TABLE "exclusion_entry" TO leads_owner;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "exclusion_entry" TO leads_fynix;
--> statement-breakpoint
GRANT SELECT ("id", "client_org_id", "kind", "value", "reason", "created_at") ON "exclusion_entry" TO leads_client;
--> statement-breakpoint
GRANT INSERT ("client_org_id", "kind", "value", "reason") ON "exclusion_entry" TO leads_client;
--> statement-breakpoint
GRANT DELETE ON "exclusion_entry" TO leads_client;
--> statement-breakpoint
CREATE POLICY "exclusion_entry_fynix_all" ON "exclusion_entry" AS PERMISSIVE FOR ALL TO leads_fynix
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "exclusion_entry_client_own" ON "exclusion_entry" AS PERMISSIVE FOR ALL TO leads_client
  USING ("client_org_id" = public.app_current_org_id())
  WITH CHECK (
    "client_org_id" = public.app_current_org_id() AND
    EXISTS (
      SELECT 1 FROM public.member m
      WHERE m.user_id = public.app_current_user_id() AND m.org_id = public.app_current_org_id() AND m.role = 'manager' AND m.status = 'active'
    )
  );
