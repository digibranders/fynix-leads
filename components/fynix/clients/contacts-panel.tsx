import { EnvelopeSimple, PencilSimple, Trash } from "@phosphor-icons/react/dist/ssr";
import { ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import type { ClientContactRecord } from "@/server/domain/client-contacts";
import { inviteClientContactAction, removeClientContactAction } from "@/server/fynix/actions";
import { EditContactPersonForm } from "../forms/contact-person-forms";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";

/** Contacts saved before every person of a client had a login. An admin invites, edits and removes one; staff read. New people join through the People tab. */
export function ContactsPanel({ contacts, canWrite }: { contacts: readonly ClientContactRecord[]; canWrite: boolean }) {
  return (
    <Panel aria-label="Saved contacts">
      <PanelHeader title="Saved contacts" count={contacts.length} />
      <p className="px-5 pb-2 text-body text-ink-muted">Saved from before. Invite one to give them a login.</p>
      {contacts.length === 0 ? (
        <p className="px-5 pb-5 text-body text-ink-muted">No saved contacts.</p>
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
                    <InlineAction action={inviteClientContactAction} fields={{ contactId: person.id }} label={`Invite ${person.name} to the portal`} variant="secondary" size="sm" savedMessage="Invite sent">
                      <EnvelopeSimple aria-hidden />
                      Invite to portal
                    </InlineAction>
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
