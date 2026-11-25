import { ArrowCounterClockwise, EnvelopeSimple, PencilSimple, Prohibit, UserPlus, XCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { FormState } from "@/lib/fynix/form-state";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PersonRow } from "@/server/domain/people-overview";
import { reactivatePersonAction, resendInviteAction, revokeInviteAction, suspendPersonAction } from "@/server/fynix/actions";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";
import { EditPersonForm } from "../forms/people-forms";
import { FYNIX_ROLES, InvitePersonForm } from "../forms/coordinator-forms";

type Organisations = readonly { readonly id: string; readonly name: string }[];

/**
 * The "Invite person" button. With `href` it opens that page (the Fynix screens each have one); without it the form opens in a sheet,
 * which is how the coordinator portal's Team page uses it. `fynix` swaps in the Fynix roles and drops the alias.
 */
export function InvitePersonButton({ organisations, description, kind = "company", primary = false, action, href }: { organisations: Organisations; description: string; kind?: "company" | "agencies" | "fynix"; primary?: boolean; action?: (previous: FormState, formData: FormData) => Promise<FormState>; href?: string }) {
  if (href !== undefined) {
    return (
      <Link href={href} className={buttonVariants({ variant: primary ? "default" : "secondary" })}>
        <UserPlus aria-hidden />
        Invite person
      </Link>
    );
  }
  return (
    <FormSheet
      trigger={
        <Button variant={primary ? "default" : "secondary"}>
          <UserPlus aria-hidden />
          Invite person
        </Button>
      }
      title="Invite person"
      description={description}
    >
      {kind === "fynix" ? (
        <InvitePersonForm organisations={organisations} roles={FYNIX_ROLES} showAlias={false} roleHelper="An admin changes set-up. Staff read it and work leads." />
      ) : (
        <InvitePersonForm organisations={organisations} showAlias={kind === "agencies" && action === undefined} {...(action === undefined ? {} : { action })} />
      )}
    </FormSheet>
  );
}

/**
 * What an admin can do to one row: change a person's details, suspend or reactivate them, or resend or revoke an open invite. Nothing
 * for staff, and no suspend for the admin's own row (the domain refuses it too).
 */
export function PersonActions({ person, canWrite, selfUserId }: { person: PersonRow; canWrite: boolean; selfUserId: string }) {
  if (!canWrite) return null;
  if (person.kind === "invite") {
    return (
      <span className="flex items-center justify-end gap-1">
        <InlineAction action={resendInviteAction} fields={{ inviteId: person.id }} label={`Resend the invite to ${person.name}`} variant="ghost">
          <EnvelopeSimple aria-hidden />
          Resend
        </InlineAction>
        <InlineAction action={revokeInviteAction} fields={{ inviteId: person.id }} label={`Revoke the invite to ${person.name}`} variant="ghost">
          <XCircle aria-hidden />
          Revoke
        </InlineAction>
      </span>
    );
  }
  return (
    <span className="flex items-center justify-end gap-1">
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
        <EditPersonForm memberId={person.id} name={person.name} jobTitle={person.jobTitle} phone={person.phone} />
      </FormSheet>
      {person.state === "suspended" ? (
        <InlineAction action={reactivatePersonAction} fields={{ memberId: person.id }} label={`Reactivate ${person.name}`} variant="ghost">
          <ArrowCounterClockwise aria-hidden />
          Reactivate
        </InlineAction>
      ) : person.userId === selfUserId ? null : (
        <InlineAction action={suspendPersonAction} fields={{ memberId: person.id }} label={`Suspend ${person.name}`} variant="ghost">
          <Prohibit aria-hidden />
          Suspend
        </InlineAction>
      )}
    </span>
  );
}
