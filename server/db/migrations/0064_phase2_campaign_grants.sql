-- Phase 2: one agreement per campaign, the going-live rule, client brief, host self-service and alias clients.
-- All additive. Rows with party 'supplier' stay in `agreement` and are no longer created or read.

-- 1. The one agreement. The client-party row is the campaign agreement. The client and the coordinator (the supplier) both accept it;
-- `agreement_acceptance.side` says which. Each side reads only its own acceptances (the user ids stay inside the side); the other
-- side's time comes through app_agreement_acceptance_times below.
GRANT SELECT ("side") ON "agreement_acceptance" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT INSERT ("side") ON "agreement_acceptance" TO leads_client, leads_agency;
--> statement-breakpoint
DROP POLICY "agreement_acceptance_client_own" ON "agreement_acceptance";
--> statement-breakpoint
CREATE POLICY "agreement_acceptance_client_own" ON "agreement_acceptance" AS PERMISSIVE FOR ALL TO leads_client
  USING (
    "side" = 'client' AND EXISTS (
      SELECT 1 FROM public.agreement a
      JOIN public.campaign c ON c.id = a.campaign_id
      WHERE a.id = "agreement_acceptance"."agreement_id"
        AND a.party = 'client'
        AND c.client_org_id = public.app_current_org_id()
    )
  )
  WITH CHECK (
    "side" = 'client' AND "user_id" = public.app_current_user_id() AND EXISTS (
      SELECT 1 FROM public.agreement a
      JOIN public.campaign c ON c.id = a.campaign_id
      JOIN public.member m ON m.org_id = c.client_org_id
      WHERE a.id = "agreement_acceptance"."agreement_id"
        AND a.party = 'client'
        AND a.status = 'current'
        AND c.client_org_id = public.app_current_org_id()
        AND m.user_id = public.app_current_user_id()
        AND m.role = 'manager'
        AND m.status = 'active'
    )
  );
--> statement-breakpoint
DROP POLICY "agreement_acceptance_agency_own" ON "agreement_acceptance";
--> statement-breakpoint
CREATE POLICY "agreement_acceptance_agency_own" ON "agreement_acceptance" AS PERMISSIVE FOR ALL TO leads_agency
  USING (
    "side" = 'supplier' AND EXISTS (
      SELECT 1 FROM public.agreement a
      JOIN public.campaign c ON c.id = a.campaign_id
      WHERE a.id = "agreement_acceptance"."agreement_id"
        AND a.party = 'client'
        AND c.agency_org_id = public.app_current_org_id()
    )
  )
  WITH CHECK (
    "side" = 'supplier' AND "user_id" = public.app_current_user_id() AND EXISTS (
      SELECT 1 FROM public.agreement a
      JOIN public.campaign c ON c.id = a.campaign_id
      JOIN public.member m ON m.org_id = c.agency_org_id
      WHERE a.id = "agreement_acceptance"."agreement_id"
        AND a.party = 'client'
        AND a.status = 'current'
        AND c.agency_org_id = public.app_current_org_id()
        AND m.user_id = public.app_current_user_id()
        AND m.role = 'manager'
        AND m.status = 'active'
    )
  );
--> statement-breakpoint
-- The coordinator (not a partner agency) reads the campaign agreement.
CREATE POLICY "agreement_agency_supplier_read" ON "agreement" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (
    "party" = 'client' AND EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "agreement"."campaign_id" AND c.agency_org_id = public.app_current_org_id()
    )
  );
--> statement-breakpoint
-- When each side accepted a version of one of the caller's campaign agreements: the side and the time, never a person.
CREATE FUNCTION public.app_agreement_acceptance_times(p_agreement uuid) RETURNS TABLE (side text, accepted_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT x.side, min(x.accepted_at)
    FROM public.agreement_acceptance x
    JOIN public.agreement a ON a.id = x.agreement_id
    JOIN public.campaign c ON c.id = a.campaign_id
    WHERE a.id = p_agreement AND a.party = 'client'
      AND (c.client_org_id = public.app_current_org_id() OR c.agency_org_id = public.app_current_org_id())
    GROUP BY x.side
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_agreement_acceptance_times(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_agreement_acceptance_times(uuid) TO leads_client, leads_agency;
--> statement-breakpoint
-- When both sides have accepted a version of the agreement, its numbers become the campaign's number (the one number). A new version that is
-- not yet accepted by both changes nothing: the old numbers stay in force. The campaign row is written with the owner's rights because the
-- tenant that accepts last holds no grant on campaign.
CREATE FUNCTION public.agreement_acceptance_apply_numbers() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agreement_acceptance x WHERE x.agreement_id = NEW.agreement_id AND x.side <> NEW.side) THEN
    UPDATE public.campaign c
       SET monthly_target = a.monthly_target, total_target = a.total_target
      FROM public.agreement a
     WHERE a.id = NEW.agreement_id AND a.party = 'client' AND c.id = a.campaign_id
       AND (c.monthly_target <> a.monthly_target OR c.total_target <> a.total_target);
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.agreement_acceptance_apply_numbers() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER agreement_acceptance_apply_numbers AFTER INSERT ON "agreement_acceptance"
  FOR EACH ROW EXECUTE FUNCTION public.agreement_acceptance_apply_numbers();
--> statement-breakpoint

-- 2. The going-live rule. `agreed`: some version of the campaign agreement has been accepted by both sides (the newest such version is in
-- force, even after a newer one is published). Without one, `client_accepted` and `supplier_accepted` say who has accepted the newest version.
CREATE FUNCTION public.campaign_go_live_state(p_campaign uuid) RETURNS TABLE (agreed boolean, client_accepted boolean, supplier_accepted boolean, has_host boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    WITH versions AS (
      SELECT a.version,
        EXISTS (SELECT 1 FROM public.agreement_acceptance x WHERE x.agreement_id = a.id AND x.side = 'client') AS client_done,
        EXISTS (SELECT 1 FROM public.agreement_acceptance x WHERE x.agreement_id = a.id AND x.side = 'supplier') AS supplier_done
      FROM public.agreement a
      WHERE a.campaign_id = p_campaign AND a.party = 'client'
    ), forced AS (
      SELECT EXISTS (SELECT 1 FROM versions WHERE client_done AND supplier_done) AS yes
    ), newest AS (
      SELECT client_done, supplier_done FROM versions ORDER BY version DESC LIMIT 1
    )
    SELECT forced.yes,
           forced.yes OR COALESCE((SELECT client_done FROM newest), false),
           forced.yes OR COALESCE((SELECT supplier_done FROM newest), false),
           EXISTS (
             SELECT 1 FROM public.campaign_host h JOIN public.member m ON m.id = h.member_id
             WHERE h.campaign_id = p_campaign AND h.active AND m.status = 'active'
           )
    FROM forced
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.campaign_go_live_state(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.campaign_go_live_state(uuid) TO leads_fynix;
--> statement-breakpoint
-- For an agency's lead form: why each of its campaigns is not live yet. Reasons as flags only; no names, no people.
CREATE FUNCTION public.app_my_campaign_readiness() RETURNS TABLE (campaign_id uuid, status text, client_accepted boolean, supplier_accepted boolean, has_host boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT c.id, c.status::text, s.client_accepted, s.supplier_accepted, s.has_host
    FROM public.campaign c, LATERAL public.campaign_go_live_state(c.id) s
    WHERE public.app_agency_sees_campaign(c.id)
    ORDER BY c.name
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_my_campaign_readiness() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_my_campaign_readiness() TO leads_agency;
--> statement-breakpoint

-- 3. A client reads the brief of its own campaigns (it wrote it with Fynix). `internal_notes`, the time zone and the meeting length stay Fynix only.
GRANT SELECT ("geography", "industries", "company_size", "icp", "job_titles", "seniority", "technologies", "bant_budget", "bant_authority", "bant_need", "bant_timeline", "instructions")
  ON "campaign" TO leads_client;
--> statement-breakpoint

-- 4. Hosts: everyone in the client's organisation still reads its people's hours and blocked times, but only the person themself or a client
-- manager writes them. (0032 let any member write any member's.)
DROP POLICY "host_hours_client_own" ON "host_hours";
--> statement-breakpoint
CREATE POLICY "host_hours_client_read" ON "host_hours" AS PERMISSIVE FOR SELECT TO leads_client
  USING (EXISTS (SELECT 1 FROM public.member m WHERE m.id = "host_hours"."member_id" AND m.org_id = public.app_current_org_id()));
--> statement-breakpoint
CREATE POLICY "host_hours_client_insert" ON "host_hours" AS PERMISSIVE FOR INSERT TO leads_client
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.member m
    WHERE m.id = "host_hours"."member_id" AND m.org_id = public.app_current_org_id() AND m.status = 'active'
      AND (m.user_id = public.app_current_user_id() OR EXISTS (
        SELECT 1 FROM public.member me WHERE me.user_id = public.app_current_user_id() AND me.org_id = public.app_current_org_id() AND me.role = 'manager' AND me.status = 'active'))
  ));
--> statement-breakpoint
CREATE POLICY "host_hours_client_delete" ON "host_hours" AS PERMISSIVE FOR DELETE TO leads_client
  USING (EXISTS (
    SELECT 1 FROM public.member m
    WHERE m.id = "host_hours"."member_id" AND m.org_id = public.app_current_org_id()
      AND (m.user_id = public.app_current_user_id() OR EXISTS (
        SELECT 1 FROM public.member me WHERE me.user_id = public.app_current_user_id() AND me.org_id = public.app_current_org_id() AND me.role = 'manager' AND me.status = 'active'))
  ));
--> statement-breakpoint
DROP POLICY "host_block_client_own" ON "host_block";
--> statement-breakpoint
CREATE POLICY "host_block_client_read" ON "host_block" AS PERMISSIVE FOR SELECT TO leads_client
  USING (EXISTS (SELECT 1 FROM public.member m WHERE m.id = "host_block"."member_id" AND m.org_id = public.app_current_org_id()));
--> statement-breakpoint
CREATE POLICY "host_block_client_insert" ON "host_block" AS PERMISSIVE FOR INSERT TO leads_client
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.member m
    WHERE m.id = "host_block"."member_id" AND m.org_id = public.app_current_org_id() AND m.status = 'active'
      AND (m.user_id = public.app_current_user_id() OR EXISTS (
        SELECT 1 FROM public.member me WHERE me.user_id = public.app_current_user_id() AND me.org_id = public.app_current_org_id() AND me.role = 'manager' AND me.status = 'active'))
  ));
--> statement-breakpoint
CREATE POLICY "host_block_client_delete" ON "host_block" AS PERMISSIVE FOR DELETE TO leads_client
  USING (EXISTS (
    SELECT 1 FROM public.member m
    WHERE m.id = "host_block"."member_id" AND m.org_id = public.app_current_org_id()
      AND (m.user_id = public.app_current_user_id() OR EXISTS (
        SELECT 1 FROM public.member me WHERE me.user_id = public.app_current_user_id() AND me.org_id = public.app_current_org_id() AND me.role = 'manager' AND me.status = 'active'))
  ));
--> statement-breakpoint

-- 5. An alias is for a client picked from the clients of the campaigns the agency sees. The trigger refuses any other client and copies the
-- client's brand into client_brand_name (the value campaign.client_brand_name holds), so lead submission and every older reader keep working.
GRANT SELECT ("client_org_id") ON "alias_identity" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ("client_org_id") ON "alias_identity" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("client_org_id", "updated_at") ON "alias_identity" TO leads_agency;
--> statement-breakpoint
CREATE FUNCTION public.alias_identity_set_client() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_brand text;
BEGIN
  IF NEW.client_org_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(o.brand_name, o.name) INTO v_brand FROM public.organisation o WHERE o.id = NEW.client_org_id AND o.kind = 'client';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'alias_client_unknown: an alias is for a client' USING ERRCODE = '23514';
  END IF;
  IF session_user = 'leads_agency' AND NOT EXISTS (
    SELECT 1 FROM public.campaign c WHERE c.client_org_id = NEW.client_org_id AND public.app_agency_sees_campaign(c.id)
  ) THEN
    RAISE EXCEPTION 'alias_client_not_assigned: an alias is for a client of a campaign your organisation is assigned to' USING ERRCODE = '42501';
  END IF;
  NEW.client_brand_name := v_brand;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.alias_identity_set_client() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER alias_identity_set_client BEFORE INSERT OR UPDATE OF client_org_id ON "alias_identity"
  FOR EACH ROW EXECUTE FUNCTION public.alias_identity_set_client();
