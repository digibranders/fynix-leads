"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { groupRefusalMessage } from "@/lib/messaging/group-rules";
import { DomainError } from "@/server/domain/errors";
import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  leaveGroup,
  listGroupCandidates,
  openDirectChat,
  listGroupMembers,
  removeGroupMember,
  renameGroup,
  type GroupCandidate,
  type GroupMemberView,
} from "@/server/domain/groups";
import type { MessagingActor } from "@/server/domain/messaging";

export interface GroupActionResult {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
  /** The conversation to open after a group is created. */
  readonly conversationId?: string;
}

async function who(): Promise<{ actor: MessagingActor; db: ReturnType<typeof getDatabase>["db"] } | null> {
  const context = await getSessionContext();
  if (context === null) return null;
  const role = context.kind === "client" ? "leads_client" : context.kind === "agency" ? "leads_agency" : "leads_fynix";
  return {
    db: getDatabase(role).db,
    actor: { userId: context.userId, orgId: context.kind === "fynix" ? null : context.orgId, orgKind: context.kind, role: context.memberRole, displayName: context.name },
  };
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function failure(error: unknown, fallback: string): GroupActionResult {
  return { status: "error", message: error instanceof DomainError ? error.message : (groupRefusalMessage(error) ?? fallback) };
}

function refresh(): void {
  for (const path of ["/client/messages", "/agency/messages", "/supplier/messages", "/fynix/inbox"]) revalidatePath(path);
}

export async function createGroupAction(_previous: GroupActionResult, formData: FormData): Promise<GroupActionResult> {
  const session = await who();
  if (session === null) return { status: "error", message: "You must be signed in." };
  try {
    const conversationId = await createGroup(session.db, session.actor, {
      name: field(formData, "name"),
      memberIds: formData.getAll("memberIds").filter((value): value is string => typeof value === "string"),
    });
    refresh();
    return { status: "success", conversationId };
  } catch (error) {
    return failure(error, "The group could not be created. Try again.");
  }
}

export async function openDirectChatAction(userId: string): Promise<GroupActionResult> {
  const session = await who();
  if (session === null) return { status: "error", message: "You must be signed in." };
  try {
    const conversationId = await openDirectChat(session.db, session.actor, { userId });
    refresh();
    return { status: "success", conversationId };
  } catch (error) {
    return failure(error, "The chat could not be opened. Try again.");
  }
}

export async function addGroupMembersAction(_previous: GroupActionResult, formData: FormData): Promise<GroupActionResult> {
  const session = await who();
  if (session === null) return { status: "error", message: "You must be signed in." };
  try {
    await addGroupMembers(session.db, session.actor, {
      groupId: field(formData, "groupId"),
      memberIds: formData.getAll("memberIds").filter((value): value is string => typeof value === "string"),
    });
    refresh();
    return { status: "success" };
  } catch (error) {
    return failure(error, "The people could not be added. Try again.");
  }
}

export async function removeGroupMemberAction(groupId: string, userId: string): Promise<GroupActionResult> {
  const session = await who();
  if (session === null) return { status: "error", message: "You must be signed in." };
  try {
    await removeGroupMember(session.db, session.actor, { groupId, userId });
    refresh();
    return { status: "success" };
  } catch (error) {
    return failure(error, "That person could not be removed. Try again.");
  }
}

export async function renameGroupAction(groupId: string, name: string): Promise<GroupActionResult> {
  const session = await who();
  if (session === null) return { status: "error", message: "You must be signed in." };
  try {
    await renameGroup(session.db, session.actor, { groupId, name });
    refresh();
    return { status: "success" };
  } catch (error) {
    return failure(error, "The group could not be renamed. Try again.");
  }
}

export async function leaveGroupAction(groupId: string): Promise<GroupActionResult> {
  const session = await who();
  if (session === null) return { status: "error", message: "You must be signed in." };
  try {
    await leaveGroup(session.db, session.actor, { groupId });
    refresh();
    return { status: "success" };
  } catch (error) {
    return failure(error, "You could not leave the group. Try again.");
  }
}

export async function deleteGroupAction(groupId: string): Promise<GroupActionResult> {
  const session = await who();
  if (session === null) return { status: "error", message: "You must be signed in." };
  try {
    await deleteGroup(session.db, session.actor, { groupId });
    refresh();
    return { status: "success" };
  } catch (error) {
    return failure(error, "The group could not be deleted. Try again.");
  }
}

/**
 * The people the signed-in person may add, for the picker. `chosen` names who is already picked and `groupId` the group being added to; the list
 * narrows to Fynix and the one side present. The domain checks both against the database.
 */
export async function loadGroupCandidatesAction(options: { readonly groupId?: string; readonly chosen?: readonly string[] } = {}): Promise<readonly GroupCandidate[]> {
  const session = await who();
  if (session === null) return [];
  try {
    return await listGroupCandidates(session.db, session.actor, options);
  } catch (error) {
    if (error instanceof DomainError) return [];
    throw error;
  }
}

/** The people in a group, by first name and role, for the group panel. */
export async function loadGroupMembersAction(groupId: string): Promise<readonly GroupMemberView[]> {
  const session = await who();
  if (session === null) return [];
  try {
    return await listGroupMembers(session.db, session.actor, groupId);
  } catch {
    return [];
  }
}
