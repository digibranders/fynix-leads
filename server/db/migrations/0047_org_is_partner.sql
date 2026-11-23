-- Whether the caller's organisation is a partner agency (it has a supplier above it) or a supplier. Sign-in uses it to send a
-- person to the right portal; the answer is one boolean about the caller's own organisation.
CREATE FUNCTION public.app_org_is_partner() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT COALESCE((SELECT o.parent_org_id IS NOT NULL FROM public.organisation o WHERE o.id = public.app_current_org_id()), false)
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_org_is_partner() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_org_is_partner() TO leads_agency;
