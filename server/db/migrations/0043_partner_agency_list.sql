-- A supplier needs the names of its own partner agencies (its overview, its agencies page, the share dialog), and a supplier role
-- holds no grant on `organisation`. This returns the partner agencies of the caller's organisation: id, reference, name and
-- status, nothing else, and only for organisations whose parent is the caller's.
CREATE FUNCTION public.app_my_partner_agencies() RETURNS TABLE (id uuid, public_ref text, name text, status text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT o.id, o.public_ref, o.name, o.status::text
    FROM public.organisation o
    WHERE o.parent_org_id = public.app_current_org_id()
    ORDER BY o.name
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_my_partner_agencies() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_my_partner_agencies() TO leads_agency;
