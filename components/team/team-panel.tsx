import { PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { EditPersonForm } from "@/components/fynix/forms/people-forms";
import { InvitePersonButton } from "@/components/fynix/people/people-actions";
import { PeopleTable } from "@/components/fynix/people/people-table";
import { Button } from "@/components/ui/button";
import type { PersonRow } from "@/server/domain/people-overview";
import type { TeamRow } from "@/server/domain/team";
import { editTeamPersonAction, inviteTeamPersonAction, setMeetingEmailsAction } from "@/server/domain/team-actions";
import { MeetingEmailsSwitch } from "./meeting-emails-switch";

type Props = {
  people: readonly TeamRow[];
  /** The caller's own organisation: its id (the rows of the caller's own organisation carry none) and its name. */
  own: { readonly id: string; readonly name: string };
  /** Whoever the caller may invite into: the caller's organisation, and for a coordinator its partner agencies. */
  inviteInto: readonly { readonly id: string; readonly name: string }[];
  /** The caller is an active manager: they see the invite button, and a client manager sees the edit and switch controls. */
  canWrite: boolean;
  /** A client's manager edits people and sets the meeting emails switch; a coordinator or agency manager only invites. */
  isClient: boolean;
  /** Show the Agency column: a coordinator's people sit in several companies. */
  showOrganisation?: boolean;
  inviteDescription: string;
  emptyHint: string;
};

/** A Team page's list: the same people table Fynix reads, wired to the portal's own forms. A person who is not a manager sees the list and nothing to press. */
export function TeamPanel({ people, own, inviteInto, canWrite, isClient, showOrganisation = false, inviteDescription, emptyHint }: Props) {
  const rows = people.map(
    (row): PersonRow => ({
      kind: row.kind,
      id: row.id,
      userId: null,
      orgId: row.orgId ?? own.id,
      orgName: row.orgName,
      name: row.name,
      jobTitle: row.jobTitle,
      email: row.email,
      phone: row.phone,
      role: row.role,
      state: row.state,
    }),
  );
  const meetingEmails = new Map(people.map((row) => [`${row.kind}-${row.id}`, row.meetingEmails]));
  const editable = canWrite && isClient;
  return (
    <PeopleTable
      title="People"
      people={rows}
      canWrite={editable}
      selfUserId=""
      showOrganisation={showOrganisation}
      emptyHint={emptyHint}
      action={canWrite ? <InvitePersonButton organisations={inviteInto} description={inviteDescription} action={inviteTeamPersonAction} primary /> : null}
      {...(isClient
        ? {
            extraColumn: {
              head: "Gets meeting emails",
              cell: (person: PersonRow) =>
                person.kind === "member" ? (
                  editable ? (
                    <MeetingEmailsSwitch action={setMeetingEmailsAction} memberId={person.id} name={person.name} enabled={meetingEmails.get(`member-${person.id}`) ?? true} />
                  ) : (
                    <span className="text-table text-ink-2">{meetingEmails.get(`member-${person.id}`) === false ? "No" : "Yes"}</span>
                  )
                ) : null,
            },
          }
        : {})}
      {...(editable
        ? {
            rowActions: (person: PersonRow) =>
              person.kind === "member" ? (
                <span className="flex items-center justify-end">
                  <FormSheet
                    trigger={
                      <Button variant="ghost" size="sm">
                        <PencilSimple aria-hidden />
                        Edit
                        <span className="sr-only"> details of {person.name}</span>
                      </Button>
                    }
                    title="Edit details"
                    description="Change the name, job title or phone. The email stays as it is."
                  >
                    <EditPersonForm memberId={person.id} name={person.name} phone={person.phone} action={editTeamPersonAction} />
                  </FormSheet>
                </span>
              ) : null,
          }
        : {})}
    />
  );
}
