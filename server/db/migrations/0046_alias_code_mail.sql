-- Queues the verification-code email for an alias. The code must reach the alias mailbox and nobody else, so the application
-- never hands it back to the person who created the alias. A tenant role cannot write the outbox, so this function does it for
-- one fixed kind of message: the recipient is the alias's own address and the wording is fixed here, so it cannot be used to
-- send anything else to anyone. It only acts on an alias that belongs to the caller's organisation.
CREATE FUNCTION public.app_queue_alias_code_mail(p_public_ref text, p_code text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_alias public.alias_identity%ROWTYPE;
BEGIN
  IF p_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'An alias code is six digits';
  END IF;
  SELECT a.* INTO v_alias
  FROM public.alias_identity a
  JOIN public.member m ON m.id = a.member_id
  WHERE a.public_ref = p_public_ref AND m.org_id = public.app_current_org_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no such alias identity';
  END IF;
  INSERT INTO public.email_outbox (recipient, template, params, subject, body)
  VALUES (
    v_alias.alias_email,
    'alias_code',
    jsonb_build_object('displayName', v_alias.display_name, 'code', p_code),
    'Your Fynix Leads verification code',
    'Your verification code for ' || v_alias.display_name || ' is ' || p_code || E'.\nEnter it on the aliases page to start using this identity.'
  );
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_queue_alias_code_mail(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_queue_alias_code_mail(text, text) TO leads_agency;
