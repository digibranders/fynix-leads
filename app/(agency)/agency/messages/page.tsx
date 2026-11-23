import { canCreateGroup, getGroupInfo } from "@/server/domain/groups";
import { listConversationAttachments } from "@/server/domain/attachments";
import type { Metadata } from "next";
import {
  MessagingView,
  type ConversationSummary,
  type ThreadMessageView,
} from "@/components/tenant/messaging-view";
import { getDatabase } from "@/server/db/client";
import { requireAgency } from "@/server/agency/session";
import { getConversationSeenAt, listConversations, listConversationMessages } from "@/server/domain/messaging";

export const metadata: Metadata = { title: "Messages" };

export default async function AgencyMessagesPage(props: {
  searchParams?: Promise<{ conv?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const view = await requireAgency();
  const db = getDatabase("leads_agency").db;

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
    side: c.side as "supplier_agency",
    subject: c.subject ?? null,
    isDirect: c.isDirect,
    counterpartyName: "Lead Supplier",
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
    <div>
      <MessagingView
        role="agency"
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
