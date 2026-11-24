"use server";

import type { FormState } from "@/lib/fynix/form-state";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { addExclusionByClient, removeExclusionByClient } from "@/server/domain/exclusions";
import { addExclusionSchema, removeExclusionSchema } from "@/server/domain/inputs";
import { field, runTenantForm } from "@/server/tenant/run-form";

/** The client's exclusion list: add a domain or a company name, remove an entry. Managers only; the domain refuses anyone else. Exports only actions. */

export async function addExclusionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: ["kind", "value", "reason"],
    kinds: ["client"],
    build: () => {
      const reason = field(formData, "reason").trim();
      return { clientOrgId: field(formData, "clientOrgId"), kind: field(formData, "kind"), value: field(formData, "value"), ...(reason === "" ? {} : { reason }) };
    },
    schema: addExclusionSchema,
    labels: { kind: "Type", value: "Value", reason: "Reason" },
    errorFields: { "exclusion-conflict": "value" },
    messages: { "exclusion-conflict": "That rule is on the list already.", "not-authorised": "Only a manager of your company can change the exclusion list." },
    perform: async (context, input) => {
      if (context.kind !== "client") return;
      await addExclusionByClient(getDatabase("leads_client").db, getDomain(), { userId: context.userId, orgId: context.orgId, role: context.memberRole }, input);
    },
    revalidate: ["/client"],
  });
}

export async function removeExclusionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runTenantForm({
    formData,
    fieldNames: [],
    kinds: ["client"],
    build: () => ({ exclusionId: field(formData, "exclusionId") }),
    schema: removeExclusionSchema,
    labels: {},
    messages: { "not-found": "That entry is already gone. Refresh the page.", "not-authorised": "Only a manager of your company can change the exclusion list." },
    perform: async (context, input) => {
      if (context.kind !== "client") return;
      await removeExclusionByClient(getDatabase("leads_client").db, { userId: context.userId, orgId: context.orgId, role: context.memberRole }, input);
    },
    revalidate: ["/client"],
  });
}
