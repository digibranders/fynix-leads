-- The brief of a campaign (who to reach, how a lead is qualified, the instructions) is what a supplier or partner agency needs in order
-- to find and qualify the right prospects, so the agency role may now read it, for the campaigns row-level security already shows it.
-- A client wrote the brief with Fynix and gets no new access. `internal_notes`, `time_zone` and `meeting_minutes` stay Fynix only.
GRANT SELECT ("geography", "industries", "company_size", "icp", "job_titles", "seniority", "technologies", "bant_budget", "bant_authority", "bant_need", "bant_timeline", "instructions")
  ON "campaign" TO leads_agency;
