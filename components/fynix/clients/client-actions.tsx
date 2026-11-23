import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormSheet } from "../forms/form-sheet";
import { AddClientForm } from "../forms/supplier-forms";

/** The header button. Shown only to an admin. */
export function AddClientButton() {
  return (
    <FormSheet
      trigger={
        <Button>
          <Plus aria-hidden />
          Add client
        </Button>
      }
      title="Add client"
      description="A client is the company that buys the meetings."
    >
      <AddClientForm />
    </FormSheet>
  );
}
