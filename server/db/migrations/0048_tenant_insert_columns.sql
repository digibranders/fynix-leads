-- Replaces the table-level INSERT of 0038 with column-level grants on every insertable column.
-- The project's rule is that a tenant role holds column grants and never a table-level privilege, so a new column added later
-- is not writable or readable by default. The ORM lists every column in an INSERT, so each pair below needs INSERT on all of
-- the table's columns that are not generated; that is what is granted, column by column. Row-level security is unchanged.
REVOKE INSERT ON "agreement_acceptance" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "agreement_id", "user_id", "accepted_at", "network_address") ON "agreement_acceptance" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "agreement_acceptance" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "agreement_id", "user_id", "accepted_at", "network_address") ON "agreement_acceptance" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "alias_identity" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "public_ref", "member_id", "client_brand_name", "display_name", "job_title", "alias_email", "verification_code_hash", "verification_sent_at", "verified_at", "status", "created_at", "updated_at") ON "alias_identity" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "campaign_host" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "campaign_id", "client_org_id", "member_id", "job_title", "active", "created_at") ON "campaign_host" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "campaign_share" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "campaign_id", "agency_org_id", "monthly_share", "created_at", "updated_at") ON "campaign_share" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "conversation" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "public_ref", "campaign_id", "lead_id", "side", "client_org_id", "supplier_org_id", "agency_org_id", "subject", "created_at", "updated_at") ON "conversation" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "conversation" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "public_ref", "campaign_id", "lead_id", "side", "client_org_id", "supplier_org_id", "agency_org_id", "subject", "created_at", "updated_at") ON "conversation" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "conversation_message" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "conversation_id", "sender_user_id", "sender_org_id", "sender_role", "sender_name", "body", "forward_of_message_id", "scrubbed_count", "created_at") ON "conversation_message" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "conversation_message" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "conversation_id", "sender_user_id", "sender_org_id", "sender_role", "sender_name", "body", "forward_of_message_id", "scrubbed_count", "created_at") ON "conversation_message" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "exclusion_entry" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "client_org_id", "kind", "value", "reason", "created_at") ON "exclusion_entry" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "host_block" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "member_id", "starts_at", "ends_at", "note", "created_at") ON "host_block" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "host_hours" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "member_id", "time_zone", "weekday", "start_minute", "end_minute", "created_at") ON "host_hours" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "invite" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "org_id", "org_kind", "email", "name", "role", "alias", "token_hash", "expires_at", "redeemed_at", "revoked_at", "created_by", "created_at") ON "invite" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "lead" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "public_ref", "campaign_id", "source_org_id", "submitted_by_user_id", "alias_identity_id", "host_member_id", "prospect_name", "prospect_title", "prospect_company", "prospect_domain", "prospect_linkedin_url", "prospect_email", "prospect_phone", "prospect_notes", "bant_budget", "bant_authority", "bant_need", "bant_timeline", "stage", "decline_reason", "dispute_reason", "proposed_times", "scheduled_meeting_time", "over_share", "duplicate_override", "submitted_at", "scheduled_at", "delivered_at", "disputed_at", "closed_at", "created_at", "updated_at") ON "lead" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "lead_history" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "lead_id", "actor_user_id", "actor_role", "action", "from_stage", "to_stage", "note", "snapshot", "created_at") ON "lead_history" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "lead_history" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "lead_id", "actor_user_id", "actor_role", "action", "from_stage", "to_stage", "note", "snapshot", "created_at") ON "lead_history" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "meeting" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "public_ref", "lead_id", "campaign_id", "host_member_id", "scheduled_start_time", "duration_minutes", "google_meet_url", "outcome", "notes", "held_at", "recorded_at", "recorded_by_user_id", "created_at", "updated_at") ON "meeting" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "meeting" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "public_ref", "lead_id", "campaign_id", "host_member_id", "scheduled_start_time", "duration_minutes", "google_meet_url", "outcome", "notes", "held_at", "recorded_at", "recorded_by_user_id", "created_at", "updated_at") ON "meeting" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "notification" FROM leads_agency;
--> statement-breakpoint
GRANT INSERT ("id", "user_id", "org_id", "kind", "title", "body", "link", "read_at", "created_at") ON "notification" TO leads_agency;
--> statement-breakpoint
REVOKE INSERT ON "notification" FROM leads_client;
--> statement-breakpoint
GRANT INSERT ("id", "user_id", "org_id", "kind", "title", "body", "link", "read_at", "created_at") ON "notification" TO leads_client;
--> statement-breakpoint
REVOKE INSERT ON "organisation" FROM leads_agency;
GRANT INSERT ("id", "public_ref", "kind", "name", "brand_name", "status", "created_at", "parent_org_id") ON "organisation" TO leads_agency;
