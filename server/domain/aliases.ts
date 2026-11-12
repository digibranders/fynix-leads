import { and, isNull, ne, sql } from "drizzle-orm";
import { agencyAlias, invite } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { DomainError } from "@/server/domain/errors";

/**
 * An alias belongs to one person (the client must never see two people under one name). It is refused when another member
 * holds it or another live invite carries it, compared without regard to case. `exceptMemberId` is the member who is renaming
 * themselves: their own current alias is not a clash. The database repeats the first half (`agency_alias_alias_unique`).
 */
export async function requireFreeAlias(tx: ScopedTransaction, alias: string, exceptMemberId?: string): Promise<void> {
  const held = await tx
    .select({ id: agencyAlias.id })
    .from(agencyAlias)
    .where(and(sql`lower(${agencyAlias.alias}) = lower(${alias})`, exceptMemberId === undefined ? undefined : ne(agencyAlias.memberId, exceptMemberId)))
    .limit(1);
  const promised = await tx
    .select({ id: invite.id })
    .from(invite)
    .where(and(sql`lower(${invite.alias}) = lower(${alias})`, isNull(invite.redeemedAt), isNull(invite.revokedAt)))
    .limit(1);
  if (held.length > 0 || promised.length > 0) throw new DomainError("alias-taken", "Another person already has that alias.");
}
