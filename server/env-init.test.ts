import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvFileExistsError, buildEnvFile, generateSecrets, writeEnvFileOnce } from "@/server/env-init";

let directory = "";
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "env-init-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("writeEnvFileOnce", () => {
  it("creates the file readable by its owner only", () => {
    const path = join(directory, ".env.local");
    writeEnvFileOnce(path, buildEnvFile(generateSecrets("tester")));
    if (process.platform !== "win32") {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(path, "utf8")).toContain("DATABASE_URL_ADMIN=");
  });

  it("refuses to overwrite and leaves the existing file untouched", () => {
    const path = join(directory, ".env.local");
    writeEnvFileOnce(path, "FIRST=1\n");
    expect(() => writeEnvFileOnce(path, "SECOND=2\n")).toThrow(EnvFileExistsError);
    expect(readFileSync(path, "utf8")).toBe("FIRST=1\n");
  });
});
