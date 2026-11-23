-- The messaging code reads all three organisation ids of a conversation it may see. A thread has one client or none, one
-- supplier or none and one agency or none, so on the rows a role may see (RLS, unchanged) the ids it was not granted before
-- are null or its own organisation.
GRANT SELECT ("supplier_org_id", "agency_org_id") ON "conversation" TO leads_client;
--> statement-breakpoint
GRANT SELECT ("client_org_id") ON "conversation" TO leads_agency;
