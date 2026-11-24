-- A Fynix person opening their own notice. The audit rule (migration 0012) refuses, at commit, any Fynix change to a domain table that has no audit_log row in its
-- transaction, so marking a notice read as Fynix could never commit (the check runs at commit, so a SECURITY DEFINER function would not get round it). Writing and
-- deleting a notice stay audited. An UPDATE of "notification" that changes nothing but `read_at` is a person opening their own notice, which is not an action worth
-- a row in the audit log, so the rule skips that one case and nothing else. Same signature and same body as 0012, plus the one branch.
CREATE OR REPLACE FUNCTION public.audit_required() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'notification' AND (to_jsonb(OLD) - 'read_at') = (to_jsonb(NEW) - 'read_at') THEN
    RETURN NULL;
  END IF;
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
