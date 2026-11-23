import "server-only";
import { headers } from "next/headers";
import { clientAddressFrom } from "@/server/auth/client-address";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { previewInvite, type InvitePreview } from "@/server/domain/invites";
import { isPartnerAgency } from "@/server/domain/org-role";

/**
 * What the accept-invite page reads for a link: the state of the invite and, when it is usable, the person's name, address,
 * party and the current terms (`previewInvite`). Called from the page inside a `<Suspense>` boundary, because with Cache
 * Components the request's headers are request-time data. A missing token is answered like a wrong one.
 */
export async function loadInvitePage(token: string | undefined): Promise<InvitePreview> {
  return previewInvite(getDomain(), { token: token ?? "", address: clientAddressFrom(await headers()) });
}

/**
 * Where a signed-in agency person starts: the partner-agency portal for a partner agency, the supplier portal for a supplier. Both are
 * `agency` organisations; the page asks here so it never touches the database itself.
 */
export async function agencyHomePath(person: { readonly userId: string; readonly orgId: string }): Promise<"/agency" | "/supplier"> {
  return (await isPartnerAgency(getDatabase("leads_agency").db, person)) ? "/agency" : "/supplier";
}
