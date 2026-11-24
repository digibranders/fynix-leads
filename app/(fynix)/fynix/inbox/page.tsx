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
import { requireFynix } from "@/server/fynix/session";
import {
  listConversations,
  getConversationSeenAt,
  listConversationMessages,
  type MessagingActor,
} from "@/server/domain/messaging";

export const metadata: Metadata = { title: "Inbox" };

async function Inbox({ searchParams: pending }: { searchParams: PageProps<"/fynix/inbox">["searchParams"] }) {
  const params = await pending;
  const searchParams = { conv: typeof params.conv === "string" ? params.conv : undefined };
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

  const seenAt = selectedId ? await getConversationSeenAt(db, actor, selectedId) : null;
  const canCreate = await canCreateGroup(db, actor);
  const groupInfo = selectedId && rawConversations.find((c) => c.id === selectedId)?.side === "group" ? await getGroupInfo(db, actor, selectedId) : null;
  const attachments = selectedId ? await listConversationAttachments(db, actor, selectedId) : [];

  const conversations: ConversationSummary[] = rawConversations.map((c) => {
    const isClientSide = c.side === "client_fynix";
    return {
      id: c.id,
      publicRef: c.publicRef,
      campaignId: c.campaignId,
      leadId: c.leadId ?? null,
      side: c.side as "client_fynix" | "supplier_fynix",
      subject: c.subject ?? null,
      isDirect: c.isDirect,
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
    <div className="flex flex-col gap-4">
      <PageHeader title="Inbox" description="Conversations with clients and suppliers about campaigns and leads." />
      <MessagingView
        role="fynix"
        currentUserId={view.actor.userId}
        conversations={conversations}
        initialConversationId={selectedId}
        initialMessages={initialMessages}
        seenAt={seenAt?.toISOString() ?? null}
        attachments={attachments}
        canCreateGroup={canCreate}
        groupInfo={groupInfo}
        availableForwardTargets={availableForwardTargets}
      />
    </div>
  );
}

export default function FynixInboxPage({ searchParams }: PageProps<"/fynix/inbox">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Inbox searchParams={searchParams} />
    </Suspense>
  );
}
