"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Notice } from "@/components/auth/notice";
import { termsParagraphs } from "@/lib/domain/invite-page-copy";
import { PLACEHOLDER_NOTICE } from "@/lib/terms/placeholder";

export interface TermsView {
  readonly title: string;
  readonly version: number;
  readonly body: string;
  readonly placeholder: boolean;
}

/** The terms to read: title, version, the PLACEHOLDER notice while the text is not lawyer-approved, and the text in a keyboard-scrollable region that fades while more remains. Plain text only. */
export function TermsPanel({ terms }: { terms: TermsView }) {
  const titleId = useId();
  const [more, setMore] = useState(false);
  // shortcut: measured on mount and on scroll only, not on resize; a resize that changes the overflow keeps the old cue until the next scroll.
  const measure = (element: HTMLElement | null): void => {
    if (element) setMore(element.scrollHeight - element.scrollTop - element.clientHeight > 2);
  };
  return (
    <section aria-labelledby={titleId}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="text-value leading-[1.35] font-semibold">
          {terms.title}
        </h2>
        <span className="shrink-0 text-label font-medium text-ink-muted">Version {terms.version}</span>
      </div>
      {terms.placeholder && (
        <Notice tone="amber" compact role="note" icon={WarningCircle} className="mt-2.5">
          {PLACEHOLDER_NOTICE}
        </Notice>
      )}
      <div className="relative mt-2.5">
        <div
          ref={measure}
          role="region"
          aria-labelledby={titleId}
          tabIndex={0}
          onScroll={(event) => measure(event.currentTarget)}
          className="max-h-[168px] overflow-auto rounded-sm bg-navy-05 px-3.5 py-3 text-table leading-5 text-ink outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-ring"
        >
          {termsParagraphs(terms.body).map((line, index) => (
            <p key={index} className={index === 0 ? undefined : "mt-2"}>
              {line}
            </p>
          ))}
        </div>
        {more && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[30px] rounded-b-sm bg-gradient-to-b from-transparent to-[#F3F4F5]" />}
      </div>
    </section>
  );
}
