CREATE TABLE "meeting_attendee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"member_org_kind" "organisation_kind" GENERATED ALWAYS AS ('client'::organisation_kind) STORED NOT NULL,
	"reply" text DEFAULT 'invited' NOT NULL,
	"replied_at" timestamp with time zone,
	"reply_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_attendee_meeting_member_unique" UNIQUE("meeting_id","member_id"),
	CONSTRAINT "meeting_attendee_token_unique" UNIQUE("reply_token_hash"),
	CONSTRAINT "meeting_attendee_reply_check" CHECK ("meeting_attendee"."reply" IN ('invited', 'accepted', 'declined', 'released')),
	CONSTRAINT "meeting_attendee_replied_check" CHECK (("meeting_attendee"."reply" = 'invited' AND "meeting_attendee"."replied_at" IS NULL) OR ("meeting_attendee"."reply" <> 'invited' AND "meeting_attendee"."replied_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "reply_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting_attendee" ADD CONSTRAINT "meeting_attendee_meeting_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendee" ADD CONSTRAINT "meeting_attendee_member_fk" FOREIGN KEY ("member_id","member_org_kind") REFERENCES "public"."member"("id","org_kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_attendee_member_idx" ON "meeting_attendee" USING btree ("member_id","meeting_id");