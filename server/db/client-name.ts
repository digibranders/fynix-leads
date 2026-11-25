import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * The client's name for the signed-in role (migration 0078). The database answers only where the role may know it: Fynix always, a client for its own,
 * an agency or coordinator for a client of a campaign it serves. Empty text means the role may not know it; every caller reads rows it can already see,
 * so in practice the name is there.
 */
export const campaignClientName = (campaignId: AnyPgColumn): SQL<string> => sql<string>`coalesce(public.app_campaign_client_name(${campaignId}), '')`;

/** The same for a client picked by id, as an alias is. */
export const clientNameOf = (clientId: AnyPgColumn): SQL<string> => sql<string>`coalesce(public.app_client_name(${clientId}), '')`;
