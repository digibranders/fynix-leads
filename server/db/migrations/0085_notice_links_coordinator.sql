-- The coordinator's portal moved from /supplier to /coordinator. Three functions write the page a notice or a message link opens
-- (app_notice_path, app_notify_conversation, app_notify_group) and still named the old address. Each is replaced by its own definition with
-- the new address: the definition is read back from the database, so the rest of the body, its settings and its grants stay exactly as they are.
-- Links already stored on notices keep working: /supplier/... redirects to /coordinator/....
DO $$
DECLARE
  r record;
  patched integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND pg_get_functiondef(p.oid) LIKE '%''/supplier%'
  LOOP
    EXECUTE replace(pg_get_functiondef(r.oid), '''/supplier', '''/coordinator');
    patched := patched + 1;
  END LOOP;
  IF patched <> 3 THEN
    RAISE EXCEPTION 'expected to update 3 functions that name the /supplier address, found %', patched;
  END IF;
END
$$;
