-- The answers Fynix takes when a campaign is set up (migration 0083) are for the people who run it: the coordinator and its agencies use the
-- pitch, the qualifying questions and the two emails to find and qualify prospects, and the client wrote them with Fynix. Same two roles and the
-- same row-level policies as the rest of the brief (0054 and 0064). `primary_contact_id` stays Fynix only: it points at a table no tenant reads.
GRANT SELECT ("pitch_introduction", "pitch_services", "pitch_differentiator", "pitch_collaterals", "pitch_case_studies", "qualifying_questions", "first_email", "second_email")
  ON "campaign" TO leads_agency, leads_client;
