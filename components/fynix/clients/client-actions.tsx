import { Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** The header button: opens the Add client page. Shown only to an admin. */
export function AddClientButton() {
  return (
    <Link href="/fynix/clients/new" className={buttonVariants()}>
      <Plus aria-hidden />
      Add client
    </Link>
  );
}
