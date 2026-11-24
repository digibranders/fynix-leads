-- Phase 1 chunk A: the client profile and its collateral, the person fields on member and invite, the organisation time zone,
-- Fynix people invited into Fynix, and a client or coordinator manager inviting into their own side.
--
-- Who reads what:
--   client_profile, client_collateral: Fynix reads and writes (admin only, audited). The client reads its own rows. A coordinator or partner
--   agency reads the rows of the clients of the campaigns it sees (app_agency_sees_client, like app_agency_sees_campaign in 0039). Removed
--   collateral is hidden from tenants. `file_ref` (a storage key) is not granted to tenants until the download route exists.
--   member.job_title and member.phone: the tenant member policies already limit every read to the caller's own organisation, so an agency
--   never reads a client person and a client never reads an agency person. Neither role reads an email: that lives in "user".
--   organisation.time_zone: the client reads its own. Agencies do not.

-- 1. client_profile
ALTER TABLE "client_profile" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "client_profile" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("introduction", "services", "differentiator", "case_studies", "updated_at") ON "client_profile" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "client_profile_fynix_all" ON "client_profile" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER client_profile_audit_required AFTER INSERT OR UPDATE OR DELETE ON "client_profile"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE TRIGGER client_profile_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "client_profile" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint

-- 2. client_collateral
ALTER TABLE "client_collateral" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "client_collateral" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("title", "url", "removed_at") ON "client_collateral" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "client_collateral_fynix_all" ON "client_collateral" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER client_collateral_audit_required AFTER INSERT OR UPDATE OR DELETE ON "client_collateral"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE TRIGGER client_collateral_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "client_collateral" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint

-- 3. Tenant reads of the profile
CREATE FUNCTION public.app_agency_sees_client(p_client uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.client_org_id = p_client
        AND (c.agency_org_id = public.app_current_org_id()
          OR EXISTS (SELECT 1 FROM public.campaign_share s WHERE s.campaign_id = c.id AND s.agency_org_id = public.app_current_org_id()))
    )
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_agency_sees_client(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_agency_sees_client(uuid) TO leads_agency;
--> statement-breakpoint
GRANT SELECT ("client_org_id", "introduction", "services", "differentiator", "case_studies", "updated_at") ON "client_profile" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "client_profile_client_own" ON "client_profile" AS PERMISSIVE FOR SELECT TO leads_client USING ("client_org_id" = public.app_current_org_id());
--> statement-breakpoint
CREATE POLICY "client_profile_agency_visible" ON "client_profile" AS PERMISSIVE FOR SELECT TO leads_agency USING (public.app_agency_sees_client("client_org_id"));
--> statement-breakpoint
GRANT SELECT ("id", "client_org_id", "kind", "title", "url", "created_at") ON "client_collateral" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "client_collateral_client_own" ON "client_collateral" AS PERMISSIVE FOR SELECT TO leads_client
  USING ("client_org_id" = public.app_current_org_id() AND "removed_at" IS NULL);
--> statement-breakpoint
CREATE POLICY "client_collateral_agency_visible" ON "client_collateral" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (public.app_agency_sees_client("client_org_id") AND "removed_at" IS NULL);
--> statement-breakpoint

-- 4. Person fields and the company time zone
GRANT UPDATE ("job_title", "phone") ON "member" TO leads_fynix;
--> statement-breakpoint
GRANT SELECT ("job_title", "phone") ON "member" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT SELECT ("job_title", "phone") ON "invite" TO leads_fynix, leads_auth;
--> statement-breakpoint
GRANT SELECT ("time_zone") ON "organisation" TO leads_client;
--> statement-breakpoint

-- 5. A manager edits the details of the people of their own client. The helper avoids a policy on member reading member (recursion).
CREATE FUNCTION public.app_caller_is_manager() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.member m
      WHERE m.user_id = public.app_current_user_id() AND m.org_id = public.app_current_org_id() AND m.role = 'manager' AND m.status = 'active'
    )
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_caller_is_manager() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_caller_is_manager() TO leads_client, leads_agency;
--> statement-breakpoint
GRANT UPDATE ("display_name", "job_title", "phone") ON "member" TO leads_client;
--> statement-breakpoint
CREATE POLICY "member_client_manager_update" ON "member" AS PERMISSIVE FOR UPDATE TO leads_client
  USING ("org_id" = public.app_current_org_id() AND public.app_caller_is_manager())
  WITH CHECK ("org_id" = public.app_current_org_id() AND public.app_caller_is_manager());
--> statement-breakpoint

-- 6. Invites: the Fynix organisation can be invited into (the check that refused it goes in 0058), and the people lists show who is waiting.
GRANT SELECT ("id", "org_id", "email", "name", "job_title", "phone", "role", "expires_at", "redeemed_at", "revoked_at", "created_at") ON "invite" TO leads_client;
--> statement-breakpoint
GRANT SELECT ("name", "job_title", "phone") ON "invite" TO leads_agency;
--> statement-breakpoint
CREATE POLICY "invite_client_read" ON "invite" AS PERMISSIVE FOR SELECT TO leads_client
  USING ("org_id" = public.app_current_org_id() AND public.app_caller_is_manager());
--> statement-breakpoint

-- 7. A client manager, a coordinator manager or a partner agency manager issues an invite into their own organisation (and a coordinator into
-- its partner agencies). One function does all of it, because the tenant roles hold no grant on "user" (is the address taken), terms_document
-- (are there terms) or email_outbox (the message). It runs with the owner's rights, takes who is asking from the transaction settings, and
-- raises 'domain:<code>' for the domain layer to turn into a DomainError. It revokes only live invites of organisations the caller manages.
CREATE FUNCTION public.app_issue_tenant_invite(
  p_org_id uuid, p_email text, p_name text, p_job_title text, p_phone text, p_role public.member_role, p_alias text,
  p_token_hash text, p_expires_at timestamptz, p_allow_placeholder boolean, p_link text, p_subject text, p_body text, p_params jsonb
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_me uuid := public.app_current_org_id();
  v_org public.organisation%ROWTYPE;
  v_placeholder boolean;
  v_alias text;
  v_id uuid;
BEGIN
  IF v_me IS NULL OR NOT public.app_caller_is_manager() THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_org FROM public.organisation o WHERE o.id = p_org_id AND (o.id = v_me OR o.parent_org_id = v_me);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'domain:not-authorised' USING ERRCODE = '42501';
  END IF;
  IF v_org.status <> 'active' THEN RAISE EXCEPTION 'domain:organisation-archived'; END IF;
  IF EXISTS (SELECT 1 FROM public."user" u WHERE u.email = p_email) THEN RAISE EXCEPTION 'domain:email-in-use'; END IF;
  SELECT t.placeholder INTO v_placeholder FROM public.terms_document t WHERE t.party = v_org.kind AND t.status = 'current';
  IF NOT FOUND THEN RAISE EXCEPTION 'domain:no-current-terms'; END IF;
  IF v_placeholder AND NOT p_allow_placeholder THEN RAISE EXCEPTION 'domain:placeholder-terms'; END IF;

  WITH revoked AS (
    UPDATE public.invite i SET revoked_at = now()
    WHERE i.email = p_email AND i.redeemed_at IS NULL AND i.revoked_at IS NULL
      AND (i.org_id = v_me OR EXISTS (SELECT 1 FROM public.organisation o WHERE o.id = i.org_id AND o.parent_org_id = v_me))
    RETURNING i.id
  )
  UPDATE public.email_outbox e SET status = 'cancelled', link = NULL, last_error = 'the invite was revoked'
  WHERE e.status = 'pending' AND e.invite_id IN (SELECT id FROM revoked);

  IF v_org.kind = 'agency' THEN
    v_alias := COALESCE(NULLIF(btrim(p_alias), ''), p_name);
    IF EXISTS (SELECT 1 FROM public.agency_alias a WHERE lower(a.alias) = lower(v_alias))
      OR EXISTS (SELECT 1 FROM public.invite i WHERE lower(i.alias) = lower(v_alias) AND i.redeemed_at IS NULL AND i.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'domain:alias-taken';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.invite (org_id, org_kind, email, name, job_title, phone, role, alias, token_hash, expires_at, created_by)
    VALUES (v_org.id, v_org.kind, p_email, p_name, p_job_title, p_phone, p_role, v_alias, p_token_hash, p_expires_at, public.app_current_user_id())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'domain:invite-conflict';
  END;

  INSERT INTO public.email_outbox (recipient, template, subject, body, params, link, invite_id)
  VALUES (p_email, 'invite', p_subject, p_body, p_params, p_link, v_id);
  RETURN v_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_issue_tenant_invite(uuid, text, text, text, text, public.member_role, text, text, timestamptz, boolean, text, text, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_issue_tenant_invite(uuid, text, text, text, text, public.member_role, text, text, timestamptz, boolean, text, text, text, jsonb) TO leads_client, leads_agency;
