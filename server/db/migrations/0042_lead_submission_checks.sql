-- The two checks an agency's lead submission needs against rows it may not read: the client's exclusion list, and the same
-- client's other leads (duplicates across agencies and campaigns). Both are SECURITY DEFINER and answer with a boolean or a
-- reference, never the rows: an agency learns "excluded" or "already submitted", not what is on the list or who else submitted.
-- The owner policies below let a function owned by leads_owner read these forced-RLS tables; no runtime role is leads_owner.

CREATE POLICY "exclusion_entry_owner_all" ON "exclusion_entry" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "lead_owner_all" ON "lead" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "lead_history_owner_all" ON "lead_history" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "meeting_owner_all" ON "meeting" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE FUNCTION public.app_norm_domain(p_raw text) RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog
  AS $$
    SELECT btrim(split_part(split_part(regexp_replace(regexp_replace(lower(btrim(p_raw)), '^https?://', ''), '^www\.', ''), '/', 1), '?', 1))
  $$;
--> statement-breakpoint

-- Mirrors matchesExclusion in lib/leads/normalize.ts: an email matches exactly; a domain matches the prospect's website or email
-- domain and its subdomains; a company matches by equality or containment either way.
CREATE FUNCTION public.app_prospect_excluded(p_client uuid, p_email text, p_domain text, p_company text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.exclusion_entry e
      WHERE e.client_org_id = p_client AND (
        (e.kind = 'email' AND lower(btrim(p_email)) = lower(btrim(e.value)))
        OR (e.kind = 'domain' AND (
          public.app_norm_domain(p_domain) = public.app_norm_domain(e.value)
          OR right(public.app_norm_domain(p_domain), length(public.app_norm_domain(e.value)) + 1) = '.' || public.app_norm_domain(e.value)
          OR split_part(lower(btrim(p_email)), '@', 2) = public.app_norm_domain(e.value)
          OR right(split_part(lower(btrim(p_email)), '@', 2), length(public.app_norm_domain(e.value)) + 1) = '.' || public.app_norm_domain(e.value)
        ))
        OR (e.kind = 'company' AND (
          lower(btrim(p_company)) = lower(btrim(e.value))
          OR position(lower(btrim(e.value)) IN lower(btrim(p_company))) > 0
          OR position(lower(btrim(p_company)) IN lower(btrim(e.value))) > 0
        ))
      )
    )
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_prospect_excluded(uuid, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_prospect_excluded(uuid, text, text, text) TO leads_agency;
--> statement-breakpoint

-- NULL when the prospect is new for this client; the lead's reference when the caller's own organisation submitted it; 'OTHER'
-- when someone else did.
CREATE FUNCTION public.app_find_duplicate_lead(p_client uuid, p_email text, p_linkedin text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT CASE WHEN l.source_org_id = public.app_current_org_id() THEN l.public_ref ELSE 'OTHER' END
    FROM public.lead l
    JOIN public.campaign c ON c.id = l.campaign_id
    WHERE c.client_org_id = p_client
      AND (l.prospect_email = p_email OR l.prospect_linkedin_url = p_linkedin)
      AND l.stage NOT IN ('withdrawn', 'lost', 'rejected', 'declined')
    ORDER BY (l.source_org_id = public.app_current_org_id()) DESC
    LIMIT 1
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_find_duplicate_lead(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_find_duplicate_lead(uuid, text, text) TO leads_agency;
