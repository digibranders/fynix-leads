-- A supplier manager sets the shares of its own campaigns (policy campaign_share_agency_own, 0032), but the trigger that checks the agency
-- belongs to the supplier's tree (0024) ran as the calling role, which cannot read campaign.agency_org_id or organisation.parent_org_id,
-- so every tenant insert failed with "permission denied for table campaign". The check now runs with its owner's rights, like the other
-- cross-table checks. It only reads two ids and refuses or passes; it returns nothing to the caller.
ALTER FUNCTION public.campaign_share_check_agency() SECURITY DEFINER;
