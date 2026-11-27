ALTER TABLE "campaign" ADD COLUMN "qualifying_items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "qualification_checks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "qualification_notes" text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- The questions are for the people who run the campaign, like the rest of the set-up answers (0084): the coordinator, its agencies and the client read them.
GRANT SELECT ("qualifying_items") ON "campaign" TO leads_agency, leads_client;
--> statement-breakpoint
-- The lead checklist is read by the three sides of a lead (the source agency, the client and Fynix, whose table grant already covers it) and written by the source
-- agency. Drizzle names every column in an INSERT (see 0067), so the agency holds INSERT on both.
GRANT SELECT ("qualification_checks", "qualification_notes") ON "lead" TO leads_agency, leads_client;
--> statement-breakpoint
GRANT INSERT ("qualification_checks", "qualification_notes") ON "lead" TO leads_agency;
--> statement-breakpoint
GRANT UPDATE ("qualification_checks", "qualification_notes") ON "lead" TO leads_agency;
--> statement-breakpoint
-- The trigger of 0069 limits the columns an agency may change to a lead that is still a draft. The checklist joins them: once a lead is sent, it is fixed.
CREATE OR REPLACE FUNCTION public.lead_agency_draft_only() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF current_user = 'leads_agency' AND OLD.stage <> 'draft' AND (
       NEW.prospect_name IS DISTINCT FROM OLD.prospect_name OR NEW.prospect_title IS DISTINCT FROM OLD.prospect_title
    OR NEW.prospect_company IS DISTINCT FROM OLD.prospect_company OR NEW.prospect_domain IS DISTINCT FROM OLD.prospect_domain
    OR NEW.prospect_linkedin_url IS DISTINCT FROM OLD.prospect_linkedin_url OR NEW.prospect_email IS DISTINCT FROM OLD.prospect_email
    OR NEW.prospect_phone IS DISTINCT FROM OLD.prospect_phone OR NEW.prospect_notes IS DISTINCT FROM OLD.prospect_notes
    OR NEW.bant_budget IS DISTINCT FROM OLD.bant_budget OR NEW.bant_authority IS DISTINCT FROM OLD.bant_authority
    OR NEW.bant_need IS DISTINCT FROM OLD.bant_need OR NEW.bant_timeline IS DISTINCT FROM OLD.bant_timeline
    OR NEW.qualification_checks IS DISTINCT FROM OLD.qualification_checks OR NEW.qualification_notes IS DISTINCT FROM OLD.qualification_notes
    OR NEW.alias_identity_id IS DISTINCT FROM OLD.alias_identity_id OR NEW.host_member_id IS DISTINCT FROM OLD.host_member_id
    OR NEW.over_share IS DISTINCT FROM OLD.over_share OR NEW.duplicate_override IS DISTINCT FROM OLD.duplicate_override
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.released IS DISTINCT FROM OLD.released
  ) THEN
    RAISE EXCEPTION 'lead_draft_only: only a draft can be edited by an agency' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
