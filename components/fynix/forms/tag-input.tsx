"use client";

import { X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { cn } from "cn";

const split = (text: string): string[] => text.split(",").map((value) => value.trim()).filter((value) => value !== "");

type TagInputProps = {
  readonly id: string;
  /** The form field name. The values post as one comma separated string, which is what the server already reads. */
  readonly name: string;
  /** The values as one comma separated string. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly invalid?: boolean;
  readonly describedBy?: string | undefined;
};

/**
 * A list of short values: type one and press Enter (or a comma) to add it, click the cross or press Backspace on an empty box to remove one.
 * Text still in the box when the person leaves it is added too, so a value typed last is never lost on save.
 */
export function TagInput({ id, name, value, onChange, placeholder, invalid, describedBy }: TagInputProps) {
  const tags = split(value);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (text: string) => {
    const added = split(text);
    if (added.length > 0) {
      const known = new Set(tags.map((tag) => tag.toLowerCase()));
      const fresh = added.filter((tag) => (known.has(tag.toLowerCase()) ? false : (known.add(tag.toLowerCase()), true)));
      if (fresh.length > 0) onChange([...tags, ...fresh].join(", "));
    }
    setDraft("");
  };
  const remove = (index: number) => onChange(tags.filter((_, position) => position !== index).join(", "));

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      aria-invalid={invalid ? true : undefined}
      className={cn(
        "flex min-h-(--h-control) w-full cursor-text flex-wrap items-center gap-1.5 rounded-sm bg-input px-2 py-1.5 shadow-[inset_0_0_0_1px_var(--ctl-edge)] transition-[box-shadow,background-color] hover:bg-navy-05 focus-within:bg-surface focus-within:shadow-[inset_0_0_0_2px_var(--navy)]",
        invalid && "bg-red-soft shadow-[inset_0_0_0_2px_var(--red-solid)]"
      )}
    >
      {tags.map((tag, index) => (
        <span key={tag} className="inline-flex max-w-full items-center gap-1 rounded-sm bg-navy-06 py-0.5 pr-1 pl-2 text-[13px] text-ink">
          <span className="truncate">{tag}</span>
          <button type="button" aria-label={`Remove ${tag}`} onClick={() => remove(index)} className="inline-flex size-5 items-center justify-center rounded-sm text-ink-2 hover:bg-navy-05 hover:text-ink">
            <X aria-hidden size={12} weight="bold" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={draft}
        autoComplete="off"
        placeholder={tags.length === 0 ? placeholder : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const text = event.target.value;
          if (text.includes(",")) commit(text);
          else setDraft(text);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Enter adds the value; it must not submit the form.
            event.preventDefault();
            commit(draft);
          } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
            remove(tags.length - 1);
          }
        }}
        onBlur={() => commit(draft)}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-[16px] text-foreground outline-none placeholder:text-ink-muted md:text-[13.5px]"
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
