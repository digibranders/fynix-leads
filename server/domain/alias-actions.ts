"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { createAliasIdentity, retireAliasIdentity, updateAliasIdentity, verifyAliasCode } from "@/server/domain/alias-identity";
import { DomainError } from "@/server/domain/errors";

export interface AliasActionResult {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function agencyActor() {
  const context = await getSessionContext();
  if (context === null || context.kind !== "agency") return null;
  return { userId: context.userId, orgId: context.orgId, orgKind: "agency" as const, role: context.memberRole };
}

function refresh(): void {
  revalidatePath("/agency/aliases");
  revalidatePath("/supplier/aliases");
}

/** Adds an alias identity. The 6-digit code goes to the alias mailbox and is never shown here. */
export async function createAliasAction(_previous: AliasActionResult, formData: FormData): Promise<AliasActionResult> {
  const actor = await agencyActor();
  if (actor === null) return { status: "error", message: "Only agency or coordinator members can add an alias." };
  try {
    const created = await createAliasIdentity(getDatabase("leads_agency").db, getDomain(), actor, {
      clientOrgId: field(formData, "clientOrgId"),
      displayName: field(formData, "displayName"),
      jobTitle: field(formData, "jobTitle"),
      aliasEmail: field(formData, "aliasEmail"),
    });
    refresh();
    return { status: "success", message: `We sent a 6-digit code to ${created.aliasEmail}. Enter it below to activate ${created.displayName}.` };
  } catch (error) {
    if (error instanceof DomainError) return { status: "error", message: error.message };
    return { status: "error", message: "The alias could not be added. Try again." };
  }
}

/** Checks the code the person read from the alias mailbox. */
export async function verifyAliasAction(_previous: AliasActionResult, formData: FormData): Promise<AliasActionResult> {
  const actor = await agencyActor();
  if (actor === null) return { status: "error", message: "Only agency or coordinator members can verify an alias." };
  try {
    await verifyAliasCode(getDatabase("leads_agency").db, getDomain(), actor, { publicRef: field(formData, "publicRef"), code: field(formData, "code") });
    refresh();
    return { status: "success", message: "The alias is verified and ready to use on a lead." };
  } catch (error) {
    if (error instanceof DomainError) return { status: "error", message: error.message };
    return { status: "error", message: "The code could not be checked. Try again." };
  }
}

/** Changes an alias's client, display name or job title. The mailbox stays: a new one would need a new code. */
export async function updateAliasAction(_previous: AliasActionResult, formData: FormData): Promise<AliasActionResult> {
  const actor = await agencyActor();
  if (actor === null) return { status: "error", message: "Only agency or coordinator members can edit an alias." };
  try {
    await updateAliasIdentity(getDatabase("leads_agency").db, actor, {
      publicRef: field(formData, "publicRef"),
      clientOrgId: field(formData, "clientOrgId"),
      displayName: field(formData, "displayName"),
      jobTitle: field(formData, "jobTitle"),
    });
    refresh();
    return { status: "success", message: "The alias is saved." };
  } catch (error) {
    if (error instanceof DomainError) return { status: "error", message: error.message };
    return { status: "error", message: "The alias could not be saved. Try again." };
  }
}

/** Retires an alias: it stays on the leads it fronted and can front no new one. */
export async function retireAliasAction(_previous: AliasActionResult, formData: FormData): Promise<AliasActionResult> {
  const actor = await agencyActor();
  if (actor === null) return { status: "error", message: "Only agency or coordinator members can retire an alias." };
  try {
    await retireAliasIdentity(getDatabase("leads_agency").db, actor, { publicRef: field(formData, "publicRef") });
    refresh();
    return { status: "success", message: "The alias is retired." };
  } catch (error) {
    if (error instanceof DomainError) return { status: "error", message: error.message };
    return { status: "error", message: "The alias could not be retired. Try again." };
  }
}
