-- Tenant inserts need INSERT on every column, not a chosen few.
-- The ORM lists every column of a table in an INSERT, writing DEFAULT for the ones it has no value for (the id, the
-- timestamps, the other organisation ids). Postgres checks the privilege on every listed column, so a grant of only the
-- columns the code sets fails with "permission denied" on the first insert. The roles below held a column-level INSERT
-- grant from 0032 to 0036; they now hold INSERT on the whole table. Nothing else changes: row-level security still decides
-- which rows each role may write, SELECT and UPDATE grants stay column-level, and no role gains a read it did not have.

GRANT INSERT ON "agreement_acceptance" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "agreement_acceptance" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "alias_identity" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "campaign_host" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "campaign_share" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "conversation" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "conversation" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "conversation_message" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "conversation_message" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "exclusion_entry" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "host_block" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "host_hours" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "invite" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "lead" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "lead_history" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "lead_history" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "meeting" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "meeting" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "notification" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ON "notification" TO leads_client;
--> statement-breakpoint
GRANT INSERT ON "organisation" TO leads_agency;
