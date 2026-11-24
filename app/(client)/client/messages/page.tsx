import { canCreateGroup, getGroupInfo } from "@/server/domain/groups";
import { listConversationAttachments } from "@/server/domain/attachments";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { PageSkeleton } from "@/components/kit/skeletons";
import {
  MessagingView,
  type ConversationSummary,
  type ThreadMessageView,
} from "@/components/messaging/messaging-view";
import { getDatabase } from "@/server/db/client";
import { requireClient } from "@/server/client/session";
import { getConversationSeenAt, listConversations, listConversationMessages } from "@/server/domain/messaging";

export const metadata: Metadata = { title: "Messages" };

async function Messages({ searchParams: pending }: { searchParams: PageProps<"/client/messages">["searchParams"] }) {
  const params = await pending;
  const searchParams = { conv: typeof params.conv === "string" ? params.conv : undefined };
  const view = await requireClient();
  const db = getDatabase("leads_client").db;

  const rawConversations = await listConversations(db, view.actor);

  const selectedId = searchParams.conv ?? rawConversations[0]?.id ?? null;

  const rawMessages = selectedId
    ? await listConversationMessages(db, view.actor, selectedId)
    : [];

  const seenAt = selectedId ? await getConversationSeenAt(db, view.actor, selectedId) : null;
  const canCreate = await canCreateGroup(db, view.actor);
  const groupInfo = selectedId && rawConversations.find((c) => c.id === selectedId)?.side === "group" ? await getGroupInfo(db, view.actor, selectedId) : null;
  const attachments = selectedId ? await listConversationAttachments(db, view.actor, selectedId) : [];

  const conversations: ConversationSummary[] = rawConversations.map((c) => ({
    id: c.id,
    publicRef: c.publicRef,
    campaignId: c.campaignId,
    leadId: c.leadId ?? null,
    side: c.side as "client_fynix",
    subject: c.subject ?? null,
    isDirect: c.isDirect,
    counterpartyName: "Fynix",
    lastMessageAt: c.updatedAt.toISOString(),
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
      <PageHeader title="Messages" description="Your conversations with Fynix about your campaigns and leads." />
      <MessagingView
        role="client"
        currentUserId={view.actor.userId}
        conversations={conversations}
        initialConversationId={selectedId}
        initialMessages={initialMessages}
        seenAt={seenAt?.toISOString() ?? null}
        attachments={attachments}
        canCreateGroup={canCreate}
        groupInfo={groupInfo}
      />
    </div>
  );
}

export default function ClientMessagesPage({ searchParams }: PageProps<"/client/messages">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Messages searchParams={searchParams} />
    </Suspense>
  );
}
