import { redirect } from "next/navigation";

/** Disputes became Rejections: a client now answers after the meeting and Fynix reads the rejections. An old link lands on the new page. */
export default function DisputesPage(): never {
  redirect("/fynix/rejections");
}
