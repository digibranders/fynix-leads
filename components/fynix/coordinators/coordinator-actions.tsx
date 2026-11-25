import { Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** The header button: opens the Add coordinator page. Shown only to an admin. */
export function AddCoordinatorButton({ primary = true }: { primary?: boolean }) {
  return (
    <Link href="/fynix/coordinators/new" className={buttonVariants({ variant: primary ? "default" : "secondary", size: primary ? "default" : "sm" })}>
      <Plus aria-hidden />
      Add coordinator
    </Link>
  );
}

/** Opens the Add agency page. Inside a coordinator (`coordinatorId`) the page starts with that coordinator; on the Agencies page it asks. */
export function AddAgencyButton({ coordinatorId, primary = false }: { coordinatorId?: string; primary?: boolean }) {
  const href = coordinatorId === undefined ? "/fynix/agencies/new" : `/fynix/agencies/new?coordinator=${encodeURIComponent(coordinatorId)}`;
  return (
    <Link href={href} className={buttonVariants({ variant: primary ? "default" : "secondary" })}>
      <Plus aria-hidden />
      Add agency
    </Link>
  );
}
