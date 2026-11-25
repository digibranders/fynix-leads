import { Archive, ArrowCounterClockwise, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { setOrganisationStatusAction } from "@/server/fynix/actions";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";
import { EditOrganisationForm } from "../forms/coordinator-forms";

/** Renames a client or a coordinator and sets its time zone. Shown only to an admin. */
export function EditOrganisationButton({ organisationId, name, timeZone, label }: { organisationId: string; name: string; timeZone: string | null; label: "Client" | "Coordinator" | "Agency" }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary">
          <PencilSimple aria-hidden />
          Edit
        </Button>
      }
      title={`Edit ${label.toLowerCase()}`}
      description="Change the name or the time zone."
    >
      <EditOrganisationForm organisationId={organisationId} name={name} timeZone={timeZone} label={label} />
    </FormSheet>
  );
}

/** Archives an active organisation or restores an archived one. Nothing is deleted, and an archived organisation takes no new invite or campaign. */
export function ArchiveToggle({ organisationId, name, status }: { organisationId: string; name: string; status: "active" | "archived" }) {
  const archiving = status === "active";
  return (
    <InlineAction action={setOrganisationStatusAction} fields={{ organisationId, status: archiving ? "archived" : "active" }} label={`${archiving ? "Archive" : "Restore"} ${name}`} variant="secondary" size="default">
      {archiving ? <Archive aria-hidden /> : <ArrowCounterClockwise aria-hidden />}
      {archiving ? "Archive" : "Restore"}
    </InlineAction>
  );
}
