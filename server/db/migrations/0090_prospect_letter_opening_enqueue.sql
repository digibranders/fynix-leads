-- The campaign's own opening paragraph for the confirmation letter to prospects (0089, rules in lib/email/letter-opening.ts).
--
-- 1. What the queue adds to a prospect letter's params: the paragraph, for the confirmation letter only, and only while it names neither the campaign's
--    coordinator, nor an agency holding a share of it, nor the agency that sent the lead. The paragraph was checked for those names when it was saved; this is
--    the same check at the moment the letter is queued, because an agency can join a campaign afterwards. A paragraph that fails is left out and the default
--    wording goes out: the letter is never held back. Called only from inside app_email_enqueue, so nobody is granted it.
CREATE FUNCTION public.app_prospect_letter_opening(p_lead uuid, p_template text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('letterOpening', c.prospect_letter_opening)
      FROM public.lead l
      JOIN public.campaign c ON c.id = l.campaign_id
     WHERE l.id = p_lead
       AND p_template = 'prospect_confirmed'
       AND c.prospect_letter_opening IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.organisation o
          WHERE (o.id IN (c.agency_org_id, l.source_org_id) OR o.id IN (SELECT s.agency_org_id FROM public.campaign_share s WHERE s.campaign_id = c.id))
            AND btrim(o.name) <> ''
            AND position(lower(btrim(o.name)) IN lower(c.prospect_letter_opening)) > 0)
  ), '{}'::jsonb)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_prospect_letter_opening(uuid, text) FROM PUBLIC;
--> statement-breakpoint

-- 2. app_email_enqueue appends it to the fields it already adds to a prospect letter. The definition is read back from the database and one expression is
--    extended (the pattern of 0085 and 0088), so the rest of the body, its settings and its grants stay exactly as they are.
DO $$
DECLARE
  v_old text := pg_get_functiondef('public.app_email_enqueue(uuid, text[], text, jsonb, text, text, text, uuid)'::regprocedure);
  v_needle text := $n$'signerTitle', ai.job_title)$n$;
BEGIN
  IF (length(v_old) - length(replace(v_old, v_needle, ''))) / length(v_needle) <> 1 THEN
    RAISE EXCEPTION 'expected app_email_enqueue to build the prospect letter fields once';
  END IF;
  EXECUTE replace(v_old, v_needle, v_needle || ' || public.app_prospect_letter_opening(l.id, p_template)');
END
$$;
