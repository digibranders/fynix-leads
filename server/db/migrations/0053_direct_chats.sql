-- One-to-one chats. A direct chat is a two-person group (0051) that nobody manages: no rename, no adding, no deleting. Each person
-- sees the other's first name as its title.
ALTER TABLE "chat_group" ADD COLUMN "kind" text DEFAULT 'group' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_group" ADD CONSTRAINT "chat_group_kind_check" CHECK ("kind" IN ('group', 'direct'));
--> statement-breakpoint

-- Only a real group can be managed; a direct chat can only be left.
CREATE OR REPLACE FUNCTION public.app_group_can_manage(p_group uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.chat_group g
      WHERE g.id = p_group AND g.status = 'active' AND g.kind = 'group' AND (
        EXISTS (SELECT 1 FROM public.member m WHERE m.user_id = public.app_current_user_id() AND m.status = 'active' AND m.org_kind = 'fynix' AND m.role = 'manager')
        OR (g.created_by_user_id = public.app_current_user_id() AND public.app_in_group(g.id))
      )
    )
  $$;
--> statement-breakpoint

-- The title of a direct chat for the person asking: the other person's first name. NULL for a real group.
CREATE FUNCTION public.app_direct_title(p_conversation uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT coalesce(
      (SELECT split_part(m.display_name, ' ', 1)
       FROM public.chat_group_member gm JOIN public.member m ON m.user_id = gm.user_id
       WHERE gm.group_id = g.id AND gm.left_at IS NULL AND gm.user_id <> public.app_current_user_id()
       LIMIT 1),
      'Direct chat')
    FROM public.conversation c
    JOIN public.chat_group g ON g.id = c.group_id
    WHERE c.id = p_conversation AND g.kind = 'direct' AND public.app_in_group(g.id)
  $$;
--> statement-breakpoint

DROP FUNCTION public.app_group_info(uuid);
--> statement-breakpoint
CREATE FUNCTION public.app_group_info(p_conversation uuid) RETURNS TABLE (group_id uuid, name text, can_manage boolean, member_count integer, kind text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT g.id, coalesce(public.app_direct_title(c.id), g.name), public.app_group_can_manage(g.id),
           (SELECT count(*)::integer FROM public.chat_group_member x WHERE x.group_id = g.id AND x.left_at IS NULL),
           g.kind
    FROM public.conversation c
    JOIN public.chat_group g ON g.id = c.group_id
    WHERE c.id = p_conversation AND public.app_in_group(g.id)
  $$;
--> statement-breakpoint

-- Opens the chat with one person, or returns the one already open between the two of them.
CREATE FUNCTION public.app_open_direct(p_group_ref text, p_conversation_ref text, p_other uuid) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_me uuid := public.app_current_user_id();
  v_existing uuid;
  v_group uuid;
  v_conversation uuid;
BEGIN
  IF NOT public.app_can_create_group() THEN
    RAISE EXCEPTION 'You cannot start a chat';
  END IF;
  IF p_other = v_me OR NOT EXISTS (SELECT 1 FROM public.app_group_candidates() c WHERE c.user_id = p_other) THEN
    RAISE EXCEPTION 'You cannot start a chat with that person';
  END IF;
  SELECT c.id INTO v_existing
  FROM public.chat_group g
  JOIN public.conversation c ON c.group_id = g.id
  WHERE g.kind = 'direct' AND g.status = 'active'
    AND EXISTS (SELECT 1 FROM public.chat_group_member x WHERE x.group_id = g.id AND x.user_id = v_me AND x.left_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.chat_group_member x WHERE x.group_id = g.id AND x.user_id = p_other AND x.left_at IS NULL)
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  INSERT INTO public.chat_group (public_ref, name, created_by_user_id, kind) VALUES (p_group_ref, 'Direct chat', v_me, 'direct') RETURNING id INTO v_group;
  INSERT INTO public.chat_group_member (group_id, user_id, added_by_user_id) VALUES (v_group, v_me, v_me), (v_group, p_other, v_me);
  INSERT INTO public.conversation (public_ref, side, group_id, subject) VALUES (p_conversation_ref, 'group', v_group, 'Direct chat') RETURNING id INTO v_conversation;
  RETURN v_conversation;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_direct_title(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_info(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_open_direct(text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_direct_title(uuid), public.app_group_info(uuid), public.app_open_direct(text, text, uuid) TO leads_client, leads_agency, leads_fynix;
