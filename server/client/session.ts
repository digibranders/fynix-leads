import "server-only";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireSessionContext } from "@/server/auth/guard";
import { DomainError } from "@/server/domain/errors";
import type { TenantActor } from "@/server/domain/alias-identity";

export interface ClientView {
  readonly actor: TenantActor;
  readonly name: string;
  readonly canWrite: boolean;
}

export async function requireClient(): Promise<ClientView> {
  await connection();
  const context = await requireSessionContext();
  if (context.kind !== "client") notFound();
  return {
    actor: {
      userId: context.userId,
      orgId: context.orgId,
      orgKind: "client",
      role: context.memberRole,
    },
    name: context.name,
    canWrite: context.memberRole === "manager",
  };
}

export async function orNotFound<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof DomainError && (error.code === "not-found" || error.code === "invalid-input")) notFound();
    throw error;
  }
}
