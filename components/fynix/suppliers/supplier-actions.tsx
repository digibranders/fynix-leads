import { Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** The header button: opens the Add coordinator page. Shown only to an admin. */
export function AddSupplierButton({ primary = true }: { primary?: boolean }) {
  return (
    <Link href="/fynix/suppliers/new" className={buttonVariants({ variant: primary ? "default" : "secondary", size: primary ? "default" : "sm" })}>
      <Plus aria-hidden />
      Add coordinator
    </Link>
  );
}

/** Opens the Add agency page. Inside a coordinator (`supplierId`) the page starts with that coordinator; on the Agencies page it asks. */
export function AddAgencyButton({ supplierId, primary = false }: { supplierId?: string; primary?: boolean }) {
  const href = supplierId === undefined ? "/fynix/agencies/new" : `/fynix/agencies/new?coordinator=${encodeURIComponent(supplierId)}`;
  return (
    <Link href={href} className={buttonVariants({ variant: primary ? "default" : "secondary" })}>
      <Plus aria-hidden />
      Add agency
    </Link>
  );
}
