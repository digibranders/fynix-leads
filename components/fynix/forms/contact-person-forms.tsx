"use client";

import { PencilSimple, Plus, X } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Hint } from "@/components/ui/hint";
import { Input } from "@/components/ui/input";
import { MAX_NEW_CONTACTS } from "@/server/domain/inputs";
import type { ClientContactRecord } from "@/server/domain/client-contacts";
import { addClientContactAction, updateClientContactAction } from "@/server/fynix/actions";
import { ActionForm, useFormState } from "./action-form";
import { FormGroup, Hidden, TextField } from "./form-parts";

interface DraftPerson {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
}

const EMPTY: DraftPerson = { name: "", email: "", phone: "" };
const isEmpty = (person: DraftPerson) => person.name.trim() === "" && person.email.trim() === "" && person.phone.trim() === "";

/**
 * One person already added: their details with Edit and Remove. Edit opens the three boxes in place with Save and Cancel; until Save the
 * form still carries the details as they were, and Save needs a name.
 */
function AddedPerson({ slot, person, messages, onSave, onRemove }: { slot: number; person: DraftPerson; messages: readonly string[]; onSave: (person: DraftPerson) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [changes, setChanges] = useState<DraftPerson>(person);
  const baseId = useId();

  return (
    <li className="flex flex-col gap-3 rounded-md bg-surface px-3.5 py-3">
      <input type="hidden" name={`contact${slot}Name`} value={person.name} />
      <input type="hidden" name={`contact${slot}Email`} value={person.email} />
      <input type="hidden" name={`contact${slot}Phone`} value={person.phone} />
      {editing ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Field id={`${baseId}-name`} label="Name">
              <Input id={`${baseId}-name`} value={changes.name} autoComplete="off" onChange={(event) => setChanges({ ...changes, name: event.target.value })} />
            </Field>
            <Field id={`${baseId}-email`} label="Email">
              <Input id={`${baseId}-email`} type="email" inputMode="email" value={changes.email} autoComplete="off" onChange={(event) => setChanges({ ...changes, email: event.target.value })} />
            </Field>
            <Field id={`${baseId}-phone`} label="Phone">
              <Input id={`${baseId}-phone`} value={changes.phone} autoComplete="off" onChange={(event) => setChanges({ ...changes, phone: event.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={changes.name.trim() === ""}
              onClick={() => {
                onSave(changes);
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setChanges(person);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-row font-semibold text-ink">{person.name}</p>
            <p className="text-caption break-words text-ink-muted">{[person.email, person.phone].filter((part) => part !== "").join("  ") || "No email or phone"}</p>
            {messages.map((message) => (
              <p key={message} role="alert" className="mt-1 text-xs text-red-text">
                {message}
              </p>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setChanges(person);
                setEditing(true);
              }}
            >
              <PencilSimple aria-hidden />
              Edit
              <span className="sr-only"> {person.name}</span>
            </Button>
            <Hint label={`Remove ${person.name}`} side="left">
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${person.name}`} onClick={onRemove}>
                <X aria-hidden />
              </Button>
            </Hint>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * The contact people on the Add client page: one set of boxes and an "Add contact person" button. Pressing it moves the person into the
 * list below the boxes and clears the boxes for the next one; each person in the list has Edit (the person's boxes open in place) and Remove. Whoever is still in the boxes
 * when the form is sent is added too, so nobody typed is lost. The people post as `contact<N>Name`, `contact<N>Email` and `contact<N>Phone`
 * (hidden boxes), and a person keeps their number when another is removed, so a problem the server finds shows under the right person.
 */
export function ContactPeopleFields() {
  const state = useFormState();
  const [people, setPeople] = useState<readonly { readonly slot: number; readonly person: DraftPerson }[]>([]);
  const [draft, setDraft] = useState<DraftPerson>(EMPTY);
  const [nextSlot, setNextSlot] = useState(0);
  const baseId = useId();
  const full = people.length >= MAX_NEW_CONTACTS;
  const problem = (slot: number, suffix: string): string | undefined => (state.status === "error" ? state.fields[`contact${slot}${suffix}`] : undefined);
  const draftSent = !isEmpty(draft) && !full;

  const add = () => {
    if (draft.name.trim() === "" || full) return;
    setPeople((current) => [...current, { slot: nextSlot, person: draft }]);
    setNextSlot((value) => value + 1);
    setDraft(EMPTY);
  };

  return (
    <FormGroup title="Contact people">
      <p className="text-xs text-muted-foreground">The people Fynix speaks to at the company. Add as many as you need. Nobody is invited by adding them here.</p>

      {people.length > 0 ? (
        <ul className="flex flex-col gap-2 md:col-span-2" aria-label="Contact people added">
          {people.map(({ slot, person }) => (
            <AddedPerson
              key={slot}
              slot={slot}
              person={person}
              messages={["Name", "Email", "Phone"].map((suffix) => problem(slot, suffix)).filter((message): message is string => message !== undefined)}
              onSave={(changed) => setPeople((current) => current.map((entry) => (entry.slot === slot ? { slot, person: changed } : entry)))}
              onRemove={() => setPeople((current) => current.filter((entry) => entry.slot !== slot))}
            />
          ))}
        </ul>
      ) : null}

      {draftSent ? (
        <>
          <input type="hidden" name={`contact${nextSlot}Name`} value={draft.name} />
          <input type="hidden" name={`contact${nextSlot}Email`} value={draft.email} />
          <input type="hidden" name={`contact${nextSlot}Phone`} value={draft.phone} />
        </>
      ) : null}

      <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
        <Field id={`${baseId}-name`} label="Name" error={draftSent ? problem(nextSlot, "Name") : undefined}>
          <Input id={`${baseId}-name`} value={draft.name} disabled={full} autoComplete="off" aria-invalid={draftSent && problem(nextSlot, "Name") !== undefined ? true : undefined} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </Field>
        <Field id={`${baseId}-email`} label="Email" error={draftSent ? problem(nextSlot, "Email") : undefined}>
          <Input id={`${baseId}-email`} type="email" inputMode="email" value={draft.email} disabled={full} autoComplete="off" aria-invalid={draftSent && problem(nextSlot, "Email") !== undefined ? true : undefined} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
        </Field>
        <Field id={`${baseId}-phone`} label="Phone" error={draftSent ? problem(nextSlot, "Phone") : undefined}>
          <Input id={`${baseId}-phone`} value={draft.phone} disabled={full} autoComplete="off" aria-invalid={draftSent && problem(nextSlot, "Phone") !== undefined ? true : undefined} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
        </Field>
      </div>

      <div className="md:col-span-2">
        <Button type="button" variant="secondary" size="sm" disabled={draft.name.trim() === "" || full} onClick={add}>
          <Plus aria-hidden />
          Add contact person
        </Button>
        {full ? <span className="ml-3 text-xs text-muted-foreground">That is the most you can add at once. Add more from the client page.</span> : null}
      </div>
    </FormGroup>
  );
}

/** Adds one contact person to a client that is already on the books. */
export function AddContactForm({ clientOrgId }: { clientOrgId: string }) {
  return (
    <ActionForm action={addClientContactAction} submitLabel="Add contact" pendingLabel="Adding" savedMessage="Contact added">
      <Hidden name="clientOrgId" value={clientOrgId} />
      <FormGroup>
        <TextField name="name" label="Name" />
        <TextField name="jobTitle" label="Job title (optional)" />
        <TextField name="email" label="Email (optional)" type="email" inputMode="email" />
        <TextField name="phone" label="Phone (optional)" />
      </FormGroup>
    </ActionForm>
  );
}

/** Changes a contact person. A box left empty clears that detail. */
export function EditContactPersonForm({ contact }: { contact: ClientContactRecord }) {
  return (
    <ActionForm action={updateClientContactAction} submitLabel="Save contact" pendingLabel="Saving" savedMessage="Contact saved">
      <Hidden name="contactId" value={contact.id} />
      <FormGroup>
        <TextField name="name" label="Name" defaultValue={contact.name} />
        <TextField name="jobTitle" label="Job title (optional)" defaultValue={contact.jobTitle ?? ""} />
        <TextField name="email" label="Email (optional)" type="email" inputMode="email" defaultValue={contact.email ?? ""} />
        <TextField name="phone" label="Phone (optional)" defaultValue={contact.phone ?? ""} />
      </FormGroup>
    </ActionForm>
  );
}
