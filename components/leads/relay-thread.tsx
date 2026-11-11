"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/dev/field";
import { Textarea } from "@/components/ui/textarea";
import type { ThreadMessage } from "@/lib/domain/types";
import { scrubContactDetails } from "@/lib/relay/scrub";
import { formatDayInZone, formatTimeInZone } from "@/lib/time/zones";
import { cn } from "@/lib/utils";

type Props = {
  messages: ThreadMessage[];
  viewerZone: string;
  /** Receives the text after contact details were removed. */
  onSend: (text: string) => void;
};

const removedNotice = (n: number): string => `We removed ${n} contact detail${n === 1 ? "" : "s"} from this message.`;

export function RelayThread({ messages, viewerZone, onSend }: Props) {
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
    <div className="flex flex-col gap-4">
      {messages.length === 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">No messages yet</p>
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            Use this thread to ask the Fynix team about this lead. Their replies appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => {
            const own = m.side === "client";
            const at = new Date(m.at);
            return (
              <li key={m.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "flex max-w-[85%] min-w-0 flex-col gap-1 rounded-lg px-3 py-2.5",
                    own ? "bg-muted" : "border bg-card",
                  )}
                >
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-medium text-foreground">{m.author}</span>
                    <time dateTime={m.at} className="text-muted-foreground">
                      {formatDayInZone(at, viewerZone)}, {formatTimeInZone(at, viewerZone)}
                    </time>
                  </p>
                  <p className="text-sm break-words whitespace-pre-wrap text-pretty">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {notice && <p className="-mt-1 text-right text-xs text-muted-foreground">{notice}</p>}

      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-2 border-t pt-4">
        <p className="text-xs text-muted-foreground">Messages go through Fynix. Contact details are removed.</p>
        <Field id="relay-message" label="Message to the Fynix team">
          <Textarea
            ref={inputRef}
            id="relay-message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
          />
        </Field>
        <div className="flex">
          <Button type="submit" disabled={draft.trim() === ""} className="ml-auto shrink-0 max-lg:h-11 max-lg:px-4">
            Send
          </Button>
        </div>
      </form>

      <div aria-live="polite" className="sr-only">
        {/* A trailing no-break space on every other send makes a repeated sentence count as a change. */}
        {announcement.text}
        {announcement.count % 2 === 0 ? "\u00a0" : ""}
      </div>
    </div>
  );
}
