import "server-only";
import { getDomain } from "@/server/domain";
import { readSettings } from "@/server/domain/settings-overview";
import type { FynixView } from "@/server/fynix/session";

/** Whether no terms are published for a side yet. An invite to that side cannot go out until they are. */
export async function termsMissing(view: FynixView, party: "client" | "agency" | "fynix"): Promise<boolean> {
  const { terms } = await readSettings(getDomain(), view.actor);
  return !terms.some((row) => row.party === party);
}
