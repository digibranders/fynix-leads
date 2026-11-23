"use client";

import { useId, useLayoutEffect, useSyncExternalStore, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowBendUpRight,
  ArrowLeft,
  ArrowRight,
  ChatsCircle,
  MagnifyingGlass,
  ShieldCheck,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import { relayText } from "@/lib/relay/relay-text";
import { Choice } from "@/components/ui/choice";
import { Hint } from "@/components/ui/hint";
import { GroupPanel, NewChatMenu, type GroupInfoView } from "./group-chat";
import { MessageComposer, MessageFlow } from "./message-flow";
import {
  forwardMessageAction,
} from "@/server/domain/message-actions";

export interface ConversationSummary {
  readonly id: string;
  readonly publicRef: string;
  readonly campaignId: string | null;
  readonly leadId: string | null;
  readonly side: "client_fynix" | "supplier_fynix" | "supplier_agency" | "group";
  readonly subject: string | null;
  /** A chat between two people (a group with two members): titled with the other person's first name. */
  readonly isDirect?: boolean;
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

export interface MessageAttachmentView {
  readonly id: string;
  readonly messageId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface ForwardTargetOption {
  readonly id: string;
  readonly publicRef: string;
  readonly label: string;
  readonly side: "client_fynix" | "supplier_fynix" | "supplier_agency" | "group";
}

export interface MessagingViewProps {
  readonly role: "client" | "supplier" | "agency" | "fynix";
  readonly currentUserId: string;
  readonly conversations: readonly ConversationSummary[];
  readonly initialConversationId?: string | null;
  readonly initialMessages?: readonly ThreadMessageView[];
  /** When someone on the other side last opened the open thread, so your sent messages can show as seen. */
  readonly seenAt?: string | null;
  /** The files sent in the open thread, matched to their messages by `messageId`. */
  readonly attachments?: readonly MessageAttachmentView[];
  /** Whether this person may start a group chat (a Fynix admin or a supplier manager). */
  readonly canCreateGroup?: boolean;
  /** The group behind the open thread, when it is one. */
  readonly groupInfo?: GroupInfoView | null;
  readonly availableForwardTargets?: readonly ForwardTargetOption[];
}

const LIST_WIDTH_KEY = "fynix-leads:thread-list-width";
const LIST_DEFAULT = 310;
const LIST_MIN = 290;
const LIST_MAX = 480;

const subscribeNothing = (): (() => void) => () => undefined;

function readSavedWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(LIST_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= LIST_MIN && saved <= LIST_MAX ? saved : LIST_DEFAULT;
  } catch {
    return LIST_DEFAULT;
  }
}

export function MessagingView({
  role,
  currentUserId,
  conversations,
  initialConversationId,
  initialMessages = [],
  seenAt = null,
  attachments = [],
  canCreateGroup = false,
  groupInfo = null,
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

  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [mobileChat, setMobileChat] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const savedWidth = useSyncExternalStore(subscribeNothing, readSavedWidth, () => LIST_DEFAULT);
  // What was dragged or set by key in this visit; until then the saved width (or the default on the server) applies.
  const [chosenWidth, setChosenWidth] = useState<number | null>(null);
  const listWidth = chosenWidth ?? savedWidth;
  const [resizing, setResizing] = useState(false);

  function setWidth(next: number, remember: boolean): void {
    const clamped = Math.min(LIST_MAX, Math.max(LIST_MIN, Math.round(next)));
    setChosenWidth(clamped);
    if (!remember) return;
    try {
      window.localStorage.setItem(LIST_WIDTH_KEY, String(clamped));
    } catch {
      /* not remembered */
    }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    setResizing(true);
    const move = (e: PointerEvent) => setWidth(e.clientX - left, false);
    const stop = (e: PointerEvent) => {
      setWidth(e.clientX - left, true);
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  /** Opens a thread: its messages come from the server for `?conv=`, so the address changes and the page data follows. */
  function openThread(id: string): void {
    setSelectedId(id);
    setMobileChat(true);
    if (id === selectedId) return;
    startNavigation(() => {
      router.replace(`${pathname}?conv=${encodeURIComponent(id)}`, { scroll: false });
    });
  }

  // The view fills the screen from its own top edge to the bottom, so only the thread list and the messages scroll, never the page.
  // On a phone it also runs edge to edge under the app bar.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const main = root.closest("main");
    const fit = () => {
      const phone = window.matchMedia("(max-width: 767px)").matches;
      const style = main === null ? null : window.getComputedStyle(main);
      const paddingBottom = style === null ? 0 : parseFloat(style.paddingBottom);
      const paddingTop = style === null ? 0 : parseFloat(style.paddingTop);
      root.style.marginLeft = root.style.marginRight = phone && style !== null ? `-${parseFloat(style.paddingLeft)}px` : "";
      root.style.marginTop = phone ? `-${paddingTop}px` : "";
      const top = root.getBoundingClientRect().top + window.scrollY;
      const gap = phone ? 0 : 16;
      root.style.height = `${Math.max(420, window.innerHeight - top - gap)}px`;
      // The page's own bottom padding would still make it scroll: take it back.
      root.style.marginBottom = `-${Math.max(0, paddingBottom - gap)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

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
  const groupConversations = filteredConversations.filter((c) => c.side === "group");

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
    <div
      ref={rootRef}
      style={{ height: "calc(100dvh - 9rem)" }}
      className={`flex min-h-[420px] overflow-hidden bg-surface md:rounded-lg md:shadow-raised ${resizing ? "select-none" : ""}`}
    >
      {/* Threads */}
      <section
        aria-label="Threads"
        style={{ "--list-w": `${listWidth}px` } as React.CSSProperties}
        className={`relative flex w-full min-w-0 flex-col md:w-[var(--list-w)] md:shrink-0 md:shadow-[inset_-1px_0_0_var(--line)] ${mobileChat ? "max-md:hidden" : ""}`}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the thread list"
          aria-valuemin={LIST_MIN}
          aria-valuemax={LIST_MAX}
          aria-valuenow={listWidth}
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={() => setWidth(LIST_DEFAULT, true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setWidth(listWidth - 16, true);
            else if (event.key === "ArrowRight") setWidth(listWidth + 16, true);
          }}
          className={`absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none outline-none max-md:hidden after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:transition-colors hover:after:bg-navy-10 focus-visible:after:bg-navy ${resizing ? "after:bg-navy-10" : ""}`}
        />
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-4 shadow-[inset_0_-1px_0_var(--line)]">
          <h1 className="min-w-0 truncate text-lead font-semibold tracking-title text-ink">Messages</h1>
          <div className="flex items-center gap-2">
          {canCreateGroup ? <NewChatMenu onCreated={(id) => openThread(id)} /> : null}
          <div role="group" aria-label="Filter threads" className="inline-flex gap-0.5 rounded-full bg-navy-05 p-[3px]">
            {(["all", "unread"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={filterTab === tab}
                onClick={() => setFilterTab(tab)}
                className={`inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold transition-colors max-md:h-10 max-md:px-4 ${
                  filterTab === tab ? "bg-navy text-offwhite shadow-btn-primary" : "text-ink-2 hover:text-ink"
                }`}
              >
                {tab === "all" ? "All" : "Unread"}
              </button>
            ))}
          </div>
          </div>
        </div>

        <div className="shrink-0 px-3 py-2">
          <div className="relative">
            <MagnifyingGlass aria-hidden className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" size={16} />
            <label htmlFor={searchInputId} className="sr-only">
              Search threads by name, company, or reference
            </label>
            <input
              id={searchInputId}
              type="search"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-full bg-navy-05 pr-4 pl-10 text-base text-ink outline-none transition-shadow placeholder:text-ink-muted focus:bg-surface focus:shadow-raised max-md:h-11"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filteredConversations.length === 0 ? (
            <p className="p-8 text-center text-table text-ink-muted">{conversations.length === 0 ? "No conversations yet." : "No conversation matches."}</p>
          ) : role === "fynix" ? (
            <>
              {clientSideConversations.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-caption font-semibold text-ink-muted">Client side</p>
                  {clientSideConversations.map((conv) => (
                    <ThreadListItem key={conv.id} conv={conv} isSelected={conv.id === selectedId} onSelect={() => openThread(conv.id)} />
                  ))}
                </div>
              )}
              {groupConversations.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-caption font-semibold text-ink-muted">Groups</p>
                  {groupConversations.map((conv) => (
                    <ThreadListItem key={conv.id} conv={conv} isSelected={conv.id === selectedId} onSelect={() => openThread(conv.id)} />
                  ))}
                </div>
              )}
              {supplySideConversations.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-caption font-semibold text-ink-muted">Supply side</p>
                  {supplySideConversations.map((conv) => (
                    <ThreadListItem key={conv.id} conv={conv} isSelected={conv.id === selectedId} onSelect={() => openThread(conv.id)} />
                  ))}
                </div>
              )}
            </>
          ) : (
            filteredConversations.map((conv) => (
              <ThreadListItem key={conv.id} conv={conv} isSelected={conv.id === selectedId} onSelect={() => openThread(conv.id)} />
            ))
          )}
        </div>
      </section>

      {/* Conversation */}
      <section aria-label="Conversation" className={`flex min-w-0 flex-1 flex-col bg-canvas/70 ${mobileChat ? "" : "max-md:hidden"}`}>
        {activeConversation ? (
          <>
            <div className="flex h-16 shrink-0 items-center gap-3 bg-surface px-3 shadow-[inset_0_-1px_0_var(--line)] md:px-4">
              <button
                type="button"
                aria-label="Back to conversations"
                onClick={() => setMobileChat(false)}
                className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-navy-07 md:hidden"
              >
                <ArrowLeft aria-hidden size={20} />
              </button>
              {activeConversation.side === "group" ? (
                <button type="button" onClick={() => setPanelOpen(true)} aria-label="Group info" className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-offset-2 hover:bg-navy-04">
                  {activeConversation.isDirect === true ? <Avatar name={activeConversation.subject ?? "Chat"} /> : <GroupAvatar />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-row font-semibold text-ink">{activeConversation.subject ?? "Group"}</span>
                    <span className="block truncate text-caption text-ink-muted">{activeConversation.isDirect === true ? "Private chat. Tap for details." : `${groupInfo === null ? "Group" : `${groupInfo.memberCount} ${groupInfo.memberCount === 1 ? "person" : "people"}`}. Tap for the list.`}</span>
                  </span>
                </button>
              ) : (
              <>
              <Avatar name={activeConversation.counterpartyName} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-row font-semibold text-ink">{activeConversation.counterpartyName}</span>
                  {activeConversation.leadRef ? <ThreadRef value={activeConversation.leadRef} /> : null}
                </div>
                <p className="flex min-w-0 items-center gap-1.5 text-caption text-ink-muted">
                  <ShieldCheck aria-hidden size={13} className="shrink-0" />
                  <span className="truncate">
                    {activeConversation.leadProspectName
                      ? `${activeConversation.leadProspectName}${activeConversation.leadCompany ? `, ${activeConversation.leadCompany}` : ""}`
                      : (activeConversation.subject ?? getPrivacyNote(activeConversation.side))}
                  </span>
                </p>
              </div>
              </>
              )}
              {activeConversation.leadRef && (
                <Link
                  href={`/${role === "fynix" ? "fynix/leads" : role === "client" ? "client/leads" : "agency/leads"}`}
                  className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0 gap-1 text-xs max-md:hidden" })}
                >
                  <span>Open lead</span>
                  <ArrowRight size={14} />
                </Link>
              )}
            </div>

            {navigating ? (
              <div className="flex flex-1 items-center justify-center text-table text-ink-muted">Opening conversation</div>
            ) : (
              <MessageFlow
                messages={initialMessages}
                currentUserId={currentUserId}
                conversationId={activeConversation.id}
                seenAt={seenAt}
                attachments={attachments}
                canForward={(role === "fynix" || role === "supplier") && activeConversation.side !== "group"}
                onForward={(message) => {
                  setForwardingMessage(message);
                  setTargetConvId(availableForwardTargets[0]?.id ?? "");
                }}
              />
            )}

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
                <Choice
                  id={forwardTargetSelectId}
                  value={targetConvId}
                  onValueChange={setTargetConvId}
                  options={availableForwardTargets.map((target) => ({ value: target.id, label: `${target.label} (${target.publicRef})` }))}
                />
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

            <MessageComposer conversationId={activeConversation.id} counterpartyName={activeConversation.side === "group" ? (activeConversation.subject ?? "the group") : activeConversation.counterpartyName} />
            {activeConversation.side === "group" && groupInfo !== null ? (
              <GroupPanel
                group={groupInfo}
                open={panelOpen}
                onOpenChange={setPanelOpen}
                onChanged={() => router.refresh()}
                onLeft={() => {
                  setPanelOpen(false);
                  setMobileChat(false);
                  router.replace(pathname, { scroll: false });
                }}
              />
            ) : null}
          </>
        ) : (
          <div className="m-auto flex max-w-[34ch] flex-col items-center gap-2 p-8 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-navy-05 text-ink-2"><ChatsCircle aria-hidden size={24} /></span>
            <p className="text-row font-semibold text-ink">Select a conversation</p>
            <p className="text-table text-ink-2">Pick a thread on the left to read and reply.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Avatar({ name }: { readonly name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  return (
    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-navy text-[13px] font-semibold text-offwhite">
      {initials === "" ? "?" : initials}
    </span>
  );
}

function GroupAvatar() {
  return (
    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-peach text-navy">
      <UsersThree size={22} weight="fill" />
    </span>
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
  const unread = conv.unreadCount !== undefined && conv.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? "bg-selected shadow-[inset_4px_0_0_var(--peach)]" : "hover:bg-navy-04"}`}
    >
      {conv.side === "group" ? (conv.isDirect === true ? <Avatar name={conv.subject ?? "Chat"} /> : <GroupAvatar />) : <Avatar name={conv.counterpartyName} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-row text-ink ${unread ? "font-semibold" : "font-medium"}`}>{conv.side === "group" ? (conv.subject ?? "Group") : conv.counterpartyName}</span>
          {conv.lastMessageAt && (
            <span className={`shrink-0 text-caption ${unread ? "font-semibold text-ink" : "text-ink-muted"}`}>
              {new Date(conv.lastMessageAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-table text-ink-2">
            {conv.leadProspectName
              ? `${conv.leadProspectName}${conv.leadCompany ? `, ${conv.leadCompany}` : ""}`
              : conv.side === "group"
                ? (conv.isDirect === true ? "Chat" : "Group chat")
                : (conv.lastMessageSnippet ?? conv.subject ?? "New conversation")}
          </span>
          {unread && (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-navy px-1.5 text-[11px] font-semibold text-offwhite">{conv.unreadCount}</span>
          )}
        </span>
      </span>
    </button>
  );
}

/** The lead's reference, which people do quote, so it copies in one click. A thread's own MSG reference stays out of sight; search still finds it. */
function ThreadRef({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Hint label="Copy lead reference">
    <button
      type="button"
      aria-label={`Copy lead reference ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded-full bg-navy-05 px-2 py-0.5 font-mono text-caption text-ink-muted transition-colors hover:bg-navy-10 hover:text-ink-2"
    >
      {copied ? "Copied" : value}
    </button>
    </Hint>
  );
}
