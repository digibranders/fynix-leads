import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { clientContact, invite, member, user } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import type { ScopedTransaction } from "@/server/db/scope";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { issueInvite, type IssuedInvite } from "@/server/domain/invites";
import { addClientContactSchema, updateClientContactSchema, uuidSchema } from "@/server/domain/inputs";
import { loadClientForContacts } from "@/server/domain/organisations";
import { parseInput } from "@/server/domain/parse";
import { snapshotContactPerson } from "@/server/domain/snapshots";

/** One contact person at a client, as Fynix sees them. */
export interface ClientContactRecord {
  readonly id: string;
  readonly clientOrgId: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly jobTitle: string | null;
  readonly createdAt: Date;
}

/** Whether a saved contact has been given a login: none, an invite still open, or an account in the client. */
export type ContactAccess = "none" | "invited" | "has-login";

/** A saved contact with the state of their access, for the client page. */
export interface ClientContactWithAccess extends ClientContactRecord {
  readonly access: ContactAccess;
}

export const clientContactColumns = {
  id: clientContact.id,
  clientOrgId: clientContact.clientOrgId,
  name: clientContact.name,
  email: clientContact.email,
  phone: clientContact.phone,
  jobTitle: clientContact.jobTitle,
  createdAt: clientContact.createdAt,
};

/** The live contacts of one client, oldest first. Open to staff. */
export async function listClientContacts(deps: DomainDeps, actor: FynixActor, clientOrgId: string): Promise<readonly ClientContactWithAccess[]> {
  const id = parseInput(uuidSchema, clientOrgId);
  return fynixRead(deps.fynixDb, actor, (tx) => readClientContacts(tx, id));
}

/** The same read inside a transaction the caller already holds, for the client page. Each contact is marked by the email: an account in the client, or an invite still open. */
export async function readClientContacts(tx: ScopedTransaction, clientOrgId: string): Promise<readonly ClientContactWithAccess[]> {
  const rows = await tx.select(clientContactColumns).from(clientContact).where(and(eq(clientContact.clientOrgId, clientOrgId), isNull(clientContact.removedAt))).orderBy(asc(clientContact.createdAt), asc(clientContact.name));
  const emails = rows.flatMap((row) => (row.email === null ? [] : [row.email.toLowerCase()]));
  if (emails.length === 0) return rows.map((row) => ({ ...row, access: "none" as const }));
  const people = await tx
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.orgId, clientOrgId), inArray(sql`lower(${user.email})`, emails)));
  const open = await tx
    .select({ email: invite.email })
    .from(invite)
    .where(and(eq(invite.orgId, clientOrgId), isNull(invite.redeemedAt), isNull(invite.revokedAt), gt(invite.expiresAt, sql`now()`), inArray(sql`lower(${invite.email})`, emails)));
  const withLogin = new Set(people.map((row) => row.email.toLowerCase()));
  const invited = new Set(open.map((row) => row.email.toLowerCase()));
  return rows.map((row) => {
    const email = row.email?.toLowerCase();
    return { ...row, access: email !== undefined && withLogin.has(email) ? ("has-login" as const) : email !== undefined && invited.has(email) ? ("invited" as const) : ("none" as const) };
  });
}

/** Adds a contact person to a client. Only a Fynix admin. Nobody is invited and nothing is sent. */
export async function addClientContact(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<ClientContactRecord> {
  const parsed = parseInput(addClientContactSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const client = await loadClientForContacts(tx, parsed.clientOrgId);
    const [created] = await tx
      .insert(clientContact)
      .values({ clientOrgId: client.id, name: parsed.name, email: parsed.email ?? null, phone: parsed.phone ?? null, jobTitle: parsed.jobTitle ?? null })
      .returning(clientContactColumns);
    if (created === undefined) throw new Error("The contact insert returned no row");
    await audit({ action: "client_contact.add", subject: { table: "client_contact", id: created.id, ref: client.publicRef }, before: null, after: snapshotContactPerson(created) });
    return created;
  });
}

/** Changes a contact person. Only a Fynix admin. */
export async function updateClientContact(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<ClientContactRecord> {
  const parsed = parseInput(updateClientContactSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [before] = await tx.select({ ...clientContactColumns, removedAt: clientContact.removedAt }).from(clientContact).where(eq(clientContact.id, parsed.contactId)).limit(1).for("update");
    if (before === undefined || before.removedAt !== null) throw new DomainError("not-found", "There is no such contact.");
    const [after] = await tx
      .update(clientContact)
      .set({ name: parsed.name ?? before.name, email: parsed.email, phone: parsed.phone, jobTitle: parsed.jobTitle, updatedAt: deps.now() })
      .where(eq(clientContact.id, parsed.contactId))
      .returning(clientContactColumns);
    if (after === undefined) throw new Error("The contact update returned no row");
    await audit({ action: "client_contact.update", subject: { table: "client_contact", id: after.id }, before: snapshotContactPerson(before), after: snapshotContactPerson(after) });
    return after;
  });
}

/** Takes a contact off the client. The row stays, hidden, so nothing that named it breaks. Only a Fynix admin. */
export async function removeClientContact(deps: DomainDeps, actor: FynixActor, contactId: string): Promise<void> {
  const id = parseInput(uuidSchema, contactId);
  await fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [row] = await tx.select({ ...clientContactColumns, removedAt: clientContact.removedAt }).from(clientContact).where(eq(clientContact.id, id)).limit(1).for("update");
    if (row === undefined || row.removedAt !== null) throw new DomainError("not-found", "There is no such contact.");
    await tx.update(clientContact).set({ removedAt: deps.now(), updatedAt: deps.now() }).where(eq(clientContact.id, id));
    await audit({ action: "client_contact.remove", subject: { table: "client_contact", id }, before: snapshotContactPerson(row), after: null });
  });
}

/**
 * Invites a saved contact to the portal as a member of their client (owner decision, 2026-11-26). The contact stays on the list. An invite needs an email and a
 * job title, so a contact without either is refused in plain words before anything is sent. Every other refusal is `issueInvite`'s own: the address already has an
 * account, the client is archived, the terms are missing, or the actor is Fynix staff (`admin-required`).
 */
export async function inviteClientContact(deps: DomainDeps, actor: FynixActor, contactId: string): Promise<IssuedInvite> {
  const id = parseInput(uuidSchema, contactId);
  const [contact] = await fynixRead(deps.fynixDb, actor, (tx) =>
    tx.select(clientContactColumns).from(clientContact).where(and(eq(clientContact.id, id), isNull(clientContact.removedAt))).limit(1),
  );
  if (contact === undefined) throw new DomainError("not-found", "There is no such contact.");
  if (contact.email === null) {
    throw new DomainError("invalid-input", "This contact needs an email before they can be invited.");
  }
  return issueInvite(deps, actor, {
    organisationId: contact.clientOrgId,
    email: contact.email,
    name: contact.name,
    ...(contact.jobTitle === null ? {} : { jobTitle: contact.jobTitle }),
    ...(contact.phone === null ? {} : { phone: contact.phone }),
    role: "manager",
  });
}
