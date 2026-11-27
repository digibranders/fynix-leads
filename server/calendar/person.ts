import { and, eq } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { member } from "@/server/db/schema";

/** Who is asking: a signed-in person, by user and organisation kind. A Fynix person is a member of the Fynix organisation, which the session does not name, so `orgId` is null for them. */
export interface PersonRef {
  readonly userId: string;
  readonly kind: "client" | "agency" | "fynix";
  readonly orgId: string | null;
}

export const personWhere = (who: PersonRef) => and(eq(member.userId, who.userId), eq(member.orgKind, who.kind), who.orgId === null ? undefined : eq(member.orgId, who.orgId), eq(member.status, "active"));

/** The member a signed-in person is in their own organisation, or null. */
export async function memberIdOf(authDb: Database, who: PersonRef): Promise<string | null> {
  const [row] = await authDb.select({ id: member.id }).from(member).where(personWhere(who)).limit(1);
  return row?.id ?? null;
}
