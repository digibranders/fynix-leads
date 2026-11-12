import type { OrganisationKind } from "@/lib/auth/session-lifetime";

/** The one word the holding page shows for the kind of organisation a person belongs to. */
export const KIND_LABEL: Record<OrganisationKind, string> = { fynix: "Fynix", client: "Client", agency: "Agency" };

/** Up to two capital letters from a name, for the avatar: the first letters of the first and last words. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);
  const first = words[0];
  if (first === undefined) return "?";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return [...(first[0] ?? ""), ...(last?.[0] ?? "")].join("").toUpperCase();
}
