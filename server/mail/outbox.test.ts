import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { enqueueEmail } from "./outbox";

describe("enqueueEmail", () => {
  it("rethrows a failed insert without the SQL parameters, the recipient or the link", async () => {
    const token = "live-token-9f8e7d";
    const email = "victim@example.com";
    // drizzle-orm's DrizzleQueryError carries the query and its params in the message and in `params`, and chains the driver error as `cause`.
    const driverError = Object.assign(new Error(`connection terminated for ${email}`), { code: "57P01" });
    const failure = Object.assign(new Error(`Failed query: insert into "email_outbox" values ($1, $2)\nparams: ${email},https://x.example/reset-password?token=${token}`), {
      name: "DrizzleQueryError",
      params: [email, token],
      cause: driverError,
    });
    const db = { insert: () => ({ values: () => Promise.reject(failure) }) } as unknown as Pick<Database, "insert">;

    const thrown = await enqueueEmail(db, { to: email, content: { template: "password_reset", params: { expiresInMinutes: 60 } }, link: `https://x.example/reset-password?token=${token}` }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as Error;
    expect(error.message).toBe("Could not write the outbox message (DrizzleQueryError)");
    const everything = [error.message, error.stack ?? "", JSON.stringify(Object.getOwnPropertyNames(error).map((key) => [key, String((error as unknown as Record<string, unknown>)[key])]))].join("\n");
    for (const secret of [token, email, "email_outbox", "params"]) expect(everything).not.toContain(secret);
    expect(error.cause).toBeUndefined();
    expect(Object.getOwnPropertyNames(error).sort()).toEqual(["message", "stack"].sort());
  });

  it("writes the content, a stored copy without the link, and the link on its own", async () => {
    let written: Record<string, unknown> = {};
    const db = { insert: () => ({ values: async (row: Record<string, unknown>) => void (written = row) }) } as unknown as Pick<Database, "insert">;
    await enqueueEmail(db, { to: "a@example.com", content: { template: "invite", params: { name: "A", organisationName: "B", expiresOn: "8 December 2026" } }, link: "https://x.example/accept-invite?token=t", inviteId: "11111111-1111-4111-8111-111111111111" });
    expect(written).toMatchObject({ recipient: "a@example.com", template: "invite", params: { name: "A", organisationName: "B", expiresOn: "8 December 2026" }, link: "https://x.example/accept-invite?token=t", inviteId: "11111111-1111-4111-8111-111111111111" });
    expect(String(written.body)).not.toContain("http");
    expect(String(written.body)).toContain("Hello A,");
    expect(written.subject).toBe("You are invited to Fynix Leads");
  });
});
