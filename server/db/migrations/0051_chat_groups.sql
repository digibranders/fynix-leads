-- Group chats. A Fynix admin can create a group and add anyone; a supplier manager can create one and add people from the
-- supplier's own organisation, its partner agencies and Fynix. The creator and any Fynix admin manage it afterwards; anyone can
-- leave. A group may mix client-side and supply-side people, so members appear to each other by first name and role only, and
-- contact details are removed from what is said (done in the application when the message is stored). Files are not allowed.
--
-- Nothing here gives a runtime role a grant on the two new tables. Every read and write goes through a SECURITY DEFINER function
-- (search_path pinned) that checks who is asking: the pool a person may add from, whether they may manage the group, whether they
-- are in it. Conversations and messages of a group are read and written by the ordinary messaging code, with row-level policies
-- that admit exactly the members of the group.

CREATE TABLE "chat_group" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "public_ref" text NOT NULL,
  "name" text NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_group_public_ref_unique" UNIQUE ("public_ref"),
  CONSTRAINT "chat_group_public_ref_format" CHECK ("public_ref" ~ '^GRP-[0-9A-HJKMNP-TV-Z]{4}$'),
  CONSTRAINT "chat_group_name_check" CHECK (char_length("name") BETWEEN 1 AND 80 AND "name" = btrim("name")),
  CONSTRAINT "chat_group_status_check" CHECK ("status" IN ('active', 'deleted')),
  CONSTRAINT "chat_group_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "chat_group_member" (
  "group_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "added_by_user_id" uuid NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "left_at" timestamp with time zone,
  CONSTRAINT "chat_group_member_pk" PRIMARY KEY ("group_id", "user_id"),
  CONSTRAINT "chat_group_member_group_fk" FOREIGN KEY ("group_id") REFERENCES "public"."chat_group"("id") ON DELETE cascade,
  CONSTRAINT "chat_group_member_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "chat_group_member_added_by_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "chat_group_member_user_idx" ON "chat_group_member" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "chat_group" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_group" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_group_member" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_group_member" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "chat_group", "chat_group_member" TO leads_owner;
--> statement-breakpoint
CREATE POLICY "chat_group_owner_all" ON "chat_group" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "chat_group_member_owner_all" ON "chat_group_member" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint

-- A group's conversation: side 'group', no campaign, no organisation ids.
ALTER TABLE "conversation" ADD COLUMN "group_id" uuid;
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_group_fk" FOREIGN KEY ("group_id") REFERENCES "public"."chat_group"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "conversation" ALTER COLUMN "campaign_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversation" DROP CONSTRAINT "conversation_side_check";
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_side_check" CHECK ("side" IN ('client_fynix', 'supplier_fynix', 'supplier_agency', 'group'));
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_group_shape" CHECK (
  ("side" = 'group' AND "group_id" IS NOT NULL AND "campaign_id" IS NULL AND "client_org_id" IS NULL AND "supplier_org_id" IS NULL AND "agency_org_id" IS NULL)
  OR ("side" <> 'group' AND "group_id" IS NULL AND "campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_group_unique" ON "conversation" USING btree ("group_id") WHERE "group_id" IS NOT NULL;
--> statement-breakpoint
GRANT SELECT ("group_id") ON "conversation" TO leads_client, leads_agency;
--> statement-breakpoint

-- Whether the caller is an active member of an active group.
CREATE FUNCTION public.app_in_group(p_group uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.chat_group_member gm
      JOIN public.chat_group g ON g.id = gm.group_id AND g.status = 'active'
      JOIN public.member m ON m.user_id = gm.user_id AND m.status = 'active'
      WHERE gm.group_id = p_group AND gm.user_id = public.app_current_user_id() AND gm.left_at IS NULL
    )
  $$;
--> statement-breakpoint
CREATE FUNCTION public.app_in_group_conversation(p_conversation uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (SELECT 1 FROM public.conversation c WHERE c.id = p_conversation AND c.side = 'group' AND public.app_in_group(c.group_id))
  $$;
--> statement-breakpoint

-- The earlier visibility check (0050) now also admits the members of a group.
CREATE OR REPLACE FUNCTION public.app_can_see_conversation(p_conversation uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT public.app_in_group_conversation(p_conversation) OR EXISTS (
      SELECT 1
      FROM public.conversation c
      JOIN public.member m ON m.user_id = public.app_current_user_id() AND m.status = 'active'
      WHERE c.id = p_conversation AND c.side <> 'group' AND (
        c.client_org_id = m.org_id OR c.supplier_org_id = m.org_id OR c.agency_org_id = m.org_id
        OR (m.org_kind = 'fynix' AND c.side IN ('client_fynix', 'supplier_fynix'))
      )
    )
  $$;
--> statement-breakpoint

-- Read receipts (0049) for groups too: in a group, anyone else opening it counts as seeing.
CREATE OR REPLACE FUNCTION public.app_mark_conversation_read(p_conversation uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT public.app_can_see_conversation(p_conversation) THEN
    RETURN;
  END IF;
  INSERT INTO public.conversation_read (conversation_id, user_id, read_at)
  VALUES (p_conversation, public.app_current_user_id(), now())
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET read_at = now();
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_conversation_seen_at(p_conversation uuid) RETURNS timestamp with time zone
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_org uuid;
  v_group boolean;
  v_seen timestamp with time zone;
BEGIN
  IF NOT public.app_can_see_conversation(p_conversation) THEN
    RETURN NULL;
  END IF;
  SELECT m.org_id INTO v_org FROM public.member m WHERE m.user_id = public.app_current_user_id() AND m.status = 'active';
  SELECT (c.side = 'group') INTO v_group FROM public.conversation c WHERE c.id = p_conversation;
  SELECT max(r.read_at) INTO v_seen
  FROM public.conversation_read r
  JOIN public.member rm ON rm.user_id = r.user_id
  WHERE r.conversation_id = p_conversation
    AND ((v_group AND r.user_id <> public.app_current_user_id()) OR (NOT v_group AND rm.org_id <> v_org));
  RETURN v_seen;
END
$$;
--> statement-breakpoint

-- The people the caller may add to a group, and the label shown for each. Fynix admins: everyone. Supplier managers: their own
-- organisation, their partner agencies and Fynix. Anyone else: nobody.
CREATE FUNCTION public.app_group_candidates() RETURNS TABLE (user_id uuid, display_name text, org_name text, role_label text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT m.user_id, m.display_name, o.name,
           CASE m.org_kind WHEN 'fynix' THEN 'Fynix' WHEN 'client' THEN 'Client'
                ELSE CASE WHEN o.parent_org_id IS NULL THEN 'Supplier' ELSE 'Agency' END END
    FROM public.member me
    JOIN public.member m ON m.status = 'active' AND m.user_id <> me.user_id
    JOIN public.organisation o ON o.id = m.org_id
    JOIN public.organisation mo ON mo.id = me.org_id
    WHERE me.user_id = public.app_current_user_id() AND me.status = 'active' AND me.role = 'manager'
      AND (
        me.org_kind = 'fynix'
        OR (me.org_kind = 'agency' AND mo.parent_org_id IS NULL
            AND (m.org_id = me.org_id OR o.parent_org_id = me.org_id OR m.org_kind = 'fynix'))
      )
    ORDER BY o.name, m.display_name
  $$;
--> statement-breakpoint
CREATE FUNCTION public.app_can_create_group() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.member me JOIN public.organisation mo ON mo.id = me.org_id
      WHERE me.user_id = public.app_current_user_id() AND me.status = 'active' AND me.role = 'manager'
        AND (me.org_kind = 'fynix' OR (me.org_kind = 'agency' AND mo.parent_org_id IS NULL))
    )
  $$;
--> statement-breakpoint
-- A Fynix admin, or the creator while still in the group.
CREATE FUNCTION public.app_group_can_manage(p_group uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.chat_group g
      WHERE g.id = p_group AND g.status = 'active' AND (
        EXISTS (SELECT 1 FROM public.member m WHERE m.user_id = public.app_current_user_id() AND m.status = 'active' AND m.org_kind = 'fynix' AND m.role = 'manager')
        OR (g.created_by_user_id = public.app_current_user_id() AND public.app_in_group(g.id))
      )
    )
  $$;
--> statement-breakpoint

CREATE FUNCTION public.app_create_group(p_group_ref text, p_conversation_ref text, p_name text, p_members uuid[]) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_name text := btrim(p_name);
  v_group uuid;
  v_conversation uuid;
  v_member uuid;
  v_me uuid := public.app_current_user_id();
BEGIN
  IF NOT public.app_can_create_group() THEN
    RAISE EXCEPTION 'You cannot create a group';
  END IF;
  IF char_length(v_name) < 1 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'A group name is 1 to 80 characters';
  END IF;
  IF coalesce(array_length(p_members, 1), 0) > 200 THEN
    RAISE EXCEPTION 'A group has at most 200 people';
  END IF;
  FOREACH v_member IN ARRAY coalesce(p_members, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.app_group_candidates() c WHERE c.user_id = v_member) THEN
      RAISE EXCEPTION 'You cannot add that person to a group';
    END IF;
  END LOOP;
  INSERT INTO public.chat_group (public_ref, name, created_by_user_id) VALUES (p_group_ref, v_name, v_me) RETURNING id INTO v_group;
  INSERT INTO public.chat_group_member (group_id, user_id, added_by_user_id) VALUES (v_group, v_me, v_me);
  INSERT INTO public.chat_group_member (group_id, user_id, added_by_user_id)
    SELECT v_group, u, v_me FROM (SELECT DISTINCT unnest(coalesce(p_members, ARRAY[]::uuid[])) AS u) s WHERE u <> v_me;
  INSERT INTO public.conversation (public_ref, side, group_id, subject) VALUES (p_conversation_ref, 'group', v_group, v_name) RETURNING id INTO v_conversation;
  RETURN v_conversation;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_group_add_members(p_group uuid, p_members uuid[]) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_member uuid;
  v_count integer := 0;
BEGIN
  IF NOT public.app_group_can_manage(p_group) THEN
    RAISE EXCEPTION 'You cannot change this group';
  END IF;
  FOREACH v_member IN ARRAY coalesce(p_members, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.app_group_candidates() c WHERE c.user_id = v_member) THEN
      RAISE EXCEPTION 'You cannot add that person to a group';
    END IF;
    INSERT INTO public.chat_group_member (group_id, user_id, added_by_user_id)
    VALUES (p_group, v_member, public.app_current_user_id())
    ON CONFLICT (group_id, user_id) DO UPDATE SET left_at = NULL, joined_at = CASE WHEN chat_group_member.left_at IS NULL THEN chat_group_member.joined_at ELSE now() END;
    v_count := v_count + 1;
  END LOOP;
  UPDATE public.chat_group SET updated_at = now() WHERE id = p_group;
  RETURN v_count;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_group_remove_member(p_group uuid, p_user uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT public.app_group_can_manage(p_group) THEN
    RAISE EXCEPTION 'You cannot change this group';
  END IF;
  IF p_user = public.app_current_user_id() THEN
    RAISE EXCEPTION 'Use leave to remove yourself';
  END IF;
  UPDATE public.chat_group_member SET left_at = now() WHERE group_id = p_group AND user_id = p_user AND left_at IS NULL;
  UPDATE public.chat_group SET updated_at = now() WHERE id = p_group;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_group_leave(p_group uuid) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    UPDATE public.chat_group_member SET left_at = now() WHERE group_id = p_group AND user_id = public.app_current_user_id() AND left_at IS NULL
  $$;
--> statement-breakpoint
CREATE FUNCTION public.app_group_rename(p_group uuid, p_name text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_name text := btrim(p_name);
BEGIN
  IF NOT public.app_group_can_manage(p_group) THEN
    RAISE EXCEPTION 'You cannot change this group';
  END IF;
  IF char_length(v_name) < 1 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'A group name is 1 to 80 characters';
  END IF;
  UPDATE public.chat_group SET name = v_name, updated_at = now() WHERE id = p_group;
  UPDATE public.conversation SET subject = v_name WHERE group_id = p_group;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_group_delete(p_group uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT public.app_group_can_manage(p_group) THEN
    RAISE EXCEPTION 'You cannot change this group';
  END IF;
  UPDATE public.chat_group SET status = 'deleted', updated_at = now() WHERE id = p_group;
END
$$;
--> statement-breakpoint

-- The people in a group, as the other members may see them: first name and role, never a surname, company, email or phone.
CREATE FUNCTION public.app_group_members(p_group uuid) RETURNS TABLE (user_id uuid, first_name text, role_label text, is_creator boolean, is_me boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT gm.user_id, split_part(m.display_name, ' ', 1),
           CASE m.org_kind WHEN 'fynix' THEN 'Fynix' WHEN 'client' THEN 'Client'
                ELSE CASE WHEN o.parent_org_id IS NULL THEN 'Supplier' ELSE 'Agency' END END,
           (gm.user_id = g.created_by_user_id), (gm.user_id = public.app_current_user_id())
    FROM public.chat_group_member gm
    JOIN public.chat_group g ON g.id = gm.group_id
    JOIN public.member m ON m.user_id = gm.user_id
    JOIN public.organisation o ON o.id = m.org_id
    WHERE gm.group_id = p_group AND gm.left_at IS NULL AND public.app_in_group(p_group)
    ORDER BY (gm.user_id = g.created_by_user_id) DESC, split_part(m.display_name, ' ', 1)
  $$;
--> statement-breakpoint
CREATE FUNCTION public.app_group_info(p_conversation uuid) RETURNS TABLE (group_id uuid, name text, can_manage boolean, member_count integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT g.id, g.name, public.app_group_can_manage(g.id),
           (SELECT count(*)::integer FROM public.chat_group_member x WHERE x.group_id = g.id AND x.left_at IS NULL)
    FROM public.conversation c
    JOIN public.chat_group g ON g.id = c.group_id
    WHERE c.id = p_conversation AND public.app_in_group(g.id)
  $$;
--> statement-breakpoint
-- Tells every other member there is a new message, linking to the right portal for each.
CREATE FUNCTION public.app_notify_group(p_conversation uuid, p_title text, p_body text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_group uuid;
BEGIN
  SELECT c.group_id INTO v_group FROM public.conversation c WHERE c.id = p_conversation AND c.side = 'group';
  IF v_group IS NULL OR NOT public.app_in_group(v_group) THEN
    RETURN;
  END IF;
  INSERT INTO public.notification (user_id, org_id, kind, title, body, link)
  SELECT gm.user_id,
         CASE WHEN m.org_kind = 'fynix' THEN NULL ELSE m.org_id END,
         'message_received',
         left(p_title, 200),
         left(p_body, 500),
         CASE WHEN m.org_kind = 'fynix' THEN '/fynix/inbox'
              WHEN m.org_kind = 'client' THEN '/client/messages'
              WHEN o.parent_org_id IS NULL THEN '/supplier/messages'
              ELSE '/agency/messages' END || '?conv=' || p_conversation::text
  FROM public.chat_group_member gm
  JOIN public.member m ON m.user_id = gm.user_id AND m.status = 'active'
  JOIN public.organisation o ON o.id = m.org_id
  WHERE gm.group_id = v_group AND gm.left_at IS NULL AND gm.user_id <> public.app_current_user_id();
END
$$;
--> statement-breakpoint

-- Row-level policies: the members of a group, and only they, read and write its conversation and messages.
CREATE POLICY "conversation_group_select" ON "conversation" AS PERMISSIVE FOR SELECT TO leads_client, leads_agency, leads_fynix
  USING ("side" = 'group' AND public.app_in_group("group_id"));
--> statement-breakpoint
CREATE POLICY "conversation_group_update" ON "conversation" AS PERMISSIVE FOR UPDATE TO leads_client, leads_agency, leads_fynix
  USING ("side" = 'group' AND public.app_in_group("group_id"))
  WITH CHECK ("side" = 'group' AND public.app_in_group("group_id"));
--> statement-breakpoint
CREATE POLICY "conversation_message_group_select" ON "conversation_message" AS PERMISSIVE FOR SELECT TO leads_client, leads_agency, leads_fynix
  USING (public.app_in_group_conversation("conversation_id"));
--> statement-breakpoint
CREATE POLICY "conversation_message_group_insert" ON "conversation_message" AS PERMISSIVE FOR INSERT TO leads_client, leads_agency, leads_fynix
  WITH CHECK ("sender_user_id" = public.app_current_user_id() AND public.app_in_group_conversation("conversation_id"));
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_in_group(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_in_group_conversation(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_candidates() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_can_create_group() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_can_manage(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_create_group(text, text, text, uuid[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_add_members(uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_remove_member(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_leave(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_rename(uuid, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_delete(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_members(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_group_info(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_notify_group(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_in_group(uuid), public.app_in_group_conversation(uuid), public.app_group_candidates(), public.app_can_create_group(), public.app_group_can_manage(uuid), public.app_create_group(text, text, text, uuid[]), public.app_group_add_members(uuid, uuid[]), public.app_group_remove_member(uuid, uuid), public.app_group_leave(uuid), public.app_group_rename(uuid, text), public.app_group_delete(uuid), public.app_group_members(uuid), public.app_group_info(uuid), public.app_notify_group(uuid, text, text) TO leads_client, leads_agency, leads_fynix;
