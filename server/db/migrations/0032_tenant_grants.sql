-- Tenant grants and row-level security policies for client and agency roles (Phase 1E).
-- Enforces strict role isolation for agreements, shares, hosts, availability, member reads, partner agency management, and invites.

-- 1. member: tenant roles read their organisation-mates
GRANT SELECT ("id", "user_id", "org_id", "org_kind", "role", "display_name", "status", "created_at") ON "member" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "member_client_own" ON "member" AS PERMISSIVE FOR SELECT TO leads_client
  USING ("org_id" = public.app_current_org_id());
--> statement-breakpoint
CREATE POLICY "member_agency_own" ON "member" AS PERMISSIVE FOR SELECT TO leads_agency
  USING ("org_id" = public.app_current_org_id());
--> statement-breakpoint

-- 2. agreement: client reads its client agreements, agency reads its supplier agreements
GRANT SELECT ("id", "public_ref", "campaign_id", "party", "monthly_target", "total_target", "dispute_window_hours", "rules", "version", "status", "created_at") ON "agreement" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "agreement_client_own" ON "agreement" AS PERMISSIVE FOR SELECT TO leads_client
  USING (
    "party" = 'client' AND EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "agreement"."campaign_id" AND c.client_org_id = public.app_current_org_id()
    )
  );
--> statement-breakpoint
CREATE POLICY "agreement_agency_own" ON "agreement" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (
    "party" = 'supplier' AND EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "agreement"."campaign_id" AND (
        c.agency_org_id = public.app_current_org_id() OR
        EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id())
      )
    )
  );
--> statement-breakpoint

-- 3. agreement_acceptance: tenant managers accept current agreements
GRANT SELECT ("id", "agreement_id", "accepted_by_user_id", "accepted_at") ON "agreement_acceptance" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT INSERT ("agreement_id", "accepted_by_user_id", "network_address") ON "agreement_acceptance" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "agreement_acceptance_client_own" ON "agreement_acceptance" AS PERMISSIVE FOR ALL TO leads_client
  USING (
    EXISTS (
      SELECT 1 FROM public.agreement a
      JOIN public.campaign c ON c.id = a.campaign_id
      WHERE a.id = "agreement_acceptance"."agreement_id"
        AND a.party = 'client'
        AND c.client_org_id = public.app_current_org_id()
    )
  )
  WITH CHECK (
    "accepted_by_user_id" = public.app_current_user_id() AND
    EXISTS (
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
CREATE POLICY "agreement_acceptance_agency_own" ON "agreement_acceptance" AS PERMISSIVE FOR ALL TO leads_agency
  USING (
    EXISTS (
      SELECT 1 FROM public.agreement a
      JOIN public.campaign c ON c.id = a.campaign_id
      WHERE a.id = "agreement_acceptance"."agreement_id"
        AND a.party = 'supplier'
        AND c.agency_org_id = public.app_current_org_id()
    )
  )
  WITH CHECK (
    "accepted_by_user_id" = public.app_current_user_id() AND
    EXISTS (
      SELECT 1 FROM public.agreement a
      JOIN public.campaign c ON c.id = a.campaign_id
      JOIN public.member m ON m.org_id = c.agency_org_id
      WHERE a.id = "agreement_acceptance"."agreement_id"
        AND a.party = 'supplier'
        AND a.status = 'current'
        AND c.agency_org_id = public.app_current_org_id()
        AND m.user_id = public.app_current_user_id()
        AND m.role = 'manager'
        AND m.status = 'active'
    )
  );
--> statement-breakpoint

-- 4. campaign_share: agency reads its shares, supplier manages shares
GRANT SELECT ("id", "campaign_id", "agency_org_id", "monthly_share", "created_at", "updated_at") ON "campaign_share" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ("campaign_id", "agency_org_id", "monthly_share") ON "campaign_share" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("monthly_share", "updated_at") ON "campaign_share" TO leads_agency;
--> statement-breakpoint
GRANT DELETE ON "campaign_share" TO leads_agency;
--> statement-breakpoint
CREATE POLICY "campaign_share_agency_own" ON "campaign_share" AS PERMISSIVE FOR ALL TO leads_agency
  USING (
    "agency_org_id" = public.app_current_org_id() OR
    EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "campaign_share"."campaign_id" AND c.agency_org_id = public.app_current_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign c
      JOIN public.member m ON m.org_id = c.agency_org_id
      WHERE c.id = "campaign_share"."campaign_id"
        AND c.agency_org_id = public.app_current_org_id()
        AND m.user_id = public.app_current_user_id()
        AND m.role = 'manager'
        AND m.status = 'active'
    )
  );
--> statement-breakpoint

-- 5. campaign_host: client manages hosts, agency reads active hosts
GRANT SELECT ("id", "campaign_id", "member_id", "job_title", "active", "created_at") ON "campaign_host" TO leads_client, leads_agency;
--> statement-breakpoint
GRANT INSERT ("campaign_id", "member_id", "client_org_id", "job_title", "active") ON "campaign_host" TO leads_client;
--> statement-breakpoint
GRANT UPDATE ("job_title", "active") ON "campaign_host" TO leads_client;
--> statement-breakpoint
CREATE POLICY "campaign_host_client_own" ON "campaign_host" AS PERMISSIVE FOR ALL TO leads_client
  USING ("client_org_id" = public.app_current_org_id())
  WITH CHECK (
    "client_org_id" = public.app_current_org_id() AND
    EXISTS (
      SELECT 1 FROM public.member m
      WHERE m.user_id = public.app_current_user_id() AND m.org_id = public.app_current_org_id() AND m.role = 'manager' AND m.status = 'active'
    )
  );
--> statement-breakpoint
CREATE POLICY "campaign_host_agency_read" ON "campaign_host" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (
    "active" = true AND EXISTS (
      SELECT 1 FROM public.campaign c
      WHERE c.id = "campaign_host"."campaign_id" AND (
        c.agency_org_id = public.app_current_org_id() OR
        EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id())
      )
    )
  );
--> statement-breakpoint

-- 6. host_hours & host_block: client manages, agency reads active host hours & block windows
GRANT SELECT ("id", "member_id", "weekday", "start_minute", "end_minute", "time_zone", "created_at") ON "host_hours" TO leads_client;
--> statement-breakpoint
GRANT INSERT ("member_id", "weekday", "start_minute", "end_minute", "time_zone") ON "host_hours" TO leads_client;
--> statement-breakpoint
GRANT DELETE ON "host_hours" TO leads_client;
--> statement-breakpoint
GRANT SELECT ("id", "member_id", "starts_at", "ends_at", "note", "created_at") ON "host_block" TO leads_client;
--> statement-breakpoint
GRANT INSERT ("member_id", "starts_at", "ends_at", "note") ON "host_block" TO leads_client;
--> statement-breakpoint
GRANT DELETE ON "host_block" TO leads_client;
--> statement-breakpoint
CREATE POLICY "host_hours_client_own" ON "host_hours" AS PERMISSIVE FOR ALL TO leads_client
  USING (EXISTS (SELECT 1 FROM public.member m WHERE m.id = "host_hours"."member_id" AND m.org_id = public.app_current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.member m WHERE m.id = "host_hours"."member_id" AND m.org_id = public.app_current_org_id()));
--> statement-breakpoint
CREATE POLICY "host_block_client_own" ON "host_block" AS PERMISSIVE FOR ALL TO leads_client
  USING (EXISTS (SELECT 1 FROM public.member m WHERE m.id = "host_block"."member_id" AND m.org_id = public.app_current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.member m WHERE m.id = "host_block"."member_id" AND m.org_id = public.app_current_org_id()));
--> statement-breakpoint
GRANT SELECT ("id", "member_id", "weekday", "start_minute", "end_minute", "time_zone") ON "host_hours" TO leads_agency;
--> statement-breakpoint
GRANT SELECT ("id", "member_id", "starts_at", "ends_at") ON "host_block" TO leads_agency;
--> statement-breakpoint
CREATE POLICY "host_hours_agency_read" ON "host_hours" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_host ch
      JOIN public.campaign c ON c.id = ch.campaign_id
      WHERE ch.member_id = "host_hours"."member_id" AND ch.active = true AND (
        c.agency_org_id = public.app_current_org_id() OR
        EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id())
      )
    )
  );
--> statement-breakpoint
CREATE POLICY "host_block_agency_read" ON "host_block" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_host ch
      JOIN public.campaign c ON c.id = ch.campaign_id
      WHERE ch.member_id = "host_block"."member_id" AND ch.active = true AND (
        c.agency_org_id = public.app_current_org_id() OR
        EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id())
      )
    )
  );
--> statement-breakpoint

-- 7. organisation & invite: supplier creates and manages partner agencies and their invites
GRANT SELECT ("parent_org_id") ON "organisation" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ("public_ref", "kind", "name", "parent_org_id") ON "organisation" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("name", "status") ON "organisation" TO leads_agency;
--> statement-breakpoint
CREATE POLICY "organisation_supplier_manage_partners" ON "organisation" AS PERMISSIVE FOR ALL TO leads_agency
  USING ("parent_org_id" = public.app_current_org_id())
  WITH CHECK (
    "parent_org_id" = public.app_current_org_id() AND
    "kind" = 'agency' AND
    EXISTS (
      SELECT 1 FROM public.member m
      WHERE m.user_id = public.app_current_user_id() AND m.org_id = public.app_current_org_id() AND m.role = 'manager' AND m.status = 'active'
    )
  );
--> statement-breakpoint
GRANT SELECT ("id", "public_ref", "org_id", "email", "role", "expires_at", "redeemed_at", "revoked_at", "created_at") ON "invite" TO leads_agency;
--> statement-breakpoint
GRANT INSERT ("public_ref", "org_id", "email", "role", "token_hash", "expires_at", "created_by_user_id") ON "invite" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("revoked_at") ON "invite" TO leads_agency;
--> statement-breakpoint
CREATE POLICY "invite_agency_manage" ON "invite" AS PERMISSIVE FOR ALL TO leads_agency
  USING (
    "org_id" = public.app_current_org_id() OR
    EXISTS (SELECT 1 FROM public.organisation o WHERE o.id = "invite"."org_id" AND o.parent_org_id = public.app_current_org_id())
  )
  WITH CHECK (
    ("org_id" = public.app_current_org_id() OR
     EXISTS (SELECT 1 FROM public.organisation o WHERE o.id = "invite"."org_id" AND o.parent_org_id = public.app_current_org_id())) AND
    EXISTS (
      SELECT 1 FROM public.member m
      WHERE m.user_id = public.app_current_user_id() AND m.org_id = public.app_current_org_id() AND m.role = 'manager' AND m.status = 'active'
    )
  );
