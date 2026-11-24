import { Plus, Prohibit } from "@phosphor-icons/react/dist/ssr";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { ConfirmAction } from "@/components/fynix/forms/confirm-action";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { When } from "@/components/kit/when";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { removeExclusionAction } from "@/server/domain/exclusion-actions";
import type { ExclusionRecord } from "@/server/domain/exclusions";
import { AddExclusionForm } from "./exclusion-forms";

const KIND_LABEL: Readonly<Record<string, string>> = { domain: "Domain", email: "Email", company: "Company" };

/**
 * The client's exclusion list: what agencies may not send. A manager adds and removes entries (removing asks first); everyone else at the client reads
 * the list and sees no control. The domain refuses a non-manager either way.
 */
export function ExclusionList({ entries, clientOrgId, canWrite }: { readonly entries: readonly ExclusionRecord[]; readonly clientOrgId: string; readonly canWrite: boolean }) {
  const add = canWrite ? (
    <FormSheet
      trigger={
        <Button type="button" variant="default">
          <Plus aria-hidden weight="bold" />
          Add an exclusion
        </Button>
      }
      title="Add an exclusion"
      description="Name a domain or a company that agencies may not send."
    >
      <AddExclusionForm clientOrgId={clientOrgId} />
    </FormSheet>
  ) : null;

  return (
    <Panel aria-label="Exclusion list">
      <PanelHeader title="Excluded" count={entries.length} action={add} />
      {entries.length === 0 ? (
        <EmptyState icon={Prohibit} title="Nothing is excluded" action={add ?? undefined}>
          {canWrite ? "Add a domain or a company name and agencies cannot send a lead for it." : "A manager of your company can add domains and company names that agencies may not send."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col px-2.5 pb-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-3 py-3 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-row font-semibold break-all">
                  {entry.value}
                  <Badge variant="quiet" size="sm">
                    {KIND_LABEL[entry.kind] ?? entry.kind}
                  </Badge>
                </p>
                {entry.reason !== null && entry.reason !== "" ? <p className="mt-0.5 text-body text-ink-2">{entry.reason}</p> : null}
                <p className="mt-0.5 text-caption text-ink-muted">
                  Added <When at={entry.createdAt} style="day" />
                </p>
              </div>
              {canWrite ? (
                <ConfirmAction
                  action={removeExclusionAction}
                  fields={{ exclusionId: entry.id }}
                  trigger="Remove"
                  triggerLabel={`Remove ${entry.value} from the exclusion list`}
                  title="Remove this exclusion?"
                  description="Agencies will be able to send leads for it again."
                  confirmLabel="Remove"
                  savedMessage="Removed from the exclusion list"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
