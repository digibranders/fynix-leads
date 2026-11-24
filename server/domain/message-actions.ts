"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { messagePostChecks, retryMessage } from "@/lib/auth/rate-limit-rules";
import { cleanFileName, checkUpload, checkUploadSize, MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/files/rules";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import { getDomain } from "@/server/domain";
import { addMessageAttachment } from "@/server/domain/attachments";
import { deleteUpload, saveUpload } from "@/server/files/storage";
import { scanUpload } from "@/server/files/scan";
import { DomainError } from "@/server/domain/errors";
import { threadHref } from "@/lib/leads/thread-ref";
import {
  forwardMessage,
  getOrCreateConversation,
  getOrCreateLeadConversation,
  openThreadWithFynix,
  markConversationRead,
  markNotificationRead,
  postMessage,
  type MessagingActor,
} from "@/server/domain/messaging";

export interface MessageActionResult {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
  readonly data?: unknown;
  /** The page that opens the thread, when the action found or made one. */
  readonly href?: string;
}

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
  const typed = getField(formData, "body");
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { status: "error", message: `Attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files to one message.` };
  }
  if (typed === "" && files.length === 0) {
    return { status: "error", message: "Write a message or attach a file." };
  }

  const deps = getDomain();
  // Before any file is read or scanned. A failure of the limiter itself propagates: it fails closed.
  const blocked = await firstBlockedLimit(deps.publicDb, messagePostChecks(context.userId, files.length), deps.now());
  if (blocked !== null) return { status: "error", message: retryMessage(blocked.retryAfterSeconds) };

  // Check every file and scan it before anything is saved, so a refused file leaves no message behind.
  const checked: { readonly name: string; readonly contentType: string; readonly bytes: Uint8Array }[] = [];
  try {
    for (const file of files) {
      const sizeProblem = checkUploadSize(file);
      if (sizeProblem !== null) return { status: "error", message: sizeProblem };
      const bytes = new Uint8Array(await file.arrayBuffer());
      const verdict = checkUpload({ name: file.name, size: bytes.length }, bytes.subarray(0, 16));
      if (!verdict.ok) return { status: "error", message: verdict.reason };
      const scan = await scanUpload(bytes);
      if (scan.status === "infected") return { status: "error", message: `${file.name} was refused: the malware scan found a problem in it.` };
      checked.push({ name: cleanFileName(file.name), contentType: verdict.contentType, bytes });
    }
  } catch {
    return { status: "error", message: "Files cannot be sent right now. Try again later." };
  }

  const body = typed !== "" ? typed : `Attached ${checked.map((file) => file.name).join(", ")}`.slice(0, 10_000);
  const { actor, db } = resolveActorAndDb(context);
  const storedKeys: string[] = [];
  let posted = false;

  try {
    // Files go to disk before the message exists, so the likeliest failure (disk) leaves no message behind.
    const saved: { readonly file: (typeof checked)[number]; readonly storageKey: string }[] = [];
    for (const file of checked) {
      const storageKey = await saveUpload(file.bytes);
      storedKeys.push(storageKey);
      saved.push({ file, storageKey });
    }
    const msg = await postMessage(db, actor, { conversationId, body }, deps);
    posted = true;
    for (const { file, storageKey } of saved) {
      await addMessageAttachment(db, actor, { messageId: msg.id, fileName: file.name, contentType: file.contentType, sizeBytes: file.bytes.length, storageKey });
    }

    revalidateMessagePaths();
    return { status: "success", data: msg };
  } catch (error) {
    await Promise.all(storedKeys.map((key) => deleteUpload(key)));
    // The message is already in the conversation (it commits before its files are recorded): show it, and say what is missing.
    if (posted) {
      revalidateMessagePaths();
      return { status: "error", message: "Your message was sent, but its files could not be attached. Send them again." };
    }
    if (error instanceof DomainError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Failed to send message." };
  }
}

function revalidateMessagePaths(): void {
  for (const path of ["/client/messages", "/agency/messages", "/supplier/messages", "/fynix/messages", "/fynix/inbox"]) revalidatePath(path);
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

/** Called when a person opens a thread: records the read so the other side's ticks turn to "seen". No page refresh, nothing returned. */
export async function markConversationReadAction(conversationId: string): Promise<void> {
  const context = await getSessionContext();
  if (context === null) return;
  const { actor, db } = resolveActorAndDb(context);
  try {
    await markConversationRead(db, actor, conversationId);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return;
  }
  // The Messages and Inbox badge lives in the shell, which a navigation does not render again.
  for (const home of ["/client", "/supplier", "/agency", "/fynix"]) revalidatePath(home, "layout");
}

/** A client or a coordinator starts a thread with Fynix about one campaign (one thread per campaign: asking again opens it). */
export async function openThreadWithFynixAction(campaignId: string): Promise<MessageActionResult> {
  const context = await getSessionContext();
  if (context === null) return { status: "error", message: "You must be signed in to send messages." };
  const { actor, db } = resolveActorAndDb(context);
  try {
    const conv = await openThreadWithFynix(db, actor, { campaignId });
    revalidateMessagePaths();
    return { status: "success", href: threadHref(context.kind, conv.id) };
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : "The conversation could not be opened. Try again." };
  }
}

/** Opens the thread about one lead, made on first use, from the lead's record page. Fynix names the side; everyone else opens their own. */
export async function openLeadThreadAction(leadId: string, side?: "client_fynix" | "supplier_fynix"): Promise<MessageActionResult> {
  const context = await getSessionContext();
  if (context === null) return { status: "error", message: "You must be signed in to send messages." };
  const { actor, db } = resolveActorAndDb(context);
  try {
    const conv = await getOrCreateLeadConversation(db, actor, { leadId, side });
    if (conv === null) return { status: "error", message: "This lead has no conversation with Fynix for your team." };
    revalidateMessagePaths();
    return { status: "success", href: threadHref(context.kind, conv.id) };
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : "The conversation could not be opened. Try again." };
  }
}
