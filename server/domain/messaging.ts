import { randomFillSync } from "node:crypto";
import {
  and,
  eq,
  isNull,
  sql,
} from "drizzle-orm";
import { generatePublicRef, type RandomBytes } from "@/lib/domain/public-ref";
import { relayText } from "@/lib/relay/relay-text";
import type { Database } from "@/server/db/pool";
import {
  conversation,
  conversationMessage,
  member,
  notification,
  type SenderRole,
} from "@/server/db/schema";
import { type ScopedTransaction } from "@/server/db/scope";
import { appendAudit } from "@/server/domain/audit";
import { DomainError } from "@/server/domain/errors";
import { forwardMessageSchema, getOrCreateConversationSchema, postMessageSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

export { assertConversationAccess, withActorScope, type MessagingActor } from "@/server/domain/messaging-core";
import {
  assertConversationAccess,
  conversationColumnsFor,
  messageColumnsFor,
  withActorScope,
  type MessagingActor,
} from "@/server/domain/messaging-core";

/**
 * Gets an existing conversation matching the criteria or creates a new one.
 */
export async function getOrCreateConversation(
  db: Database,
  actor: MessagingActor,
  input: unknown,
  deps?: { randomBytes?: RandomBytes; now?: () => Date },
) {
  const parsed = parseInput(getOrCreateConversationSchema, input);
  const now = deps?.now ? deps.now() : new Date();
  const randomBytes = deps?.randomBytes ?? ((n: number) => randomFillSync(new Uint8Array(n)));

  if (actor.orgKind === "fynix") {
    if (parsed.side === "supplier_agency") {
      throw new DomainError("not-authorised", "Fynix cannot access coordinator-agency conversations.");
    }
  } else if (actor.orgKind === "client") {
    if (parsed.side !== "client_fynix") {
      throw new DomainError("not-authorised", "Client can only create client-fynix conversations.");
    }
    if (parsed.clientOrgId && parsed.clientOrgId !== actor.orgId) {
      throw new DomainError("not-authorised", "Client cannot create conversations for another organisation.");
    }
  } else if (actor.orgKind === "agency") {
    if (parsed.side === "client_fynix") {
      throw new DomainError("not-authorised", "Agencies cannot access client-fynix conversations.");
    }
    if (parsed.side === "supplier_fynix" && parsed.supplierOrgId && parsed.supplierOrgId !== actor.orgId) {
      throw new DomainError("not-authorised", "Coordinator cannot create conversations for another coordinator.");
    }
    if (
      parsed.side === "supplier_agency" &&
      parsed.supplierOrgId &&
      parsed.agencyOrgId &&
      actor.orgId !== parsed.supplierOrgId &&
      actor.orgId !== parsed.agencyOrgId
    ) {
      throw new DomainError("not-authorised", "Agency cannot create conversations between organisations it does not belong to.");
    }
  }

  const clientOrgId = parsed.side === "client_fynix" ? (parsed.clientOrgId ?? actor.orgId ?? null) : null;
  const supplierOrgId =
    parsed.side === "supplier_fynix" || parsed.side === "supplier_agency"
      ? (parsed.supplierOrgId ?? (actor.orgKind === "agency" && parsed.side === "supplier_fynix" ? actor.orgId : null))
      : null;
  const agencyOrgId = parsed.side === "supplier_agency" ? (parsed.agencyOrgId ?? null) : null;

  const cols = conversationColumnsFor(actor.orgKind);

  return withActorScope(db, actor, async (tx) => {
    const conditions = [
      eq(conversation.campaignId, parsed.campaignId),
      eq(conversation.side, parsed.side),
    ];
    if (parsed.leadId !== undefined) {
      conditions.push(eq(conversation.leadId, parsed.leadId));
    } else {
      conditions.push(isNull(conversation.leadId));
    }
    if (clientOrgId) conditions.push(eq(conversation.clientOrgId, clientOrgId));
    if (supplierOrgId) conditions.push(eq(conversation.supplierOrgId, supplierOrgId));
    if (agencyOrgId) conditions.push(eq(conversation.agencyOrgId, agencyOrgId));

    const [existing] = await tx
      .select(cols)
      .from(conversation)
      .where(and(...conditions))
      .limit(1);

    if (existing !== undefined) {
      return existing;
    }

    const publicRef = generatePublicRef("MSG", randomBytes);
    const [created] = await tx
      .insert(conversation)
      .values({
        publicRef,
        campaignId: parsed.campaignId,
        leadId: parsed.leadId ?? null,
        side: parsed.side,
        clientOrgId,
        supplierOrgId,
        agencyOrgId,
        subject: parsed.subject ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning(cols);

    if (actor.orgKind === "fynix") {
      await appendAudit(tx, {
        action: "conversation.create",
        subject: { table: "conversation", id: created.id, ref: created.publicRef },
      });
    }

    return created;
  });
}

/**
 * Posts a message to a conversation and sends notifications to counterparties.
 */
export async function postMessage(
  db: Database,
  actor: MessagingActor,
  input: unknown,
  deps?: { now?: () => Date },
) {
  const parsed = parseInput(postMessageSchema, input);
  const now = deps?.now ? deps.now() : new Date();

  return withActorScope(db, actor, async (tx) => {
    const [conv] = await tx
      .select({
        id: conversation.id,
        publicRef: conversation.publicRef,
        campaignId: conversation.campaignId,
        leadId: conversation.leadId,
        side: conversation.side,
        clientOrgId: conversation.clientOrgId,
        supplierOrgId: conversation.supplierOrgId,
        agencyOrgId: conversation.agencyOrgId,
        subject: conversation.subject,
      })
      .from(conversation)
      .where(eq(conversation.id, parsed.conversationId))
      .limit(1);

    if (conv === undefined) {
      throw new DomainError("not-found", "There is no such conversation.");
    }

    assertConversationAccess(actor, conv);

    const isGroup = conv.side === "group";
    let senderRole: SenderRole;
    if (actor.orgKind === "fynix") {
      senderRole = "fynix";
    } else if (actor.orgKind === "client") {
      senderRole = "client";
    } else if (isGroup) {
      // Both a supplier and a partner agency are `agency` organisations; the one with no supplier above it is the supplier.
      const partner = await tx.execute<{ partner: boolean }>(sql`select public.app_org_is_partner() as partner`);
      senderRole = partner.rows[0]?.partner === true ? "agency" : "supplier";
    } else {
      senderRole = conv.supplierOrgId === actor.orgId ? "supplier" : "agency";
    }

    // In a group people see each other by first name and role only, and contact details are taken out of what is said, because a
    // group may hold people from both sides.
    const groupScrub = isGroup ? relayText(parsed.body) : null;
    const storedBody = groupScrub === null ? parsed.body : groupScrub.text;
    const senderName = isGroup
      ? (actor.displayName ?? "").trim().split(/\s+/)[0] || "Member"
      : actor.displayName ??
      (senderRole === "fynix"
        ? "Fynix Staff"
        : senderRole === "client"
          ? "Client"
          : senderRole === "supplier"
            ? "Coordinator"
            : "Agency");

    const messageCols = messageColumnsFor(actor.orgKind);

    const [msg] = await tx
      .insert(conversationMessage)
      .values({
        conversationId: conv.id,
        senderUserId: actor.userId,
        senderOrgId: actor.orgId ?? null,
        senderRole,
        senderName,
        body: storedBody,
        forwardOfMessageId: null,
        scrubbedCount: groupScrub?.removed ?? 0,
        createdAt: now,
      })
      .returning(messageCols);

    await tx
      .update(conversation)
      .set({ updatedAt: now })
      .where(eq(conversation.id, conv.id));

    if (actor.orgKind === "fynix") {
      await appendAudit(tx, {
        action: "conversation.message",
        subject: { table: "conversation_message", id: msg.id },
      });
    }

    if (isGroup) {
      await tx.execute(sql`select public.app_notify_group(${conv.id}::uuid, ${`New message from ${senderName}`}, ${storedBody.length > 80 ? `${storedBody.slice(0, 77)}...` : storedBody})`);
    } else {
      await dispatchMessageNotifications(tx, conv, senderRole, senderName, parsed.body, now);
    }

    return msg;
  });
}

/**
 * Forwards a message from one conversation to another, scrubbing contact details
 * when crossing the client vs supplier/agency boundary.
 */
export async function forwardMessage(
  db: Database,
  actor: MessagingActor,
  input: unknown,
  deps?: { now?: () => Date },
) {
  const parsed = parseInput(forwardMessageSchema, input);
  const now = deps?.now ? deps.now() : new Date();

  return withActorScope(db, actor, async (tx) => {
    const [orig] = await tx
      .select({
        id: conversationMessage.id,
        conversationId: conversationMessage.conversationId,
        senderUserId: conversationMessage.senderUserId,
        senderRole: conversationMessage.senderRole,
        senderName: conversationMessage.senderName,
        body: conversationMessage.body,
        createdAt: conversationMessage.createdAt,
      })
      .from(conversationMessage)
      .where(eq(conversationMessage.id, parsed.messageId))
      .limit(1);

    if (orig === undefined) {
      throw new DomainError("not-found", "There is no such message to forward.");
    }

    const [sourceConv] = await tx
      .select({
        id: conversation.id,
        publicRef: conversation.publicRef,
        side: conversation.side,
        clientOrgId: conversation.clientOrgId,
        supplierOrgId: conversation.supplierOrgId,
        agencyOrgId: conversation.agencyOrgId,
      })
      .from(conversation)
      .where(eq(conversation.id, orig.conversationId))
      .limit(1);

    if (sourceConv === undefined) {
      throw new DomainError("not-found", "Source conversation not found.");
    }
    assertConversationAccess(actor, sourceConv);
    if (sourceConv.side === "group") {
      throw new DomainError("not-authorised", "A message from a group cannot be forwarded.");
    }

    const [targetConv] = await tx
      .select({
        id: conversation.id,
        publicRef: conversation.publicRef,
        side: conversation.side,
        clientOrgId: conversation.clientOrgId,
        supplierOrgId: conversation.supplierOrgId,
        agencyOrgId: conversation.agencyOrgId,
      })
      .from(conversation)
      .where(eq(conversation.id, parsed.targetConversationId))
      .limit(1);

    if (targetConv?.side === "group") {
      throw new DomainError("not-authorised", "A message cannot be forwarded into a group.");
    }
    if (targetConv === undefined) {
      throw new DomainError("not-found", "Target conversation not found.");
    }
    assertConversationAccess(actor, targetConv);

    const isClientSide = (side: string) => side === "client_fynix";
    const isSupplierAgencySide = (side: string) => side === "supplier_fynix" || side === "supplier_agency";
    const crossesBoundary =
      (isClientSide(sourceConv.side) && isSupplierAgencySide(targetConv.side)) ||
      (isSupplierAgencySide(sourceConv.side) && isClientSide(targetConv.side));

    let finalBody = orig.body;
    let scrubbedCount = 0;
    if (crossesBoundary) {
      const scrubbed = relayText(orig.body);
      finalBody = scrubbed.text;
      scrubbedCount = typeof scrubbed.removed === "number" ? scrubbed.removed : (scrubbed.removed as unknown as unknown[]).length;
    }

    let senderRole: SenderRole;
    if (actor.orgKind === "fynix") {
      senderRole = "fynix";
    } else if (actor.orgKind === "client") {
      senderRole = "client";
    } else {
      senderRole = targetConv.supplierOrgId === actor.orgId ? "supplier" : "agency";
    }

    const senderName =
      actor.displayName ??
      (senderRole === "fynix"
        ? "Fynix Staff"
        : senderRole === "client"
          ? "Client"
          : senderRole === "supplier"
            ? "Coordinator"
            : "Agency");

    const messageCols = messageColumnsFor(actor.orgKind);

    const [forwarded] = await tx
      .insert(conversationMessage)
      .values({
        conversationId: targetConv.id,
        senderUserId: actor.userId,
        senderOrgId: actor.orgId ?? null,
        senderRole,
        senderName,
        body: finalBody,
        forwardOfMessageId: orig.id,
        scrubbedCount,
        createdAt: now,
      })
      .returning(messageCols);

    await tx
      .update(conversation)
      .set({ updatedAt: now })
      .where(eq(conversation.id, targetConv.id));

    if (actor.orgKind === "fynix") {
      await appendAudit(tx, {
        action: "conversation.message",
        subject: { table: "conversation_message", id: forwarded.id },
      });
    }

    await dispatchMessageNotifications(tx, targetConv, senderRole, senderName, finalBody, now);

    return forwarded;
  });
}

async function dispatchMessageNotifications(
  tx: ScopedTransaction,
  conv: {
    id: string;
    publicRef: string;
    side: string;
    clientOrgId: string | null;
    supplierOrgId: string | null;
    agencyOrgId: string | null;
  },
  senderRole: SenderRole,
  senderName: string,
  body: string,
  now: Date,
): Promise<void> {
  const snippet = body.length > 80 ? `${body.slice(0, 77)}...` : body;
  const toList = <T>(val: unknown): T[] => (Array.isArray(val) ? (val as T[]) : []);

  if (conv.side === "client_fynix") {
    if (senderRole === "client") {
      const fynixMembers = toList<{ userId: string }>(
        await tx
          .select({ userId: member.userId })
          .from(member)
          .where(and(eq(member.orgKind, "fynix"), eq(member.status, "active"))),
      );
      for (const m of fynixMembers) {
        await tx.insert(notification).values({
          userId: m.userId,
          orgId: null,
          kind: "message_received",
          title: `New message from ${senderName}`,
          body: snippet,
          link: `/fynix/messages/${conv.publicRef}`,
          createdAt: now,
        });
      }
    } else {
      if (conv.clientOrgId) {
        const clientMembers = toList<{ userId: string; orgId: string }>(
          await tx
            .select({ userId: member.userId, orgId: member.orgId })
            .from(member)
            .where(and(eq(member.orgId, conv.clientOrgId), eq(member.status, "active"))),
        );
        for (const m of clientMembers) {
          await tx.insert(notification).values({
            userId: m.userId,
            orgId: m.orgId,
            kind: "message_received",
            title: `New message from ${senderName}`,
            body: snippet,
            link: `/client/messages/${conv.publicRef}`,
            createdAt: now,
          });
        }
      }
    }
  } else if (conv.side === "supplier_fynix") {
    if (senderRole === "supplier") {
      const fynixMembers = toList<{ userId: string }>(
        await tx
          .select({ userId: member.userId })
          .from(member)
          .where(and(eq(member.orgKind, "fynix"), eq(member.status, "active"))),
      );
      for (const m of fynixMembers) {
        await tx.insert(notification).values({
          userId: m.userId,
          orgId: null,
          kind: "message_received",
          title: `New message from ${senderName}`,
          body: snippet,
          link: `/fynix/messages/${conv.publicRef}`,
          createdAt: now,
        });
      }
    } else {
      if (conv.supplierOrgId) {
        const supplierMembers = toList<{ userId: string; orgId: string }>(
          await tx
            .select({ userId: member.userId, orgId: member.orgId })
            .from(member)
            .where(and(eq(member.orgId, conv.supplierOrgId), eq(member.status, "active"))),
        );
        for (const m of supplierMembers) {
          await tx.insert(notification).values({
            userId: m.userId,
            orgId: m.orgId,
            kind: "message_received",
            title: `New message from ${senderName}`,
            body: snippet,
            link: `/supplier/messages/${conv.publicRef}`,
            createdAt: now,
          });
        }
      }
    }
  } else if (conv.side === "supplier_agency") {
    if (senderRole === "supplier") {
      if (conv.agencyOrgId) {
        const agencyMembers = toList<{ userId: string; orgId: string }>(
          await tx
            .select({ userId: member.userId, orgId: member.orgId })
            .from(member)
            .where(and(eq(member.orgId, conv.agencyOrgId), eq(member.status, "active"))),
        );
        for (const m of agencyMembers) {
          await tx.insert(notification).values({
            userId: m.userId,
            orgId: m.orgId,
            kind: "message_received",
            title: `New message from ${senderName}`,
            body: snippet,
            link: `/agency/messages/${conv.publicRef}`,
            createdAt: now,
          });
        }
      }
    } else {
      if (conv.supplierOrgId) {
        const supplierMembers = toList<{ userId: string; orgId: string }>(
          await tx
            .select({ userId: member.userId, orgId: member.orgId })
            .from(member)
            .where(and(eq(member.orgId, conv.supplierOrgId), eq(member.status, "active"))),
        );
        for (const m of supplierMembers) {
          await tx.insert(notification).values({
            userId: m.userId,
            orgId: m.orgId,
            kind: "message_received",
            title: `New message from ${senderName}`,
            body: snippet,
            link: `/supplier/messages/${conv.publicRef}`,
            createdAt: now,
          });
        }
      }
    }
  }
}

export * from "@/server/domain/messaging-reads";
