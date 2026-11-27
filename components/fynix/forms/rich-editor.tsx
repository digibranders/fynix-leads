"use client";

import { Eraser, LinkSimple, ListBullets, ListNumbers, TextB, TextHTwo, TextItalic, TextUnderline } from "@phosphor-icons/react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "cn";
import { useEffect, useId, useRef, useState } from "react";
import { Field } from "@/components/ui/field";
import { CONTROL } from "@/components/ui/input";
import { viewHtml } from "@/lib/rich-text-view";
import { useFormState } from "./action-form";

/**
 * The rich text box used for the long answers on a campaign. Typing and pasting (from Word, Google Docs or a web page) keep bold, italic,
 * underline, headings, lists and links; everything else is dropped by the editor's own schema, and the server cleans what it receives again
 * (lib/rich-text.ts). The value is the editor's HTML, or "" when there is nothing in it.
 */

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: { openOnClick: false, autolink: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" } },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    blockquote: false,
  }),
];

function ToolButton({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the focus in the editor so the selection the command acts on is not lost.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-sm text-ink-2 transition-colors hover:bg-navy-06 focus-visible:outline-2 focus-visible:outline-navy disabled:opacity-40",
        active && "bg-navy-08 text-navy",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [address, setAddress] = useState("");
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      heading: current.isActive("heading"),
      bullets: current.isActive("bulletList"),
      numbers: current.isActive("orderedList"),
      link: current.isActive("link"),
    }),
  });
  const openLink = () => {
    setAddress((editor.getAttributes("link").href as string | undefined) ?? "https://");
    setLinkOpen(true);
  };
  const applyLink = () => {
    const href = address.trim();
    if (href === "" || href === "https://") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  };
  return (
    <div className="flex flex-col">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 shadow-[inset_0_-1px_0_var(--line)]">
        <ToolButton label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <TextB aria-hidden weight="bold" size={15} />
        </ToolButton>
        <ToolButton label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <TextItalic aria-hidden weight="bold" size={15} />
        </ToolButton>
        <ToolButton label="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <TextUnderline aria-hidden weight="bold" size={15} />
        </ToolButton>
        <ToolButton label="Heading" active={state.heading} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <TextHTwo aria-hidden weight="bold" size={15} />
        </ToolButton>
        <ToolButton label="Bulleted list" active={state.bullets} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <ListBullets aria-hidden weight="bold" size={15} />
        </ToolButton>
        <ToolButton label="Numbered list" active={state.numbers} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListNumbers aria-hidden weight="bold" size={15} />
        </ToolButton>
        <ToolButton label="Link" active={state.link} onClick={openLink}>
          <LinkSimple aria-hidden weight="bold" size={15} />
        </ToolButton>
        <ToolButton label="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          <Eraser aria-hidden weight="bold" size={15} />
        </ToolButton>
      </div>
      {linkOpen ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 shadow-[inset_0_-1px_0_var(--line)]">
          <input
            aria-label="Link address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") setLinkOpen(false);
            }}
            autoFocus
            className="h-8 min-w-0 flex-1 rounded-sm bg-input px-2 text-[13px] outline-none focus-visible:bg-surface focus-visible:shadow-[inset_0_0_0_2px_var(--navy)]"
          />
          <button type="button" onClick={applyLink} className="h-8 rounded-sm px-2.5 text-[13px] font-semibold text-navy hover:bg-navy-06">
            Apply
          </button>
          <button type="button" onClick={() => setLinkOpen(false)} className="h-8 rounded-sm px-2 text-[13px] text-ink-2 hover:bg-navy-06">
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

type EditorProps = {
  readonly id: string;
  /** The HTML to show. A change that did not come from typing here replaces what is in the box (a paste from Word applied by the dialog). */
  readonly value: string;
  readonly onChange: (html: string) => void;
  readonly label: string;
  readonly invalid?: boolean;
  readonly describedBy?: string | undefined;
  readonly minHeight?: string;
};

/** The editor itself: a toolbar over the writing area, in the app's tonal input look. The caller holds the value. */
export function RichEditor({ id, value, onChange, label, invalid = false, describedBy, minHeight = "min-h-[3.75rem]" }: EditorProps) {
  const lastEmitted = useRef(value);
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: viewHtml(value),
    immediatelyRender: false,
    editorProps: { attributes: { id, role: "textbox", "aria-multiline": "true", "aria-label": label, ...(describedBy === undefined ? {} : { "aria-describedby": describedBy }), class: cn("rich px-3 py-2.5 text-[13.5px] outline-none [&_em]:italic [&_strong]:font-bold [&_u]:underline", minHeight) } },
    onUpdate: ({ editor: current }) => {
      const html = current.isEmpty ? "" : current.getHTML();
      lastEmitted.current = html;
      onChange(html);
    },
  });

  // A value set from outside (a paste applied by the dialog, or a failed save restoring what was typed) replaces the content; typing does not loop back.
  useEffect(() => {
    if (editor === null || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(viewHtml(value), { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className={cn(CONTROL, "flex flex-col rounded-sm focus-within:bg-surface focus-within:shadow-[inset_0_0_0_2px_var(--navy)]")} aria-invalid={invalid ? true : undefined}>
      {editor === null ? <div className="h-9 shadow-[inset_0_-1px_0_var(--line)]" /> : <Toolbar editor={editor} />}
      {editor === null ? <div className={cn("rich px-3 py-2.5 text-[13.5px] [&_em]:italic [&_strong]:font-bold [&_u]:underline", minHeight)} dangerouslySetInnerHTML={{ __html: viewHtml(value) }} /> : <EditorContent editor={editor} />}
    </div>
  );
}

/**
 * A labelled rich text field that posts its HTML under `name`, like the plain boxes beside it. After a failed save it shows what was typed.
 * Give it `value` and `onChange` when something else (the Word paste dialog) also sets it.
 */
export function RichField({
  name,
  label,
  helper,
  defaultValue = "",
  value,
  onChange,
}: {
  name: string;
  label: string;
  helper?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (html: string) => void;
}) {
  const id = `${useId()}-${name}`;
  const state = useFormState();
  const error = state.status === "error" ? state.fields[name] : undefined;
  const restored = state.status === "error" ? (state.values[name] ?? defaultValue) : defaultValue;
  const [own, setOwn] = useState(restored);
  const current = value ?? own;
  const set = (html: string) => {
    setOwn(html);
    onChange?.(html);
  };
  return (
    <Field id={id} label={label} helper={helper} error={error}>
      <RichEditor id={id} value={current} onChange={set} label={label} invalid={error !== undefined} describedBy={error !== undefined || helper !== undefined ? `${id}-message` : undefined} />
      <input type="hidden" name={name} value={current} />
    </Field>
  );
}
