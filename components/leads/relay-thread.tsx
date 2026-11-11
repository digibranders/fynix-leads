"use client";

import { useEffect, useRef, useState } from "react";
import { Info, PaperPlaneTilt } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ThreadMessage } from "@/lib/domain/types";
import { dayHeading } from "@/lib/leads/activity";
import { scrubContactDetails } from "@/lib/relay/scrub";
import { formatDayInZone, formatTimeInZone } from "@/lib/time/zones";
import { cn } from "@/lib/utils";

type Props = {
  messages: ThreadMessage[];
  now: Date;
  viewerZone: string;
  /** Receives the text after contact details were removed. */
  onSend: (text: string) => void;
};

const removedNotice = (n: number): string => `We removed ${n} contact detail${n === 1 ? "" : "s"} from this message.`;

/** "Today, 8:20 am" for the current day, else "Tue 10 Nov, 9:10 am". */
function messageTime(at: Date, now: Date, viewerZone: string): string {
  const day = dayHeading(at, now, viewerZone).title === "Today" ? "Today" : formatDayInZone(at, viewerZone);
  return `${day}, ${formatTimeInZone(at, viewerZone)}`;
}

export function RelayThread({ messages, now, viewerZone, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seen = useRef(messages.length);

  // After a send, scroll so the new message, its notice and the compose box are all in view. Nothing moves on load.
  useEffect(() => {
    if (messages.length > seen.current) {
      formRef.current?.scrollIntoView({ block: "nearest" });
    }
    seen.current = messages.length;
  }, [messages.length]);

  function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (draft.trim() === "") return;
    const { text, removed } = scrubContactDetails(draft.trim());
    onSend(text);
    setDraft("");
    // The Send button disables itself, so focus goes back to the box for the next message.
    inputRef.current?.focus();
    const removedText = removed > 0 ? removedNotice(removed) : "";
    setNotice(removedText);
    setAnnouncement((a) => ({ text: `Message sent. ${removedText}`.trim(), count: a.count + 1 }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 px-6 pt-1.5 pb-5">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-1 py-6">
            <p className="text-[15px] font-semibold">No messages yet</p>
            <p className="max-w-prose text-body text-ink-2 text-pretty">
              Use this thread to ask the Fynix team about this lead. Their replies appear here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => {
              const own = m.side === "client";
              return (
                <li key={m.id} className={cn("flex max-w-[92%] flex-col @[34rem]:max-w-[84%]", own ? "items-end self-end" : "items-start self-start")}>
                  <p className="mb-[5px] flex flex-wrap gap-x-2 text-[12.5px] leading-4 font-semibold text-ink-2">
                    {m.author}
                    <time dateTime={m.at} className="font-normal text-ink-muted">
                      {messageTime(new Date(m.at), now, viewerZone)}
                    </time>
                  </p>
                  <p
                    className={cn(
                      "px-4 pt-[11px] pb-3 text-[14px] leading-[21px] break-words whitespace-pre-wrap",
                      own ? "rounded-[18px_6px_18px_18px] bg-bubble-client" : "rounded-[6px_18px_18px_18px] bg-bubble-fynix",
                    )}
                  >
                    {m.body}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {notice && <p className="self-end text-xs text-ink-muted">{notice}</p>}
      </div>

      <form ref={formRef} onSubmit={submit} className="relative px-6 pt-3.5 pb-[18px]">
        <span aria-hidden className="absolute top-0 right-6 left-6 h-px bg-line" />
        <Label htmlFor="relay-message" className="mb-2 leading-4">
          Message to the Fynix team
        </Label>
        <Textarea
          ref={inputRef}
          id="relay-message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Write a message"
          className="max-h-28 min-h-16 resize-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <p className="flex min-w-0 flex-1 basis-52 items-start gap-[7px] text-[12.5px] leading-4 text-ink-muted">
            <Info aria-hidden size={16} className="shrink-0" />
            Messages go through Fynix. Contact details are removed.
          </p>
          <Button type="submit" disabled={draft.trim() === ""} className="ml-auto shrink-0">
            <PaperPlaneTilt aria-hidden weight="fill" />
            Send
          </Button>
        </div>
      </form>

      <div aria-live="polite" className="sr-only">
        {/* A trailing no-break space on every other send makes a repeated sentence count as a change. */}
        {announcement.text}
        {announcement.count % 2 === 0 ? " " : ""}
      </div>
    </div>
  );
}
