-- `app_email_enqueue` (0075, last replaced in 0078) carried its own list of the launch templates, a second copy of the `email_template` enum that every new
-- template had to be added to. It now asks the enum: any value of it is a launch template except the three account emails, which are queued by the application
-- with their own links and never through this function. The definition is read back from the database and only the list is replaced (the pattern of 0085), so the
-- rest of the body, its settings and its grants stay exactly as they are.
DO $$
DECLARE
  v_old text := pg_get_functiondef('public.app_email_enqueue(uuid, text[], text, jsonb, text, text, text, uuid)'::regprocedure);
  v_new text;
BEGIN
  IF regexp_count(v_old, 'p_template NOT IN \([^)]*\)') <> 1 THEN
    RAISE EXCEPTION 'expected app_email_enqueue to hold one list of templates';
  END IF;
  v_new := regexp_replace(
    v_old,
    'p_template NOT IN \([^)]*\)',
    $new$(p_template IN ('password_reset', 'invite', 'alias_code') OR NOT (p_template = ANY (enum_range(NULL::public.email_template)::text[])))$new$);
  EXECUTE v_new;
END
$$;
