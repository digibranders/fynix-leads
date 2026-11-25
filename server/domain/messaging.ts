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
  campaign,
  conversation,
  conversationMessage,
  lead,
  type SenderRole,
} from "@/server/db/schema";
import { type ScopedTransaction } from "@/server/db/scope";
import { appendAudit } from "@/server/domain/audit";
import { DomainError } from "@/server/domain/errors";
import { forwardMessageSchema, getOrCreateConversationSchema, leadConversationSchema, openThreadSchema, postMessageSchema } from "@/server/domain/inputs";
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
    if (parsed.side === "supplier_fynix" && parsed.coordinatorOrgId && parsed.coordinatorOrgId !== actor.orgId) {
      throw new DomainError("not-authorised", "Coordinator cannot create conversations for another coordinator.");
    }
    if (
      parsed.side === "supplier_agency" &&
      parsed.coordinatorOrgId &&
      parsed.agencyOrgId &&
      actor.orgId !== parsed.coordinatorOrgId &&
      actor.orgId !== parsed.agencyOrgId
    ) {
      throw new DomainError("not-authorised", "Agency cannot create conversations between organisations it does not belong to.");
    }
  }

  const clientOrgId = parsed.side === "client_fynix" ? (parsed.clientOrgId ?? actor.orgId ?? null) : null;
  const coordinatorOrgId =
    parsed.side === "supplier_fynix" || parsed.side === "supplier_agency"
      ? (parsed.coordinatorOrgId ?? (actor.orgKind === "agency" && parsed.side === "supplier_fynix" ? (actor.orgId ?? null) : null))
      : null;
  const agencyOrgId = parsed.side === "supplier_agency" ? (parsed.agencyOrgId ?? null) : null;

  return withActorScope(db, actor, async (tx) => {
    if (actor.orgKind !== "fynix") await assertCampaignVisible(tx, parsed.campaignId, parsed.leadId);
    return findOrCreateConversation(tx, actor, { campaignId: parsed.campaignId, leadId: parsed.leadId ?? null, side: parsed.side, clientOrgId, coordinatorOrgId, agencyOrgId, subject: parsed.subject ?? null }, randomBytes, now);
  });
}

interface ConversationKey {
  readonly campaignId: string;
  readonly leadId: string | null;
  readonly side: "client_fynix" | "supplier_fynix" | "supplier_agency";
  readonly clientOrgId: string | null;
  readonly coordinatorOrgId: string | null;
  readonly agencyOrgId: string | null;
  readonly subject: string | null;
}

/** A tenant may only open a thread about a campaign it can read, and a lead of that campaign it can read. Row-level security answers for both. */
async function assertCampaignVisible(tx: ScopedTransaction, campaignId: string, leadId: string | undefined): Promise<void> {
  const [seen] = await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (seen === undefined) throw new DomainError("not-found", "There is no such campaign.");
  if (leadId !== undefined) {
    const [row] = await tx.select({ id: lead.id }).from(lead).where(and(eq(lead.id, leadId), eq(lead.campaignId, campaignId))).limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
  }
}

/** The one thread for this key (campaign, lead, side and organisations), made when there is none yet. */
async function findOrCreateConversation(tx: ScopedTransaction, actor: MessagingActor, key: ConversationKey, randomBytes: RandomBytes, now: Date) {
  const cols = conversationColumnsFor(actor.orgKind);
  const conditions = [eq(conversation.campaignId, key.campaignId), eq(conversation.side, key.side)];
  conditions.push(key.leadId === null ? isNull(conversation.leadId) : eq(conversation.leadId, key.leadId));
  if (key.clientOrgId) conditions.push(eq(conversation.clientOrgId, key.clientOrgId));
  if (key.coordinatorOrgId) conditions.push(eq(conversation.coordinatorOrgId, key.coordinatorOrgId));
  if (key.agencyOrgId) conditions.push(eq(conversation.agencyOrgId, key.agencyOrgId));

  const [existing] = await tx.select(cols).from(conversation).where(and(...conditions)).limit(1);
  if (existing !== undefined) return existing;

  const publicRef = generatePublicRef("MSG", randomBytes);
  const [created] = await tx
    .insert(conversation)
    .values({ publicRef, campaignId: key.campaignId, leadId: key.leadId, side: key.side, clientOrgId: key.clientOrgId, coordinatorOrgId: key.coordinatorOrgId, agencyOrgId: key.agencyOrgId, subject: key.subject, createdAt: now, updatedAt: now })
    .returning(cols);
  if (created === undefined) throw new Error("Insert of conversation returned no row");

  if (actor.orgKind === "fynix") {
    await appendAudit(tx, { action: "conversation.create", subject: { table: "conversation", id: created.id, ref: created.publicRef } });
  }
  return created;
}

/**
 * A client starts a thread with Fynix, or a coordinator does (the thread is about one of its campaigns). One thread per campaign: asking again opens the
 * one that exists. A partner agency has no thread with Fynix: its hop is its coordinator.
 */
export async function openThreadWithFynix(db: Database, actor: MessagingActor, input: unknown, deps?: { randomBytes?: RandomBytes; now?: () => Date }) {
  const parsed = parseInput(openThreadSchema, input);
  if (actor.orgKind === "client") return getOrCreateConversation(db, actor, { campaignId: parsed.campaignId, side: "client_fynix", subject: parsed.subject }, deps);
  if (actor.orgKind === "agency") {
    const coordinator = await withActorScope(db, actor, async (tx) => {
      const [row] = await tx.select({ coordinatorOrgId: campaign.agencyOrgId }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1);
      return row !== undefined && row.coordinatorOrgId === actor.orgId;
    });
    if (!coordinator) throw new DomainError("not-authorised", "Only the coordinator of a campaign has a thread with Fynix about it.");
    return getOrCreateConversation(db, actor, { campaignId: parsed.campaignId, side: "supplier_fynix", subject: parsed.subject }, deps);
  }
  throw new DomainError("not-authorised", "Fynix answers a thread; the client or the coordinator starts it.");
}

/**
 * The thread about one lead, made when there is none, with the lead's reference in its title. Two separate threads exist: the client with Fynix, and the
 * coordinator with Fynix; neither side reads the other's. A client or a coordinator opens its own. Fynix names the side. A partner agency has none (its hop is
 * its coordinator, so the answer is null). A draft has no thread.
 */
export async function getOrCreateLeadConversation(db: Database, actor: MessagingActor, input: unknown, deps?: { randomBytes?: RandomBytes; now?: () => Date }) {
  const parsed = parseInput(leadConversationSchema, input);
  const now = deps?.now ? deps.now() : new Date();
  const randomBytes = deps?.randomBytes ?? ((n: number) => randomFillSync(new Uint8Array(n)));
  return withActorScope(db, actor, async (tx) => {
    const [row] = await tx
      .select({ id: lead.id, publicRef: lead.publicRef, campaignId: lead.campaignId, released: lead.released, clientOrgId: campaign.clientOrgId, coordinatorOrgId: campaign.agencyOrgId })
      .from(lead)
      .innerJoin(campaign, eq(campaign.id, lead.campaignId))
      .where(eq(lead.id, parsed.leadId))
      .limit(1);
    if (row === undefined) throw new DomainError("not-found", "There is no such lead.");
    if (!row.released) throw new DomainError("invalid-lead-stage", "A draft has no thread.");
    const subject = `Lead ${row.publicRef}`;
    const base = { campaignId: row.campaignId, leadId: row.id, subject, agencyOrgId: null } as const;
    if (actor.orgKind === "client") {
      if (row.clientOrgId !== actor.orgId) throw new DomainError("not-found", "There is no such lead.");
      return findOrCreateConversation(tx, actor, { ...base, side: "client_fynix", clientOrgId: actor.orgId, coordinatorOrgId: null }, randomBytes, now);
    }
    if (actor.orgKind === "agency") {
      if (row.coordinatorOrgId !== actor.orgId) return null;
      return findOrCreateConversation(tx, actor, { ...base, side: "supplier_fynix", clientOrgId: null, coordinatorOrgId: actor.orgId }, randomBytes, now);
    }
    if (parsed.side === "supplier_fynix") return findOrCreateConversation(tx, actor, { ...base, side: "supplier_fynix", clientOrgId: null, coordinatorOrgId: row.coordinatorOrgId }, randomBytes, now);
    return findOrCreateConversation(tx, actor, { ...base, side: "client_fynix", clientOrgId: row.clientOrgId, coordinatorOrgId: null }, randomBytes, now);
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
        coordinatorOrgId: conversation.coordinatorOrgId,
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
      // Both a coordinator and a partner agency are `agency` organisations; the one with no coordinator above it is the coordinator.
      const partner = await tx.execute<{ partner: boolean }>(sql`select public.app_org_is_partner() as partner`);
      senderRole = partner.rows[0]?.partner === true ? "agency" : "supplier";
    } else {
      senderRole = conv.coordinatorOrgId === actor.orgId ? "supplier" : "agency";
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
      await notifyConversation(tx, conv.id, senderName, parsed.body);
    }

    return msg;
  });
}

/**
 * Forwards a message from one conversation to another, scrubbing contact details
 * when crossing the client vs coordinator/agency boundary.
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
        coordinatorOrgId: conversation.coordinatorOrgId,
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
        coordinatorOrgId: conversation.coordinatorOrgId,
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
    const isCoordinatorAgencySide = (side: string) => side === "supplier_fynix" || side === "supplier_agency";
    const crossesBoundary =
      (isClientSide(sourceConv.side) && isCoordinatorAgencySide(targetConv.side)) ||
      (isCoordinatorAgencySide(sourceConv.side) && isClientSide(targetConv.side));

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
      senderRole = targetConv.coordinatorOrgId === actor.orgId ? "supplier" : "agency";
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

    await notifyConversation(tx, targetConv.id, senderName, finalBody);

    return forwarded;
  });
}

/**
 * Tells the people on the other side of a one-to-one thread there is a new message. The database function works out who they are and links each to
 * the thread in their own portal; a tenant role cannot write another person's notice, so the application never inserts one itself.
 */
async function notifyConversation(tx: ScopedTransaction, conversationId: string, senderName: string, body: string): Promise<void> {
  const snippet = body.length > 80 ? `${body.slice(0, 77)}...` : body;
  await tx.execute(sql`select public.app_notify_conversation(${conversationId}::uuid, ${`New message from ${senderName}`}, ${snippet})`);
}

export * from "@/server/domain/messaging-reads";
