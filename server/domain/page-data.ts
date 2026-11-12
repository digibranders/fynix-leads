import "server-only";
import { headers } from "next/headers";
import { clientAddressFrom } from "@/server/auth/client-address";
import { getDomain } from "@/server/domain";
import { previewInvite, type InvitePreview } from "@/server/domain/invites";

/**
 * What the accept-invite page reads for a link: the state of the invite and, when it is usable, the person's name, address,
 * party and the current terms (`previewInvite`). Called from the page inside a `<Suspense>` boundary, because with Cache
 * Components the request's headers are request-time data. A missing token is answered like a wrong one.
 */
export async function loadInvitePage(token: string | undefined): Promise<InvitePreview> {
  return previewInvite(getDomain(), { token: token ?? "", address: clientAddressFrom(await headers()) });
}
