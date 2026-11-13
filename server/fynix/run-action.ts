import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { fieldErrors, type FormState, type FormValues } from "@/lib/fynix/form-state";
import { getSessionContext } from "@/server/auth";
import { getDomain } from "@/server/domain";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import type { FynixActor } from "@/server/domain/fynix-write";
import { domainMessage, SESSION_GONE, SOMETHING_WENT_WRONG } from "@/server/fynix/errors";

/** The text of one form field, or an empty string when the field is missing or is a file. */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** A number field as a number: empty is `undefined` (so the schema says it is required), anything that is not a number is `NaN` (so it says so). */
export function numberField(formData: FormData, name: string): number | undefined {
  const text = field(formData, name).trim();
  return text === "" ? undefined : Number(text);
}

export interface ActionSpec {
  readonly formData: FormData;
  /** The fields to give back on an error, so a failed attempt keeps what was typed. */
  readonly fieldNames: readonly string[];
  /** The input the domain function takes, built from the form. */
  readonly build: (formData: FormData) => unknown;
  /** The domain's own schema for that input, run first so each problem lands on its field. */
  readonly schema: z.ZodType;
  /** The names the person sees for the schema's keys. */
  readonly labels: Readonly<Record<string, string>>;
  /** Problems the form can see before the schema does (a grid of times, a date and a time zone), as sentences per field. */
  readonly precheck?: (formData: FormData) => FormValues;
  /** Calls the domain function. It may return a page to move to. */
  readonly perform: (deps: DomainDeps, actor: FynixActor, input: unknown) => Promise<{ readonly redirectTo?: string } | void>;
  /** A better sentence for a reason, when this form can say something more exact. */
  readonly messages?: Partial<Record<DomainErrorCode, string>>;
}

const failed = (message: string | null, fields: FormValues, values: FormValues): FormState => ({ status: "error", message, fields, values });

/**
 * The shared body of every Fynix form action. It checks the session again (a form can be sent after the session ended), checks
 * the input with the domain's schema so each field gets a sentence, calls the domain function, turns a refusal into plain words,
 * and revalidates every Fynix page so the change shows. The domain checks the admin rule itself, so staff who send a form
 * anyway are told to ask an admin. A fault logs only the error's name, because its message can carry an address.
 */
export async function runAction(spec: ActionSpec): Promise<FormState> {
  const values: FormValues = Object.fromEntries(spec.fieldNames.map((name) => [name, field(spec.formData, name)]));
  const context = await getSessionContext();
  if (context === null || context.kind !== "fynix") return failed(SESSION_GONE, {}, values);

  const problems = spec.precheck?.(spec.formData) ?? {};
  if (Object.keys(problems).length > 0) return failed(null, problems, values);
  const input = spec.build(spec.formData);
  const checked = spec.schema.safeParse(input);
  if (!checked.success) return failed(null, fieldErrors(checked.error, spec.labels), values);

  try {
    const result = await spec.perform(getDomain(), { userId: context.userId }, input);
    revalidatePath("/fynix", "layout");
    return { status: "done", redirectTo: result?.redirectTo ?? null };
  } catch (error) {
    if (error instanceof DomainError) return failed(domainMessage(error.code, spec.messages), {}, values);
    console.error("A Fynix action failed", error instanceof Error ? error.name : "unknown error");
    return failed(SOMETHING_WENT_WRONG, {}, values);
  }
}
