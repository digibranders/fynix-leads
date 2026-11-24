import { canCreateGroup, getGroupInfo } from "@/server/domain/groups";
import { listConversationAttachments } from "@/server/domain/attachments";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import {
  MessagingView,
  type ConversationSummary,
  type ForwardTargetOption,
  type ThreadMessageView,
} from "@/components/messaging/messaging-view";
import { getDatabase } from "@/server/db/client";
import { NewFynixThread } from "@/components/messaging/new-fynix-thread";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import { requireSupplier } from "@/server/supplier/session";
import { leadRefFromSubject } from "@/lib/leads/thread-ref";
import { getConversationSeenAt, listConversations, listConversationMessages } from "@/server/domain/messaging";

export const metadata: Metadata = { title: "Messages" };

async function Messages({ searchParams: pending }: { searchParams: PageProps<"/supplier/messages">["searchParams"] }) {
  const params = await pending;
  const searchParams = { conv: typeof params.conv === "string" ? params.conv : undefined };
  const view = await requireSupplier();
  const db = getDatabase("leads_agency").db;

  const [rawConversations, campaigns] = await Promise.all([listConversations(db, view.actor), listTenantCampaigns(db, view.actor, "supplier")]);

  const selectedId = searchParams.conv ?? rawConversations[0]?.id ?? null;

  const rawMessages = selectedId
    ? await listConversationMessages(db, view.actor, selectedId)
    : [];

  const seenAt = selectedId ? await getConversationSeenAt(db, view.actor, selectedId) : null;
  const canCreate = await canCreateGroup(db, view.actor);
  const groupInfo = selectedId && rawConversations.find((c) => c.id === selectedId)?.side === "group" ? await getGroupInfo(db, view.actor, selectedId) : null;
  const attachments = selectedId ? await listConversationAttachments(db, view.actor, selectedId) : [];

  const conversations: ConversationSummary[] = rawConversations.map((c) => {
    const isFynixSide = c.side === "supplier_fynix";
    return {
      id: c.id,
      publicRef: c.publicRef,
      campaignId: c.campaignId,
      leadId: c.leadId ?? null,
      side: c.side as "supplier_fynix" | "supplier_agency",
      subject: c.subject ?? null,
      isDirect: c.isDirect,
      counterpartyName: isFynixSide ? "Fynix" : "Partner agency",
      leadRef: c.leadId === null || c.leadId === undefined ? null : leadRefFromSubject(c.subject ?? null),
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
    <div className="flex flex-col gap-4">
      <PageHeader title="Messages" description="Your conversations with Fynix and your partner agencies about campaigns and leads." actions={<NewFynixThread campaigns={campaigns.map((row) => ({ value: row.id, label: row.name }))} />} />
      <MessagingView
        role="supplier"
        currentUserId={view.actor.userId}
        conversations={conversations}
        initialConversationId={selectedId}
        initialMessages={initialMessages}
        seenAt={seenAt?.toISOString() ?? null}
        attachments={attachments}
        canCreateGroup={canCreate}
        groupInfo={groupInfo}
        availableForwardTargets={availableForwardTargets}
        openedByLink={searchParams.conv !== undefined}
      />
    </div>
  );
}

export default function SupplierMessagesPage({ searchParams }: PageProps<"/supplier/messages">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Messages searchParams={searchParams} />
    </Suspense>
  );
}
