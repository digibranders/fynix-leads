-- An audit row must be written by an active member of the Fynix organisation. 0012 only tied the row to the request's
-- scope (app.user_id), so a client user's id, a suspended Fynix member's id or an id that belongs to nobody could still
-- append one, and with it satisfy audit_required for a change of its own. The policy now also looks the actor up in
-- `member`. leads_fynix may read every column of `member` (0016), so the check needs no SECURITY DEFINER function.
DROP POLICY "audit_log_fynix_append" ON "audit_log";
--> statement-breakpoint
CREATE POLICY "audit_log_fynix_append" ON "audit_log" AS PERMISSIVE FOR INSERT TO leads_fynix
  WITH CHECK (
    "actor_user_id" = public.app_current_user_id()
    AND "actor_role" = current_user::text
    AND EXISTS (
      SELECT 1 FROM public."member" m
      WHERE m."user_id" = "audit_log"."actor_user_id" AND m."org_kind" = 'fynix' AND m."status" = 'active'
    )
  );
