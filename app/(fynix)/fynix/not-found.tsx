import { Compass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";

/** An address under /fynix that names nothing, such as a campaign reference that does not exist. The shell stays, so the sidebar still works. */
export default function FynixNotFound() {
  return (
    <Panel className="mx-auto mt-10 max-w-md">
      <EmptyState
        icon={Compass}
        title="Not found"
        action={
          <Link href="/fynix/campaigns" className={buttonVariants({ variant: "default" })}>
            Back to campaigns
          </Link>
        }
      >
        That address does not match a coordinator or a campaign. Check the reference, or pick one from the list.
      </EmptyState>
    </Panel>
  );
}
