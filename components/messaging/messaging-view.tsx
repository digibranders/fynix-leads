"use client";

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowBendUpRight, ArrowLeft, ArrowRight, ChatsCircle, MagnifyingGlass, ShieldCheck, UsersThree } from "@phosphor-icons/react";
import { EmptyState } from "@/components/kit/empty-state";
import { Tonal } from "@/components/kit/panel";
import { When } from "@/components/kit/when";
import { Button, buttonVariants } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint } from "@/components/ui/hint";
import { CONTROL } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { relayText } from "@/lib/relay/relay-text";
import { cn } from "@/lib/utils";
import { forwardMessageAction } from "@/server/domain/message-actions";
import { GroupPanel, NewChatMenu, type GroupInfoView } from "./group-chat";
import { MessageComposer, MessageFlow } from "./message-flow";

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
const LIST_DEFAULT = 280;
const LIST_MIN = 232;
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

/** Initials in a soft tile, the avatar shape of the language (9px corners). */
function Avatar({ name }: { readonly name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-sm bg-navy-06 text-[12px] font-semibold text-ink-2">
      {initials === "" ? "?" : initials}
    </span>
  );
}

function GroupAvatar() {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-sm bg-navy-06 text-ink-2">
      <UsersThree size={20} weight="fill" />
    </span>
  );
}

function ThreadListItem({ conv, isSelected, onSelect }: { readonly conv: ConversationSummary; readonly isSelected: boolean; readonly onSelect: () => void }) {
  const unread = conv.unreadCount !== undefined && conv.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
        isSelected ? "bg-selected before:absolute before:top-3 before:bottom-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-peach" : "hover:bg-navy-04",
      )}
    >
      {conv.side === "group" ? conv.isDirect === true ? <Avatar name={conv.subject ?? "Chat"} /> : <GroupAvatar /> : <Avatar name={conv.counterpartyName} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-row text-ink", unread ? "font-semibold" : "font-medium")}>{conv.side === "group" ? (conv.subject ?? "Group") : conv.counterpartyName}</span>
          {conv.lastMessageAt ? <When at={conv.lastMessageAt} style="day" className={cn("shrink-0 text-caption", unread ? "font-semibold text-ink" : "text-ink-muted")} /> : null}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-table text-ink-2">
            {conv.leadProspectName
              ? `${conv.leadProspectName}${conv.leadCompany ? `, ${conv.leadCompany}` : ""}`
              : conv.side === "group"
                ? conv.isDirect === true ? "Chat" : "Group chat"
                : (conv.lastMessageSnippet ?? conv.subject ?? "New conversation")}
          </span>
          {unread ? <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-xs bg-selected px-1.5 text-xs font-semibold text-peach-deep">{conv.unreadCount}</span> : null}
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
        className="rounded-xs bg-navy-05 px-1.5 py-0.5 font-mono text-caption text-ink-muted transition-colors hover:bg-navy-10 hover:text-ink-2"
      >
        {copied ? "Copied" : value}
      </button>
    </Hint>
  );
}

function getPrivacyNote(role: MessagingViewProps["role"], side: string): string {
  if (side === "client_fynix") {
    return role === "client" ? "Client side. Only your team and Fynix see this thread." : "Client side. Only the client and Fynix see this thread. Supply side does not.";
  }
  if (side === "supplier_fynix") {
    return role === "supplier" ? "Only your team and Fynix see this thread. Your agencies do not." : "Coordinator side. Only the coordinator and Fynix see this thread. Client does not.";
  }
  return "Partner side. Only the coordinator and agency see this thread. Fynix does not.";
}

/**
 * Threads on the left, the open conversation on the right, in one panel. The open thread is `?conv=`. On a phone the list and the
 * conversation take turns; that is decided by CSS, with one flag for which one is showing.
 */
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
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? (conversations[0]?.id ?? null));
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

  // The panel fills the screen from its own top edge to the bottom, so only the thread list and the messages scroll, never the page.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const main = root.closest("main");
    const fit = () => {
      const paddingBottom = main === null ? 0 : parseFloat(window.getComputedStyle(main).paddingBottom);
      const top = root.getBoundingClientRect().top + window.scrollY;
      // On a phone the glass tab bar floats over the foot of the screen: stop above it, so the composer is never under it.
      const bar = document.querySelector<HTMLElement>("nav.glass-ink");
      const barReserve = bar !== null && bar.offsetHeight > 0 ? window.innerHeight - bar.getBoundingClientRect().top + 12 : 0;
      const gap = Math.max(16, barReserve);
      root.style.height = `${Math.max(420, window.innerHeight - top - gap)}px`;
      // The page's own bottom padding would still make it scroll: take it back.
      root.style.marginBottom = `-${Math.max(0, paddingBottom - gap)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const needle = searchQuery.trim().toLowerCase();
  const filteredConversations = conversations.filter((c) => {
    if (filterTab === "unread" && (!c.unreadCount || c.unreadCount === 0)) return false;
    if (needle === "") return true;
    return (
      c.counterpartyName.toLowerCase().includes(needle) ||
      c.publicRef.toLowerCase().includes(needle) ||
      (c.subject?.toLowerCase().includes(needle) ?? false) ||
      (c.leadProspectName?.toLowerCase().includes(needle) ?? false) ||
      (c.leadCompany?.toLowerCase().includes(needle) ?? false)
    );
  });

  // Client side and supply side are grouped for Fynix only.
  const clientSide = filteredConversations.filter((c) => c.side === "client_fynix");
  const supplySide = filteredConversations.filter((c) => c.side === "supplier_fynix" || c.side === "supplier_agency");
  const groups = filteredConversations.filter((c) => c.side === "group");

  const forwardScrubResult = forwardingMessage ? relayText(forwardingMessage.body) : null;

  const item = (conv: ConversationSummary) => <ThreadListItem key={conv.id} conv={conv} isSelected={conv.id === selectedId} onSelect={() => openThread(conv.id)} />;
  const section = (title: string, rows: readonly ConversationSummary[]) =>
    rows.length === 0 ? null : (
      <div>
        <p className="px-3 pt-3 pb-1 text-caption font-semibold text-ink-muted">{title}</p>
        {rows.map(item)}
      </div>
    );

  return (
    <div ref={rootRef} className={cn("@container/mv flex min-h-[420px] overflow-hidden rounded-lg bg-surface shadow-raised", resizing && "select-none")}>
      <section
        aria-label="Threads"
        style={{ "--list-w": `${listWidth}px` } as React.CSSProperties}
        className={cn("relative flex w-full min-w-0 flex-col @min-[620px]/mv:w-[min(var(--list-w),38%)] @min-[620px]/mv:shrink-0 @min-[620px]/mv:shadow-[inset_-1px_0_0_var(--line)]", mobileChat && "@max-[619px]/mv:hidden")}
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
          className={cn("absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:transition-colors hover:after:bg-navy-10 focus-visible:after:bg-navy @max-[619px]/mv:hidden", resizing && "after:bg-navy-10")}
        />
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
          <div role="group" aria-label="Filter threads" className="inline-flex gap-0.5 rounded-sm bg-navy-05 p-0.5">
            {(["all", "unread"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={filterTab === tab}
                onClick={() => setFilterTab(tab)}
                className={cn(
                  "inline-flex h-7 items-center rounded-xs px-3 text-[13px] font-semibold transition-colors max-md:h-9 max-md:px-4",
                  filterTab === tab ? "bg-surface text-ink shadow-raised" : "text-ink-2 hover:text-ink",
                )}
              >
                {tab === "all" ? "All" : "Unread"}
              </button>
            ))}
          </div>
          {canCreateGroup ? <NewChatMenu onCreated={(id) => openThread(id)} /> : null}
        </div>

        <div className="shrink-0 px-4 pb-2">
          <div className="relative">
            <MagnifyingGlass aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" size={15} />
            <Label htmlFor={searchInputId} className="sr-only">
              Search threads by name, company or reference
            </Label>
            <input
              id={searchInputId}
              type="search"
              placeholder="Search threads"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(CONTROL, "h-(--h-control) w-full rounded-sm pr-3 pl-9 text-[16px] placeholder:text-ink-muted md:text-[13.5px]")}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {filteredConversations.length === 0 ? (
            <p className="p-8 text-center text-table text-ink-muted">{conversations.length === 0 ? "No conversations yet." : "No conversation matches."}</p>
          ) : role === "fynix" ? (
            <>
              {section("Client side", clientSide)}
              {section("Groups", groups)}
              {section("Supply side", supplySide)}
            </>
          ) : (
            filteredConversations.map(item)
          )}
        </div>
      </section>

      <section aria-label="Conversation" className={cn("@container/chat flex min-w-0 flex-1 flex-col", !mobileChat && "@max-[619px]/mv:hidden")}>
        {activeConversation ? (
          <>
            <div className="flex h-16 shrink-0 items-center gap-3 px-3 shadow-[inset_0_-1px_0_var(--line)] md:px-5">
              <Button type="button" variant="ghost" size="icon" aria-label="Back to conversations" onClick={() => setMobileChat(false)} className="@min-[620px]/mv:hidden">
                <ArrowLeft aria-hidden />
              </Button>
              {activeConversation.side === "group" ? (
                <button type="button" onClick={() => setPanelOpen(true)} aria-label="Group info" className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-offset-2 hover:bg-navy-04">
                  {activeConversation.isDirect === true ? <Avatar name={activeConversation.subject ?? "Chat"} /> : <GroupAvatar />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-row font-semibold text-ink">{activeConversation.subject ?? "Group"}</span>
                    <span className="block truncate text-caption text-ink-muted">
                      {activeConversation.isDirect === true ? "Private chat. Open for details." : `${groupInfo === null ? "Group" : `${groupInfo.memberCount} ${groupInfo.memberCount === 1 ? "person" : "people"}`}. Open for the list.`}
                    </span>
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
                          : (activeConversation.subject ?? getPrivacyNote(role, activeConversation.side))}
                      </span>
                    </p>
                  </div>
                </>
              )}
              {activeConversation.leadRef ? (
                <Link
                  href={`/${role === "fynix" ? "fynix/leads" : role === "client" ? "client/leads" : role === "supplier" ? "supplier/leads" : "agency/leads"}`}
                  className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0 @max-[619px]/mv:hidden" })}
                >
                  Open lead
                  <ArrowRight aria-hidden />
                </Link>
              ) : null}
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

            <Dialog open={forwardingMessage !== null} onOpenChange={(open) => (open ? undefined : setForwardingMessage(null))}>
              <DialogContent className="max-w-lg">
                {forwardingMessage !== null ? (
                  <form
                    className="grid gap-4"
                    action={async (formData) => {
                      if (!targetConvId) return;
                      startTransition(async () => {
                        await forwardMessageAction({ status: "idle" }, formData);
                        setForwardingMessage(null);
                      });
                    }}
                  >
                    <DialogHeader>
                      <DialogTitle>Forward this message</DialogTitle>
                      <DialogDescription>Contact details are removed automatically before it is forwarded.</DialogDescription>
                    </DialogHeader>
                    <input type="hidden" name="messageId" value={forwardingMessage.id} />
                    <input type="hidden" name="targetConversationId" value={targetConvId} />
                    {availableForwardTargets.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={forwardTargetSelectId}>Target conversation</Label>
                        <Choice
                          id={forwardTargetSelectId}
                          value={targetConvId}
                          onValueChange={setTargetConvId}
                          options={availableForwardTargets.map((target) => ({ value: target.id, label: `${target.label} (${target.publicRef})` }))}
                        />
                      </div>
                    ) : null}
                    <Tonal>
                      <p className="text-table leading-relaxed whitespace-pre-wrap text-ink">{forwardScrubResult?.text}</p>
                      <p className="mt-3 flex items-center gap-2 text-caption text-ink-2">
                        <ShieldCheck aria-hidden size={16} className="shrink-0" />
                        {forwardScrubResult?.removed ?? 0} contact details redacted before forwarding.
                      </p>
                    </Tonal>
                    <DialogFooter>
                      <Button type="button" variant="secondary" onClick={() => setForwardingMessage(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isPending || !targetConvId} aria-busy={isPending}>
                        <ArrowBendUpRight aria-hidden />
                        {isPending ? "Forwarding" : "Confirm and forward"}
                      </Button>
                    </DialogFooter>
                  </form>
                ) : null}
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <div className="m-auto">
            <EmptyState icon={ChatsCircle} title="Select a conversation">
              Pick a thread on the left to read and reply.
            </EmptyState>
          </div>
        )}
      </section>
    </div>
  );
}
