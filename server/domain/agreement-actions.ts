"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clientAddressFrom } from "@/server/auth/client-address";
import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { getDomain } from "@/server/domain";
import { acceptAgreementByTenant } from "@/server/domain/agreements";
import { DomainError } from "@/server/domain/errors";

export interface AgreementActionResult {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
}

/** A manager accepts the current version of an agreement for their organisation. The address is the one the request came from. */
export async function acceptAgreementAction(_previous: AgreementActionResult, formData: FormData): Promise<AgreementActionResult> {
  const context = await getSessionContext();
  if (context === null || (context.kind !== "client" && context.kind !== "agency")) {
    return { status: "error", message: "Only a client or coordinator manager can accept an agreement." };
  }
  const agreementId = formData.get("agreementId");
  if (typeof agreementId !== "string") return { status: "error", message: "Choose an agreement to accept." };
  try {
    const role = context.kind === "client" ? "leads_client" : "leads_agency";
    await acceptAgreementByTenant(
      getDatabase(role).db,
      getDomain(),
      { userId: context.userId, orgId: context.orgId, orgKind: context.kind, role: context.memberRole },
      { agreementId },
      clientAddressFrom(await headers()),
    );
    revalidatePath("/client/agreement");
    revalidatePath("/supplier/agreement");
    return { status: "success", message: "Accepted. Your acceptance is on record." };
  } catch (error) {
    if (error instanceof DomainError) return { status: "error", message: error.message };
    return { status: "error", message: "The agreement could not be accepted. Try again." };
  }
}
