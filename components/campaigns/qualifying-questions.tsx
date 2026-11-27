import { RichText } from "@/components/ui/rich-text";
import { qualifyingItemsFor, type QualifyingItem } from "@/lib/qualifying-items";
import { isHtmlEmpty } from "@/lib/rich-text-view";

/**
 * The questions the sales team asks a prospect, each with the answer the client hopes to hear. A campaign set up before the list existed shows its
 * old single text box, one question per line. Returns null when there is nothing, so the caller shows its own "Not set".
 */
export function QualifyingQuestionsView({ items, legacyText }: { readonly items: readonly QualifyingItem[]; readonly legacyText: string }) {
  const list = qualifyingItemsFor(items, legacyText);
  if (list.length === 0) return null;
  return (
    <ol className="flex flex-col gap-3">
      {list.map((item, index) => (
        <li key={`${index}-${item.question}`} className="grid grid-cols-[1.5rem_1fr] gap-2">
          <span className="pt-px text-caption font-semibold text-ink-muted tabular-nums">{index + 1}</span>
          <div className="min-w-0">
            <RichText value={item.question} className="font-medium text-ink" />
            {isHtmlEmpty(item.answer) ? null : (
              <div className="mt-1.5">
                <p className="text-caption font-semibold text-ink-muted">Expected answer</p>
                <RichText value={item.answer} className="text-ink-2" />
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
