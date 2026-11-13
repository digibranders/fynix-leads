CREATE TYPE "public"."agreement_party" AS ENUM('client', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."agreement_status" AS ENUM('current', 'superseded');--> statement-breakpoint
CREATE TABLE "agreement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"party" "agreement_party" NOT NULL,
	"version" integer NOT NULL,
	"monthly_target" integer NOT NULL,
	"total_target" integer NOT NULL,
	"dispute_window_hours" integer DEFAULT 48 NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" "agreement_status" DEFAULT 'current' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_campaign_party_version_unique" UNIQUE("campaign_id","party","version"),
	CONSTRAINT "agreement_version_positive" CHECK ("agreement"."version" >= 1),
	CONSTRAINT "agreement_targets_not_negative" CHECK ("agreement"."monthly_target" >= 0 AND "agreement"."total_target" >= 0),
	CONSTRAINT "agreement_dispute_window_range" CHECK ("agreement"."dispute_window_hours" BETWEEN 1 AND 720)
);
--> statement-breakpoint
CREATE TABLE "agreement_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"network_address" text NOT NULL,
	CONSTRAINT "agreement_acceptance_agreement_user_unique" UNIQUE("agreement_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "agreement" ADD CONSTRAINT "agreement_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement" ADD CONSTRAINT "agreement_created_by_member_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_acceptance" ADD CONSTRAINT "agreement_acceptance_agreement_id_agreement_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_acceptance" ADD CONSTRAINT "agreement_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_one_current" ON "agreement" USING btree ("campaign_id","party") WHERE "agreement"."status" = 'current';--> statement-breakpoint
CREATE INDEX "agreement_campaign_idx" ON "agreement" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "agreement_acceptance_user_idx" ON "agreement_acceptance" USING btree ("user_id");