"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowBendUpRight,
  ArrowRight,
  ChatsCircle,
  MagnifyingGlass,
  Paperclip,
  PaperPlaneRight,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import { relayText } from "@/lib/relay/relay-text";
import {
  forwardMessageAction,
  postMessageAction,
} from "@/server/domain/message-actions";

export interface ConversationSummary {
  readonly id: string;
  readonly publicRef: string;
  readonly campaignId: string;
  readonly leadId: string | null;
  readonly side: "client_fynix" | "supplier_fynix" | "supplier_agency";
  readonly subject: string | null;
  readonly counterpartyName: string;
  readonly leadRef?: string | null;
  readonly leadProspectName?: string | null;
  readonly leadCompany?: string | null;
  readonly lastMessageSnippet?: string | null;
  readonly lastMessageAt?: string | null;
  readonly unreadCount?: number;
}

export interface ThreadMessageView {
  readonly id: string;
  readonly conversationId: string;
  readonly senderUserId: string;
  readonly senderRole: "client" | "supplier" | "agency" | "fynix";
  readonly senderName: string;
  readonly body: string;
  readonly forwardOfMessageId: string | null;
  readonly scrubbedCount: number;
  readonly createdAt: string;
}

export interface ForwardTargetOption {
  readonly id: string;
  readonly publicRef: string;
  readonly label: string;
  readonly side: "client_fynix" | "supplier_fynix" | "supplier_agency";
}

export interface MessagingViewProps {
  readonly role: "client" | "supplier" | "agency" | "fynix";
  readonly currentUserId: string;
  readonly conversations: readonly ConversationSummary[];
  readonly initialConversationId?: string | null;
  readonly initialMessages?: readonly ThreadMessageView[];
  readonly availableForwardTargets?: readonly ForwardTargetOption[];
}

export function MessagingView({
  role,
  currentUserId,
  conversations,
  initialConversationId,
  initialMessages = [],
  availableForwardTargets = [],
}: MessagingViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversationId ?? (conversations[0]?.id ?? null),
  );
  const [filterTab, setFilterTab] = useState<"all" | "unread">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [forwardingMessage, setForwardingMessage] = useState<ThreadMessageView | null>(null);
  const [targetConvId, setTargetConvId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const searchInputId = useId();
  const forwardTargetSelectId = useId();

  const activeConversation = conversations.find((c) => c.id === selectedId);

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (filterTab === "unread" && (!c.unreadCount || c.unreadCount === 0)) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.counterpartyName.toLowerCase().includes(q) ||
      c.publicRef.toLowerCase().includes(q) ||
      (c.subject && c.subject.toLowerCase().includes(q)) ||
      (c.leadProspectName && c.leadProspectName.toLowerCase().includes(q)) ||
      (c.leadCompany && c.leadCompany.toLowerCase().includes(q))
    );
  });

  // Client side vs Supply side grouping for Fynix
  const clientSideConversations = filteredConversations.filter(
    (c) => c.side === "client_fynix",
  );
  const supplySideConversations = filteredConversations.filter(
    (c) => c.side === "supplier_fynix" || c.side === "supplier_agency",
  );

  // Scrubbed preview computation when forwarding
  const forwardScrubResult = forwardingMessage
    ? relayText(forwardingMessage.body)
    : null;

  function getPrivacyNote(side: string) {
    if (side === "client_fynix") {
      return role === "client"
        ? "Client side. Only your team and Fynix see this thread."
        : "Client side. Only the client and Fynix see this thread. Supply side does not.";
    }
    if (side === "supplier_fynix") {
      return role === "supplier"
        ? "Only your team and Fynix see this thread. Your agencies do not."
        : "Supplier side. Only the supplier and Fynix see this thread. Client does not.";
    }
    return "Partner side. Only the supplier and agency see this thread. Fynix does not.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[640px]">
        {/* Left Pane: Threads List */}
        <section
          aria-label="Threads list"
          className="md:col-span-5 lg:col-span-4 flex flex-col rounded-lg bg-surface  shadow-raised overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2">
              <span>Threads</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-canvas text-ink-2 font-mono">
                {conversations.length}
              </span>
            </h2>
            <div className="flex items-center gap-1 bg-canvas p-1 rounded-md text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`px-3 py-1 rounded transition-colors ${
                  filterTab === "all"
                    ? "bg-surface text-ink shadow-sm font-semibold"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("unread")}
                className={`px-3 py-1 rounded transition-colors ${
                  filterTab === "unread"
                    ? "bg-surface text-ink shadow-sm font-semibold"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                Unread
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="p-3 border-b border-line bg-canvas/40">
            <div className="relative">
              <MagnifyingGlass
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                size={16}
              />
              <label htmlFor={searchInputId} className="sr-only">
                Search threads by name, company, or ref
              </label>
              <input
                id={searchInputId}
                type="text"
                placeholder="Name, company, or ref..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full pl-9 pr-3 text-base rounded-md bg-surface  text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Threads table / list */}
          <div className="flex-1 overflow-y-auto divide-y divide-line">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink-muted">
                No conversation threads match your filter.
              </div>
            ) : role === "fynix" ? (
              <>
                {clientSideConversations.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-canvas/70 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                      Client side
                    </div>
                    {clientSideConversations.map((conv) => (
                      <ThreadListItem
                        key={conv.id}
                        conv={conv}
                        isSelected={conv.id === selectedId}
                        onSelect={() => setSelectedId(conv.id)}
                      />
                    ))}
                  </div>
                )}
                {supplySideConversations.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-canvas/70 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                      Supply side
                    </div>
                    {supplySideConversations.map((conv) => (
                      <ThreadListItem
                        key={conv.id}
                        conv={conv}
                        isSelected={conv.id === selectedId}
                        onSelect={() => setSelectedId(conv.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              filteredConversations.map((conv) => (
                <ThreadListItem
                  key={conv.id}
                  conv={conv}
                  isSelected={conv.id === selectedId}
                  onSelect={() => setSelectedId(conv.id)}
                />
              ))
            )}
          </div>
        </section>

        {/* Right Pane: Active Thread */}
        <section
          aria-label="Active conversation thread"
          className="md:col-span-7 lg:col-span-8 flex flex-col rounded-lg bg-surface  shadow-raised overflow-hidden"
        >
          {activeConversation ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-line flex items-start justify-between gap-4 bg-canvas/20">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink text-base">
                      {activeConversation.counterpartyName}
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-canvas text-ink-2 ">
                      {activeConversation.leadRef ?? activeConversation.publicRef}
                    </span>
                    {activeConversation.leadProspectName && (
                      <span className="text-sm text-ink-2 truncate">
                        {activeConversation.leadProspectName}
                        {activeConversation.leadCompany
                          ? `, ${activeConversation.leadCompany}`
                          : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-ink-muted">
                    <ShieldCheck size={14} className="text-primary flex-shrink-0" />
                    <span>{getPrivacyNote(activeConversation.side)}</span>
                  </div>
                </div>

                {activeConversation.leadRef && (
                  <Link
                    href={`/${role === "fynix" ? "fynix/leads" : role === "client" ? "client/leads" : "agency/leads"}`}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                      className: "flex-shrink-0 text-xs",
                    })}
                  >
                    <span>Open lead</span>
                    <ArrowRight size={14} className="ml-1" />
                  </Link>
                )}
              </div>

              {/* Messages Flow */}
              <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4 bg-canvas/10 min-h-[380px]">
                {initialMessages.length === 0 ? (
                  <div className="my-auto text-center p-8 text-sm text-ink-muted">
                    <ChatsCircle size={32} className="mx-auto mb-2 text-ink-muted/60" />
                    <p>No messages in this thread yet.</p>
                    <p className="text-xs text-ink-muted/80 mt-1">
                      Type a question or update below to start the conversation.
                    </p>
                  </div>
                ) : (
                  initialMessages.map((msg) => {
                    const isMine = msg.senderUserId === currentUserId;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col gap-1 max-w-[85%] ${
                          isMine ? "ml-auto items-end" : "mr-auto items-start"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs text-ink-muted">
                          <span className="font-medium text-ink-2">
                            {isMine ? "You" : msg.senderName}
                          </span>
                          {!isMine && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-canvas font-mono">
                              {msg.senderRole}
                            </span>
                          )}
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <div
                          className={`rounded-xl px-4 py-2.5 text-sm shadow-sm ${
                            isMine
                              ? "bg-navy text-offwhite rounded-br-none"
                              : "bg-surface text-ink  rounded-bl-none"
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>

                          {msg.forwardOfMessageId && (
                            <div className="mt-2 pt-2 border-t border-line text-xs opacity-80 flex items-center gap-1">
                              <ArrowBendUpRight size={13} />
                              <span>Forwarded message</span>
                              {msg.scrubbedCount > 0 && (
                                <span className="ml-1 font-mono text-[10px]">
                                  ({msg.scrubbedCount} contact detail
                                  {msg.scrubbedCount > 1 ? "s" : ""} scrubbed)
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Forward button for Fynix and Supplier */}
                        {(role === "fynix" || role === "supplier") && (
                          <button
                            type="button"
                            onClick={() => {
                              setForwardingMessage(msg);
                              setTargetConvId(
                                availableForwardTargets[0]?.id ?? "",
                              );
                            }}
                            className="text-[11px] text-ink-muted hover:text-primary flex items-center gap-1 mt-0.5 transition-colors"
                          >
                            <ArrowBendUpRight size={12} />
                            <span>Forward to other side</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Forward Box / Modal (when forward is active) */}
              {forwardingMessage && (
                <div className="p-4 border-t border-amber-200 bg-amber-50/60 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                      <ArrowBendUpRight size={14} className="text-amber-700" />
                      <span>Forward message with automated contact redaction</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setForwardingMessage(null)}
                      className="text-amber-700 hover:text-amber-900 text-xs"
                      aria-label="Close forward preview"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {availableForwardTargets.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={forwardTargetSelectId}
                        className="text-xs font-medium text-amber-900"
                      >
                        Target conversation
                      </label>
                      <select
                        id={forwardTargetSelectId}
                        value={targetConvId}
                        onChange={(e) => setTargetConvId(e.target.value)}
                        className="text-xs p-2 rounded border border-amber-300 bg-surface text-ink focus:ring-1 focus:ring-amber-500"
                      >
                        {availableForwardTargets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.label} ({target.publicRef})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="p-2.5 rounded bg-surface border border-amber-200 text-xs text-ink whitespace-pre-wrap leading-relaxed">
                    {forwardScrubResult?.text}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-amber-800">
                    <ShieldCheck size={16} className="text-amber-700 flex-shrink-0" />
                    <span>
                      {forwardScrubResult?.removed ?? 0} contact details
                      automatically redacted before forwarding.
                    </span>
                  </div>

                  <form
                    action={async (formData) => {
                      if (!targetConvId) return;
                      startTransition(async () => {
                        await forwardMessageAction(
                          { status: "idle" },
                          formData,
                        );
                        setForwardingMessage(null);
                      });
                    }}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="messageId" value={forwardingMessage.id} />
                    <input
                      type="hidden"
                      name="targetConversationId"
                      value={targetConvId}
                    />
                    <button
                      type="submit"
                      disabled={isPending || !targetConvId}
                      className={buttonVariants({
                        variant: "default",
                        size: "sm",
                        className: "text-xs",
                      })}
                    >
                      {isPending ? "Forwarding..." : "Confirm & Forward"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForwardingMessage(null)}
                      className={buttonVariants({
                        variant: "secondary",
                        size: "sm",
                        className: "text-xs",
                      })}
                    >
                      Cancel
                    </button>
                  </form>
                </div>
              )}

              {/* Message Composer */}
              <div className="p-4 border-t border-line bg-surface flex flex-col gap-2">
                <form
                  action={async (formData) => {
                    startTransition(async () => {
                      await postMessageAction({ status: "idle" }, formData);
                    });
                  }}
                  className="flex flex-col gap-2"
                >
                  <input
                    type="hidden"
                    name="conversationId"
                    value={activeConversation.id}
                  />

                  <div className="relative rounded-lg  bg-surface focus-within:border-primary focus-within:ring-1 focus-within:ring-primary overflow-hidden">
                    <textarea
                      name="body"
                      required
                      rows={2}
                      placeholder={`Write a message to ${activeConversation.counterpartyName}...`}
                      className="w-full p-3 text-base text-ink placeholder:text-ink-muted resize-none focus:outline-none"
                    />

                    <div className="p-2 border-t border-line flex items-center justify-between bg-canvas/30">
                      <div className="text-[11px] text-ink-muted flex items-center gap-1.5">
                        <Paperclip size={14} className="text-ink-muted" />
                        <span>PDF, Word, Excel, images up to 10 MB</span>
                      </div>

                      <button
                        type="submit"
                        disabled={isPending}
                        className={buttonVariants({
                          variant: "default",
                          size: "sm",
                          className: "gap-1.5 text-xs font-semibold px-4",
                        })}
                      >
                        <span>Send</span>
                        <PaperPlaneRight size={14} />
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="my-auto text-center p-12 text-ink-muted">
              <ChatsCircle size={40} className="mx-auto mb-3 text-ink-muted/40" />
              <h3 className="font-semibold text-ink-2 text-sm">No thread selected</h3>
              <p className="text-xs text-ink-muted mt-1">
                Select a conversation thread from the left pane to view messages.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ThreadListItem({
  conv,
  isSelected,
  onSelect,
}: {
  readonly conv: ConversationSummary;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-3.5 flex items-start justify-between gap-3 transition-colors ${
        isSelected
          ? "bg-selected shadow-[inset_4px_0_0_var(--peach)]"
          : "hover:bg-canvas/50"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-ink truncate">
            {conv.counterpartyName}
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-canvas text-ink-muted ">
            {conv.leadRef ?? conv.publicRef}
          </span>
        </div>

        <div className="text-xs text-ink-2 truncate mt-0.5 font-medium">
          {conv.leadProspectName
            ? `${conv.leadProspectName}${conv.leadCompany ? `, ${conv.leadCompany}` : ""}`
            : conv.subject ?? "General Discussion"}
        </div>

        {conv.lastMessageSnippet && (
          <div className="text-xs text-ink-muted truncate mt-1">
            {conv.lastMessageSnippet}
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0 text-right">
        {conv.lastMessageAt && (
          <span className="text-[11px] text-ink-muted">
            {new Date(conv.lastMessageAt).toLocaleDateString("en-GB", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
        {conv.unreadCount !== undefined && conv.unreadCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-offwhite font-mono font-bold">
            {conv.unreadCount}
          </span>
        )}
      </div>
    </button>
  );
}
