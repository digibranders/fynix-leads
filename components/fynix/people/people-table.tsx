import { Users } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Person } from "@/components/kit/person";
import { StatusChip } from "@/components/kit/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PersonRow } from "@/server/domain/people-overview";
import { PersonActions } from "./people-actions";

type Props = {
  people: readonly PersonRow[];
  canWrite: boolean;
  /** The signed-in admin's account, so their own row offers no suspend. */
  selfUserId: string;
  /** The Agency column, for a coordinator whose people sit in several companies. */
  showOrganisation?: boolean;
  title?: string;
  /** The button above the table (Invite person). */
  action?: React.ReactNode;
  emptyHint?: string;
  /** What a portal puts in the last column of a row (edit, or nothing yet); the Fynix admin actions when absent. */
  rowActions?: (person: PersonRow) => React.ReactNode;
  /** An extra column with one control per person, such as the meeting emails switch. */
  extraColumn?: { readonly head: string; readonly cell: (person: PersonRow) => React.ReactNode };
};

/** Everyone on a record: name and job title, email, phone, role and status, with the admin's row actions. Contact details drop under the name on a phone. */
export function PeopleTable({ people, canWrite, selfUserId, showOrganisation = false, title = "People", action, emptyHint, rowActions, extraColumn }: Props) {
  return (
    <Panel aria-label={title}>
      <PanelHeader title={title} count={people.length} action={action} />
      {people.length === 0 ? (
        <EmptyState icon={Users} title="Nobody here yet">
          {emptyHint ?? (canWrite ? "Invite a person to start." : "A Fynix admin invites people.")}
        </EmptyState>
      ) : (
        <div className="px-2.5 pb-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>th]:bg-navy-04">
                <TableHead>Person</TableHead>
                {showOrganisation ? <TableHead className="max-md:hidden">Agency</TableHead> : null}
                <TableHead className="max-md:hidden">Email</TableHead>
                <TableHead className="max-lg:hidden">Phone</TableHead>
                <TableHead className="max-md:hidden">Role</TableHead>
                <TableHead>Status</TableHead>
                {extraColumn === undefined ? null : <TableHead>{extraColumn.head}</TableHead>}
                {canWrite || rowActions !== undefined ? <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => (
                <TableRow key={`${person.kind}-${person.id}`}>
                  <TableCell>
                    <Person name={person.name} sub={person.jobTitle ?? undefined} />
                    <span className="block truncate pt-1 text-caption text-ink-muted md:hidden">{person.email}</span>
                    {showOrganisation ? <span className="block truncate text-caption text-ink-muted md:hidden">{person.orgName}</span> : null}
                  </TableCell>
                  {showOrganisation ? <TableCell className="max-md:hidden">{person.orgName}</TableCell> : null}
                  <TableCell className="max-md:hidden">{person.email}</TableCell>
                  <TableCell className="max-lg:hidden">{person.phone ?? "Not given"}</TableCell>
                  <TableCell className="max-md:hidden">{person.role === "manager" ? "Manager" : "Member"}</TableCell>
                  <TableCell>
                    <StatusChip kind="person" status={person.state} size="sm" />
                  </TableCell>
                  {extraColumn === undefined ? null : <TableCell>{extraColumn.cell(person)}</TableCell>}
                  {canWrite || rowActions !== undefined ? (
                    <TableCell>{rowActions === undefined ? <PersonActions person={person} canWrite={canWrite} selfUserId={selfUserId} /> : rowActions(person)}</TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
