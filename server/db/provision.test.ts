import { describe, expect, it } from "vitest";
import { databaseUrl } from "@/server/db/provision";

describe("databaseUrl", () => {
  it("keeps the server and credentials and swaps the database", () => {
    expect(databaseUrl("postgresql://me@localhost:5432/postgres", "fynix_leads")).toBe("postgresql://me@localhost:5432/fynix_leads");
    expect(databaseUrl("postgresql://u:p%40ss@db.internal:6543/postgres?sslmode=require", "x_test")).toBe(
      "postgresql://u:p%40ss@db.internal:6543/x_test?sslmode=require",
    );
  });
});
