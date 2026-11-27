import { redirect } from "next/navigation";

/** The old address of the working hours page, kept so a bookmark still lands. */
export default function OldHostsPage(): never {
  redirect("/client/hours");
}
