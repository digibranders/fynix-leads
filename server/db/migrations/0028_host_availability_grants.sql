-- Row-level security, grants and the overlap trigger for host_hours and host_block. See 0002 for the rules every table follows.
--
-- Fynix reads, adds and removes rows of both and changes none: a host's weekly set is replaced as a whole (delete, then insert),
-- and a block is added or removed. Both are settings, so Fynix holds DELETE here, like on campaign_share (0024); the audit
-- row keeps what was removed. No other role holds anything; phase 1E lets a host read and edit their own, and lets the
-- supplier and its agencies read the free blocks only (spec 5.1).
ALTER TABLE "host_hours" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "host_block" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "host_hours" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "host_hours_fynix_all" ON "host_hours" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "host_block" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "host_block_fynix_all" ON "host_block" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER host_hours_audit_required AFTER INSERT OR UPDATE OR DELETE ON "host_hours"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER host_block_audit_required AFTER INSERT OR UPDATE OR DELETE ON "host_block"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
-- Two windows overlap when each starts before the other ends. They are compared for the same member, weekday and time zone
-- only (two zones are not on one clock); one that ends where the next starts does not overlap. An exclusion constraint would
-- say the same but needs the btree_gist extension, so a trigger does. It cannot see another transaction's uncommitted row,
-- so the service replaces a host's set under a lock on the member row (server/domain/availability.ts).
CREATE FUNCTION public.host_hours_check_overlap() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.host_hours h
    WHERE h.member_id = NEW.member_id AND h.weekday = NEW.weekday AND h.time_zone = NEW.time_zone AND h.id <> NEW.id
      AND h.start_minute < NEW.end_minute AND NEW.start_minute < h.end_minute
  ) THEN
    RAISE EXCEPTION 'host_hours_overlap: working hours on one day must not overlap' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.host_hours_check_overlap() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER host_hours_check_overlap BEFORE INSERT OR UPDATE ON "host_hours"
  FOR EACH ROW EXECUTE FUNCTION public.host_hours_check_overlap();
