-- A lead no longer needs an alias (0116). The prospect's letter is then signed in the client's own name: the sender name is the client's name, the signer is the
-- client's name with the title "Meetings team", and there is no alias mailbox to reply to. A lead that still has an alias is written exactly as before. Both
-- functions are read back from the database and the alias lines changed, as in 0085, 0088, 0090 and 0095.

-- 1. app_email_enqueue: the alias is optional in the prospect branch.
DO $$
DECLARE
  v_old text := pg_get_functiondef('public.app_email_enqueue(uuid, text[], text, jsonb, text, text, text, uuid)'::regprocedure);
  v_new text;
  v_pairs text[][] := ARRAY[
    ARRAY[$n$'signerName', ai.display_name, 'signerTitle', ai.job_title)$n$, $r$'signerName', coalesce(ai.display_name, o.name), 'signerTitle', coalesce(ai.job_title, 'Meetings team'))$r$],
    ARRAY[$n$p_subject, p_body, ai.display_name, ai.alias_email$n$, $r$p_subject, p_body, coalesce(ai.display_name, o.name), ai.alias_email$r$],
    ARRAY[$n$      JOIN public.alias_identity ai ON ai.id = l.alias_identity_id$n$, $r$      LEFT JOIN public.alias_identity ai ON ai.id = l.alias_identity_id$r$],
    ARRAY[$n$AND l.prospect_email <> '' AND ai.status = 'active' AND ai.verified_at IS NOT NULL;$n$, $r$AND l.prospect_email <> '' AND (ai.id IS NULL OR (ai.status = 'active' AND ai.verified_at IS NOT NULL));$r$]
  ];
  v_i integer;
BEGIN
  v_new := v_old;
  FOR v_i IN 1 .. array_length(v_pairs, 1) LOOP
    IF (length(v_new) - length(replace(v_new, v_pairs[v_i][1], ''))) / length(v_pairs[v_i][1]) <> 1 THEN
      RAISE EXCEPTION 'expected app_email_enqueue to contain line % of the prospect branch once', v_i;
    END IF;
    v_new := replace(v_new, v_pairs[v_i][1], v_pairs[v_i][2]);
  END LOOP;
  EXECUTE v_new;
END
$$;
--> statement-breakpoint

-- 2. app_lead_email_context_core: a prospect letter can be written without an alias; one that has an alias still needs it active and verified.
DO $$
DECLARE
  v_old text := pg_get_functiondef('public.app_lead_email_context_core(uuid)'::regprocedure);
  v_needle text := $n$AND EXISTS (SELECT 1 FROM public.alias_identity ai WHERE ai.id = l.alias_identity_id AND ai.status = 'active' AND ai.verified_at IS NOT NULL))$n$;
  v_repl text := $r$AND (l.alias_identity_id IS NULL OR EXISTS (SELECT 1 FROM public.alias_identity ai WHERE ai.id = l.alias_identity_id AND ai.status = 'active' AND ai.verified_at IS NOT NULL)))$r$;
BEGIN
  IF (length(v_old) - length(replace(v_old, v_needle, ''))) / length(v_needle) <> 1 THEN
    RAISE EXCEPTION 'expected app_lead_email_context_core to check the alias once';
  END IF;
  EXECUTE replace(v_old, v_needle, v_repl);
END
$$;
