import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormSheet } from "../forms/form-sheet";
import { PublishTermsForm } from "../forms/settings-forms";

/** The button in the Terms panel. Shown only to an admin. */
export function PublishTermsButton() {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <Plus aria-hidden />
          Publish terms
        </Button>
      }
      title="Publish terms"
      description="People accept these before they first use the portal. An invite cannot go out to a side that has none."
    >
      <PublishTermsForm />
    </FormSheet>
  );
}
