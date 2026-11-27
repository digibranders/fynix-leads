-- A Fynix admin may change a person's role (member or manager; admin or staff in the Fynix organisation). The column grant is all that is new: the row policy
-- and the admin-only and audit triggers on member already cover every write Fynix makes. No tenant role gains anything.
GRANT UPDATE ("role") ON "member" TO leads_fynix;
