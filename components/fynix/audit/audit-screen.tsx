import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { NATIVE_FIELD } from "@/components/kit/field-classes";
import { Pager } from "@/components/kit/pager";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { When } from "@/components/kit/when";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AUDIT_PAGE_SIZE, auditHref, type AuditFilter } from "@/lib/fynix/audit-filter";
import { auditSentence } from "@/lib/fynix/audit-text";
import type { AuditPage } from "@/server/domain/audit-overview";

const BASE = "/fynix/audit";

/** The audit log for a Fynix admin: a filter that is a plain GET form (it works without script), then a paged table, newest first. */
export function AuditScreen({ data, filter }: { readonly data: AuditPage; readonly filter: AuditFilter }) {
  const from = data.total === 0 ? 0 : (data.page - 1) * AUDIT_PAGE_SIZE + 1;
  const to = data.total === 0 ? 0 : from + data.rows.length - 1;
  const filtered = filter.prefix !== "" || filter.subject !== "" || filter.person !== "" || filter.q !== "";
  return (
    <div className="flex flex-col gap-4">
      <Panel aria-label="Filters">
        <form action={BASE} className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
          <label className="flex min-w-0 flex-col gap-1.5 text-label font-semibold text-ink-muted">
            Search
            <input type="search" name="q" defaultValue={filter.q} placeholder="A word in the action, reference or name" maxLength={80} className={NATIVE_FIELD} />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-label font-semibold text-ink-muted">
            Kind of change
            <select name="action" defaultValue={filter.prefix} className={NATIVE_FIELD}>
              <option value="">All changes</option>
              {data.prefixes.map((prefix) => (
                <option key={prefix} value={prefix}>
                  {prefix.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-label font-semibold text-ink-muted">
            Subject reference
            <input type="text" name="subject" defaultValue={filter.subject} placeholder="For example CMP-7Q2X" maxLength={40} autoCapitalize="characters" spellCheck={false} className={NATIVE_FIELD} />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-label font-semibold text-ink-muted">
            Person
            <select name="person" defaultValue={filter.person} className={NATIVE_FIELD}>
              <option value="">Everyone</option>
              {data.people.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" size="default">
              Apply
            </Button>
            {filtered ? (
              <a href={BASE} className="rounded-xs px-2 text-body font-semibold text-primary underline-offset-4 hover:underline">
                Clear
              </a>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel aria-label="Audit log">
        <PanelHeader title="Recorded changes" count={data.total} />
        {data.rows.length === 0 ? (
          <EmptyState icon={ClockCounterClockwise} title={filtered ? "Nothing matches" : "Nothing recorded yet"}>
            {filtered ? "Try a different word or clear a filter." : "Every change a Fynix person makes to set-up or to a lead is recorded here."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What happened</TableHead>
                <TableHead>Subject</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-ink-muted">
                    <When at={row.at} />
                  </TableCell>
                  <TableCell className="font-semibold">{row.by ?? "Unknown person"}</TableCell>
                  <TableCell>
                    <span className="block">{auditSentence(row.action)}</span>
                    <span className="block font-mono text-caption text-ink-muted">{row.action}</span>
                  </TableCell>
                  <TableCell className="font-mono text-ink-2">{row.subjectRef ?? row.subjectTable.replace(/_/g, " ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager from={from} to={to} total={data.total} prevHref={data.page > 1 ? auditHref(BASE, { ...filter, page: data.page - 1 }) : undefined} nextHref={data.page < data.pages ? auditHref(BASE, { ...filter, page: data.page + 1 }) : undefined} />
      </Panel>
    </div>
  );
}
