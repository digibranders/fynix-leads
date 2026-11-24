import "server-only";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { z } from "zod";
import { fieldErrors, type FormState, type FormValues } from "@/lib/fynix/form-state";
import { getSessionContext } from "@/server/auth";
import type { SessionContext } from "@/server/auth/session-context";
import { sendQueuedMail } from "@/server/domain";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import { domainMessage, SESSION_GONE, SOMETHING_WENT_WRONG } from "@/server/fynix/errors";
import { field } from "@/server/fynix/run-action";

export { field };

export interface TenantFormSpec {
  readonly formData: FormData;
  /** The fields to give back on an error, so a failed attempt keeps what was typed. Never a password. */
  readonly fieldNames: readonly string[];
  /** Who may send this form. A person of any other kind is told the session is gone. */
  readonly kinds: readonly SessionContext["kind"][];
  /** Problems the form can see before the schema does (a grid of times, a date and a time zone), as sentences per field. */
  readonly precheck?: (formData: FormData) => FormValues;
  readonly build: (formData: FormData) => unknown;
  readonly schema: z.ZodType;
  readonly labels: Readonly<Record<string, string>>;
  readonly perform: (context: SessionContext, input: unknown) => Promise<void>;
  /** Pages (layouts) to revalidate when the change is saved. */
  readonly revalidate: readonly string[];
  /** Send the mail that the change queued (an invite), after the response has gone. */
  readonly sendMail?: boolean;
  readonly messages?: Partial<Record<DomainErrorCode, string>>;
  readonly errorFields?: Partial<Record<DomainErrorCode, string>>;
}

const failed = (message: string | null, fields: FormValues, values: FormValues): FormState => ({ status: "error", message, fields, values });

/**
 * The shared body of the client, coordinator and agency forms, the tenant twin of `runAction`: it checks the session again, checks the input with
 * the domain's schema so each problem lands on its field, calls the domain function, turns a refusal into plain words and revalidates the pages.
 * A fault logs only the error's name, because its message can carry an address.
 */
export async function runTenantForm(spec: TenantFormSpec): Promise<FormState> {
  const values: FormValues = Object.fromEntries(spec.fieldNames.map((name) => [name, field(spec.formData, name)]));
  const context = await getSessionContext();
  if (context === null || !spec.kinds.includes(context.kind)) return failed(SESSION_GONE, {}, values);
  const problems = spec.precheck?.(spec.formData) ?? {};
  if (Object.keys(problems).length > 0) return failed(null, problems, values);
  const input = spec.build(spec.formData);
  const checked = spec.schema.safeParse(input);
  if (!checked.success) return failed(null, fieldErrors(checked.error, spec.labels), values);
  try {
    await spec.perform(context, input);
  } catch (error) {
    if (error instanceof DomainError) {
      const message = domainMessage(error.code, spec.messages);
      const fieldName = spec.errorFields?.[error.code];
      return fieldName === undefined ? failed(message, {}, values) : failed(null, { [fieldName]: message }, values);
    }
    console.error("A portal action failed", error instanceof Error ? error.name : "unknown error");
    return failed(SOMETHING_WENT_WRONG, {}, values);
  }
  for (const path of spec.revalidate) revalidatePath(path, "layout");
  if (spec.sendMail === true) {
    after(async () => {
      try {
        await sendQueuedMail();
      } catch (error) {
        console.error("Sending queued mail failed", error instanceof Error ? error.name : "unknown error");
      }
    });
  }
  return { status: "done", redirectTo: null };
}
