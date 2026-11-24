-- A client's decline sets closed_at. Migration 0034 left that column out of the client's UPDATE grant, so every decline failed
-- with "permission denied for table lead". Additive: a wider grant changes nothing for a process that is already running.
GRANT UPDATE ("closed_at") ON "lead" TO leads_client;
