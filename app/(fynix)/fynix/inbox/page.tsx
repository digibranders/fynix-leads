import type { Metadata } from "next";
import { FynixPageHeader } from "@/components/fynix/page-header";
import {
  MessagingView,
  type ConversationSummary,
  type ForwardTargetOption,
  type ThreadMessageView,
} from "@/components/tenant/messaging-view";
import { getDatabase } from "@/server/db/client";
import { requireFynix } from "@/server/fynix/session";
import {
  listConversations,
  listConversationMessages,
  type MessagingActor,
} from "@/server/domain/messaging";

export const metadata: Metadata = { title: "Inbox" };

export default async function FynixInboxPage(props: {
  searchParams?: Promise<{ conv?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const view = await requireFynix();
  const db = getDatabase("leads_fynix").db;

  const actor: MessagingActor = {
    userId: view.actor.userId,
    orgKind: "fynix",
    displayName: view.name,
    role: view.canWrite ? "manager" : "member",
  };

  const rawConversations = await listConversations(db, actor);

  const selectedId = searchParams.conv ?? rawConversations[0]?.id ?? null;

  const rawMessages = selectedId
    ? await listConversationMessages(db, actor, selectedId)
    : [];

  const conversations: ConversationSummary[] = rawConversations.map((c) => {
    const isClientSide = c.side === "client_fynix";
    return {
      id: c.id,
      publicRef: c.publicRef,
      campaignId: c.campaignId,
      leadId: c.leadId ?? null,
      side: c.side as "client_fynix" | "supplier_fynix",
      subject: c.subject ?? null,
      counterpartyName: isClientSide ? "Client Organization" : "Supplier Organization",
      lastMessageAt: c.updatedAt.toISOString(),
    };
  });

  const selectedConv = rawConversations.find((c) => c.id === selectedId);

  // Available forward targets for Fynix: counterpart threads for the same campaign or lead on the other side
  const availableForwardTargets: ForwardTargetOption[] = rawConversations
    .filter((c) => c.id !== selectedId && c.side !== selectedConv?.side && (c.leadId === selectedConv?.leadId || c.campaignId === selectedConv?.campaignId))
    .map((c) => ({
      id: c.id,
      publicRef: c.publicRef,
      label: c.side === "client_fynix" ? "Client Side" : "Supplier Side",
      side: c.side as "client_fynix" | "supplier_fynix",
    }));

  const initialMessages: ThreadMessageView[] = rawMessages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    senderUserId: m.senderUserId,
    senderRole: m.senderRole as "client" | "supplier" | "agency" | "fynix",
    senderName: m.senderName,
    body: m.body,
    forwardOfMessageId: m.forwardOfMessageId,
    scrubbedCount: m.scrubbedCount,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <FynixPageHeader
        title="Inbox"
        subtitle="Manage communication threads between clients and suppliers. Conversations between suppliers and sub-agencies remain private."
      />

      <MessagingView
        role="fynix"
        currentUserId={view.actor.userId}
        conversations={conversations}
        initialConversationId={selectedId}
        initialMessages={initialMessages}
        availableForwardTargets={availableForwardTargets}
      />
    </div>
  );
}
