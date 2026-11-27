"use server";

import { z } from "zod";
import type { FormState } from "@/lib/fynix/form-state";
import { calendarSetupFromEnv } from "@/server/calendar";
import { disconnectCalendar } from "@/server/calendar/connections";
import { getDomain } from "@/server/domain";
import { DomainError } from "@/server/domain/errors";
import { field, runTenantForm } from "@/server/tenant/run-form";

const disconnectInput = z.object({ provider: z.enum(["google", "microsoft"]) }).strict();

/** A signed-in person disconnects their own calendar: the token is revoked where the provider allows it and the connection and its busy times are removed. */
export async function disconnectCalendarAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["client", "agency", "fynix"],
    build: () => ({ provider: field(formData, "provider") }),
    schema: disconnectInput,
    labels: { provider: "Calendar" },
    perform: async (context, input) => {
      const setup = calendarSetupFromEnv();
      if (setup === null) throw new DomainError("invalid-input", "Calendar connection is not turned on.");
      await disconnectCalendar({ authDb: getDomain().authDb, setup }, { userId: context.userId, kind: context.kind, orgId: context.kind === "fynix" ? null : context.orgId }, disconnectInput.parse(input).provider);
    },
    messages: { "invalid-input": "Calendar connection is not turned on." },
    revalidate: ["/client", "/agency", "/coordinator", "/fynix"],
  });
}
