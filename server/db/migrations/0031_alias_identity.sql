-- Alias identities table, RLS policies, triggers, and grants.
CREATE TABLE "alias_identity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "public_ref" text NOT NULL,
  "member_id" uuid NOT NULL,
  "member_org_kind" "organisation_kind" GENERATED ALWAYS AS ('agency'::organisation_kind) STORED NOT NULL,
  "client_brand_name" text NOT NULL,
  "display_name" text NOT NULL,
  "job_title" text NOT NULL,
  "alias_email" text NOT NULL,
  "verification_code_hash" text,
  "verification_sent_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "alias_identity_public_ref_unique" UNIQUE("public_ref"),
  CONSTRAINT "alias_identity_member_fk" FOREIGN KEY ("member_id", "member_org_kind") REFERENCES "public"."member"("id", "org_kind") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "alias_identity_public_ref_format" CHECK ("public_ref" ~ '^ALI-[0-9A-HJKMNP-TV-Z]{4}$'),
  CONSTRAINT "alias_identity_status_check" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "alias_identity_brand_length" CHECK (char_length(btrim("client_brand_name")) BETWEEN 1 AND 100 AND "client_brand_name" = btrim("client_brand_name")),
  CONSTRAINT "alias_identity_name_length" CHECK (char_length(btrim("display_name")) BETWEEN 1 AND 100 AND "display_name" = btrim("display_name")),
  CONSTRAINT "alias_identity_title_length" CHECK (char_length(btrim("job_title")) BETWEEN 1 AND 100 AND "job_title" = btrim("job_title")),
  CONSTRAINT "alias_identity_email_check" CHECK ("alias_email" = lower(btrim("alias_email")) AND "alias_email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "alias_identity_member_brand_email_unique" ON "alias_identity" USING btree ("member_id", lower("client_brand_name"), "alias_email");
--> statement-breakpoint
ALTER TABLE "alias_identity" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "alias_identity" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status", "display_name", "job_title") ON "alias_identity" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "alias_identity_fynix_all" ON "alias_identity" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER alias_identity_audit_required AFTER INSERT OR UPDATE OR DELETE ON "alias_identity"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE TRIGGER alias_identity_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "alias_identity"
  FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
GRANT SELECT ("id", "public_ref", "member_id", "client_brand_name", "display_name", "job_title", "alias_email", "verification_sent_at", "verified_at", "status", "created_at") ON "alias_identity" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ("public_ref", "member_id", "client_brand_name", "display_name", "job_title", "alias_email", "verification_code_hash", "verification_sent_at") ON "alias_identity" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("display_name", "job_title", "status", "verification_code_hash", "verification_sent_at", "verified_at") ON "alias_identity" TO leads_agency;
--> statement-breakpoint
CREATE POLICY "alias_identity_agency_own" ON "alias_identity" AS PERMISSIVE FOR ALL TO leads_agency
  USING (
    EXISTS (
      SELECT 1 FROM public.member m
      WHERE m.id = "alias_identity"."member_id"
        AND m.org_id = public.app_current_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.member m
      WHERE m.id = "alias_identity"."member_id"
        AND m.org_id = public.app_current_org_id()
    )
  );
--> statement-breakpoint
GRANT SELECT ("id", "public_ref", "member_id", "client_brand_name", "display_name", "job_title", "alias_email", "verified_at", "status") ON "alias_identity" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "alias_identity_auth_all" ON "alias_identity" AS PERMISSIVE FOR SELECT TO leads_auth USING (true);
