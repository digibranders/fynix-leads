import { randomFillSync } from "node:crypto";
import { sql } from "drizzle-orm";
import { generatePublicRef, type RandomBytes } from "@/lib/domain/public-ref";
import type { Database } from "@/server/db/pool";
import type { ScopedTransaction } from "@/server/db/scope";
import { appendAudit, type AuditEntry } from "@/server/domain/audit";
import { DomainError } from "@/server/domain/errors";
import { createGroupSchema, directChatSchema, groupIdSchema, groupMemberSchema, groupMembersSchema, markConversationReadSchema, renameGroupSchema } from "@/server/domain/inputs";
import { withActorScope, type MessagingActor } from "@/server/domain/messaging";
import { parseInput } from "@/server/domain/parse";

/**
 * Group chats (migration 0051). Every call goes through a database function that checks who is asking, so none of the rules below
 * can be bypassed by a mistake here: who may create a group, whom they may add, who may manage it, who is in it.
 */
export interface GroupCandidate {
  readonly userId: string;
  readonly displayName: string;
  readonly orgName: string;
  readonly roleLabel: string;
}

export interface GroupMemberView {
  readonly userId: string;
  readonly firstName: string;
  readonly roleLabel: string;
  readonly isCreator: boolean;
  readonly isMe: boolean;
}

export interface GroupInfo {
  readonly groupId: string;
  readonly name: string;
  readonly canManage: boolean;
  readonly memberCount: number;
  /** "direct" for a chat between two people: it cannot be renamed, added to or deleted, only left. */
  readonly kind: "group" | "direct";
}

/** The database refuses with a plain sentence (RAISE EXCEPTION); show that sentence, and nothing else from the database. */
function refusal(error: unknown): never {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const message = cause instanceof Error ? cause.message : "";
  if (/^You cannot|^A group|^Use leave/.test(message)) throw new DomainError("not-authorised", message);
  throw error;
}

/**
 * A group change touches `conversation`, and the database refuses a Fynix change to it at commit unless the same transaction
 * wrote an audit_log row (migration 0036). So a Fynix actor records one beside the change; tenant roles cannot write the log
 * and record nothing.
 */
async function withGroupWrite<T>(db: Database, actor: MessagingActor, entry: (result: T) => AuditEntry, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withActorScope(db, actor, async (tx) => {
    const result = await work(tx);
    if (actor.orgKind === "fynix") await appendAudit(tx, entry(result));
    return result;
  });
}

export async function canCreateGroup(db: Database, actor: MessagingActor): Promise<boolean> {
  return withActorScope(db, actor, async (tx) => {
    const result = await tx.execute<{ allowed: boolean }>(sql`select public.app_can_create_group() as allowed`);
    return result.rows[0]?.allowed === true;
  });
}

/** Who this person may put in a group, grouped for the picker. Empty for someone who cannot create groups. */
export async function listGroupCandidates(db: Database, actor: MessagingActor): Promise<readonly GroupCandidate[]> {
  return withActorScope(db, actor, async (tx) => {
    const result = await tx.execute<{ user_id: string; display_name: string; org_name: string; role_label: string }>(
      sql`select user_id, display_name, org_name, role_label from public.app_group_candidates()`,
    );
    return result.rows.map((row) => ({ userId: row.user_id, displayName: row.display_name, orgName: row.org_name, roleLabel: row.role_label }));
  });
}

/** Creates the group and its conversation, with the creator in it. Returns the conversation id, which the messages screen opens. */
export async function createGroup(db: Database, actor: MessagingActor, input: unknown, deps?: { randomBytes?: RandomBytes }): Promise<string> {
  const parsed = parseInput(createGroupSchema, input);
  const randomBytes = deps?.randomBytes ?? ((count: number) => randomFillSync(new Uint8Array(count)));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await withGroupWrite(db, actor, (id: string) => ({ action: "conversation.create", subject: { table: "conversation", id } }), async (tx) => {
        const result = await tx.execute<{ id: string }>(
          sql`select public.app_create_group(${generatePublicRef("GRP", randomBytes)}, ${generatePublicRef("MSG", randomBytes)}, ${parsed.name}, ${`{${parsed.memberIds.join(",")}}`}::uuid[]) as id`,
        );
        const id = result.rows[0]?.id;
        if (id === undefined) throw new DomainError("not-authorised", "The group could not be created.");
        return id;
      });
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      if (cause instanceof Error && /duplicate key value/.test(cause.message)) continue;
      return refusal(error);
    }
  }
  throw new DomainError("not-authorised", "The group could not be created. Try again.");
}

/** Opens the chat with one person, or the one already open with them. Returns the conversation id. */
export async function openDirectChat(db: Database, actor: MessagingActor, input: unknown, deps?: { randomBytes?: RandomBytes }): Promise<string> {
  const parsed = parseInput(directChatSchema, input);
  const randomBytes = deps?.randomBytes ?? ((count: number) => randomFillSync(new Uint8Array(count)));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await withGroupWrite(db, actor, (id: string) => ({ action: "conversation.open_direct", subject: { table: "conversation", id } }), async (tx) => {
        const result = await tx.execute<{ id: string }>(
          sql`select public.app_open_direct(${generatePublicRef("GRP", randomBytes)}, ${generatePublicRef("MSG", randomBytes)}, ${parsed.userId}::uuid) as id`,
        );
        const id = result.rows[0]?.id;
        if (id === undefined) throw new DomainError("not-authorised", "The chat could not be opened.");
        return id;
      });
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      if (cause instanceof Error && /duplicate key value/.test(cause.message)) continue;
      return refusal(error);
    }
  }
  throw new DomainError("not-authorised", "The chat could not be opened. Try again.");
}

export async function addGroupMembers(db: Database, actor: MessagingActor, input: unknown): Promise<number> {
  const parsed = parseInput(groupMembersSchema, input);
  try {
    return await withGroupWrite(db, actor, () => ({ action: "chat_group.update", subject: { table: "chat_group", id: parsed.groupId } }), async (tx) => {
      const result = await tx.execute<{ added: number }>(sql`select public.app_group_add_members(${parsed.groupId}::uuid, ${`{${parsed.memberIds.join(",")}}`}::uuid[]) as added`);
      return result.rows[0]?.added ?? 0;
    });
  } catch (error) {
    return refusal(error);
  }
}

export async function removeGroupMember(db: Database, actor: MessagingActor, input: unknown): Promise<void> {
  const parsed = parseInput(groupMemberSchema, input);
  try {
    await withGroupWrite(db, actor, () => ({ action: "chat_group.update", subject: { table: "chat_group", id: parsed.groupId } }), async (tx) => {
      await tx.execute(sql`select public.app_group_remove_member(${parsed.groupId}::uuid, ${parsed.userId}::uuid)`);
    });
  } catch (error) {
    refusal(error);
  }
}

export async function leaveGroup(db: Database, actor: MessagingActor, input: unknown): Promise<void> {
  const parsed = parseInput(groupIdSchema, input);
  await withGroupWrite(db, actor, () => ({ action: "chat_group.update", subject: { table: "chat_group", id: parsed.groupId } }), async (tx) => {
    await tx.execute(sql`select public.app_group_leave(${parsed.groupId}::uuid)`);
  });
}

export async function renameGroup(db: Database, actor: MessagingActor, input: unknown): Promise<void> {
  const parsed = parseInput(renameGroupSchema, input);
  try {
    await withGroupWrite(db, actor, () => ({ action: "chat_group.update", subject: { table: "chat_group", id: parsed.groupId } }), async (tx) => {
      await tx.execute(sql`select public.app_group_rename(${parsed.groupId}::uuid, ${parsed.name})`);
    });
  } catch (error) {
    refusal(error);
  }
}

export async function deleteGroup(db: Database, actor: MessagingActor, input: unknown): Promise<void> {
  const parsed = parseInput(groupIdSchema, input);
  try {
    await withGroupWrite(db, actor, () => ({ action: "chat_group.delete", subject: { table: "chat_group", id: parsed.groupId } }), async (tx) => {
      await tx.execute(sql`select public.app_group_delete(${parsed.groupId}::uuid)`);
    });
  } catch (error) {
    refusal(error);
  }
}

/** The people in a group, by first name and role. Nothing for someone who is not in it. */
export async function listGroupMembers(db: Database, actor: MessagingActor, groupId: string): Promise<readonly GroupMemberView[]> {
  const parsed = parseInput(groupIdSchema, { groupId });
  return withActorScope(db, actor, async (tx) => {
    const result = await tx.execute<{ user_id: string; first_name: string; role_label: string; is_creator: boolean; is_me: boolean }>(
      sql`select user_id, first_name, role_label, is_creator, is_me from public.app_group_members(${parsed.groupId}::uuid)`,
    );
    return result.rows.map((row) => ({ userId: row.user_id, firstName: row.first_name, roleLabel: row.role_label, isCreator: row.is_creator, isMe: row.is_me }));
  });
}

/** The group behind an open conversation, or null when it is not a group the person is in. */
export async function getGroupInfo(db: Database, actor: MessagingActor, conversationId: string): Promise<GroupInfo | null> {
  const parsed = parseInput(markConversationReadSchema, { conversationId });
  return withActorScope(db, actor, async (tx) => {
    const result = await tx.execute<{ group_id: string; name: string; can_manage: boolean; member_count: number; kind: "group" | "direct" }>(
      sql`select group_id, name, can_manage, member_count, kind from public.app_group_info(${parsed.conversationId}::uuid)`,
    );
    const row = result.rows[0];
    return row === undefined ? null : { groupId: row.group_id, name: row.name, canManage: row.can_manage, memberCount: row.member_count, kind: row.kind };
  });
}
