-- The agency invite policy of 0032 tested `organisation.id` and `parent_org_id` in a subquery, but the agency role may read only
-- `parent_org_id` of organisation, so any read of an invite by an agency failed with "permission denied for table organisation" (and
-- the same error is what blocked a direct insert). The test moves into a SECURITY DEFINER helper, like app_agency_sees_campaign (0039).
--
-- Reads: an agency reads the invites of its own organisation and of its partner agencies. Revoking: an active manager only, same scope.
-- Issuing: no direct insert any more. The only way in is app_issue_tenant_invite (0059), which checks terms, accounts and the manager.
CREATE FUNCTION public.app_org_in_my_tree(p_org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT p_org = public.app_current_org_id()
        OR EXISTS (SELECT 1 FROM public.organisation o WHERE o.id = p_org AND o.parent_org_id = public.app_current_org_id())
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_org_in_my_tree(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_org_in_my_tree(uuid) TO leads_agency;
--> statement-breakpoint
DROP POLICY "invite_agency_manage" ON "invite";
--> statement-breakpoint
CREATE POLICY "invite_agency_read" ON "invite" AS PERMISSIVE FOR SELECT TO leads_agency USING (public.app_org_in_my_tree("org_id"));
--> statement-breakpoint
CREATE POLICY "invite_agency_revoke" ON "invite" AS PERMISSIVE FOR UPDATE TO leads_agency
  USING (public.app_org_in_my_tree("org_id") AND public.app_caller_is_manager())
  WITH CHECK (public.app_org_in_my_tree("org_id") AND public.app_caller_is_manager());
--> statement-breakpoint
REVOKE INSERT ON "invite" FROM leads_agency;
