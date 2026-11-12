import { describe, expect, it } from "vitest";
import type { DatabaseHandle } from "@/server/db/pool";
import { describeError, resetDatabase, testDatabaseName } from "@/server/db/testing";

describe("testDatabaseName", () => {
  it("accepts a database whose name ends in _test", () => {
    expect(testDatabaseName("postgresql://leads_client:pw@localhost:5432/fynix_leads_test")).toBe("fynix_leads_test");
    expect(testDatabaseName("postgres://u:p@db.internal/anything_test")).toBe("anything_test");
  });

  it.each([
    ["the dev database", "postgresql://leads_owner:pw@localhost:5432/fynix_leads"],
    ["a name that only contains test", "postgresql://u:p@localhost:5432/test_data"],
    ["no database at all", "postgresql://u:p@localhost:5432"],
    ["a different protocol", "mysql://u:p@localhost:3306/fynix_leads_test"],
    ["a host redirect in the query", "postgresql://u:p@localhost:5432/fynix_leads_test?host=prod.example.com"],
  ])("refuses %s", (_label, url) => {
    expect(() => testDatabaseName(url)).toThrow(/Refusing/);
  });

  it("does not echo a password when the URL cannot be parsed", () => {
    let message = "";
    try {
      testDatabaseName("not a url with secret-password");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("not a valid URL");
    expect(message).not.toContain("secret-password");
  });
});

describe("resetDatabase", () => {
  it("refuses to truncate a database whose name does not end in _test, before issuing any TRUNCATE", async () => {
    const statements: unknown[] = [];
    const owner = { db: { execute: async (statement: unknown) => (statements.push(statement), { rows: [{ name: "fynix_leads" }] }) } } as unknown as DatabaseHandle;
    await expect(resetDatabase(owner)).rejects.toThrow('Refusing to truncate "fynix_leads"');
    expect(statements).toHaveLength(1);
  });
});

describe("describeError", () => {
  it("joins the cause chain so a test can match the Postgres message", () => {
    const error = new Error("Failed query", { cause: new Error("permission denied for table campaign") });
    expect(describeError(error)).toBe("Failed query\npermission denied for table campaign");
  });
});
