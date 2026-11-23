"use client";

import { ArrowBendUpRight, ChatsCircle, Check, Checks, Copy, DownloadSimple, File as FileIcon, FileText, Image as ImageIcon, MicrosoftExcelLogo, PaperPlaneRight, Plus, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markConversationReadAction, postMessageAction } from "@/server/domain/message-actions";
import { ALLOWED_TYPES, ATTACH_MENU, extensionOf, formatBytes, MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_BYTES, type AttachmentKind } from "@/lib/files/rules";
import { Hint } from "@/components/ui/hint";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MessageAttachmentView, ThreadMessageView } from "./messaging-view";

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
/** Messages from the same person within this many minutes read as one run: the name is shown once. */
const RUN_MINUTES = 5;
/** How often an open thread asks the server for new messages and read receipts, while the tab is visible. */
const REFRESH_MS = 15_000;

function dayLabel(date: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return DAY.format(date);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** One tick when the message is stored, two blue ticks once someone on the other side has opened the thread after it was sent. */
function Ticks({ seen }: { readonly seen: boolean }) {
  return seen ? (
    <Hint label="Seen"><span role="img" aria-label="Seen" className="inline-flex text-blue-solid"><Checks size={16} weight="bold" aria-hidden /></span></Hint>
  ) : (
    <Hint label="Sent"><span role="img" aria-label="Sent" className="inline-flex text-ink-muted"><Check size={16} weight="bold" aria-hidden /></span></Hint>
  );
}

function HoverButton({ label, onClick, children }: { readonly label: string; readonly onClick: () => void; readonly children: React.ReactNode }) {
  return (
    <Hint label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="grid size-8 place-items-center rounded-full bg-navy-05 text-ink-2 transition-colors hover:bg-navy-10 hover:text-ink focus-visible:bg-navy-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-navy max-md:size-10"
      >
        {children}
      </button>
    </Hint>
  );
}

function kindOf(contentType: string): AttachmentKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.includes("excel") || contentType.includes("spreadsheet")) return "spreadsheet";
  return "document";
}

function KindIcon({ kind, size = 20 }: { readonly kind: AttachmentKind; readonly size?: number }) {
  if (kind === "image") return <ImageIcon aria-hidden size={size} />;
  if (kind === "spreadsheet") return <MicrosoftExcelLogo aria-hidden size={size} />;
  return <FileText aria-hidden size={size} />;
}

/** The files on one message: an image shows as a picture, anything else as a card with its name and size. Every one downloads through the checked route. */
function AttachmentList({ items }: { readonly items: readonly MessageAttachmentView[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mb-1.5 flex flex-col gap-1.5">
      {items.map((item) => {
        const kind = kindOf(item.contentType);
        return (
          <li key={item.id}>
            {kind === "image" ? (
              <a href={`/api/attachments/${item.id}`} className="block overflow-hidden rounded-xl bg-navy-05">
                {/* eslint-disable-next-line @next/next/no-img-element -- a private, checked route: next/image would need to proxy it again */}
                <img src={`/api/attachments/${item.id}?inline=1`} alt={item.fileName} loading="lazy" className="max-h-64 w-full object-cover" />
              </a>
            ) : (
              <a href={`/api/attachments/${item.id}`} className="flex items-center gap-3 rounded-xl bg-surface/70 px-3 py-2.5 transition-colors hover:bg-surface">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-05 text-ink-2"><KindIcon kind={kind} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-table font-semibold text-ink">{item.fileName}</span>
                  <span className="block text-caption text-ink-muted">{formatBytes(item.sizeBytes)}</span>
                </span>
                <DownloadSimple aria-hidden size={18} className="shrink-0 text-ink-2" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface FlowProps {
  readonly messages: readonly ThreadMessageView[];
  readonly currentUserId: string;
  readonly conversationId: string;
  /** When someone on the other side last opened the thread, or null. */
  readonly seenAt: string | null;
  readonly attachments: readonly MessageAttachmentView[];
  readonly canForward: boolean;
  readonly onForward: (message: ThreadMessageView) => void;
}

/** The thread: day dividers, runs of bubbles, tick marks on your own, and copy and forward that appear when you hover a bubble. */
export function MessageFlow({ messages, currentUserId, conversationId, seenAt, attachments, canForward, onForward }: FlowProps) {
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const seenTime = seenAt === null ? null : new Date(seenAt).getTime();
  const now = useMemo(() => new Date(), []);

  // Opening a thread, and every new message while it is open, counts as reading it.
  useEffect(() => {
    void markConversationReadAction(conversationId);
  }, [conversationId, messages.length]);

  // Bring in new messages and read receipts without a reload.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversationId, messages.length]);

  async function copy(message: ThreadMessageView): Promise<void> {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 1600);
    } catch {
      setCopiedId(null);
    }
  }

  if (messages.length === 0) {
    return (
      <div className="m-auto flex max-w-[34ch] flex-col items-center gap-2 p-8 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-navy-05 text-ink-2"><ChatsCircle aria-hidden size={20} /></span>
        <p className="text-row font-semibold text-ink">No messages yet</p>
        <p className="text-table text-ink-2">Say hello below. Replies appear here.</p>
      </div>
    );
  }

  return (
    <div role="log" aria-live="polite" aria-label="Messages" className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-5 md:px-6">
      {messages.map((message, index) => {
        const mine = message.senderUserId === currentUserId;
        const created = new Date(message.createdAt);
        const previous = messages[index - 1];
        const previousDate = previous === undefined ? null : new Date(previous.createdAt);
        const newDay = previousDate === null || startOfDay(previousDate) !== startOfDay(created);
        const newRun = newDay || previous === undefined || previous.senderUserId !== message.senderUserId || (created.getTime() - (previousDate?.getTime() ?? 0)) / 60_000 > RUN_MINUTES;
        const seen = mine && seenTime !== null && seenTime >= created.getTime();
        const actions = (
          <div className="flex items-center gap-1 opacity-0 transition-opacity duration-(--dur-hover) group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 [@media(hover:none)]:hidden [@media(hover:none)]:group-focus-within/msg:flex">
            <HoverButton label={copiedId === message.id ? "Copied" : "Copy text"} onClick={() => void copy(message)}>
              {copiedId === message.id ? <Check size={16} weight="bold" aria-hidden /> : <Copy size={16} aria-hidden />}
            </HoverButton>
            {canForward ? (
              <HoverButton label="Forward to the other side" onClick={() => onForward(message)}>
                <ArrowBendUpRight size={16} aria-hidden />
              </HoverButton>
            ) : null}
          </div>
        );
        return (
          <div key={message.id} className="flex flex-col">
            {newDay ? (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-navy-05 px-3 py-1 text-caption font-semibold text-ink-2">{dayLabel(created, now)}</span>
              </div>
            ) : null}
            <div tabIndex={0} className={`group/msg flex items-center gap-1.5 outline-none ${mine ? "flex-row-reverse self-end" : "self-start"} ${newRun && !newDay ? "mt-3" : ""} max-w-[88%] md:max-w-[75%]`}>
              <div className={`min-w-0 rounded-2xl px-3.5 pt-2 pb-1.5 text-body ${mine ? "rounded-br-md bg-bubble-client text-ink" : "rounded-bl-md bg-bubble-fynix text-ink"}`}>
                {!mine && newRun ? (
                  <p className="mb-0.5 flex items-center gap-1.5 text-caption font-semibold text-ink-2">
                    {message.senderName}
                    <span className="rounded-full bg-navy-07 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-2">{message.senderRole}</span>
                  </p>
                ) : null}
                {message.forwardOfMessageId ? (
                  <p className="mb-1 flex items-center gap-1 text-caption text-ink-2">
                    <ArrowBendUpRight aria-hidden size={13} />
                    Forwarded{message.scrubbedCount > 0 ? `, ${message.scrubbedCount} contact detail${message.scrubbedCount > 1 ? "s" : ""} removed` : ""}
                  </p>
                ) : null}
                <AttachmentList items={attachments.filter((item) => item.messageId === message.id)} />
                {message.body.startsWith("Attached ") && attachments.some((item) => item.messageId === message.id) ? null : (
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
                )}
                <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-ink-muted">
                  <time dateTime={message.createdAt}>{TIME.format(created)}</time>
                  {mine ? <Ticks seen={seen} /> : null}
                </p>
              </div>
              {actions}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

/** A messenger-style composer: one rounded field that grows with the text, Enter to send on a computer, a round send button. */
export function MessageComposer({ conversationId, counterpartyName, allowFiles = true }: { readonly conversationId: string; readonly counterpartyName: string; readonly allowFiles?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(accept: string): void {
    const picker = pickerRef.current;
    if (picker === null) return;
    picker.accept = accept;
    picker.click();
  }

  /** A pasted screenshot arrives as "image.png"; give it a name people can tell apart. */
  function nameForPasted(file: File): File {
    if (!/^image\.(png|jpe?g)$/i.test(file.name)) return file;
    const stamp = new Date().toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/[/:]/g, ".").replace(", ", " ");
    return new File([file], `Screenshot ${stamp}.${extensionOf(file.name) === "png" ? "png" : "jpg"}`, { type: file.type });
  }

  function addFiles(picked: Iterable<File> | null, renamePasted = false): void {
    if (picked === null) return;
    const next = [...files];
    let message: string | null = null;
    for (const original of picked) {
      const file = renamePasted ? nameForPasted(original) : original;
      if (!ALLOWED_TYPES.some((type) => type.extensions.includes(extensionOf(file.name)))) {
        message = `${file.name} is not a PDF, Word, Excel, PNG or JPG file.`;
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        message = `${file.name} is larger than 10 MB.`;
        continue;
      }
      if (next.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        message = `Attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files to one message.`;
        break;
      }
      next.push(file);
    }
    setError(message);
    setFiles(next);
    if (pickerRef.current !== null) pickerRef.current.value = "";
  }

  function grow(): void {
    const field = fieldRef.current;
    if (field === null) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 144)}px`;
  }

  const empty = text.trim() === "" && files.length === 0;

  return (
    <div className="px-3 pt-2 pb-3 md:px-5 md:pb-4">
      {files.length > 0 ? (
        <ul aria-label="Files to send" className="mb-2 flex flex-wrap gap-2 px-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-2 rounded-full bg-navy-05 py-1 pr-1 pl-3 text-table text-ink-2">
              <FileIcon aria-hidden size={14} className="shrink-0" />
              <span className="max-w-44 truncate font-medium text-ink">{file.name}</span>
              <span className="text-caption text-ink-muted">{formatBytes(file.size)}</span>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, position) => position !== index))} className="grid size-6 place-items-center rounded-full hover:bg-navy-10"><X aria-hidden size={12} weight="bold" /></button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        ref={formRef}
        action={(formData) => {
          if (empty) return;
          setError(null);
          formData.delete("files");
          for (const file of files) formData.append("files", file);
          startTransition(async () => {
            const result = await postMessageAction({ status: "idle" }, formData);
            if (result.status === "error") {
              setError(result.message ?? "The message was not sent. Try again.");
              return;
            }
            setText("");
            setFiles([]);
            requestAnimationFrame(grow);
          });
        }}
        className={`flex items-end gap-2 rounded-[26px] bg-navy-05 py-1.5 pr-1.5 ${allowFiles ? "pl-1.5" : "pl-4"} transition-shadow focus-within:bg-surface focus-within:shadow-raised`}
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <input ref={pickerRef} type="file" multiple tabIndex={-1} aria-hidden className="hidden" onChange={(event) => addFiles(event.target.files === null ? null : Array.from(event.target.files))} />
        {allowFiles ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Attach a file"
            className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-navy-07 hover:text-ink data-[popup-open]:bg-navy-07 max-md:size-10"
          >
            <Plus aria-hidden size={20} weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={10} className="min-w-52">
            {ATTACH_MENU.map((entry) => (
              <DropdownMenuItem key={entry.kind} onClick={() => choose(entry.accept)} className="gap-3 py-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-navy-05 text-ink-2"><KindIcon kind={entry.kind} size={18} /></span>
                <span className="flex flex-col leading-tight">
                  <span className="text-table font-semibold text-ink">{entry.label}</span>
                  <span className="text-caption text-ink-muted">{entry.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        ) : null}
        <label htmlFor={`compose-${conversationId}`} className="sr-only">Message to {counterpartyName}</label>
        <textarea
          id={`compose-${conversationId}`}
          ref={fieldRef}
          name="body"
          rows={1}
          value={text}
          enterKeyHint="send"
          placeholder={`Message ${counterpartyName}`}
          onChange={(event) => {
            setText(event.target.value);
            grow();
          }}
          onPaste={(event) => {
            // A screenshot or a copied file attaches; pasted text still pastes as text.
            const pasted = Array.from(event.clipboardData.files);
            if (!allowFiles || pasted.length === 0) return;
            event.preventDefault();
            addFiles(pasted, true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              event.preventDefault();
              if (!empty) formRef.current?.requestSubmit();
            }
          }}
          className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 text-ink outline-none placeholder:text-ink-muted"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={empty || pending}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-offwhite shadow-btn-primary transition-[opacity,transform] duration-(--dur-press) active:scale-[0.96] disabled:opacity-35 disabled:shadow-none"
        >
          <PaperPlaneRight aria-hidden size={18} weight="fill" />
        </button>
      </form>
      {error !== null ? (
        <p role="alert" className="mt-2 px-2 text-caption text-red-text">{error}</p>
      ) : (
        <p className="mt-1.5 hidden px-4 text-[11px] text-ink-muted md:block">Enter to send, Shift and Enter for a new line</p>
      )}
    </div>
  );
}
