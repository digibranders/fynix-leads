"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { DomainError } from "@/server/domain/errors";
import {
  forwardMessage,
  getOrCreateConversation,
  markNotificationRead,
  postMessage,
  type MessagingActor,
} from "@/server/domain/messaging";

export interface MessageActionResult {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
  readonly data?: unknown;
}

export const IDLE_MESSAGE_ACTION: MessageActionResult = { status: "idle" };

function getField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function resolveActorAndDb(context: NonNullable<Awaited<ReturnType<typeof getSessionContext>>>): {
  actor: MessagingActor;
  db: ReturnType<typeof getDatabase>["db"];
} {
  const roleName =
    context.kind === "client"
      ? "leads_client"
      : context.kind === "agency"
        ? "leads_agency"
        : "leads_fynix";

  const db = getDatabase(roleName).db;
  const actor: MessagingActor = {
    userId: context.userId,
    orgId: context.kind === "fynix" ? null : context.orgId,
    orgKind: context.kind,
    role: context.memberRole,
    displayName: context.name,
  };

  return { actor, db };
}

/**
 * Server action to get or create a conversation thread.
 */
export async function getOrCreateConversationAction(
  _previous: MessageActionResult,
  formData: FormData,
): Promise<MessageActionResult> {
  const context = await getSessionContext();
  if (context === null) {
    return { status: "error", message: "You must be signed in to manage conversations." };
  }

  const campaignId = getField(formData, "campaignId");
  const leadId = getField(formData, "leadId") || undefined;
  const side = getField(formData, "side") as "client_fynix" | "supplier_fynix" | "supplier_agency";
  const clientOrgId = getField(formData, "clientOrgId") || undefined;
  const supplierOrgId = getField(formData, "supplierOrgId") || undefined;
  const agencyOrgId = getField(formData, "agencyOrgId") || undefined;
  const subject = getField(formData, "subject") || undefined;

  const { actor, db } = resolveActorAndDb(context);
  const deps = getDomain();

  try {
    const conv = await getOrCreateConversation(
      db,
      actor,
      {
        campaignId,
        leadId,
        side,
        clientOrgId,
        supplierOrgId,
        agencyOrgId,
        subject,
      },
      deps,
    );

    revalidatePath("/client/messages");
    revalidatePath("/agency/messages");
    revalidatePath("/supplier/messages");
    revalidatePath("/fynix/messages");

    return { status: "success", data: conv };
  } catch (error) {
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Failed to open conversation." };
  }
}

/**
 * Server action to post a message in a conversation.
 */
export async function postMessageAction(
  _previous: MessageActionResult,
  formData: FormData,
): Promise<MessageActionResult> {
  const context = await getSessionContext();
  if (context === null) {
    return { status: "error", message: "You must be signed in to send messages." };
  }

  const conversationId = getField(formData, "conversationId");
  const body = getField(formData, "body");

  const { actor, db } = resolveActorAndDb(context);
  const deps = getDomain();

  try {
    const msg = await postMessage(db, actor, { conversationId, body }, deps);

    revalidatePath("/client/messages");
    revalidatePath("/agency/messages");
    revalidatePath("/supplier/messages");
    revalidatePath("/fynix/messages");

    return { status: "success", data: msg };
  } catch (error) {
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Failed to send message." };
  }
}

/**
 * Server action to forward a message across hops with automatic contact scrubbing.
 */
export async function forwardMessageAction(
  _previous: MessageActionResult,
  formData: FormData,
): Promise<MessageActionResult> {
  const context = await getSessionContext();
  if (context === null) {
    return { status: "error", message: "You must be signed in to forward messages." };
  }

  const messageId = getField(formData, "messageId");
  const targetConversationId = getField(formData, "targetConversationId");

  const { actor, db } = resolveActorAndDb(context);
  const deps = getDomain();

  try {
    const forwarded = await forwardMessage(
      db,
      actor,
      { messageId, targetConversationId },
      deps,
    );

    revalidatePath("/client/messages");
    revalidatePath("/agency/messages");
    revalidatePath("/supplier/messages");
    revalidatePath("/fynix/messages");

    return { status: "success", data: forwarded };
  } catch (error) {
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Failed to forward message." };
  }
}

/**
 * Server action to mark an in-app notification as read.
 */
export async function markNotificationReadAction(
  _previous: MessageActionResult,
  formData: FormData,
): Promise<MessageActionResult> {
  const context = await getSessionContext();
  if (context === null) {
    return { status: "error", message: "You must be signed in to update notifications." };
  }

  const notificationId = getField(formData, "notificationId");
  const { actor, db } = resolveActorAndDb(context);
  const deps = getDomain();

  try {
    const updated = await markNotificationRead(db, actor, notificationId, deps);

    revalidatePath("/client/notifications");
    revalidatePath("/agency/notifications");
    revalidatePath("/supplier/notifications");
    revalidatePath("/fynix/notifications");

    return { status: "success", data: updated };
  } catch (error) {
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Failed to mark notification as read." };
  }
}
