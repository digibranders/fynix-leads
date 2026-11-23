-- Verifying an alias proves the person controls the alias mailbox, so the stored hash of the 6-digit code must stay unreadable to
-- them: a code is only a million values, and a readable hash would let anyone verify any alias without the mailbox. The check
-- therefore runs inside the database. A SECURITY DEFINER function compares the hash and stamps the alias; the role that asks
-- is not allowed to read the hash or to set `verified_at` itself (0031 had granted it UPDATE on `verified_at`, which would
-- have made the check optional).
REVOKE UPDATE ("verified_at") ON "alias_identity" FROM leads_agency;
--> statement-breakpoint
-- Returns 'ok', 'already' (verified earlier), 'wrong' or 'missing' (no such alias among the caller's organisation's own).
CREATE FUNCTION public.app_verify_alias_code(p_public_ref text, p_code_hash text) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_row public.alias_identity%ROWTYPE;
BEGIN
  SELECT a.* INTO v_row
  FROM public.alias_identity a
  JOIN public.member m ON m.id = a.member_id
  WHERE a.public_ref = p_public_ref AND m.org_id = public.app_current_org_id();
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;
  IF v_row.verified_at IS NOT NULL THEN
    RETURN 'already';
  END IF;
  IF v_row.verification_code_hash IS DISTINCT FROM p_code_hash THEN
    RETURN 'wrong';
  END IF;
  UPDATE public.alias_identity
     SET verified_at = now(), verification_code_hash = NULL, updated_at = now()
   WHERE id = v_row.id;
  RETURN 'ok';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_verify_alias_code(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_verify_alias_code(text, text) TO leads_agency;
