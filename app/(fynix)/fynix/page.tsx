import { redirect } from "next/navigation";

/** Suppliers is the first live screen, so the Fynix home goes there until Overview exists. */
export default function FynixHome(): never {
  redirect("/fynix/suppliers");
}
