import type { FirstInvite } from "@/server/domain/coordinators";
import { domainMessage } from "@/server/fynix/errors";

/** What to tell the person when the organisation was added but its first invite was refused. `undefined` when there is nothing to say. */
export function firstInviteNotice(label: "coordinator" | "agency", result: FirstInvite): string | undefined {
  if (result.status !== "failed") return undefined;
  const reason = result.code === null ? "something went wrong, so invite them again from the page." : domainMessage(result.code);
  return `The ${label} was added, but the invite was not sent: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}
