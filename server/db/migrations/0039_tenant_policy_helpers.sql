-- Helper functions for policies that must look at rows the caller may not read (SECURITY DEFINER, owner: leads_owner).
-- Until now no function used SECURITY DEFINER, so a policy could only test what its own role could already see. That made
-- two things impossible: a partner agency reading the campaigns shared with it (the campaign and campaign_share policies
-- called each other and Postgres refused with "infinite recursion"), and a role-hidden table being consulted at all.
-- Each helper does one narrow check, takes no more than ids, reads only the caller's scope from the transaction settings
-- (app.org_id), returns a boolean, and is executable by the roles that need it and nobody else.

CREATE FUNCTION public.app_agency_sees_campaign(p_campaign uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = p_campaign AND c.agency_org_id = public.app_current_org_id())
        OR EXISTS (SELECT 1 FROM public.campaign_share s WHERE s.campaign_id = p_campaign AND s.agency_org_id = public.app_current_org_id())
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_agency_sees_campaign(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_agency_sees_campaign(uuid) TO leads_agency;
--> statement-breakpoint

DROP POLICY "campaign_agency_own" ON "campaign";
--> statement-breakpoint
CREATE POLICY "campaign_agency_own" ON "campaign" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (public.app_agency_sees_campaign("id"));
--> statement-breakpoint

-- The code of an agency reads the client and supplier ids of the campaigns it sees, and a client reads the supplier id of its own.
-- Row access is unchanged (campaign RLS), so each role can only ever read the ids on rows it may already see.
GRANT SELECT ("client_org_id") ON "campaign" TO leads_agency;
--> statement-breakpoint
GRANT SELECT ("agency_org_id") ON "campaign" TO leads_client;
