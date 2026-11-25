import { PencilSimple, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import type { ClientContactRecord } from "@/server/domain/client-contacts";
import { removeClientContactAction } from "@/server/fynix/actions";
import { AddContactForm, EditContactPersonForm } from "../forms/contact-person-forms";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";

/** The people Fynix speaks to at the client. Contacts, not logins: the People tab holds the people who sign in. An admin adds, edits and removes; staff read. */
export function ContactsPanel({ clientOrgId, contacts, canWrite }: { clientOrgId: string; contacts: readonly ClientContactRecord[]; canWrite: boolean }) {
  return (
    <Panel aria-label="Contact people">
      <PanelHeader
        title="Contact people"
        count={contacts.length}
        action={
          canWrite ? (
            <FormSheet
              trigger={
                <Button variant="secondary" size="sm">
                  <Plus aria-hidden />
                  Add contact
                </Button>
              }
              title="Add contact"
              description="Someone Fynix speaks to at the client. Nobody is invited and nothing is sent."
            >
              <AddContactForm clientOrgId={clientOrgId} />
            </FormSheet>
          ) : null
        }
      />
      {contacts.length === 0 ? (
        <p className="px-5 pb-5 text-body text-ink-muted">No contact people yet.</p>
      ) : (
        <ul className="flex flex-col pb-3">
          {contacts.map((person) => (
            <ListRow
              key={person.id}
              title={person.jobTitle === null ? person.name : `${person.name}, ${person.jobTitle}`}
              sub={[person.email, person.phone].filter((part): part is string => part !== null).join("  ") || undefined}
              trailing={
                canWrite ? (
                  <span className="flex items-center gap-1">
                    <FormSheet
                      trigger={
                        <Button variant="ghost" size="sm">
                          <PencilSimple aria-hidden />
                          Edit
                          <span className="sr-only"> {person.name}</span>
                        </Button>
                      }
                      title="Edit contact"
                      description="Change the details. An empty box clears that detail."
                    >
                      <EditContactPersonForm contact={person} />
                    </FormSheet>
                    <InlineAction action={removeClientContactAction} fields={{ contactId: person.id }} label={`Remove ${person.name}`} variant="ghost" savedMessage="Contact removed">
                      <Trash aria-hidden />
                      Remove
                    </InlineAction>
                  </span>
                ) : null
              }
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
