import { Plus, UserPlus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { AddAgencyForm, AddSupplierForm, InvitePersonForm } from "../forms/supplier-forms";
import { FormSheet } from "../forms/form-sheet";

/** The header button. Shown only to an admin. */
export function AddSupplierButton({ primary = true }: { primary?: boolean }) {
  return (
    <FormSheet
      trigger={
        <Button variant={primary ? "default" : "secondary"} size={primary ? "default" : "sm"}>
          <Plus aria-hidden />
          Add coordinator
        </Button>
      }
      title="Add coordinator"
      description="A coordinator is an agency that works with Fynix directly."
    >
      <AddSupplierForm />
    </FormSheet>
  );
}

export function AddAgencyButton({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary">
          <Plus aria-hidden />
          Add agency
        </Button>
      }
      title="Add agency"
      description={`A partner agency that works under ${supplierName}.`}
    >
      <AddAgencyForm supplierId={supplierId} />
    </FormSheet>
  );
}

export function InvitePersonButton({ organisations, supplierName }: { organisations: readonly { readonly id: string; readonly name: string }[]; supplierName: string }) {
  return (
    <FormSheet
      trigger={
        <Button>
          <UserPlus aria-hidden />
          Invite a person
        </Button>
      }
      title="Invite a person"
      description={`They get an email with a link to set a password. They join ${supplierName} or one of its agencies.`}
    >
      <InvitePersonForm organisations={organisations} />
    </FormSheet>
  );
}
