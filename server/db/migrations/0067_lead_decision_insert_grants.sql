-- Drizzle names every column in an INSERT and writes DEFAULT for the ones it has no value for, and Postgres checks the INSERT privilege on each
-- column named, DEFAULT or not (the reason migration 0048 grants every column of `lead` and `meeting`). The columns of 0065 need the same, or no
-- agency can submit a lead and no client can book a meeting. The application never sets a decision column on insert, so nothing changes for it.
GRANT INSERT ("outcome_recorded_at", "decision_note", "decision_at", "decision_by_user_id", "decision_source") ON "lead" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ("recorded_by_role") ON "meeting" TO leads_agency, leads_client;
