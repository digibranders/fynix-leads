-- Posting a message moves the conversation's updated_at, so a role that may post must be able to update that one column of a
-- conversation it may see. Same rows as its SELECT policy.
GRANT UPDATE ("updated_at") ON "conversation" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "conversation_client_update" ON "conversation" AS PERMISSIVE FOR UPDATE TO leads_client
  USING ("client_org_id" = public.app_current_org_id() AND "side" = 'client_fynix')
  WITH CHECK ("client_org_id" = public.app_current_org_id() AND "side" = 'client_fynix');
--> statement-breakpoint
CREATE POLICY "conversation_agency_update" ON "conversation" AS PERMISSIVE FOR UPDATE TO leads_agency
  USING (
    ("supplier_org_id" = public.app_current_org_id() AND "side" IN ('supplier_fynix', 'supplier_agency')) OR
    ("agency_org_id" = public.app_current_org_id() AND "side" = 'supplier_agency')
  )
  WITH CHECK (
    ("supplier_org_id" = public.app_current_org_id() AND "side" IN ('supplier_fynix', 'supplier_agency')) OR
    ("agency_org_id" = public.app_current_org_id() AND "side" = 'supplier_agency')
  );
