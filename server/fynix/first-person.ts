import { fieldErrors, type FormValues } from "@/lib/fynix/form-state";
import { firstPersonSchema } from "@/server/domain/inputs";
import type { FirstInvite } from "@/server/domain/suppliers";
import { domainMessage } from "@/server/fynix/errors";

/** The form fields of the optional "First person" group on Add coordinator and Add agency. */
export const FIRST_PERSON_FIELDS = ["firstName", "firstJobTitle", "firstEmail", "firstPhone", "firstRole"] as const;

const RENAME = { name: "firstName", jobTitle: "firstJobTitle", email: "firstEmail", phone: "firstPhone", role: "firstRole" } as const;
const LABELS = { name: "Full name", jobTitle: "Job title", email: "Email", phone: "Phone", role: "Role" } as const;

/** The person as the domain takes them, or `undefined` when the group was left empty (the role alone does not count). */
export function firstPersonBody(get: (name: string) => string): Record<string, string> | undefined {
  const name = get("firstName").trim();
  const jobTitle = get("firstJobTitle").trim();
  const email = get("firstEmail").trim();
  const phone = get("firstPhone").trim();
  if (name === "" && jobTitle === "" && email === "" && phone === "") return undefined;
  return { name, jobTitle, email, role: get("firstRole") === "member" ? "member" : "manager", ...(phone === "" ? {} : { phone }) };
}

/** A sentence per field of the group when it was started but is not complete or not valid; nothing when it is empty or fine. */
export function firstPersonProblems(get: (name: string) => string): FormValues {
  const body = firstPersonBody(get);
  if (body === undefined) return {};
  const checked = firstPersonSchema.safeParse(body);
  return checked.success ? {} : fieldErrors(checked.error, LABELS, RENAME);
}

/** What to tell the person when the organisation was added but its first invite was refused. `undefined` when there is nothing to say. */
export function firstInviteNotice(label: "coordinator" | "agency", result: FirstInvite): string | undefined {
  if (result.status !== "failed") return undefined;
  const reason = result.code === null ? "something went wrong, so invite them again from the page." : domainMessage(result.code);
  return `The ${label} was added, but the invite was not sent: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}
