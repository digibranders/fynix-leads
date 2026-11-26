-- Calendar step C: the two new meeting columns (0097) can be written when a meeting is inserted, and read by no tenant. Drizzle lists every column of the table in an
-- insert, as DEFAULT, and Postgres checks the insert privilege of every column listed, so without this a client or an agency could not book a meeting at all. The
-- same pattern as the room and calendar file columns of 0075: insert only, no select, so the leak probes of the two columns still hold.
GRANT INSERT ("confirmed_at", "reply_due_at") ON "meeting" TO leads_client, leads_agency;
