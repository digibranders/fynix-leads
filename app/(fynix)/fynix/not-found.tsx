import { Compass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/fynix/empty-state";
import { Button } from "@/components/ui/button";

/** An address under /fynix that names nothing, such as a campaign reference that does not exist. The shell stays, so the rail still works. */
export default function FynixNotFound() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-lg bg-surface shadow-raised">
      <EmptyState
        icon={Compass}
        title="Not found"
        action={
          <Button nativeButton={false} render={<Link href="/fynix/suppliers" />}>
            Back to suppliers
          </Button>
        }
      >
        That address does not match a supplier or a campaign. Check the reference, or pick one from the list.
      </EmptyState>
    </div>
  );
}
