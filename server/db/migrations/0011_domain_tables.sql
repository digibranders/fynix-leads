CREATE TYPE "public"."terms_status" AS ENUM('current', 'superseded');--> statement-breakpoint
ALTER TYPE "public"."campaign_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TYPE "public"."email_template" ADD VALUE 'invite';--> statement-breakpoint
ALTER TYPE "public"."outbox_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"tx_id" bigint DEFAULT txid_current() NOT NULL,
	"actor_user_id" uuid DEFAULT public.app_current_user_id() NOT NULL,
	"actor_role" text DEFAULT current_user NOT NULL,
	"action" text NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_ref" text,
	"before" jsonb,
	"after" jsonb,
	CONSTRAINT "audit_log_action_format" CHECK ("audit_log"."action" ~ '^[a-z_]+\.[a-z_]+$')
);
--> statement-breakpoint
CREATE TABLE "terms_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"party" "organisation_kind" NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"network_address" text NOT NULL,
	CONSTRAINT "terms_acceptance_user_document_unique" UNIQUE("user_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "terms_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party" "organisation_kind" NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "terms_status" DEFAULT 'current' NOT NULL,
	"placeholder" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_document_party_version_unique" UNIQUE("party","version"),
	CONSTRAINT "terms_document_id_party_unique" UNIQUE("id","party"),
	CONSTRAINT "terms_document_version_positive" CHECK ("terms_document"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"org_kind" "organisation_kind" NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"alias" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invite_email_lowercase" CHECK ("invite"."email" = lower("invite"."email")),
	CONSTRAINT "invite_token_hash_format" CHECK ("invite"."token_hash" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "invite_not_fynix" CHECK ("invite"."org_kind" <> 'fynix'),
	CONSTRAINT "invite_alias_matches_kind" CHECK (("invite"."org_kind" = 'agency' AND "invite"."alias" IS NOT NULL) OR ("invite"."org_kind" <> 'agency' AND "invite"."alias" IS NULL)),
	CONSTRAINT "invite_not_used_and_revoked" CHECK (NOT ("invite"."redeemed_at" IS NOT NULL AND "invite"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "agency_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"member_org_kind" "organisation_kind" GENERATED ALWAYS AS ('agency'::organisation_kind) STORED NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_alias_length" CHECK (char_length(btrim("agency_alias"."alias")) BETWEEN 2 AND 60 AND "agency_alias"."alias" = btrim("agency_alias"."alias"))
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "geography" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "industries" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "company_size" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "icp" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "job_titles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "seniority" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "technologies" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "bant_budget" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "bant_authority" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "bant_need" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "bant_timeline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "instructions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "params" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "invite_id" uuid;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_id_org_kind_unique" UNIQUE("id","org_kind");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptance" ADD CONSTRAINT "terms_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptance" ADD CONSTRAINT "terms_acceptance_document_fk" FOREIGN KEY ("document_id","party") REFERENCES "public"."terms_document"("id","party") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_org_fk" FOREIGN KEY ("org_id","org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_alias" ADD CONSTRAINT "agency_alias_member_fk" FOREIGN KEY ("member_id","member_org_kind") REFERENCES "public"."member"("id","org_kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_tx_idx" ON "audit_log" USING btree ("tx_id");--> statement-breakpoint
CREATE INDEX "audit_log_subject_idx" ON "audit_log" USING btree ("subject_table","subject_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "terms_acceptance_user_idx" ON "terms_acceptance" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_document_one_current" ON "terms_document" USING btree ("party") WHERE "terms_document"."status" = 'current';--> statement-breakpoint
CREATE INDEX "invite_org_idx" ON "invite" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_one_live" ON "invite" USING btree ("email") WHERE "invite"."redeemed_at" IS NULL AND "invite"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agency_alias_member_unique" ON "agency_alias" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_alias_alias_unique" ON "agency_alias" USING btree (lower("alias"));--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_invite_id_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invite"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_outbox_invite_idx" ON "email_outbox" USING btree ("invite_id");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_link_only_while_pending" CHECK ("email_outbox"."link" IS NULL OR "email_outbox"."status" = 'pending');--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_attempts_not_negative" CHECK ("email_outbox"."attempts" >= 0);
