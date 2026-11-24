import { Plus } from "@phosphor-icons/react/dist/ssr";
import { FormSheet } from "@/components/fynix/forms/form-sheet";
import { Button } from "@/components/ui/button";
import { AddPartnerAgencyForm } from "./team-forms";

/** The "Add agency" button of the coordinator's Partner agencies page, with its form in a sheet. Shown to a coordinator manager only. */
export function AddAgencyButton() {
  return (
    <FormSheet
      trigger={
        <Button>
          <Plus aria-hidden />
          Add agency
        </Button>
      }
      title="Add agency"
      description="A partner agency works under your coordinator account. You give it campaigns, and invite its people from the Team page."
    >
      <AddPartnerAgencyForm />
    </FormSheet>
  );
}
