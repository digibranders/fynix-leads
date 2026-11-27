import { cn } from "cn";
import { viewHtml } from "@/lib/rich-text-view";

/**
 * Stored rich text, read. The HTML was cleaned to a small subset when it was saved (lib/rich-text.ts); plain text from before becomes paragraphs.
 * Nothing the person typed is passed through as markup except that cleaned subset, so this is the only place `dangerouslySetInnerHTML` is used for it.
 */
export function RichText({ value, className }: { readonly value: string; readonly className?: string }) {
  const html = viewHtml(value);
  if (html === "") return null;
  return <div className={cn("rich whitespace-normal", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
