-- Read receipts: when each person last opened a conversation. No runtime role reads or writes this table. Two SECURITY DEFINER
-- functions do it: one records that the caller has opened a conversation they belong to; the other returns the latest moment
-- someone on the OTHER side opened it, which is all a sender needs to show "seen". It never says who, and a person's own
-- colleagues do not count as the other side.
CREATE TABLE "conversation_read" (
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_read_pk" PRIMARY KEY ("conversation_id", "user_id"),
  CONSTRAINT "conversation_read_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade,
  CONSTRAINT "conversation_read_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE "conversation_read" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversation_read" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "conversation_read" TO leads_owner;
--> statement-breakpoint
CREATE POLICY "conversation_read_owner_all" ON "conversation_read" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE FUNCTION public.app_mark_conversation_read(p_conversation uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_member public.member%ROWTYPE;
BEGIN
  SELECT m.* INTO v_member FROM public.member m WHERE m.user_id = public.app_current_user_id() AND m.status = 'active';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation c
    WHERE c.id = p_conversation AND (
      c.client_org_id = v_member.org_id OR c.supplier_org_id = v_member.org_id OR c.agency_org_id = v_member.org_id
      OR (v_member.org_kind = 'fynix' AND c.side IN ('client_fynix', 'supplier_fynix'))
    )
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.conversation_read (conversation_id, user_id, read_at)
  VALUES (p_conversation, v_member.user_id, now())
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET read_at = now();
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_conversation_seen_at(p_conversation uuid) RETURNS timestamp with time zone
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_member public.member%ROWTYPE;
  v_seen timestamp with time zone;
BEGIN
  SELECT m.* INTO v_member FROM public.member m WHERE m.user_id = public.app_current_user_id() AND m.status = 'active';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation c
    WHERE c.id = p_conversation AND (
      c.client_org_id = v_member.org_id OR c.supplier_org_id = v_member.org_id OR c.agency_org_id = v_member.org_id
      OR (v_member.org_kind = 'fynix' AND c.side IN ('client_fynix', 'supplier_fynix'))
    )
  ) THEN
    RETURN NULL;
  END IF;
  SELECT max(r.read_at) INTO v_seen
  FROM public.conversation_read r
  JOIN public.member rm ON rm.user_id = r.user_id
  WHERE r.conversation_id = p_conversation AND rm.org_id <> v_member.org_id;
  RETURN v_seen;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_mark_conversation_read(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_conversation_seen_at(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_mark_conversation_read(uuid) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_conversation_seen_at(uuid) TO leads_client, leads_agency, leads_fynix;
