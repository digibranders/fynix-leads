import type { z } from "zod";
import { DomainError } from "@/server/domain/errors";

/**
 * Parses `input` with `schema` or throws `DomainError("invalid-input")` naming the first problem's path and rule, never its
 * value: what was typed may be a name or an address.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.join(".") ?? "";
  throw new DomainError("invalid-input", `${path === "" ? "The input" : path} ${issue?.message ?? "is not valid"}`);
}
