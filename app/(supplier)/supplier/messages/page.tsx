import type { Metadata } from "next";
import { TenantPageHeader } from "@/components/tenant/page-header";
import {
  MessagingView,
  type ConversationSummary,
  type ForwardTargetOption,
  type ThreadMessageView,
} from "@/components/tenant/messaging-view";
import { getDatabase } from "@/server/db/client";
import { requireSupplier } from "@/server/supplier/session";
import { listConversations, listConversationMessages } from "@/server/domain/messaging";

export const metadata: Metadata = { title: "Messages" };

export default async function SupplierMessagesPage(props: {
  searchParams?: Promise<{ conv?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const view = await requireSupplier();
  const db = getDatabase("leads_agency").db;

  const rawConversations = await listConversations(db, view.actor);

  const selectedId = searchParams.conv ?? rawConversations[0]?.id ?? null;

  const rawMessages = selectedId
    ? await listConversationMessages(db, view.actor, selectedId)
    : [];

  const conversations: ConversationSummary[] = rawConversations.map((c) => {
    const isFynixSide = c.side === "supplier_fynix";
    return {
      id: c.id,
      publicRef: c.publicRef,
      campaignId: c.campaignId,
      leadId: c.leadId ?? null,
      side: c.side as "supplier_fynix" | "supplier_agency",
      subject: c.subject ?? null,
      counterpartyName: isFynixSide ? "Fynix" : "Partner Agency",
      lastMessageAt: c.updatedAt.toISOString(),
    };
  });

  const selectedConv = conversations.find((c) => c.id === selectedId);

  // Available forward targets: counterpart conversations for same lead or campaign
  const availableForwardTargets: ForwardTargetOption[] = conversations
    .filter((c) => c.id !== selectedId && (c.leadId === selectedConv?.leadId || c.campaignId === selectedConv?.campaignId))
    .map((c) => ({
      id: c.id,
      publicRef: c.publicRef,
      label: c.counterpartyName,
      side: c.side,
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
      <TenantPageHeader
        title="Messages"
        subtitle="Manage communication threads with Fynix and your partner agencies."
      />

      <MessagingView
        role="supplier"
        currentUserId={view.actor.userId}
        conversations={conversations}
        initialConversationId={selectedId}
        initialMessages={initialMessages}
        availableForwardTargets={availableForwardTargets}
      />
    </div>
  );
}
