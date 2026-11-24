import "server-only";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import type { Database } from "@/server/db/pool";
import type { MessagingActor } from "@/server/domain/messaging-core";

/** The signed-in person as the messaging and notice domain wants them, with the database pool of their own role. Null when nobody is signed in. */
export async function currentMessagingActor(): Promise<{ readonly actor: MessagingActor; readonly db: Database } | null> {
  const context = await getSessionContext();
  if (context === null) return null;
  return {
    db: getDatabase(context.role).db,
    actor: { userId: context.userId, orgId: context.kind === "fynix" ? null : context.orgId, orgKind: context.kind, role: context.memberRole, displayName: context.name },
  };
}
