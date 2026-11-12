-- The two functions every row-level security policy reads the request scope through. The scope helper sets
-- app.org_id and app.user_id with set_config(..., true) inside a transaction (server/db/scope.ts).
--
-- Plain LANGUAGE sql, STABLE, with no SET clause and every name qualified, so the planner can inline them into the
-- policy expression. A function with a SET clause (a pinned search_path, for example) is never inlined. Outside a
-- transaction that set the value, current_setting returns an empty string, which nullif turns into NULL, so an
-- unscoped connection compares against NULL and sees no rows.
CREATE FUNCTION public.app_current_org_id() RETURNS pg_catalog.uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(pg_catalog.current_setting('app.org_id', true), '')::pg_catalog.uuid $$;
--> statement-breakpoint
CREATE FUNCTION public.app_current_user_id() RETURNS pg_catalog.uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(pg_catalog.current_setting('app.user_id', true), '')::pg_catalog.uuid $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_current_org_id() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_current_user_id() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_current_org_id() TO leads_auth, leads_fynix, leads_client, leads_agency, leads_public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO leads_auth, leads_fynix, leads_client, leads_agency, leads_public;
