import { isRichEmpty, richToHtml } from "./rich-text";

/** One question a prospect is asked to qualify them, with the answer the client hopes to hear. Both are rich text (see lib/rich-text.ts). */
export type QualifyingItem = { readonly question: string; readonly answer: string };

/** The most questions a campaign holds, and the most characters in one question or one answer. */
export const MAX_QUALIFYING_ITEMS = 30;
export const MAX_QUALIFYING_CHARS = 6000;

/** The questions to show: the structured list when there is one, otherwise the old single text box split into one question per line. */
export function qualifyingItemsFor(items: readonly QualifyingItem[], legacyText: string): QualifyingItem[] {
  const filled = items.filter((item) => !isRichEmpty(item.question) || !isRichEmpty(item.answer));
  if (filled.length > 0) return filled.map((item) => ({ question: richToHtml(item.question), answer: richToHtml(item.answer) }));
  return legacyText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => ({ question: richToHtml(line), answer: "" }));
}
