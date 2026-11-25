-- The label shown beside a person in a group chat said "Supplier" for a coordinator. Two functions hand it out (app_group_candidates, the people a
-- group may add, and app_group_members, the people in it). Each is replaced by its own definition with the label "Coordinator": the definition is
-- read back from the database, so the rest of the body, its settings and its grants stay exactly as they are.
DO $$
DECLARE
  r record;
  patched integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND pg_get_functiondef(p.oid) LIKE '%''Supplier''%'
  LOOP
    EXECUTE replace(pg_get_functiondef(r.oid), '''Supplier''', '''Coordinator''');
    patched := patched + 1;
  END LOOP;
  IF patched <> 2 THEN
    RAISE EXCEPTION 'expected to update 2 functions that label a coordinator "Supplier", found %', patched;
  END IF;
END
$$;
