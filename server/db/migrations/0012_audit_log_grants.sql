-- audit_log: row-level security, grants, the append-only rule and the "no Fynix change without an audit row" rule.
-- See 0002 for the rules every table follows.
--
-- Fynix reads and appends. Nobody else holds any privilege. The row's actor must be the user the request was scoped to
-- (app.user_id) and its role the connection's own role, so an insert cannot be written in another person's name.
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_log" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "audit_log_fynix_read" ON "audit_log" AS PERMISSIVE FOR SELECT TO leads_fynix USING (true);
--> statement-breakpoint
CREATE POLICY "audit_log_fynix_append" ON "audit_log" AS PERMISSIVE FOR INSERT TO leads_fynix
  WITH CHECK ("actor_user_id" = public.app_current_user_id() AND "actor_role" = current_user::text);
--> statement-breakpoint
-- Append only, for every role including the owner: no privilege is granted and this trigger raises on any UPDATE or
-- DELETE that reaches a row. TRUNCATE is not blocked, because the test harness empties every table with it
-- (server/db/testing/index.ts, resetDatabase); no runtime role holds TRUNCATE. A superuser can still disable the trigger,
-- which is why the log is also shipped off the machine in phase 6.
CREATE FUNCTION public.audit_log_refuse_change() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append only: % is not allowed', TG_OP;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.audit_log_refuse_change() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_refuse_change();
--> statement-breakpoint
-- A transaction that changes a domain table as leads_fynix must also have appended an audit_log row, or it cannot commit.
-- The check is deferred to commit, so the audit row may be written before or after the change. It only looks at
-- leads_fynix: seeds, `pnpm admin:create` and the other roles' own writes are not Fynix actions. It counts rows of the
-- same transaction, not of the same subject: that every action writes the right row is the service tests' job, and that
-- none can write nothing is this trigger's. Each table adds its own trigger in its grants migration, and the structural
-- test fails for a table that Fynix can write and that has none.
CREATE FUNCTION public.audit_required() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  -- Two IFs, not one condition with AND: Postgres does not promise to skip the subquery when the first test is false,
  -- and every role but leads_fynix is refused SELECT on audit_log, so reading it for them would fail their commit.
  IF current_user = 'leads_fynix' THEN
    IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE tx_id = txid_current()) THEN
      RAISE EXCEPTION 'A change to % by Fynix has no audit_log row in its transaction', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.audit_required() FROM PUBLIC;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER organisation_audit_required AFTER INSERT OR UPDATE OR DELETE ON "organisation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER campaign_audit_required AFTER INSERT OR UPDATE OR DELETE ON "campaign"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
