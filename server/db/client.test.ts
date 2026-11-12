import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createDatabase = vi.fn((connectionString: string) => ({ connectionString, db: {}, close: async () => undefined }));
const getEnv = vi.fn<() => Record<string, string | undefined>>();

vi.mock("@/server/db/pool", () => ({ createDatabase: (connectionString: string) => createDatabase(connectionString) }));
vi.mock("@/server/env", () => ({ getEnv: () => getEnv() }));

const CACHE_KEY = Symbol.for("fynix-leads.db.handles");
const clearCache = (): void => {
  Reflect.deleteProperty(globalThis, CACHE_KEY);
};

beforeEach(() => {
  vi.resetModules();
  clearCache();
  createDatabase.mockClear();
  getEnv.mockReturnValue({ DATABASE_URL_CLIENT: "postgres://client", DATABASE_URL_AGENCY: "postgres://agency" });
});
afterEach(clearCache);

describe("getDatabase", () => {
  it.each([undefined, ""])("throws a specific error naming the variable, never a value, when the URL is %j", async (value) => {
    getEnv.mockReturnValue({ DATABASE_URL_CLIENT: value, DATABASE_URL_AGENCY: "postgres://secret-agency" });
    const { getDatabase } = await import("@/server/db/client");
    const attempt = (): unknown => getDatabase("leads_client");
    expect(attempt).toThrow("DATABASE_URL_CLIENT is not set, so the leads_client pool cannot be opened");
    expect(attempt).not.toThrow(/secret-agency/);
    expect(createDatabase).not.toHaveBeenCalled();
  });

  it("opens each role's pool once, on first use", async () => {
    const { getDatabase } = await import("@/server/db/client");
    expect(createDatabase).not.toHaveBeenCalled();
    expect(getDatabase("leads_client")).toBe(getDatabase("leads_client"));
    expect(getDatabase("leads_agency")).not.toBe(getDatabase("leads_client"));
    expect(createDatabase.mock.calls).toEqual([["postgres://client"], ["postgres://agency"]]);
  });

  it("keeps its pools across a module reload, as `next dev` hot reload does, instead of leaking a second set", async () => {
    const first = await import("@/server/db/client");
    const handle = first.getDatabase("leads_client");
    vi.resetModules();
    const second = await import("@/server/db/client");
    expect(second).not.toBe(first);
    expect(second.getDatabase("leads_client")).toBe(handle);
    expect(createDatabase).toHaveBeenCalledTimes(1);
  });

  it("closeDatabases ends every pool and forgets them", async () => {
    const { getDatabase, closeDatabases } = await import("@/server/db/client");
    const close = vi.fn(async () => undefined);
    createDatabase.mockImplementation((connectionString: string) => ({ connectionString, db: {}, close }));
    getDatabase("leads_client");
    getDatabase("leads_agency");
    await closeDatabases();
    expect(close).toHaveBeenCalledTimes(2);
    getDatabase("leads_client");
    expect(createDatabase).toHaveBeenCalledTimes(3);
  });
});
