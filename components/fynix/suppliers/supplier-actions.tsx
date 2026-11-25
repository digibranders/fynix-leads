import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { AddAgencyForm, AddSupplierForm } from "../forms/supplier-forms";
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
      description="A coordinator is an agency that works with Fynix directly. Add it, and invite its first person if you have one."
    >
      <AddSupplierForm />
    </FormSheet>
  );
}

/** Inside a coordinator (`supplierId` and `supplierName`) or on the Agencies page (`coordinators`, to pick from). */
export function AddAgencyButton({ supplierId, supplierName, coordinators, primary = false }: { supplierId?: string; supplierName?: string; coordinators?: readonly { readonly id: string; readonly name: string }[]; primary?: boolean }) {
  return (
    <FormSheet
      trigger={
        <Button variant={primary ? "default" : "secondary"}>
          <Plus aria-hidden />
          Add agency
        </Button>
      }
      title="Add agency"
      description={supplierName === undefined ? "A partner agency works under a coordinator." : `A partner agency that works under ${supplierName}.`}
    >
      <AddAgencyForm supplierId={supplierId} coordinators={coordinators} />
    </FormSheet>
  );
}
