import Link from "next/link";
import { PencilSimple, Note } from "@phosphor-icons/react/dist/ssr";
import { ConfirmAction } from "@/components/fynix/forms/confirm-action";
import { EmptyState } from "@/components/kit/empty-state";
import { Person } from "@/components/kit/person";
import { When } from "@/components/kit/when";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { discardDraftAction } from "@/server/domain/draft-actions";

export interface DraftRow {
  readonly id: string;
  readonly publicRef: string;
  readonly campaignId: string;
  readonly prospectName: string;
  readonly prospectCompany: string;
  readonly updatedAt: Date | string;
}

/**
 * The drafts of the signed-in organisation: each one opens the lead form with its fields filled in (`?draft=`), or is discarded after a confirm step.
 * Only the organisation that wrote a draft reads this list; the client never learns a draft exists.
 */
export function DraftsTable({ drafts, newHref, campaigns }: { readonly drafts: readonly DraftRow[]; readonly newHref: string; readonly campaigns: Readonly<Record<string, { readonly name: string }>> }) {
  if (drafts.length === 0) {
    return (
      <EmptyState icon={Note} title="No drafts">
        Save a lead as a draft from the lead form and finish it later. Only your company can see a draft.
      </EmptyState>
    );
  }
  return (
    <div className="px-2.5">
      <Table>
        <TableHeader>
          <TableRow className="hover:[&>th]:bg-navy-04">
            <TableHead>Prospect</TableHead>
            <TableHead className="max-md:hidden">Campaign</TableHead>
            <TableHead className="max-lg:hidden">Last saved</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drafts.map((draft) => (
            <TableRow key={draft.id} className="relative">
              <TableCell>
                <Person name={draft.prospectName} href={`${newHref}?draft=${draft.publicRef}`} sub={draft.prospectCompany === "" ? <span className="font-mono">{draft.publicRef}</span> : draft.prospectCompany} />
              </TableCell>
              <TableCell className="max-md:hidden">{campaigns[draft.campaignId]?.name ?? "Campaign"}</TableCell>
              <TableCell className="text-ink-muted max-lg:hidden">
                <When at={draft.updatedAt} style="day" />
              </TableCell>
              <TableCell className="text-right">
                <span className="relative inline-flex items-center justify-end gap-1.5">
                  <Link href={`${newHref}?draft=${draft.publicRef}`} className={buttonVariants({ variant: "secondary", size: "xs" })}>
                    <PencilSimple aria-hidden weight="bold" />
                    Continue
                  </Link>
                  <ConfirmAction
                    action={discardDraftAction}
                    fields={{ leadId: draft.id }}
                    trigger="Discard"
                    triggerLabel={`Discard the draft for ${draft.prospectName}`}
                    title="Discard this draft?"
                    description="The draft is removed. It was never sent, so the client does not know about it."
                    confirmLabel="Discard draft"
                    savedMessage="Draft discarded"
                  />
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
