-- Row-level security and grants for campaign_host. See 0002 for the rules every table follows.
--
-- Fynix reads and adds hosts, and may change the job title and the active flag. A host is deactivated, never removed.
-- The foreign keys (0025) already pin each host to a member of the campaign's client. No other role holds anything; phase 1E
-- decides what the client, the supplier and its agencies read of a host.
ALTER TABLE "campaign_host" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "campaign_host" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("job_title", "active") ON "campaign_host" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "campaign_host_fynix_all" ON "campaign_host" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER campaign_host_audit_required AFTER INSERT OR UPDATE OR DELETE ON "campaign_host"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
