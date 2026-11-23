-- File attachments on messages (spec 11: PDF, Word, Excel, PNG, JPG, up to 10 MB, private, served only to members of the
-- conversation). This table holds the metadata; the bytes live in private file storage outside the web root. No runtime role
-- touches the table. Four SECURITY DEFINER functions (search_path pinned) are the only way in and out, and each checks that
-- the caller belongs to the conversation, so a file can never be listed or located by someone who is not in the thread.

CREATE TABLE "message_attachment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "storage_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_attachment_message_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_message"("id") ON DELETE cascade,
  CONSTRAINT "message_attachment_storage_key_unique" UNIQUE ("storage_key"),
  CONSTRAINT "message_attachment_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
  CONSTRAINT "message_attachment_name_check" CHECK (char_length("file_name") BETWEEN 1 AND 180 AND "file_name" !~ '[/\\\x00-\x1f]'),
  CONSTRAINT "message_attachment_type_check" CHECK ("content_type" IN (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ))
);
--> statement-breakpoint
CREATE INDEX "message_attachment_message_idx" ON "message_attachment" USING btree ("message_id");
--> statement-breakpoint
ALTER TABLE "message_attachment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "message_attachment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "message_attachment" TO leads_owner;
--> statement-breakpoint
CREATE POLICY "message_attachment_owner_all" ON "message_attachment" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Whether the caller belongs to the conversation: their organisation is one of its parties, or they are Fynix and it is a Fynix thread.
CREATE FUNCTION public.app_can_see_conversation(p_conversation uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.conversation c
      JOIN public.member m ON m.user_id = public.app_current_user_id() AND m.status = 'active'
      WHERE c.id = p_conversation AND (
        c.client_org_id = m.org_id OR c.supplier_org_id = m.org_id OR c.agency_org_id = m.org_id
        OR (m.org_kind = 'fynix' AND c.side IN ('client_fynix', 'supplier_fynix'))
      )
    )
  $$;
--> statement-breakpoint

CREATE FUNCTION public.app_add_message_attachment(p_message uuid, p_name text, p_type text, p_size integer, p_key text) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_conversation uuid;
  v_id uuid;
BEGIN
  SELECT cm.conversation_id INTO v_conversation
  FROM public.conversation_message cm
  WHERE cm.id = p_message AND cm.sender_user_id = public.app_current_user_id();
  IF v_conversation IS NULL OR NOT public.app_can_see_conversation(v_conversation) THEN
    RAISE EXCEPTION 'You can only attach files to your own message in a conversation you belong to';
  END IF;
  INSERT INTO public.message_attachment (message_id, file_name, content_type, size_bytes, storage_key)
  VALUES (p_message, p_name, p_type, p_size, p_key)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
--> statement-breakpoint

CREATE FUNCTION public.app_list_message_attachments(p_conversation uuid) RETURNS TABLE (id uuid, message_id uuid, file_name text, content_type text, size_bytes integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT a.id, a.message_id, a.file_name, a.content_type, a.size_bytes
    FROM public.message_attachment a
    JOIN public.conversation_message cm ON cm.id = a.message_id
    WHERE cm.conversation_id = p_conversation AND public.app_can_see_conversation(p_conversation)
    ORDER BY a.created_at, a.id
  $$;
--> statement-breakpoint

CREATE FUNCTION public.app_message_attachment_location(p_attachment uuid) RETURNS TABLE (storage_key text, file_name text, content_type text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT a.storage_key, a.file_name, a.content_type
    FROM public.message_attachment a
    JOIN public.conversation_message cm ON cm.id = a.message_id
    WHERE a.id = p_attachment AND public.app_can_see_conversation(cm.conversation_id)
  $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_can_see_conversation(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_add_message_attachment(uuid, text, text, integer, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_list_message_attachments(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_message_attachment_location(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_can_see_conversation(uuid) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_add_message_attachment(uuid, text, text, integer, text) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_list_message_attachments(uuid) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_message_attachment_location(uuid) TO leads_client, leads_agency, leads_fynix;
