ALTER TABLE "calendar_connection" DROP CONSTRAINT "calendar_connection_member_fk";
--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_member_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connection" DROP COLUMN "member_org_kind";