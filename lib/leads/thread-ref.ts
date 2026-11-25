/** A lead's thread is titled "Lead LEAD-XXXX". Its reference, or null for any other thread. */
export function leadRefFromSubject(subject: string | null): string | null {
  const match = subject === null ? null : /^Lead (\S+)$/.exec(subject);
  return match?.[1] ?? null;
}

/** The Messages page of a portal and the address that opens one thread in it. A coordinator is the only agency with a thread with Fynix. */
export function threadHref(kind: "client" | "agency" | "fynix", conversationId: string): string {
  const page = kind === "client" ? "/client/messages" : kind === "fynix" ? "/fynix/inbox" : "/coordinator/messages";
  return `${page}?conv=${encodeURIComponent(conversationId)}`;
}
