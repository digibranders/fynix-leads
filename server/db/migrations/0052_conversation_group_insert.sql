-- The ORM lists every column of `conversation` in an INSERT, now including group_id (0051), so the roles that open ordinary threads
-- need INSERT on it. They cannot use it to make a group conversation: their insert policies only admit the client and supplier sides.
GRANT INSERT ("group_id") ON "conversation" TO leads_client, leads_agency;
