# Phase 1A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a PostgreSQL layer that itself enforces the client and agency isolation: six least-privilege login roles, per-migration-commit migrations, a scope helper, typed per-role column lists, and a test harness that proves the isolation on two real tables, `organisation` and `campaign`. Later phases add tables, not mechanisms.

**Architecture:** one Next.js app (no monorepo). Runtime code is in `server/db/`, scripts in `scripts/`, the zod environment schema in `server/env.ts`. A request resolves to a role, opens the pool of that role (one pool per role, a login per pool, no `SET ROLE`) and runs inside a transaction that sets `app.org_id` and `app.user_id` with `set_config(..., true)`. Tenant roles (`leads_client`, `leads_agency`) hold only column-level `SELECT` grants plus row-level security policies on `app_current_org_id()`. `lib/` stays pure domain code with no database imports.

**Tech Stack:** PostgreSQL 16, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, @types/pg 8.23.1, tsx 4.23.15, zod 4.6.7 (all pinned exactly), Vitest 5.1.0, Node 24, pnpm 11.3.0.

**Master plan:** `docs/superpowers/plans/2026-11-11-phase-1-accounts-and-campaigns.md` (decisions D1 to D7, section 3 architecture, section 4 data model, section 6 sub-phases). **Spike:** `docs/superpowers/specs/phase-1/rls-column-grant-spike.sql`.

**Exit criteria for 1A (master plan section 6):** an empty database migrates cleanly; a scoped role sees only its rows; `select *` fails for tenant roles; the harness refuses non-test databases; CI green.

---

## How to work through this plan

- Work on the `development` branch in `/Users/a12345/Desktop/AI/Fynix Digital/fynix-leads`. Commit after each task. Never push, never commit to `main`.
- Commit messages are plain: no attribution lines, no em or en dashes (the copy rule applies to commit messages, code, comments and docs).
- Run every command from the repository root. Code blocks in steps are the complete file contents unless a step says "replace" or "add".
- Every code block in this plan was run, not just written. The Verification appendix at the end records how.
- TDD order inside a task: write the test, run it and see it fail for the stated reason, write the code, run it and see it pass. Where a step says "Expected: FAIL", a pass means the test is wrong.
- Read `AGENTS.md` before touching Next.js code. This plan does not touch any Next.js route or component.
- This machine runs one Postgres 16 shared with other projects. This plan creates only the roles `leads_*` and the databases `fynix_leads` and `fynix_leads_test`. Roles are cluster-wide, so `pnpm db:roles` resets the passwords of the `leads_*` roles for every checkout that shares the cluster.

## Decisions in this plan that sharpen or correct the master plan

| # | Decision | Why |
|---|---|---|
| C1 | The agency reads a client's brand from `campaign.client_brand_name`, a copy kept in step by two triggers. It reads no `organisation` row except its own. | Master plan section 3 says "copied into campaign columns it can read"; the section 4 table said the agency may read client organisation rows. Reading them needs the client's `id` for a join, and the agency must never read an organisation id. The copy also needs no `SECURITY DEFINER`. Section 3 wins. |
| C2 | No tenant role gets any organisation id column: not `organisation.id`, not `campaign.client_org_id`, not `campaign.agency_org_id`, not the `*_org_kind` columns. | The spike granted each role its own side. Nothing needs it (the server knows the organisation from the session) and withholding it makes the policy-on-an-unreadable-column case the normal case, which the spike proved works. A tenant can still ask the database for its own scope through `app_current_org_id()`; that is the one organisation id it can learn. |
| C3 | Two connection variables for administration: `DATABASE_URL_ADMIN` (a Postgres superuser on the `postgres` database; creates roles and databases) and `DATABASE_URL_OWNER` (`leads_owner`, which is NOSUPERUSER and owns the tables; runs migrations). | The platform repository used a superuser for both, so its tables belong to a superuser. Here the owner is a real least-privilege role, so something else must create it. `db-migrate` refuses to run as anyone but `leads_owner`. |
| C4 | `leads_fynix` gets `SELECT, INSERT, UPDATE` on both tables and no `DELETE` or `TRUNCATE`. | The master plan says "everything". Organisations and campaigns are archived by status. Deleting one would cascade through leads in phase 2. An owner decision to allow deletes is one grant plus one test change. |
| C5 | `REVOKE ALL ON SCHEMA public FROM PUBLIC` (stronger than the requested `REVOKE CREATE`), `REVOKE ALL ON DATABASE ... FROM PUBLIC` then `CONNECT` per role (this also removes `TEMPORARY`), and `ALTER DEFAULT PRIVILEGES FOR ROLE leads_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`. | Closes three channels a tenant could otherwise use: creating tables, creating temporary tables, calling any future function that was never granted to anyone. Structural tests check all three. |
| C6 | Environment is loaded with Node's built-in `process.loadEnvFile`, not `dotenv`. | Node 24 has it, so one dependency less. `dotenv` is not added. |
| C7 | Scripts wrap their body in `runScript(async () => ...)`. | The repository is CommonJS (no `"type": "module"`), so a script cannot use top-level await under `tsx`. |
| C8 | `runMigrations` takes `stopAfter` (a tag) and `bookkeepingSchema` options. `pnpm db:migrate:test -- --stop-after=<tag>` uses the first. | Lets Task 8 watch the structural tests fail on a database that has the tables but not the grants. The second lets the migrator be tested in a throwaway schema. |
| C9 | `server/db/pool.ts` (no `server-only`, used by scripts and tests) is separate from `server/db/client.ts` (imports `server-only`, holds the per-role app pools). | `tsx` cannot import `server-only`. App code must only reach a pool through `client.ts` and `scope.ts`. |
| C10 | Every structural check is a function that returns offenders and has a self-test that creates a deliberately broken object inside a rolled-back transaction. | A check that finds nothing may simply be broken. The self-test proves each one can fail. |
| C11 | A dev seed command, `pnpm db:seed`, is included. | Listed in the master plan's 1A deliverables; it reuses the test seed. |

## File structure

| File | Responsibility |
|---|---|
| `server/db/roles.ts` | The six role names, which are tenant and runtime roles, database names, and the env variable names derived from them. No imports. |
| `server/env.ts` | zod schemas (`runtimeEnvSchema`, `toolingEnvSchema`), lazy `getEnv()`, `describeEnvProblems()` that names variables and never values. |
| `server/env-file.ts` | `loadEnvLocal()`: reads `.env.local` into `process.env` for scripts and tests. |
| `server/env-init.ts` | Generates secrets, builds the `.env.local` text, `writeEnvFileOnce()` (mode 0600, `wx`, never overwrites). |
| `server/run-script.ts` | `runScript(main)`: error handling for scripts. |
| `server/db/provision.ts` | Role, database and hardening SQL run as the superuser. |
| `server/db/migrator.ts` | Per-migration-commit migrator. |
| `server/db/migrate-guards.ts` | `assertReadyToMigrate()`: all six roles exist and the connection is `leads_owner`. |
| `server/db/pool.ts` | `createDatabase()`, the `Database` type. |
| `server/db/client.ts` | Lazy per-role pools for the app (imports `server-only`). |
| `server/db/scope.ts` | `withScope`, `withOrgScope`, `withFynixScope`, `assertUuid` (imports `server-only`). |
| `server/db/schema/` | Drizzle tables and enums. |
| `server/db/migrations/` | Generated DDL plus hand-written grants, policies, functions and triggers. |
| `server/db/columns.ts`, `server/db/tenant-reads.ts` | Typed per-role column lists and the only way tenant code starts a read. |
| `server/db/testing/` | Harness: `index.ts` (databases, reset, error helpers), `seed.ts`, `structure.ts` (catalog checks), `leak-matrix.ts` (read paths, probes, forbidden values). |
| `server/db/*.test.ts` | Unit tests, no database. |
| `server/db/*.integration.test.ts` | Integration tests, real `fynix_leads_test`. |
| `scripts/*.ts` | `env-init`, `env-check`, `db-roles`, `db-create`, `db-migrate`, `db-seed`. |

---

## Task 1: Dependencies, scripts, configuration

**Files:**
- Modify: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `vitest.config.mts`
- Create: `drizzle.config.ts`, `vitest.integration.config.mts`, `.env.example`

- [ ] **Step 1: Confirm a clean start**

```bash
cd "/Users/a12345/Desktop/AI/Fynix Digital/fynix-leads"
git checkout development
git status --short
```

Expected: no output (clean tree). This plan file and the master plan must already be committed; commit them first if `git status` lists them. If anything else is listed, stop and ask the owner.

- [ ] **Step 2: Add the dependencies, pinned exactly**

```bash
pnpm add -E drizzle-orm@0.45.4 pg@8.23.1 zod@4.6.7
pnpm add -D -E drizzle-kit@0.31.11 @types/pg@8.23.1 tsx@4.23.15
```

Expected: both commands add the packages. With pnpm 11 the second command can end with `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: esbuild@...`. That is expected: drizzle-kit and tsx depend on esbuild, and pnpm 11 refuses unreviewed build scripts.

- [ ] **Step 3: Review the esbuild build script**

pnpm has now added a placeholder to `pnpm-workspace.yaml`. esbuild does not need its install script (it ships its binary as an optional dependency, and `tsx` and `drizzle-kit` run without it), so decline it. Replace the whole file with:

```yaml
allowBuilds:
  esbuild: false
  sharp: false
  unrs-resolver: false
```

Then:

```bash
pnpm install
pnpm exec tsx --version
pnpm exec drizzle-kit --version
```

Expected: `pnpm install` finishes with no error. `tsx v4.23.15`, then `drizzle-kit: v0.31.11` and `drizzle-orm: v0.45.4`.

- [ ] **Step 4: Replace the `scripts` block in `package.json`**

Replace the existing `"scripts": { ... }` object with exactly this (`test:integration`, `env:*` and `db:*` are new; the others are unchanged):

```json
  "scripts": {
    "dev": "next dev --port 3020",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:integration": "tsx scripts/db-migrate.ts --target=test && vitest run --config vitest.integration.config.mts",
    "typecheck": "next typegen && tsc --noEmit",
    "env:init": "tsx scripts/env-init.ts",
    "env:check": "tsx scripts/env-check.ts",
    "db:roles": "tsx scripts/db-roles.ts",
    "db:create": "tsx scripts/db-create.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/db-migrate.ts --target=dev",
    "db:migrate:test": "tsx scripts/db-migrate.ts --target=test",
    "db:seed": "tsx scripts/db-seed.ts"
  },
```

`pnpm db:generate --custom --name=<name>` passes the extra flags through to drizzle-kit and creates an empty hand-written migration.

- [ ] **Step 5: Ignore env files except the example**

In `.gitignore` replace the line

```
.env*
```

with

```
.env*
!.env.example
```

- [ ] **Step 6: Create `drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";

// Only used to generate SQL from the schema (`pnpm db:generate`). It never connects: migrations are applied by
// scripts/db-migrate.ts, as the owner role.
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema/index.ts",
  out: "./server/db/migrations",
  strict: true,
  verbose: true,
});
```

- [ ] **Step 7: Replace `vitest.config.mts` (unit tests: no database)**

```typescript
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside a server build. Tests run in Node, so it resolves to an empty module.
    alias: { "server-only": fileURLToPath(new URL("./lib/test/server-only-stub.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "server/**/*.test.ts"],
    // Unit tests never need a database. Integration tests run through vitest.integration.config.mts.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
```

- [ ] **Step 8: Create `vitest.integration.config.mts` (integration tests: one file at a time)**

```typescript
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Integration tests share one test database, so files run one at a time. */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./lib/test/server-only-stub.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["server/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
```

- [ ] **Step 9: Create `.env.example`**

```bash
# Do not copy this file. `pnpm env:init` writes .env.local with random secrets and the right URLs.
# This file lists every variable the app and its scripts read, so a reviewer can see what a deployment must set.
# `pnpm env:check` prints any that are missing or malformed, by name only.

# Scripts only: a Postgres superuser on the maintenance database. Creates roles and databases.
DATABASE_URL_ADMIN=

# Scripts only: the password of each of the six roles (24 characters or more).
LEADS_OWNER_PASSWORD=
LEADS_AUTH_PASSWORD=
LEADS_FYNIX_PASSWORD=
LEADS_CLIENT_PASSWORD=
LEADS_AGENCY_PASSWORD=
LEADS_PUBLIC_PASSWORD=

# Scripts only: migrations and drizzle-kit connect as the owner role. The app never does.
DATABASE_URL_OWNER=

# The running app: one connection string per runtime role.
DATABASE_URL_AUTH=
DATABASE_URL_FYNIX=
DATABASE_URL_CLIENT=
DATABASE_URL_AGENCY=
DATABASE_URL_PUBLIC=

# Integration tests: the same roles on the test database, whose name must end in _test.
DATABASE_URL_OWNER_TEST=
DATABASE_URL_AUTH_TEST=
DATABASE_URL_FYNIX_TEST=
DATABASE_URL_CLIENT_TEST=
DATABASE_URL_AGENCY_TEST=
DATABASE_URL_PUBLIC_TEST=
```

- [ ] **Step 10: Check nothing existing broke**

```bash
pnpm test
pnpm lint
```

Expected: the existing `lib/` tests pass (the new include pattern finds no `server/` tests yet); lint prints nothing.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml .gitignore vitest.config.mts vitest.integration.config.mts drizzle.config.ts .env.example
git commit -m "Add Postgres, Drizzle and Vitest integration configuration"
```

---

## Task 2: Roles list and environment tooling

**Files:**
- Create: `server/db/roles.ts`, `server/env.ts`, `server/env-file.ts`, `server/env-init.ts`, `server/run-script.ts`, `scripts/env-init.ts`, `scripts/env-check.ts`
- Test: `server/env.test.ts`, `server/env-init.test.ts`

- [ ] **Step 1: Write the failing tests**

`server/env.test.ts` covers the schemas, that no message ever contains a value, that `roles.ts` and the schemas agree on every variable name, the generated file, and that `.env.example` lists exactly the declared variables.

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATABASES, ROLE_NAMES, passwordVariable, urlVariable } from "@/server/db/roles";
import { buildEnvFile, generateSecrets } from "@/server/env-init";
import { declaredVariables, derivedVariables, describeEnvProblems, getToolingEnv, runtimeEnvSchema, toolingEnvSchema } from "@/server/env";

/** A complete environment, built the way `pnpm env:init` builds it. */
function completeEnvironment(): Record<string, string> {
  const entries = buildEnvFile(generateSecrets("tester"))
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const);
  return Object.fromEntries(entries);
}

describe("environment schemas", () => {
  it("accepts the environment that env:init writes", () => {
    const environment = completeEnvironment();
    expect(describeEnvProblems(environment, runtimeEnvSchema)).toEqual([]);
    expect(describeEnvProblems(environment, toolingEnvSchema)).toEqual([]);
    expect(getToolingEnv(environment).DATABASE_URL_OWNER).toContain("leads_owner");
  });

  it("declares exactly the variable names that roles.ts derives", () => {
    const declared = declaredVariables();
    const derived = derivedVariables();
    expect([...declared.runtime].sort()).toEqual([...derived.runtime].sort());
    expect([...declared.tooling].sort()).toEqual([...derived.tooling].sort());
  });

  it("reports a missing variable by name only", () => {
    const environment = completeEnvironment();
    delete environment.DATABASE_URL_CLIENT;
    expect(describeEnvProblems(environment, runtimeEnvSchema)).toEqual(["DATABASE_URL_CLIENT: missing"]);
  });

  it("reports an invalid variable by name and rule, never by value", () => {
    const environment = { ...completeEnvironment(), DATABASE_URL_AGENCY_TEST: "mysql://secret-user:secret-pass@host/db", LEADS_AUTH_PASSWORD: "short" };
    const problems = describeEnvProblems(environment, toolingEnvSchema).join("\n");
    expect(problems).toContain("DATABASE_URL_AGENCY_TEST: invalid, must be a postgres:// or postgresql:// URL");
    expect(problems).toContain("LEADS_AUTH_PASSWORD: invalid, must be at least 24 characters");
    expect(problems).not.toContain("secret-pass");
    expect(problems).not.toContain("short\n");
  });

  it("throws from getToolingEnv with names and no values", () => {
    const environment = { ...completeEnvironment(), LEADS_OWNER_PASSWORD: "hunter2" };
    let message = "";
    try {
      getToolingEnv(environment);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("LEADS_OWNER_PASSWORD");
    expect(message).not.toContain("hunter2");
  });
});

describe("generated environment file", () => {
  it("gives every role its own random password and uses them in the URLs", () => {
    const secrets = generateSecrets("tester");
    const passwords = ROLE_NAMES.map((role) => secrets.passwords[role]);
    expect(new Set(passwords).size).toBe(ROLE_NAMES.length);
    expect(passwords.every((value) => /^[0-9a-f]{48}$/.test(value))).toBe(true);
    const file = buildEnvFile(secrets);
    for (const role of ROLE_NAMES) {
      expect(file).toContain(`${passwordVariable(role)}=${secrets.passwords[role]}`);
      expect(file).toContain(`${urlVariable(role, "test")}=postgresql://${role}:${secrets.passwords[role]}@localhost:5432/${DATABASES.test}`);
    }
  });

  it("keeps the owner out of the runtime variables", () => {
    const runtimeLines = buildEnvFile(generateSecrets("tester"))
      .split("\n")
      .filter((line) => /^DATABASE_URL_(AUTH|FYNIX|CLIENT|AGENCY|PUBLIC)=/.test(line));
    expect(runtimeLines).toHaveLength(5);
    expect(runtimeLines.some((line) => line.includes("leads_owner"))).toBe(false);
  });

  it("is safe to load unquoted: no whitespace, quotes, hash or dollar in any value", () => {
    for (const line of buildEnvFile(generateSecrets("tester")).split("\n").filter((l) => l !== "" && !l.startsWith("#"))) {
      expect(line.slice(line.indexOf("=") + 1)).toMatch(/^[^\s"'#$]+$/);
    }
  });
});

describe(".env.example", () => {
  it("lists exactly the variables the schemas declare, and holds no values", () => {
    const lines = readFileSync(join(process.cwd(), ".env.example"), "utf8").split("\n").filter((line) => /^[A-Z_]+=/.test(line));
    expect(lines.map((line) => line.slice(0, line.indexOf("="))).sort()).toEqual([...declaredVariables().runtime, ...declaredVariables().tooling].sort());
    expect(lines.every((line) => line.endsWith("="))).toBe(true);
  });
});
```

`server/env-init.test.ts` covers mode 0600 and the refusal to overwrite.

```typescript
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
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, "utf8")).toContain("DATABASE_URL_ADMIN=");
  });

  it("refuses to overwrite and leaves the existing file untouched", () => {
    const path = join(directory, ".env.local");
    writeEnvFileOnce(path, "FIRST=1\n");
    expect(() => writeEnvFileOnce(path, "SECOND=2\n")).toThrow(EnvFileExistsError);
    expect(readFileSync(path, "utf8")).toBe("FIRST=1\n");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm exec vitest run server/env
```

Expected: FAIL. Both files fail to load with `Error: Cannot find package '@/server/db/roles' imported from .../server/env.test.ts` (and the same for `@/server/env-init`).

- [ ] **Step 3: Create `server/db/roles.ts`**

The two database names and the six roles live here and nowhere else. Env variable names are derived from the role, with literal-typed return values so `env[urlVariable("leads_client", "test")]` is checked by the compiler.

```typescript
/**
 * The six login roles, one connection pool per role, and the names of the environment variables that carry their
 * passwords and connection strings. Plain data with no imports, so scripts, tests and app code can all read it.
 * The role purposes are in docs/superpowers/plans/2026-11-11-phase-1-accounts-and-campaigns.md, section 3.
 */
export const ROLE_NAMES = ["leads_owner", "leads_auth", "leads_fynix", "leads_client", "leads_agency", "leads_public"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

/** Roles the running app connects as. `leads_owner` is for migrations and never opens a runtime pool. */
export const RUNTIME_ROLES = ["leads_auth", "leads_fynix", "leads_client", "leads_agency", "leads_public"] as const;
export type RuntimeRoleName = (typeof RUNTIME_ROLES)[number];

/** Roles that only ever see their own organisation's rows, through column grants and row-level security. */
export const TENANT_ROLES = ["leads_client", "leads_agency"] as const;
export type TenantRoleName = (typeof TENANT_ROLES)[number];

export const OWNER_ROLE = "leads_owner";

export const DATABASES = { dev: "fynix_leads", test: "fynix_leads_test" } as const;
export type DatabaseTarget = keyof typeof DATABASES;

const SUFFIX = {
  leads_owner: "OWNER",
  leads_auth: "AUTH",
  leads_fynix: "FYNIX",
  leads_client: "CLIENT",
  leads_agency: "AGENCY",
  leads_public: "PUBLIC",
} as const satisfies Record<RoleName, string>;

export type RoleUrlVariable<R extends RoleName> = `DATABASE_URL_${(typeof SUFFIX)[R]}`;
export type RoleTestUrlVariable<R extends RoleName> = `DATABASE_URL_${(typeof SUFFIX)[R]}_TEST`;
export type RolePasswordVariable<R extends RoleName> = `LEADS_${(typeof SUFFIX)[R]}_PASSWORD`;

/** `DATABASE_URL_CLIENT` for the dev database, `DATABASE_URL_CLIENT_TEST` for the test one. */
export function urlVariable<R extends RoleName>(role: R, target: "dev"): RoleUrlVariable<R>;
export function urlVariable<R extends RoleName>(role: R, target: "test"): RoleTestUrlVariable<R>;
export function urlVariable(role: RoleName, target: DatabaseTarget): string {
  return target === "dev" ? `DATABASE_URL_${SUFFIX[role]}` : `DATABASE_URL_${SUFFIX[role]}_TEST`;
}

export function passwordVariable<R extends RoleName>(role: R): RolePasswordVariable<R> {
  return `LEADS_${SUFFIX[role]}_PASSWORD` as RolePasswordVariable<R>;
}
```

- [ ] **Step 4: Create `server/env.ts`**

Two schemas: what the running app needs (five role URLs, no owner) and what scripts and tests need on top. `describeEnvProblems` is the only thing that formats problems, and it never prints a value. `getEnv()` parses lazily, so `next build` and unit tests need no secrets.

```typescript
import { z } from "zod";
import { ROLE_NAMES, RUNTIME_ROLES, passwordVariable, urlVariable } from "@/server/db/roles";

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

const postgresUrl = z.string().refine(isPostgresUrl, "must be a postgres:// or postgresql:// URL");
const password = z.string().min(24, "must be at least 24 characters");

/** What the running app needs: one connection string per runtime role. The owner role is never in the app. */
export const runtimeEnvSchema = z.object({
  DATABASE_URL_AUTH: postgresUrl,
  DATABASE_URL_FYNIX: postgresUrl,
  DATABASE_URL_CLIENT: postgresUrl,
  DATABASE_URL_AGENCY: postgresUrl,
  DATABASE_URL_PUBLIC: postgresUrl,
});
export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

/**
 * What the scripts and integration tests need on top of that: a superuser URL to create roles and databases, the
 * owner URL for migrations, a password per role, and the same connection strings for the test database.
 */
export const toolingEnvSchema = z.object({
  DATABASE_URL_ADMIN: postgresUrl,
  DATABASE_URL_OWNER: postgresUrl,
  DATABASE_URL_OWNER_TEST: postgresUrl,
  DATABASE_URL_AUTH_TEST: postgresUrl,
  DATABASE_URL_FYNIX_TEST: postgresUrl,
  DATABASE_URL_CLIENT_TEST: postgresUrl,
  DATABASE_URL_AGENCY_TEST: postgresUrl,
  DATABASE_URL_PUBLIC_TEST: postgresUrl,
  LEADS_OWNER_PASSWORD: password,
  LEADS_AUTH_PASSWORD: password,
  LEADS_FYNIX_PASSWORD: password,
  LEADS_CLIENT_PASSWORD: password,
  LEADS_AGENCY_PASSWORD: password,
  LEADS_PUBLIC_PASSWORD: password,
});
export type ToolingEnv = z.infer<typeof toolingEnvSchema>;

/** The variable names the two schemas declare, for the check that roles.ts and this file agree. */
export function declaredVariables(): { readonly runtime: string[]; readonly tooling: string[] } {
  return { runtime: Object.keys(runtimeEnvSchema.shape), tooling: Object.keys(toolingEnvSchema.shape) };
}

/** The variable names roles.ts derives, for the same check. */
export function derivedVariables(): { readonly runtime: string[]; readonly tooling: string[] } {
  const runtime = RUNTIME_ROLES.map((role) => urlVariable(role, "dev"));
  const tooling = [
    "DATABASE_URL_ADMIN",
    urlVariable("leads_owner", "dev"),
    ...ROLE_NAMES.map((role) => urlVariable(role, "test")),
    ...ROLE_NAMES.map((role) => passwordVariable(role)),
  ];
  return { runtime, tooling };
}

type Source = Readonly<Record<string, string | undefined>>;

/**
 * One line per problem, naming the variable and the rule it broke, never its value: env values here are passwords.
 * An empty list means the environment is complete.
 */
export function describeEnvProblems(source: Source, schema: z.ZodObject): string[] {
  const result = schema.safeParse(source);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? "(unknown)");
    const value = source[name];
    return value === undefined || value === "" ? `${name}: missing` : `${name}: invalid, ${issue.message}`;
  });
}

let runtimeEnv: RuntimeEnv | undefined;

/**
 * The runtime environment, parsed on first use and not at import time, so `next build` and unit tests need no
 * secrets. Throws a message that names the failing variables and never their values.
 */
export function getEnv(source: Source = process.env): RuntimeEnv {
  if (runtimeEnv !== undefined) return runtimeEnv;
  const problems = describeEnvProblems(source, runtimeEnvSchema);
  if (problems.length > 0) {
    throw new Error(`The environment is not valid. Run "pnpm env:check" to see it again.\n${problems.join("\n")}`);
  }
  runtimeEnv = runtimeEnvSchema.parse(source);
  return runtimeEnv;
}

/** The tooling environment, for scripts and tests. Not cached: scripts load their env file just before calling this. */
export function getToolingEnv(source: Source = process.env): ToolingEnv {
  const problems = describeEnvProblems(source, toolingEnvSchema);
  if (problems.length > 0) {
    throw new Error(`The environment is not valid. Run "pnpm env:init" for a new machine or "pnpm env:check".\n${problems.join("\n")}`);
  }
  return toolingEnvSchema.parse(source);
}

/** Test hook: forget the cached runtime environment. */
export function resetEnvCache(): void {
  runtimeEnv = undefined;
}
```

- [ ] **Step 5: Create `server/env-file.ts`**

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";

export const ENV_FILE_NAME = ".env.local";

/**
 * Loads `.env.local` from the repository root into `process.env`, for scripts and tests. Next.js loads the same
 * file for the app on its own. Variables already set in the shell win, which is how CI overrides them.
 */
export function loadEnvLocal(directory: string = process.cwd()): void {
  const path = join(directory, ENV_FILE_NAME);
  if (!existsSync(path)) {
    throw new Error(`${path} does not exist. Run "pnpm env:init" to create it.`);
  }
  process.loadEnvFile(path);
}
```

- [ ] **Step 6: Create `server/env-init.ts`**

```typescript
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { DATABASES, ROLE_NAMES, passwordVariable, urlVariable, type DatabaseTarget, type RoleName } from "@/server/db/roles";

const HOST = "localhost:5432";

export interface EnvSecrets {
  /** The operating system user, who is the local Postgres superuser. In CI it is the runner user. */
  readonly superuser: string;
  readonly passwords: Readonly<Record<RoleName, string>>;
}

/** 24 random bytes as hex: 48 characters, safe unquoted in an env file and in a URL. */
export function generateSecrets(superuser: string): EnvSecrets {
  const passwords = Object.fromEntries(ROLE_NAMES.map((role) => [role, randomBytes(24).toString("hex")])) as Record<RoleName, string>;
  return { superuser, passwords };
}

function roleUrl(role: RoleName, password: string, target: DatabaseTarget): string {
  return `postgresql://${role}:${encodeURIComponent(password)}@${HOST}/${DATABASES[target]}`;
}

/** The contents of `.env.local`. Every value is dotenv-safe: no whitespace, quotes, `#` or `$`. */
export function buildEnvFile(secrets: EnvSecrets): string {
  const lines = [
    "# Local development only. Generated by `pnpm env:init`. Never commit this file.",
    "",
    "# Role and database setup connect as the local Postgres superuser, to the maintenance database.",
    `DATABASE_URL_ADMIN=postgresql://${encodeURIComponent(secrets.superuser)}@${HOST}/postgres`,
    "",
    "# Passwords for the six roles created by `pnpm db:roles`.",
    ...ROLE_NAMES.map((role) => `${passwordVariable(role)}=${secrets.passwords[role]}`),
    "",
    "# Migrations and drizzle-kit connect as the owner role.",
    `${urlVariable("leads_owner", "dev")}=${roleUrl("leads_owner", secrets.passwords.leads_owner, "dev")}`,
    "",
    "# The running app: one connection string per runtime role, and never the owner.",
    ...ROLE_NAMES.filter((role) => role !== "leads_owner").map((role) => `${urlVariable(role, "dev")}=${roleUrl(role, secrets.passwords[role], "dev")}`),
    "",
    "# Integration tests: the same roles on the test database.",
    ...ROLE_NAMES.map((role) => `${urlVariable(role, "test")}=${roleUrl(role, secrets.passwords[role], "test")}`),
    "",
  ];
  return lines.join("\n");
}

/** `.env.local` already exists. Nothing was changed. */
export class EnvFileExistsError extends Error {
  constructor(readonly path: string) {
    super(`${path} already exists, so nothing was changed. Delete it first if you want new secrets.`);
    this.name = "EnvFileExistsError";
  }
}

/**
 * Writes `contents` to a new file readable by its owner only. The `wx` flag makes the write fail if the file exists
 * (no check-then-write race), and `mode` applies only to a newly created file. It never overwrites.
 */
export function writeEnvFileOnce(path: string, contents: string): void {
  try {
    writeFileSync(path, contents, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") throw new EnvFileExistsError(path);
    throw error;
  }
}
```

- [ ] **Step 7: Create `server/run-script.ts`**

```typescript
/**
 * Runs a script's `main`, prints a failure as one readable message and exits non-zero. The repository is CommonJS
 * (no "type": "module"), so a script cannot use top-level await under tsx.
 */
export function runScript(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
```

- [ ] **Step 8: Run the tests and see them pass**

```bash
pnpm exec vitest run server/env
```

Expected: PASS, 2 test files, 11 tests.

- [ ] **Step 9: Create the two scripts**

`scripts/env-init.ts`:

```typescript
import { userInfo } from "node:os";
import { join } from "node:path";
import { ENV_FILE_NAME } from "@/server/env-file";
import { EnvFileExistsError, buildEnvFile, generateSecrets, writeEnvFileOnce } from "@/server/env-init";
import { runScript } from "@/server/run-script";

runScript(async () => {
  const path = join(process.cwd(), ENV_FILE_NAME);
  try {
    writeEnvFileOnce(path, buildEnvFile(generateSecrets(userInfo().username)));
  } catch (error) {
    if (error instanceof EnvFileExistsError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  console.log(`Wrote ${path} (mode 600). Next: pnpm db:roles, pnpm db:create, pnpm db:migrate.`);
});
```

`scripts/env-check.ts`:

```typescript
import { describeEnvProblems, runtimeEnvSchema, toolingEnvSchema } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Prints variable names and the rule they broke. Never prints a value: they are passwords.
runScript(async () => {
  loadEnvLocal();
  const problems = [...describeEnvProblems(process.env, runtimeEnvSchema), ...describeEnvProblems(process.env, toolingEnvSchema)];
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s) in the environment:\n${[...new Set(problems)].join("\n")}`);
    process.exit(1);
  }
  console.log("Environment OK.");
});
```

- [ ] **Step 10: Run them on this machine**

```bash
pnpm env:init
stat -f "%Sp %N" .env.local
pnpm env:check
pnpm env:init
```

Expected, in order: `Wrote <repo>/.env.local (mode 600). Next: pnpm db:roles, pnpm db:create, pnpm db:migrate.`; then `-rw------- .env.local`; then `Environment OK.`; then the second `env:init` prints `<repo>/.env.local already exists, so nothing was changed. Delete it first if you want new secrets.` and exits with status 1 (pnpm adds an `ELIFECYCLE` line).

Check that `env:check` reports names and never values:

```bash
DATABASE_URL_CLIENT= LEADS_AUTH_PASSWORD=short pnpm env:check
```

Expected: exit status 1 and exactly

```
2 problem(s) in the environment:
DATABASE_URL_CLIENT: missing
LEADS_AUTH_PASSWORD: invalid, must be at least 24 characters
```

- [ ] **Step 11: Typecheck, lint and commit**

```bash
pnpm typecheck
pnpm lint
git add server scripts
git commit -m "Add role list and environment tooling with generated secrets"
```

Expected: no errors. `.env.local` is not staged (it is ignored).

---

## Task 3: Database creation and roles scripts

**Files:**
- Create: `server/db/provision.ts`, `scripts/db-roles.ts`, `scripts/db-create.ts`
- Test: `server/db/provision.test.ts`

Order matters and the scripts enforce it: `pnpm db:roles` first (the owner role must exist to own the databases), then `pnpm db:create`. Both are safe to run again. `db:roles` also hardens any database that already exists, so it works on a machine or in CI where the database was created some other way.

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm exec vitest run server/db/provision
```

Expected: FAIL with `Cannot find package '@/server/db/provision'`.

- [ ] **Step 3: Create `server/db/provision.ts`**

All privilege decisions of decision C5 are here, in one file, run as the superuser. Role passwords are escaped with `escapeLiteral` because `CREATE ROLE` takes no bind parameters. Nothing prints a password.

```typescript
import { Client } from "pg";
import { DATABASES, OWNER_ROLE, ROLE_NAMES, RUNTIME_ROLES, type RoleName } from "@/server/db/roles";

/**
 * Least privilege: login only. None of these roles can create databases or roles, bypass row-level security or
 * replicate. Row-level security applies to all of them because only `leads_owner` owns tables, and the app never
 * connects as the owner.
 */
const ROLE_ATTRIBUTES = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION";

/** The same server and credentials, another database. */
export function databaseUrl(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

async function withClient<T>(connectionString: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Creates the six roles, or resets the attributes and password of one that exists, so the script can be run again.
 * Roles are cluster-wide: resetting a password changes it for every checkout that shares this Postgres server.
 */
export async function provisionRoles(admin: Client, passwords: Readonly<Record<RoleName, string>>): Promise<void> {
  for (const role of ROLE_NAMES) {
    const identifier = admin.escapeIdentifier(role);
    const password = admin.escapeLiteral(passwords[role]);
    const existing = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE ROLE ${identifier} ${ROLE_ATTRIBUTES} PASSWORD ${password}`);
      console.log(`Created role ${role}`);
    } else {
      await admin.query(`ALTER ROLE ${identifier} ${ROLE_ATTRIBUTES} PASSWORD ${password}`);
      console.log(`Updated role ${role}; its password now matches this checkout's .env.local`);
    }
  }
}

/** Creates the database, owned by the owner role, unless it exists. Needs the roles first. */
export async function createDatabaseIfMissing(admin: Client, database: string): Promise<void> {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(database)} OWNER ${admin.escapeIdentifier(OWNER_ROLE)}`);
    console.log(`Created database ${database}, owned by ${OWNER_ROLE}`);
  }
}

/**
 * Makes an existing database safe, and is safe to run again:
 * - the owner role owns it, so migrations run as the owner and tables belong to it;
 * - PUBLIC loses every database privilege, so only the six roles can connect and nobody can create temporary tables;
 * - PUBLIC loses CREATE on the public schema, and the runtime roles get USAGE only;
 * - functions the owner creates later are not executable by PUBLIC unless a migration grants it.
 */
export async function hardenDatabase(adminUrl: string, database: string): Promise<void> {
  await withClient(adminUrl, async (admin) => {
    const name = admin.escapeIdentifier(database);
    await admin.query(`ALTER DATABASE ${name} OWNER TO ${admin.escapeIdentifier(OWNER_ROLE)}`);
    await admin.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    for (const role of ROLE_NAMES) {
      await admin.query(`GRANT CONNECT ON DATABASE ${name} TO ${admin.escapeIdentifier(role)}`);
    }
  });
  await withClient(databaseUrl(adminUrl, database), async (client) => {
    await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    for (const role of RUNTIME_ROLES) {
      await client.query(`GRANT USAGE ON SCHEMA public TO ${client.escapeIdentifier(role)}`);
    }
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${client.escapeIdentifier(OWNER_ROLE)} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`);
  });
  console.log(`Hardened database ${database}`);
}

/** The roles script: roles first, then every database that already exists. */
export async function runRolesSetup(adminUrl: string, passwords: Readonly<Record<RoleName, string>>): Promise<void> {
  await withClient(adminUrl, (admin) => provisionRoles(admin, passwords));
  for (const database of Object.values(DATABASES)) {
    const exists = await withClient(adminUrl, async (admin) => (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database])).rowCount !== 0);
    if (exists) await hardenDatabase(adminUrl, database);
  }
}

/** The create script: both databases, then the same hardening. Fails clearly when the roles are missing. */
export async function runDatabaseSetup(adminUrl: string): Promise<void> {
  for (const database of Object.values(DATABASES)) {
    await withClient(adminUrl, async (admin) => {
      const owner = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [OWNER_ROLE]);
      if (owner.rowCount === 0) throw new Error(`Role ${OWNER_ROLE} does not exist. Run "pnpm db:roles" first.`);
      await createDatabaseIfMissing(admin, database);
    });
    await hardenDatabase(adminUrl, database);
  }
}
```

- [ ] **Step 4: Run the test and see it pass**

```bash
pnpm exec vitest run server/db/provision
```

Expected: PASS, 1 test.

- [ ] **Step 5: Create the two scripts**

`scripts/db-roles.ts`:

```typescript
import { runRolesSetup } from "@/server/db/provision";
import { ROLE_NAMES, passwordVariable, type RoleName } from "@/server/db/roles";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

runScript(async () => {
  loadEnvLocal();
  const env = getToolingEnv();
  const passwords = Object.fromEntries(ROLE_NAMES.map((role) => [role, env[passwordVariable(role)]])) as Record<RoleName, string>;
  await runRolesSetup(env.DATABASE_URL_ADMIN, passwords);
});
```

`scripts/db-create.ts`:

```typescript
import { runDatabaseSetup } from "@/server/db/provision";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

runScript(async () => {
  loadEnvLocal();
  await runDatabaseSetup(getToolingEnv().DATABASE_URL_ADMIN);
});
```

- [ ] **Step 6: Run them in the right order and see the guard**

```bash
pnpm db:create
```

Expected: fails with `Role leads_owner does not exist. Run "pnpm db:roles" first.` (exit status 1).

```bash
pnpm db:roles
pnpm db:create
```

Expected:

```
Created role leads_owner
Created role leads_auth
Created role leads_fynix
Created role leads_client
Created role leads_agency
Created role leads_public
Created database fynix_leads, owned by leads_owner
Hardened database fynix_leads
Created database fynix_leads_test, owned by leads_owner
Hardened database fynix_leads_test
```

- [ ] **Step 7: Check the result in the catalog**

```bash
psql -d postgres -Atc "select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication from pg_roles where rolname like 'leads\_%' order by 1"
psql -d postgres -Atc "select count(*) from pg_auth_members where roleid::regrole::text like 'leads\_%' or member::regrole::text like 'leads\_%'"
psql -d postgres -Atc "select datname, pg_get_userbyid(datdba), datacl from pg_database where datname like 'fynix\_leads%' order by 1"
```

Expected:

```
leads_agency|t|f|f|f|f|f
leads_auth|t|f|f|f|f|f
leads_client|t|f|f|f|f|f
leads_fynix|t|f|f|f|f|f
leads_owner|t|f|f|f|f|f
leads_public|t|f|f|f|f|f
0
fynix_leads|leads_owner|{leads_owner=CTc/leads_owner,leads_auth=c/leads_owner,leads_fynix=c/leads_owner,leads_client=c/leads_owner,leads_agency=c/leads_owner,leads_public=c/leads_owner}
fynix_leads_test|leads_owner|{leads_owner=CTc/leads_owner,leads_auth=c/leads_owner,leads_fynix=c/leads_owner,leads_client=c/leads_owner,leads_agency=c/leads_owner,leads_public=c/leads_owner}
```

Columns of the first query: login, superuser, createdb, createrole, bypassrls, replication. The `datacl` has no `=Tc/` entry, which is the PUBLIC grant that was revoked.

- [ ] **Step 8: Run both again to prove they are idempotent**

```bash
pnpm db:roles
pnpm db:create
```

Expected: six lines `Updated role leads_...; its password now matches this checkout's .env.local`, then `Hardened database` lines for both databases, with no `Created database` line and no error.

- [ ] **Step 9: Typecheck, lint and commit**

```bash
pnpm typecheck
pnpm lint
git add server/db/provision.ts server/db/provision.test.ts scripts/db-roles.ts scripts/db-create.ts
git commit -m "Add scripts that create the six roles and the two databases"
```

---

## Task 4: The per-migration-commit migrator

**Files:**
- Create: `server/db/migrator.ts`, `server/db/migrate-guards.ts`, `scripts/db-migrate.ts`
- Test: `server/db/migrate-guards.test.ts` (the migrator's own integration test is in Task 10, which needs the harness)

- [ ] **Step 1: Write the failing test for the guards**

The guards take anything with a `query` method, so the test passes a fake and needs no database.

```typescript
import { describe, expect, it } from "vitest";
import { assertReadyToMigrate, type Queryable } from "@/server/db/migrate-guards";
import { ROLE_NAMES } from "@/server/db/roles";

function fakeDatabase(roles: readonly string[], currentUser: string): Queryable {
  return {
    query: async <Row extends Record<string, unknown>>(text: string) =>
      ({ rows: (text.includes("pg_roles") ? roles.map((rolname) => ({ rolname })) : [{ current_user: currentUser }]) as unknown as Row[] }),
  };
}

describe("assertReadyToMigrate", () => {
  it("passes when all six roles exist and the connection is the owner", async () => {
    await expect(assertReadyToMigrate(fakeDatabase(ROLE_NAMES, "leads_owner"))).resolves.toBeUndefined();
  });

  it("names every missing role and points at the roles script", async () => {
    const present = ROLE_NAMES.filter((name) => name !== "leads_client" && name !== "leads_public");
    await expect(assertReadyToMigrate(fakeDatabase(present, "leads_owner"))).rejects.toThrow(
      'Missing database roles: leads_client, leads_public. Run "pnpm db:roles" before migrating.',
    );
  });

  it("refuses a connection that is not the owner", async () => {
    await expect(assertReadyToMigrate(fakeDatabase(ROLE_NAMES, "a12345"))).rejects.toThrow("Migrations must run as leads_owner, not a12345.");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm exec vitest run server/db/migrate-guards
```

Expected: FAIL with `Cannot find package '@/server/db/migrate-guards'`.

- [ ] **Step 3: Create `server/db/migrate-guards.ts`**

```typescript
import { OWNER_ROLE, ROLE_NAMES } from "@/server/db/roles";

/** The one method the guards use, so a unit test can pass a fake. `pg`'s Pool and Client both fit. */
export interface Queryable {
  query<Row extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>;
}

/**
 * Migrations grant privileges to the six roles and must create every object as the owner. Refuse to run when a role is
 * missing, or when the connection is not the owner: a table created by a superuser would belong to the wrong role and
 * nothing could be granted on it later.
 */
export async function assertReadyToMigrate(db: Queryable): Promise<void> {
  const found = await db.query<{ rolname: string }>("SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])", [[...ROLE_NAMES]]);
  const missing = ROLE_NAMES.filter((name) => !found.rows.some((row) => row.rolname === name));
  if (missing.length > 0) {
    throw new Error(`Missing database roles: ${missing.join(", ")}. Run "pnpm db:roles" before migrating.`);
  }
  const current = await db.query<{ current_user: string }>("SELECT current_user");
  const user = current.rows[0]?.current_user;
  if (user !== OWNER_ROLE) {
    throw new Error(`Migrations must run as ${OWNER_ROLE}, not ${user ?? "an unknown role"}. Check DATABASE_URL_OWNER.`);
  }
}
```

- [ ] **Step 4: Run the test and see it pass**

```bash
pnpm exec vitest run server/db/migrate-guards
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Create `server/db/migrator.ts`**

A port of the sibling platform repository's migrator, with the reason in the comment: drizzle-orm applies all pending migrations in one transaction, and Postgres refuses to use a new enum value in the transaction that added it. This repository has `CREATE TYPE ... AS ENUM` in `0001` and will add values later, so a fresh database must not depend on every migration having been applied on a different day. Added over the platform's version: `stopAfter` (Task 8 uses it) and `bookkeepingSchema` (Task 10 uses it).

```typescript
import { readFileSync } from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Pool, PoolClient } from "pg";

/** Drizzle's own bookkeeping location. Keep it: drizzle-kit and drizzle-orm both expect it. */
const DEFAULT_SCHEMA = "drizzle";

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** A migration failed. It was rolled back on its own; every migration before it stays applied. */
export class MigrationFailedError extends Error {
  constructor(
    readonly migration: string,
    options: { readonly cause: unknown },
  ) {
    const reason = options.cause instanceof Error ? options.cause.message : String(options.cause);
    super(`Migration ${migration} failed and was rolled back; nothing after it was applied. ${reason}`, options);
    this.name = "MigrationFailedError";
  }
}

export interface MigrateOptions {
  /** Stop after applying the migration with this tag, for example `0001_organisation_campaign`. Later ones stay pending. */
  readonly stopAfter?: string;
  /** Where Drizzle's bookkeeping table lives. Only the migrator's own integration test changes it. */
  readonly bookkeepingSchema?: string;
}

/** The migration names, in order, from drizzle-kit's journal. Drizzle's own reader discards them. */
function readMigrationTags(migrationsFolder: string): readonly string[] {
  const journal: unknown = JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"));
  const entries = (journal as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) throw new Error(`${migrationsFolder}/meta/_journal.json has no entries list.`);
  return entries.map((entry: unknown, index) => {
    const tag = (entry as { tag?: unknown }).tag;
    if (typeof tag !== "string") throw new Error(`Journal entry ${index} in ${migrationsFolder} has no tag.`);
    return tag;
  });
}

async function applyOne(client: PoolClient, statements: readonly string[], insert: string, hash: string, createdAt: number): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const statement of statements) await client.query(statement);
    await client.query(insert, [hash, createdAt]);
    await client.query("COMMIT");
  } catch (error) {
    // A connection that has lost the transaction cannot roll back; the original error is the one worth reporting.
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/**
 * Applies pending migrations the way drizzle-orm's migrator does (same files, same bookkeeping table and hashes, same
 * "newer than the last applied migration" rule) except that each migration commits on its own.
 *
 * Drizzle runs every pending migration in one transaction. Postgres refuses to use an enum value in the transaction
 * that added it (55P04, "unsafe use of new value"), so a database migrated from scratch can fail on a migration that
 * worked on every database that received the same migrations on different days. The sibling platform repository
 * found this when its first fresh production database failed. Committing per migration is what Rails and Flyway do.
 *
 * A failing migration is rolled back by itself and stops the run: everything before it stays applied, nothing after
 * it is attempted, and the error names it.
 */
export async function runMigrations(pool: Pool, migrationsFolder: string, options: MigrateOptions = {}): Promise<void> {
  const schema = quote(options.bookkeepingSchema ?? DEFAULT_SCHEMA);
  const table = `${schema}."__drizzle_migrations"`;
  const migrations = readMigrationFiles({ migrationsFolder });
  const tags = readMigrationTags(migrationsFolder);
  if (tags.length !== migrations.length) {
    throw new Error(`${migrationsFolder} lists ${tags.length} migrations in its journal but has ${migrations.length}.`);
  }
  if (options.stopAfter !== undefined && !tags.includes(options.stopAfter)) {
    throw new Error(`stopAfter names "${options.stopAfter}", which is not in ${migrationsFolder}/meta/_journal.json.`);
  }

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`CREATE TABLE IF NOT EXISTS ${table} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
    const last = await client.query<{ created_at: string | null }>(`SELECT created_at FROM ${table} ORDER BY created_at DESC LIMIT 1`);
    // Drizzle compares against the newest recorded migration only; keep the same rule so both runners agree.
    const lastApplied = last.rows[0] === undefined ? null : Number(last.rows[0].created_at);
    const insert = `INSERT INTO ${table} ("hash", "created_at") VALUES ($1, $2)`;

    for (const [index, migration] of migrations.entries()) {
      const tag = tags[index] ?? `#${index}`;
      if (lastApplied === null || lastApplied < migration.folderMillis) {
        try {
          await applyOne(client, migration.sql, insert, migration.hash, migration.folderMillis);
        } catch (error) {
          throw new MigrationFailedError(tag, { cause: error });
        }
      }
      if (tag === options.stopAfter) return;
    }
  } finally {
    client.release();
  }
}
```

- [ ] **Step 6: Create `scripts/db-migrate.ts`**

It refuses to run if a role is missing or the connection is not `leads_owner`, applies the migrations in `server/db/migrations/` and accepts `--target=dev|test` and `--stop-after=<tag>`. It does not use drizzle-orm's `migrate()`.

```typescript
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { assertReadyToMigrate } from "@/server/db/migrate-guards";
import { runMigrations } from "@/server/db/migrator";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

runScript(async () => {
  const { values } = parseArgs({ options: { target: { type: "string" }, "stop-after": { type: "string" } } });
  const target = values.target ?? "dev";
  if (target !== "dev" && target !== "test") {
    throw new Error(`--target must be "dev" or "test", received ${JSON.stringify(values.target)}`);
  }

  loadEnvLocal();
  const env = getToolingEnv();
  const pool = new Pool({ connectionString: target === "dev" ? env.DATABASE_URL_OWNER : env.DATABASE_URL_OWNER_TEST, max: 1 });
  try {
    await assertReadyToMigrate(pool);
    // Not drizzle-orm's migrate(): it applies every pending migration in one transaction. See server/db/migrator.ts.
    await runMigrations(pool, join(process.cwd(), "server/db/migrations"), { stopAfter: values["stop-after"] });
    console.log(`Migrations applied to the ${target} database${values["stop-after"] ? `, stopping after ${values["stop-after"]}` : ""}.`);
  } finally {
    await pool.end();
  }
});
```

- [ ] **Step 7: Typecheck, lint and commit**

```bash
pnpm typecheck
pnpm lint
git add server/db/migrator.ts server/db/migrate-guards.ts server/db/migrate-guards.test.ts scripts/db-migrate.ts
git commit -m "Add the per-migration-commit migrator and its guards"
```

The script cannot be run end to end yet: there are no migrations. Task 5 runs it for the first time.

---

## Task 5: Schema, generated DDL, grants, policies and triggers

**Files:**
- Create: `server/db/schema/enums.ts`, `server/db/schema/organisation.ts`, `server/db/schema/campaign.ts`, `server/db/schema/index.ts`
- Create (by drizzle-kit, then edited): `server/db/migrations/0000_functions.sql`, `0001_organisation_campaign.sql`, `0002_organisation_grants.sql`, `0003_campaign_grants.sql`, `0004_campaign_brand_sync.sql`, and `server/db/migrations/meta/`

What the migrations do, so the SQL below is not a surprise:

- **0000** is hand-written and first: `app_current_org_id()` and `app_current_user_id()`. Plain `LANGUAGE sql STABLE`, every name qualified with `pg_catalog`, no `SET` clause (a `SET` clause stops the planner inlining a function, and the policies lean on inlining). Executable by the five runtime roles and nobody else.
- **0001** is generated DDL for both tables. `campaign` carries both organisation ids plus two constant generated columns, `client_org_kind` and `agency_org_kind`. The composite foreign keys `(client_org_id, client_org_kind) -> organisation(id, kind)` and `(agency_org_id, agency_org_kind) -> organisation(id, kind)` make the database itself refuse an agency used as a client or the reverse. This is the composite foreign key pattern. The pattern that keeps a *lead's* two organisation ids equal to its campaign's (`foreign key (campaign_id, client_org_id, agency_org_id) references campaign (id, client_org_id, agency_org_id)`) first applies to `lead` in phase 2; its target, the unique constraint `campaign_id_orgs_unique`, is created here.
- **0002 and 0003** are hand-written: enable row-level security, grant, create policies, per role. Tenant roles get `SELECT` on named columns only. The policies compare `id` or `client_org_id` or `agency_org_id`, columns the tenant cannot read; Postgres evaluates a policy with its own rights, which is what the spike proved.
- **0004** is hand-written: two triggers that keep `campaign.client_brand_name` equal to the client's brand name (decision C1). Both run with the caller's rights; neither is `SECURITY DEFINER`.

- [ ] **Step 1: Create the schema files**

`server/db/schema/enums.ts`:

```typescript
import { pgEnum } from "drizzle-orm/pg-core";

export const organisationKind = pgEnum("organisation_kind", ["fynix", "client", "agency"]);
export const organisationStatus = pgEnum("organisation_status", ["active", "archived"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "active", "paused", "completed"]);
```

`server/db/schema/organisation.ts`:

```typescript
import { check, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organisationKind, organisationStatus } from "./enums";

/**
 * Fynix itself, the client companies and the agencies. A tenant role reads only its own row, and never the `id`
 * column: the server knows the organisation id from the session, and no query a tenant can write returns one.
 */
export const organisation = pgTable(
  "organisation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The reference that is safe to show: `ORG-` and four base-32 characters, generated by the server. */
    publicRef: text("public_ref").notNull(),
    kind: organisationKind("kind").notNull(),
    name: text("name").notNull(),
    /** What an agency sees of a client. Required for clients, optional for the others. */
    brandName: text("brand_name"),
    status: organisationStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("organisation_public_ref_unique").on(table.publicRef),
    // The target of the composite foreign keys that pin a campaign's two organisations to the right kind.
    unique("organisation_id_kind_unique").on(table.id, table.kind),
    check("organisation_public_ref_format", sql`${table.publicRef} ~ '^ORG-[0-9A-HJKMNP-TV-Z]{4}$'`),
    check("organisation_client_has_brand", sql`${table.kind} <> 'client' OR ${table.brandName} IS NOT NULL`),
  ],
);
```

`server/db/schema/campaign.ts`:

```typescript
import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { campaignStatus, organisationKind } from "./enums";
import { organisation } from "./organisation";

/**
 * One client, served by one agency. Both organisation ids live here so a policy can compare one column per role.
 *
 * - The client never gets a grant on `agency_org_id`, and the agency never gets one on `client_org_id`.
 * - `client_org_kind` and `agency_org_kind` are constants. The composite foreign keys below use them to make the
 *   database refuse a client id that points at an agency, or the other way round.
 * - `client_brand_name` is a copy of the client's brand, kept in step by triggers (migration 0004), so an agency can
 *   read the brand of its own campaigns without being able to read any client organisation row.
 */
export const campaign = pgTable(
  "campaign",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `CMP-` and four base-32 characters, generated by the server. */
    publicRef: text("public_ref").notNull(),
    name: text("name").notNull(),
    clientOrgId: uuid("client_org_id").notNull(),
    clientOrgKind: organisationKind("client_org_kind").notNull().generatedAlwaysAs(sql`'client'::organisation_kind`),
    agencyOrgId: uuid("agency_org_id").notNull(),
    agencyOrgKind: organisationKind("agency_org_kind").notNull().generatedAlwaysAs(sql`'agency'::organisation_kind`),
    /** Set by a trigger from the client organisation. Callers do not pass it. */
    clientBrandName: text("client_brand_name").notNull().default(""),
    /** Fynix only. No tenant role has a grant on this column. */
    internalNotes: text("internal_notes"),
    status: campaignStatus("status").notNull().default("draft"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    monthlyTarget: integer("monthly_target").notNull(),
    totalTarget: integer("total_target").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("campaign_public_ref_unique").on(table.publicRef),
    // The target of phase 2's composite foreign key from `lead`, which keeps a lead's two organisation ids equal
    // to its campaign's.
    unique("campaign_id_orgs_unique").on(table.id, table.clientOrgId, table.agencyOrgId),
    foreignKey({
      name: "campaign_client_org_fk",
      columns: [table.clientOrgId, table.clientOrgKind],
      foreignColumns: [organisation.id, organisation.kind],
    }),
    foreignKey({
      name: "campaign_agency_org_fk",
      columns: [table.agencyOrgId, table.agencyOrgKind],
      foreignColumns: [organisation.id, organisation.kind],
    }),
    index("campaign_client_org_idx").on(table.clientOrgId),
    index("campaign_agency_org_idx").on(table.agencyOrgId),
    check("campaign_public_ref_format", sql`${table.publicRef} ~ '^CMP-[0-9A-HJKMNP-TV-Z]{4}$'`),
    check("campaign_dates_in_order", sql`${table.endDate} >= ${table.startDate}`),
    check("campaign_targets_not_negative", sql`${table.monthlyTarget} >= 0 AND ${table.totalTarget} >= 0`),
  ],
);
```

`server/db/schema/index.ts`:

```typescript
export * from "./enums";
export * from "./organisation";
export * from "./campaign";
```

- [ ] **Step 2: Create the first hand-written migration**

```bash
pnpm db:generate --custom --name=functions
```

Expected: `[✓] Your SQL migration file ➜ server/db/migrations/0000_functions.sql`. It also writes `meta/_journal.json` and `meta/0000_snapshot.json` (an empty schema snapshot). Replace the contents of `server/db/migrations/0000_functions.sql` with:

```sql
-- The two functions every row-level security policy reads the request scope through. The scope helper sets
-- app.org_id and app.user_id with set_config(..., true) inside a transaction (server/db/scope.ts).
--
-- Plain LANGUAGE sql, STABLE, with no SET clause and every name qualified, so the planner can inline them into the
-- policy expression. A function with a SET clause (a pinned search_path, for example) is never inlined. Outside a
-- transaction that set the value, current_setting returns an empty string, which nullif turns into NULL, so an
-- unscoped connection compares against NULL and sees no rows.
CREATE FUNCTION public.app_current_org_id() RETURNS pg_catalog.uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(pg_catalog.current_setting('app.org_id', true), '')::pg_catalog.uuid $$;
--> statement-breakpoint
CREATE FUNCTION public.app_current_user_id() RETURNS pg_catalog.uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(pg_catalog.current_setting('app.user_id', true), '')::pg_catalog.uuid $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_current_org_id() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_current_user_id() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_current_org_id() TO leads_auth, leads_fynix, leads_client, leads_agency, leads_public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO leads_auth, leads_fynix, leads_client, leads_agency, leads_public;
```

- [ ] **Step 3: Generate the DDL**

```bash
pnpm db:generate --name=organisation_campaign
```

Expected: `2 tables`, `organisation 7 columns 0 indexes 0 fks`, `campaign 15 columns 2 indexes 2 fks`, and `server/db/migrations/0001_organisation_campaign.sql`. Do not edit it. Open it and check it matches this (the order of statements and the constraint names must match; whitespace may differ):

```sql
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."organisation_kind" AS ENUM('fynix', 'client', 'agency');--> statement-breakpoint
CREATE TYPE "public"."organisation_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"kind" "organisation_kind" NOT NULL,
	"name" text NOT NULL,
	"brand_name" text,
	"status" "organisation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_public_ref_unique" UNIQUE("public_ref"),
	CONSTRAINT "organisation_id_kind_unique" UNIQUE("id","kind"),
	CONSTRAINT "organisation_public_ref_format" CHECK ("organisation"."public_ref" ~ '^ORG-[0-9A-HJKMNP-TV-Z]{4}$'),
	CONSTRAINT "organisation_client_has_brand" CHECK ("organisation"."kind" <> 'client' OR "organisation"."brand_name" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"name" text NOT NULL,
	"client_org_id" uuid NOT NULL,
	"client_org_kind" "organisation_kind" GENERATED ALWAYS AS ('client'::organisation_kind) STORED NOT NULL,
	"agency_org_id" uuid NOT NULL,
	"agency_org_kind" "organisation_kind" GENERATED ALWAYS AS ('agency'::organisation_kind) STORED NOT NULL,
	"client_brand_name" text DEFAULT '' NOT NULL,
	"internal_notes" text,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"monthly_target" integer NOT NULL,
	"total_target" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_public_ref_unique" UNIQUE("public_ref"),
	CONSTRAINT "campaign_id_orgs_unique" UNIQUE("id","client_org_id","agency_org_id"),
	CONSTRAINT "campaign_public_ref_format" CHECK ("campaign"."public_ref" ~ '^CMP-[0-9A-HJKMNP-TV-Z]{4}$'),
	CONSTRAINT "campaign_dates_in_order" CHECK ("campaign"."end_date" >= "campaign"."start_date"),
	CONSTRAINT "campaign_targets_not_negative" CHECK ("campaign"."monthly_target" >= 0 AND "campaign"."total_target" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_client_org_fk" FOREIGN KEY ("client_org_id","client_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_agency_org_fk" FOREIGN KEY ("agency_org_id","agency_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_client_org_idx" ON "campaign" USING btree ("client_org_id");--> statement-breakpoint
CREATE INDEX "campaign_agency_org_idx" ON "campaign" USING btree ("agency_org_id");
```

- [ ] **Step 4: Create the three hand-written migrations**

```bash
pnpm db:generate --custom --name=organisation_grants
pnpm db:generate --custom --name=campaign_grants
pnpm db:generate --custom --name=campaign_brand_sync
```

Expected: `0002_organisation_grants.sql`, `0003_campaign_grants.sql`, `0004_campaign_brand_sync.sql`, each empty. Fill them in.

`server/db/migrations/0002_organisation_grants.sql`:

```sql
-- Row-level security and grants for organisation. Written by hand: drizzle-kit does not generate grants.
--
-- Rules for every table (server/db/structure.integration.test.ts checks them for all tables, present and future):
--   1. Row-level security is enabled.
--   2. A tenant role (leads_client, leads_agency) never holds a table-level grant, only SELECT on named columns, so a
--      `select *` fails with "permission denied" and a column added later is hidden until someone grants it.
--   3. Each role that holds any grant has a policy. leads_auth and leads_public hold none on this table.
ALTER TABLE "organisation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Fynix: every row, no DELETE. An organisation is archived (status), not removed.
GRANT SELECT, INSERT, UPDATE ON "organisation" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "organisation_fynix_all" ON "organisation" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Tenants: their own row, and not its `id`, `status` or `created_at`. The policy compares `id`, a column these roles
-- cannot read; Postgres evaluates a policy with its own privileges, so that works.
GRANT SELECT ("public_ref", "kind", "name", "brand_name") ON "organisation" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "organisation_client_own" ON "organisation" AS PERMISSIVE FOR SELECT TO leads_client USING ("id" = public.app_current_org_id());
--> statement-breakpoint
CREATE POLICY "organisation_agency_own" ON "organisation" AS PERMISSIVE FOR SELECT TO leads_agency USING ("id" = public.app_current_org_id());
```

`server/db/migrations/0003_campaign_grants.sql`:

```sql
-- Row-level security and grants for campaign. See 0002 for the rules.
ALTER TABLE "campaign" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "campaign" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "campaign_fynix_all" ON "campaign" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
-- The client reads its own campaigns and the agency reads its own. Neither gets either organisation id, the kind
-- columns or `internal_notes`, so the client learns nothing about the agency and the agency nothing about the client's
-- identity. `client_brand_name` is the one piece of the client the agency may know.
GRANT SELECT ("id", "public_ref", "name", "client_brand_name", "status", "start_date", "end_date", "monthly_target", "total_target")
  ON "campaign" TO leads_client, leads_agency;
--> statement-breakpoint
CREATE POLICY "campaign_client_own" ON "campaign" AS PERMISSIVE FOR SELECT TO leads_client USING ("client_org_id" = public.app_current_org_id());
--> statement-breakpoint
CREATE POLICY "campaign_agency_own" ON "campaign" AS PERMISSIVE FOR SELECT TO leads_agency USING ("agency_org_id" = public.app_current_org_id());
```

`server/db/migrations/0004_campaign_brand_sync.sql`:

```sql
-- Keeps campaign.client_brand_name equal to the client organisation's brand name, so the agency can read the brand
-- of its own campaigns without any grant on organisation. Two triggers: one when a campaign is written, one when a
-- client's brand name changes. Both run with the privileges of the caller, which is leads_fynix (or the owner),
-- the only roles that write these tables. No SECURITY DEFINER, so no function here can be used to read more
-- than its caller could.
CREATE FUNCTION public.campaign_copy_client_brand() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  -- COALESCE so that a client id pointing at a non-client organisation (no brand) reaches the foreign key, which
  -- refuses it with a message that names the real problem, instead of failing here on a NOT NULL.
  NEW.client_brand_name := COALESCE((SELECT o.brand_name FROM public.organisation o WHERE o.id = NEW.client_org_id), '');
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.organisation_push_brand() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  UPDATE public.campaign SET client_brand_name = NEW.brand_name WHERE client_org_id = NEW.id;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.campaign_copy_client_brand() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.organisation_push_brand() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER campaign_copy_client_brand BEFORE INSERT OR UPDATE OF client_org_id ON "campaign"
  FOR EACH ROW EXECUTE FUNCTION public.campaign_copy_client_brand();
--> statement-breakpoint
CREATE TRIGGER organisation_push_brand AFTER UPDATE OF brand_name ON "organisation"
  FOR EACH ROW WHEN (OLD.brand_name IS DISTINCT FROM NEW.brand_name) EXECUTE FUNCTION public.organisation_push_brand();
```

- [ ] **Step 5: Check that drizzle-kit sees the snapshots as consistent**

```bash
pnpm db:generate
```

Expected: `No schema changes, nothing to migrate`. If it proposes a migration, a snapshot is out of step with `server/db/schema/`; fix the schema file, never the snapshot.

- [ ] **Step 6: Migrate the empty dev database**

```bash
pnpm db:migrate
```

Expected: `Migrations applied to the dev database.` Do not migrate the test database yet: Task 8 needs to start it at migration 0001 to watch the tests fail.

- [ ] **Step 7: Look at what was created**

```bash
psql -d fynix_leads -c '\dt' -c '\df public.*'
```

Expected: tables `campaign` and `organisation`, owner `leads_owner`; functions `app_current_org_id`, `app_current_user_id`, `campaign_copy_client_brand`, `organisation_push_brand`.

```bash
psql -d fynix_leads -Atc "select c.relname, c.relrowsecurity from pg_class c where relname in ('organisation','campaign') order by 1"
psql -d fynix_leads -c "select p.polname, p.polcmd, p.polroles::regrole[] as roles from pg_policy p order by 1"
psql -d fynix_leads -c "select table_name, grantee, string_agg(column_name, ', ' order by column_name) as columns from information_schema.column_privileges where table_schema = 'public' and privilege_type = 'SELECT' and grantee in ('leads_client','leads_agency') group by 1, 2 order by 1, 2"
```

Expected:

```
campaign|t
organisation|t
```

```
         polname         | polcmd |     roles      
-------------------------+--------+----------------
 campaign_agency_own     | r      | {leads_agency}
 campaign_client_own     | r      | {leads_client}
 campaign_fynix_all      | *      | {leads_fynix}
 organisation_agency_own | r      | {leads_agency}
 organisation_client_own | r      | {leads_client}
 organisation_fynix_all  | *      | {leads_fynix}
(6 rows)
```

```
  table_name  |   grantee    |                                               columns                                               
--------------+--------------+-----------------------------------------------------------------------------------------------------
 campaign     | leads_agency | client_brand_name, end_date, id, monthly_target, name, public_ref, start_date, status, total_target
 campaign     | leads_client | client_brand_name, end_date, id, monthly_target, name, public_ref, start_date, status, total_target
 organisation | leads_agency | brand_name, kind, name, public_ref
 organisation | leads_client | brand_name, kind, name, public_ref
(4 rows)
```

No `id`, no `client_org_id`, no `agency_org_id`, no `internal_notes` for either tenant role.

- [ ] **Step 8: Commit**

```bash
git add server/db/schema server/db/migrations
git commit -m "Add organisation and campaign schema with grants, policies and brand triggers"
```

---

## Task 6: The scope helper and the per-role pools

**Files:**
- Create: `server/db/pool.ts`, `server/db/client.ts`, `server/db/scope.ts`
- Test: `server/db/scope.test.ts`

Design rules the code below implements: ids are validated as UUIDs before they reach `set_config` and the error never echoes the value; the scope is transaction-local, so it disappears at commit or rollback, including after an error; a tenant pool is only reachable through `withOrgScope`, which refuses a missing or malformed scope before any connection is made; Fynix has its own `withFynixScope` on the `leads_fynix` pool; there is no `SET ROLE` anywhere, because each pool logs in as its role.

- [ ] **Step 1: Write the failing test**

The test uses a fake database that records calls, so it needs no Postgres. It proves validation happens before a transaction is opened.

```typescript
import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { assertUuid, withOrgScope, withScope } from "@/server/db/scope";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

/** A database that records whether anything reached it. */
function spyDatabase(): { readonly db: Database; readonly calls: string[] } {
  const calls: string[] = [];
  const db = {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      calls.push("transaction");
      return work({ execute: async () => calls.push("set_config") });
    },
  } as unknown as Database;
  return { db, calls };
}

describe("assertUuid", () => {
  it("accepts a UUID in either case", () => {
    expect(() => assertUuid(ORG, "orgId")).not.toThrow();
    expect(() => assertUuid(ORG.toUpperCase(), "orgId")).not.toThrow();
  });

  it.each(["", "not-a-uuid", "11111111-1111-4111-8111-11111111111", `${ORG}; drop table organisation`, undefined, null, 42])(
    "rejects %j with a message that does not echo it",
    (value) => {
      expect(() => assertUuid(value, "orgId")).toThrow("orgId must be a UUID");
      expect(() => assertUuid(value, "orgId")).not.toThrow(/drop table/);
    },
  );
});

describe("withScope", () => {
  it("validates before opening a transaction", async () => {
    const { db, calls } = spyDatabase();
    await expect(withScope(db, { orgId: "nope", userId: USER }, async () => "unreachable")).rejects.toThrow("orgId must be a UUID");
    await expect(withScope(db, { orgId: ORG, userId: "" }, async () => "unreachable")).rejects.toThrow("userId must be a UUID");
    expect(calls).toEqual([]);
  });

  it("sets the scope inside one transaction, then runs the work", async () => {
    const { db, calls } = spyDatabase();
    await expect(withScope(db, { orgId: ORG, userId: USER }, async () => "done")).resolves.toBe("done");
    expect(calls).toEqual(["transaction", "set_config"]);
  });

  it("accepts no organisation, for Fynix", async () => {
    const { db, calls } = spyDatabase();
    await withScope(db, { orgId: null, userId: USER }, async () => undefined);
    expect(calls).toEqual(["transaction", "set_config"]);
  });
});

describe("withOrgScope", () => {
  it.each([
    ["no organisation", { orgId: undefined, userId: USER }, "orgId must be a UUID"],
    ["an empty organisation", { orgId: "", userId: USER }, "orgId must be a UUID"],
    ["no user", { orgId: ORG, userId: undefined }, "userId must be a UUID"],
    ["no scope at all", undefined, "A scope is required to use the leads_client pool"],
  ])("refuses a tenant pool with %s, before any connection is made", async (_label, scope, message) => {
    await expect(withOrgScope("leads_client", scope as never, async () => "unreachable")).rejects.toThrow(message);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm exec vitest run server/db/scope
```

Expected: FAIL with `Cannot find package '@/server/db/scope'`.

- [ ] **Step 3: Create `server/db/pool.ts`**

```typescript
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/server/db/schema";

export type Database = NodePgDatabase<typeof schema> & { readonly $client: Pool };

export interface DatabaseHandle {
  readonly db: Database;
  /** Ends the pool. Safe to call more than once. */
  readonly close: () => Promise<void>;
}

export interface DatabaseOptions {
  /** Maximum pooled connections. */
  readonly max?: number;
  /**
   * Called when an idle pooled connection fails, for example when Postgres restarts. Without a listener Node would
   * crash the process on the pool's "error" event. Defaults to logging to stderr.
   */
  readonly onIdleConnectionError?: (error: Error) => void;
}

const DEFAULT_POOL_SIZE = 10;
/** Fail fast instead of waiting forever when every pooled connection is busy or the server is down. */
const CONNECTION_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 30_000;

function logIdleConnectionError(error: Error): void {
  console.error("An idle Postgres connection failed; the pool opens a new one when needed.", error);
}

/**
 * One pool for one connection string. The role is whatever the string logs in as, and the pool never changes it: no
 * `SET ROLE` anywhere, so a pool can never be talked into becoming another role. Used by the scripts and the test
 * harness; app code gets its pools from client.ts.
 */
export function createDatabase(connectionString: string, options: DatabaseOptions = {}): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: options.max ?? DEFAULT_POOL_SIZE,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  });
  pool.on("error", options.onIdleConnectionError ?? logIdleConnectionError);
  const db = drizzle({ client: pool, schema });

  let closing: Promise<void> | undefined;
  return {
    db,
    close: () => {
      closing ??= pool.end();
      return closing;
    },
  };
}
```

- [ ] **Step 4: Create `server/db/client.ts`**

```typescript
import "server-only";
import { getEnv } from "@/server/env";
import { createDatabase, type DatabaseHandle } from "@/server/db/pool";
import { urlVariable, type RuntimeRoleName } from "@/server/db/roles";

const handles = new Map<RuntimeRoleName, DatabaseHandle>();

/**
 * The pool for one runtime role, opened on first use. Each role has its own pool and its own login, so the database
 * decides what a request may see by who connected, not by anything the app says afterwards.
 *
 * Do not query a tenant role's pool directly: with no scope set it returns nothing, and with a stale one it could
 * return the wrong organisation. Use `withOrgScope` from scope.ts, which sets the scope inside a transaction.
 */
export function getDatabase(role: RuntimeRoleName): DatabaseHandle {
  const existing = handles.get(role);
  if (existing !== undefined) return existing;
  const handle = createDatabase(getEnv()[urlVariable(role, "dev")]);
  handles.set(role, handle);
  return handle;
}

/** Ends every open pool, for a clean shutdown. */
export async function closeDatabases(): Promise<void> {
  const open = [...handles.values()];
  handles.clear();
  await Promise.all(open.map((handle) => handle.close()));
}
```

- [ ] **Step 5: Create `server/db/scope.ts`**

```typescript
import "server-only";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import type { Database } from "@/server/db/pool";
import type { TenantRoleName } from "@/server/db/roles";

/**
 * The transaction passed to the callbacks below. The type alone does not prove a scope was set: a plain
 * `db.transaction()` callback has the same type. Inside `work`, always use `tx`; the outer `db` is another pooled
 * connection with no scope.
 */
export type ScopedTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** What a client or agency request runs as: its organisation, and the signed-in user. */
export interface TenantScope {
  readonly orgId: string;
  readonly userId: string;
}

/** What a Fynix admin request runs as. Fynix sees every organisation, so there is no organisation to scope to. */
export interface FynixScope {
  readonly userId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres would reject a malformed id deep inside a policy; fail early with a clear message instead. Never echoes the value. */
export function assertUuid(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${name} must be a UUID`);
  }
}

/**
 * Runs `work` in one transaction with the scope set for that transaction only (`set_config(..., true)`), so the
 * setting disappears at commit or rollback, including after an error, and cannot leak to the next request that
 * reuses the pooled connection. An empty organisation id means "no organisation": policies compare against NULL.
 */
export async function withScope<T>(
  db: Database,
  scope: { readonly orgId: string | null; readonly userId: string },
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  assertUuid(scope.userId, "userId");
  if (scope.orgId !== null) assertUuid(scope.orgId, "orgId");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${scope.orgId ?? ""}, true), set_config('app.user_id', ${scope.userId}, true)`);
    return work(tx);
  });
}

/**
 * Runs `work` as the client or agency role, scoped to one organisation and user. Both ids are required and must be
 * UUIDs: a request with no organisation must not reach a tenant pool at all.
 */
export async function withOrgScope<T>(role: TenantRoleName, scope: TenantScope, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  if (scope === undefined || scope === null) throw new Error(`A scope is required to use the ${role} pool`);
  assertUuid(scope.orgId, "orgId");
  assertUuid(scope.userId, "userId");
  return withScope(getDatabase(role).db, scope, work);
}

/** Runs `work` as Fynix. Policies allow every row; the user id is for the audit log phase 1C adds. */
export async function withFynixScope<T>(scope: FynixScope, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withScope(getDatabase("leads_fynix").db, { orgId: null, userId: scope.userId }, work);
}
```

- [ ] **Step 6: Run the test and see it pass**

```bash
pnpm exec vitest run server/db/scope
```

Expected: PASS, 15 tests.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
pnpm typecheck
pnpm lint
git add server/db/pool.ts server/db/client.ts server/db/scope.ts server/db/scope.test.ts
git commit -m "Add per-role pools and the transaction-scoped scope helper"
```

---

## Task 7: Typed per-role column lists and the tenant read helpers

**Files:**
- Create: `server/db/columns.ts`, `server/db/tenant-reads.ts`
- Test: `server/db/columns.test.ts`, `server/db/boundaries.test.ts`

The grants in the migrations are the truth. `columns.ts` mirrors them so TypeScript can check every tenant select. Drift between the two is caught by a test in Task 8 (`rls.integration.test.ts`, "columns.ts names exactly the columns the database granted").

- [ ] **Step 1: Write the failing tests**

`server/db/columns.test.ts` asserts that no tenant list ever contains a forbidden column, for each role and table.

```typescript
import { describe, expect, it } from "vitest";
import { TENANT_COLUMNS, columnNames } from "@/server/db/columns";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";

/** Columns a tenant role must never be able to ask for, per table. The same list applies to both roles in phase 1A. */
const FORBIDDEN: Record<"organisation" | "campaign", readonly string[]> = {
  organisation: ["id", "status", "created_at"],
  campaign: ["client_org_id", "client_org_kind", "agency_org_id", "agency_org_kind", "internal_notes", "created_at"],
};

describe.each(TENANT_ROLES)("%s column lists", (role: TenantRoleName) => {
  it.each(["organisation", "campaign"] as const)("never name a forbidden column of %s", (table) => {
    const names = columnNames(TENANT_COLUMNS[role][table]);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => FORBIDDEN[table].includes(name))).toEqual([]);
  });

  it("names no column twice", () => {
    for (const table of ["organisation", "campaign"] as const) {
      const names = columnNames(TENANT_COLUMNS[role][table]);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
```

`server/db/boundaries.test.ts` guards the structure: `lib/` imports nothing from `server/` or a database driver; no source file outside tests and the harness calls `.select()` with no columns; `client.ts` and `scope.ts` import `server-only`; and there is no em or en dash in `server/`, `scripts/` or the migrations.

```typescript
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-level rules that keep the database design from being undone by accident. They read files, not the database.
 */

const ROOT = process.cwd();

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(join(ROOT, directory))) {
    const path = join(directory, name);
    if (statSync(join(ROOT, path)).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path);
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

describe("lib/ stays pure domain code", () => {
  it("imports nothing from server/ and no database driver", () => {
    const offenders = sourceFiles("lib")
      .filter((path) => !isTest(path))
      .filter((path) => /from\s+["'](@\/server\/|drizzle-orm|pg["'/])/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("tenant queries name their columns", () => {
  it("no source file outside tests and the test harness calls .select() with no column list", () => {
    const offenders = ["server", "app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((path) => !isTest(path) && !path.startsWith(join("server", "db", "testing")))
      .filter((path) => /\.select\(\s*\)/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("files that open connections", () => {
  it("client.ts and scope.ts import server-only, so a client component cannot pull them in", () => {
    for (const path of ["server/db/client.ts", "server/db/scope.ts"]) {
      expect(read(path), path).toMatch(/^import "server-only";/m);
    }
  });
});

describe("copy rule", () => {
  it("server/, scripts/ and the migrations contain no em or en dashes", () => {
    const files = [...sourceFiles("server"), ...sourceFiles("scripts"), "drizzle.config.ts"];
    const sql = readdirSync(join(ROOT, "server/db/migrations")).filter((name) => name.endsWith(".sql")).map((name) => join("server/db/migrations", name));
    // The pattern is spelled with escapes so this file does not contain the characters it forbids.
    expect([...files, ...sql].filter((path) => /[\u2013\u2014]/.test(read(path)))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them**

```bash
pnpm exec vitest run server/db/columns server/db/boundaries
```

Expected: `columns.test.ts` FAILS with `Cannot find package '@/server/db/columns'`. `boundaries.test.ts` PASSES at once (4 tests): it guards later edits. Prove it can fail:

```bash
printf 'export const probe = (db: { select: () => unknown }) => db.select();\n' > server/db/zz-probe.ts
pnpm exec vitest run server/db/boundaries
rm server/db/zz-probe.ts
```

Expected for the middle command: FAIL, `expected [ 'server/db/zz-probe.ts' ] to deeply equal []`. After `rm`, it passes again.

- [ ] **Step 3: Create `server/db/columns.ts`**

```typescript
import type { PgColumn } from "drizzle-orm/pg-core";
import { campaign, organisation } from "@/server/db/schema";
import type { TenantRoleName } from "@/server/db/roles";

/**
 * The columns each tenant role may read, one typed list per role and table. A tenant role has no table-level SELECT,
 * so a Drizzle select with no column list fails for it by design; every tenant read passes one of these lists instead.
 *
 * The lists mirror the GRANT statements in the hand-written migrations. Two tests keep them honest:
 * columns.test.ts proves a list never contains a forbidden column, and rls.integration.test.ts proves each list is
 * exactly what the database granted. Changing a grant means changing the list in the same commit.
 */
const tenantOrganisationColumns = {
  publicRef: organisation.publicRef,
  kind: organisation.kind,
  name: organisation.name,
  brandName: organisation.brandName,
} as const;

const tenantCampaignColumns = {
  id: campaign.id,
  publicRef: campaign.publicRef,
  name: campaign.name,
  clientBrandName: campaign.clientBrandName,
  status: campaign.status,
  startDate: campaign.startDate,
  endDate: campaign.endDate,
  monthlyTarget: campaign.monthlyTarget,
  totalTarget: campaign.totalTarget,
} as const;

/** Separate constants per role, so a later phase can give the roles different columns without touching the other. */
export const clientOrganisationColumns = { ...tenantOrganisationColumns } as const;
export const agencyOrganisationColumns = { ...tenantOrganisationColumns } as const;
export const clientCampaignColumns = { ...tenantCampaignColumns } as const;
export const agencyCampaignColumns = { ...tenantCampaignColumns } as const;

export const TENANT_COLUMNS = {
  leads_client: { organisation: clientOrganisationColumns, campaign: clientCampaignColumns },
  leads_agency: { organisation: agencyOrganisationColumns, campaign: agencyCampaignColumns },
} as const satisfies Record<TenantRoleName, { organisation: Record<string, PgColumn>; campaign: Record<string, PgColumn> }>;

/** The database column names in a list, for comparing with the catalog. */
export function columnNames(columns: Readonly<Record<string, PgColumn>>): string[] {
  return Object.values(columns).map((column) => column.name);
}
```

- [ ] **Step 4: Create `server/db/tenant-reads.ts`**

```typescript
import { TENANT_COLUMNS } from "@/server/db/columns";
import type { TenantRoleName } from "@/server/db/roles";
import { campaign, organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";

/**
 * The only way tenant code starts a read of these tables. Each helper passes the role's column list, so a tenant query
 * never says `select()` with no columns, which the database refuses. They return the Drizzle query, so a caller can
 * still add `.where(...)`, `.orderBy(...)` and `.limit(...)` on columns the role may read.
 */
export function selectOrganisations(tx: ScopedTransaction, role: TenantRoleName) {
  return tx.select(TENANT_COLUMNS[role].organisation).from(organisation);
}

export function selectCampaigns(tx: ScopedTransaction, role: TenantRoleName) {
  return tx.select(TENANT_COLUMNS[role].campaign).from(campaign);
}
```

- [ ] **Step 5: Run the tests and see them pass**

```bash
pnpm exec vitest run server/db/columns server/db/boundaries
```

Expected: PASS, 2 files. `columns.test.ts` runs 6 tests (2 roles times 3).

- [ ] **Step 6: Typecheck, lint and commit**

```bash
pnpm typecheck
pnpm lint
git add server/db/columns.ts server/db/columns.test.ts server/db/tenant-reads.ts server/db/boundaries.test.ts
git commit -m "Add typed per-role column lists, tenant read helpers and boundary tests"
```

---

## Task 8: The integration test harness, structural tests and the leak matrix

**Files:**
- Create: `server/db/testing/index.ts`, `server/db/testing/seed.ts`, `server/db/testing/structure.ts`, `server/db/testing/leak-matrix.ts`
- Test: `server/db/testing/index.test.ts`, `server/db/structure.integration.test.ts`, `server/db/rls.integration.test.ts`, `server/db/leak-matrix.integration.test.ts`

What this task builds:

- The harness refuses any database whose name does not end in `_test`, opens the owner (for seeding and catalog reads, never for assertions about what a role sees) and one pool per runtime role, truncates every public table between tests (so tables added later are included) and seeds a world of two clients, two agencies and four campaigns covering every pairing.
- Structural checks as functions over the catalogs, so they apply to every table, view, function and role that exists now or is added later. Each has a self-test against a deliberately broken object.
- The leak matrix: a registry of read paths (`READ_PATHS`) and denied statements (`PROBES`), run as both tenant roles for both organisations of each kind. What each viewer must not find is computed from the seed, and the search covers results and error messages.
- Behaviour tests for the two tables: Fynix rights, the brand copy triggers, integrity constraints, the scope functions, and that `columns.ts` equals the grants.

- [ ] **Step 1: Write the failing unit test for the harness guards**

```typescript
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
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm exec vitest run server/db/testing
```

Expected: FAIL, `Cannot find package '@/server/db/testing'`.

- [ ] **Step 3: Create `server/db/testing/index.ts`**

`testDatabaseName` and `resetDatabase` are the two places that refuse a non-test database. `queryAs` runs test SQL in a transaction either way, so a statement that unexpectedly succeeds (for example `SET ROLE`) cannot outlive the test.

```typescript
import { sql } from "drizzle-orm";
import { createDatabase, type Database, type DatabaseHandle } from "@/server/db/pool";
import { ROLE_NAMES, type RoleName, type RuntimeRoleName, RUNTIME_ROLES, urlVariable } from "@/server/db/roles";
import { withScope, type ScopedTransaction } from "@/server/db/scope";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";

export interface TestDatabases {
  /** Connects as `leads_owner`: bypasses row-level security, so it seeds and inspects. Tests never read data through it. */
  readonly owner: DatabaseHandle;
  /** One handle per runtime role, each logged in as that role on the test database. */
  readonly roles: Readonly<Record<RuntimeRoleName, DatabaseHandle>>;
  readonly closeAll: () => Promise<void>;
}

/**
 * Truncation is destructive, so refuse any URL that could reach something other than a database whose name ends in
 * `_test`. Returns the database name.
 */
export function testDatabaseName(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("A test database URL is not a valid URL (value hidden because it contains a password).");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Refusing a test database URL that is not postgres:// or postgresql://.");
  }
  if (url.searchParams.has("host")) {
    throw new Error("Refusing a test database URL with a host query parameter: it can redirect the connection.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database.endsWith("_test")) {
    throw new Error(`Refusing to use "${database}" for tests: the database name must end with "_test".`);
  }
  return database;
}

/** Opens the owner and the five runtime roles on the test database, after checking that every URL names the same `_test` database. */
export function openTestDatabases(): TestDatabases {
  loadEnvLocal();
  const env = getToolingEnv();
  const urls = Object.fromEntries(ROLE_NAMES.map((role) => [role, env[urlVariable(role, "test")]])) as Record<RoleName, string>;

  const names = new Set(ROLE_NAMES.map((role) => testDatabaseName(urls[role])));
  if (names.size !== 1) {
    throw new Error(`Every test database URL must name the same database, found: ${[...names].join(", ")}`);
  }

  const owner = createDatabase(urls.leads_owner, { max: 2 });
  const roles = Object.fromEntries(RUNTIME_ROLES.map((role) => [role, createDatabase(urls[role], { max: 3 })])) as Record<RuntimeRoleName, DatabaseHandle>;
  return {
    owner,
    roles,
    closeAll: async () => {
      await Promise.all([owner.close(), ...Object.values(roles).map((handle) => handle.close())]);
    },
  };
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Empties every table in the public schema of a `_test` database. Tables added by later migrations are included. */
export async function resetDatabase(owner: DatabaseHandle): Promise<void> {
  const current = await owner.db.execute<{ name: string }>(sql`select current_database() as name`);
  const name = current.rows[0]?.name ?? "";
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to truncate "${name}": it is not a _test database.`);
  }
  const tables = await owner.db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' order by tablename`);
  if (tables.rows.length === 0) return;
  const list = tables.rows.map((row) => `public.${quoteIdentifier(row.tablename)}`).join(", ");
  await owner.db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
}

const MAX_CAUSE_DEPTH = 10;

/** Drizzle wraps driver errors; this joins the cause chain so a test can match the Postgres message. */
export function describeError(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return String(error);
  if (error.cause === undefined || depth >= MAX_CAUSE_DEPTH) return error.message;
  return `${error.message}\n${describeError(error.cause, depth + 1)}`;
}

/** The full error text of an operation that must fail. Fails the test if it succeeds. */
export async function captureErrorText(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    return describeError(error);
  }
  throw new Error("Expected the operation to fail, but it succeeded.");
}

/** The rows of a statement run as one role. `scope` null means no scope is set, which is how an unscoped request looks. */
export async function queryAs(db: Database, scope: { readonly orgId: string | null; readonly userId: string } | null, statement: string): Promise<Record<string, unknown>[]> {
  const run = async (tx: ScopedTransaction): Promise<Record<string, unknown>[]> => (await tx.execute(sql.raw(statement))).rows;
  // A transaction either way, so a statement that unexpectedly succeeds (SET ROLE, for one) cannot outlive the test.
  return scope === null ? db.transaction(run) : withScope(db, scope, run);
}
```

- [ ] **Step 4: Run the unit test and see it pass**

```bash
pnpm exec vitest run server/db/testing
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Create `server/db/testing/seed.ts`**

Every value is distinct and findable as plain text, which is what the leak matrix searches for. Campaign names and internal notes deliberately contain no organisation name, so an allowed value is never a substring of a forbidden one. This file is also used by `pnpm db:seed` (Task 10).

```typescript
import type { DatabaseHandle } from "@/server/db/pool";
import { campaign, organisation } from "@/server/db/schema";

export interface SeededOrganisation {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly brandName: string | null;
}

export interface SeededCampaign {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly internalNotes: string;
  readonly client: SeededOrganisation;
  readonly agency: SeededOrganisation;
}

/**
 * Two client organisations, two agencies and a campaign for every pairing, so each tenant has rows that are its own
 * and rows that belong to someone else. Every value is distinct and findable as plain text, which is what the leak
 * matrix searches responses for.
 */
export interface SeedWorld {
  readonly fynix: SeededOrganisation;
  readonly kestrel: SeededOrganisation;
  readonly halden: SeededOrganisation;
  readonly brightpath: SeededOrganisation;
  readonly northgate: SeededOrganisation;
  readonly campaigns: readonly SeededCampaign[];
  /** Same objects as `kestrel` and `halden`, in order. */
  readonly clients: readonly SeededOrganisation[];
  /** Same objects as `brightpath` and `northgate`, in order. */
  readonly agencies: readonly SeededOrganisation[];
}

function firstRow<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Seeding ${what} returned no row`);
  return row;
}

/** Writes through the owner connection, which bypasses row-level security. Test and dev databases only. */
export async function seedWorld(owner: DatabaseHandle): Promise<SeedWorld> {
  const { db } = owner;
  const insertOrganisation = async (publicRef: string, kind: "fynix" | "client" | "agency", name: string, brandName: string | null): Promise<SeededOrganisation> => {
    const row = firstRow(
      await db.insert(organisation).values({ publicRef, kind, name, brandName }).returning({ id: organisation.id }),
      `organisation ${publicRef}`,
    );
    return { id: row.id, publicRef, name, brandName };
  };

  const fynix = await insertOrganisation("ORG-7F2A", "fynix", "Fynix Digital Operations", null);
  const kestrel = await insertOrganisation("ORG-4K9P", "client", "Kestrel Logistics Ltd", "Kestrel");
  const halden = await insertOrganisation("ORG-8H3D", "client", "Halden Foods Ltd", "Halden");
  const brightpath = await insertOrganisation("ORG-2B6R", "agency", "Brightpath Media Pvt Ltd", null);
  const northgate = await insertOrganisation("ORG-9N5T", "agency", "Northgate Leads Ltd", null);

  const insertCampaign = async (
    publicRef: string,
    name: string,
    internalNotes: string,
    client: SeededOrganisation,
    agency: SeededOrganisation,
  ): Promise<SeededCampaign> => {
    const row = firstRow(
      await db
        .insert(campaign)
        .values({
          publicRef,
          name,
          internalNotes,
          clientOrgId: client.id,
          agencyOrgId: agency.id,
          startDate: "2026-12-01",
          endDate: "2027-05-31",
          monthlyTarget: 20,
          totalTarget: 120,
        })
        .returning({ id: campaign.id }),
      `campaign ${publicRef}`,
    );
    return { id: row.id, publicRef, name, internalNotes, client, agency };
  };

  const campaigns = [
    await insertCampaign("CMP-7Q2X", "UK freight decision makers", "INTERNAL-NOTE margin on this one is thin", kestrel, brightpath),
    await insertCampaign("CMP-4M6R", "Retail grocery buyers", "INTERNAL-NOTE halden pays late", halden, brightpath),
    await insertCampaign("CMP-8T3W", "Nordic warehouse managers", "INTERNAL-NOTE northgate is on probation", kestrel, northgate),
    await insertCampaign("CMP-2V5Z", "Frozen food distributors", "INTERNAL-NOTE renewal in March", halden, northgate),
  ] as const;

  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate] };
}
```

- [ ] **Step 6: Create `server/db/testing/structure.ts`**

Each exported function returns the offenders it found; an empty list means the rule holds. The rules: row-level security on every table; every view `security_invoker` and no materialized views; no table-level privilege for a tenant role; nothing granted to PUBLIC (tables, columns, functions); every role with a grant has a policy; role attributes, no stray `leads_` roles and no membership; no runtime role may create objects or temporary tables; `SECURITY DEFINER` functions pin `search_path`; the scope functions stay inlinable. Postgres keeps the spelling given in `WITH (security_invoker = on)`, so the view check accepts `on`, `true`, `1`, `yes` and `t`.

```typescript
import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { RUNTIME_ROLES, ROLE_NAMES, TENANT_ROLES, type RoleName } from "@/server/db/roles";

/**
 * The structural checks. Each returns the offenders it found, so an empty list means the rule holds. They read the
 * system catalogs, so they cover every table, view, function and role in the public schema, including ones later
 * phases add, without anyone listing them. server/db/structure.integration.test.ts runs each one on the real
 * database and again on a deliberately broken one, to prove the check can fail.
 */

/** Anything that can run a statement: the owner database, or a transaction on it. */
export interface Executor {
  execute: Database["execute"];
}

const quoted = (names: readonly string[]): string => names.map((name) => `'${name}'`).join(", ");
const ALL_ROLES = quoted(ROLE_NAMES);
const RUNTIME = quoted(RUNTIME_ROLES);
const TENANTS = quoted(TENANT_ROLES);
const RELATION_KINDS = "('r', 'p', 'v', 'm', 'S')";

async function offenders(executor: Executor, query: SQL): Promise<string[]> {
  const result = await executor.execute<{ offender: string }>(query);
  return result.rows.map((row) => row.offender);
}

/** Tables with row-level security switched off. */
export function tablesWithoutRowLevelSecurity(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`,
  );
}

/**
 * Views that run with their owner's rights (the default) bypass row-level security, and a materialized view cannot be
 * made to do otherwise, so any of either is an offender. A view must say `WITH (security_invoker = true)`; Postgres
 * keeps the spelling it was given, so `on`, `true` and `1` all count.
 */
export function viewsThatBypassRowLevelSecurity(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and (c.relkind = 'm'
            or (c.relkind = 'v' and not exists (
                 select 1 from pg_options_to_table(c.reloptions) o
                 where o.option_name = 'security_invoker' and lower(o.option_value) in ('true', 'on', '1', 'yes', 't'))))
        order by 1`,
  );
}

/** "role.relation" for every table-level privilege a tenant role holds. Tenant roles may only hold column grants. */
export function tenantTableLevelGrants(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select r.rolname || '.' || c.relname as offender
      from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join pg_roles r
      where n.nspname = 'public' and c.relkind in ${RELATION_KINDS} and r.rolname in (${TENANTS})
        and (has_table_privilege(r.oid, c.oid, 'SELECT') or has_table_privilege(r.oid, c.oid, 'INSERT')
          or has_table_privilege(r.oid, c.oid, 'UPDATE') or has_table_privilege(r.oid, c.oid, 'DELETE')
          or has_table_privilege(r.oid, c.oid, 'TRUNCATE') or has_table_privilege(r.oid, c.oid, 'REFERENCES')
          or has_table_privilege(r.oid, c.oid, 'TRIGGER'))
      order by 1`),
  );
}

/** Anything granted to PUBLIC, which is every role: relations, columns and functions. Nothing may be. */
export function grantsToPublic(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(c.relacl) a
        where n.nspname = 'public' and c.relkind in ${RELATION_KINDS} and a.grantee = 0
      union all
      select c.relname || '.' || att.attname from pg_attribute att join pg_class c on c.oid = att.attrelid
        join pg_namespace n on n.oid = c.relnamespace cross join lateral aclexplode(att.attacl) a
        where n.nspname = 'public' and a.grantee = 0
      union all
      select p.proname || '()' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
      order by 1`),
  );
}

/** "role.table" for each role that can read or write a table but has no policy that applies to it. */
export function grantsWithoutPolicy(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select r.rolname || '.' || c.relname as offender
      from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join pg_roles r
      where n.nspname = 'public' and c.relkind in ('r', 'p') and r.rolname in (${RUNTIME})
        and (has_any_column_privilege(r.oid, c.oid, 'SELECT') or has_any_column_privilege(r.oid, c.oid, 'INSERT')
          or has_any_column_privilege(r.oid, c.oid, 'UPDATE') or has_table_privilege(r.oid, c.oid, 'DELETE'))
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid and (p.polroles = '{0}' or r.oid = any (p.polroles)))
      order by 1`),
  );
}

/** Role attribute problems, a missing role or a role that is not one of the six but is named like one. */
export function roleProblems(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select rolname::text || ' has a forbidden attribute' as offender from pg_roles
        where rolname in (${ALL_ROLES}) and (rolsuper or rolcreatedb or rolcreaterole or rolbypassrls or rolreplication or not rolcanlogin)
      union all
      select 'missing role ' || n from unnest(array[${ALL_ROLES}]) n where not exists (select 1 from pg_roles where rolname = n)
      union all
      select rolname::text || ' is not one of the six roles' from pg_roles where rolname like 'leads\\_%' and rolname not in (${ALL_ROLES})
      order by 1`),
  );
}

/** Role memberships that involve any of the six roles. There must be none: a member can `SET ROLE` to its group. */
export function roleMemberships(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select m.roleid::regrole::text || ' has member ' || m.member::regrole::text as offender from pg_auth_members m
        where m.roleid::regrole::text in (${ALL_ROLES}) or m.member::regrole::text in (${ALL_ROLES}) order by 1`),
  );
}

/** Runtime roles that may create objects or temporary tables. They may not: only the owner changes the schema. */
export function creationPrivileges(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql.raw(`select r.rolname || ' can ' || p.privilege as offender
      from pg_roles r cross join (values ('create in schema public'), ('create temporary tables'), ('create in the database')) p(privilege)
      where r.rolname in (${RUNTIME})
        and ((p.privilege = 'create in schema public' and has_schema_privilege(r.oid, 'public', 'CREATE'))
          or (p.privilege = 'create temporary tables' and has_database_privilege(r.oid, current_database(), 'TEMPORARY'))
          or (p.privilege = 'create in the database' and has_database_privilege(r.oid, current_database(), 'CREATE')))
      order by 1`),
  );
}

/** SECURITY DEFINER functions without a pinned search_path that starts with pg_catalog. */
export function definerFunctionsWithoutSearchPath(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select p.proname::text as offender from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=pg_catalog%')
        order by 1`,
  );
}

/** The scope functions must stay plain, STABLE, SQL and without a SET clause, or the planner stops inlining them into policies. */
export function scopeFunctionProblems(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select n::text as offender from unnest(array['app_current_org_id', 'app_current_user_id']) n
        where not exists (
          select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace join pg_language l on l.oid = p.prolang
          where s.nspname = 'public' and p.proname = n and l.lanname = 'sql' and p.provolatile = 's'
            and p.proconfig is null and not p.prosecdef)
        order by 1`,
  );
}

/** Every table in the public schema, so a test can loop over tables nobody has listed by hand. */
export async function publicTables(executor: Executor): Promise<string[]> {
  return offenders(
    executor,
    sql`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
  );
}

/** The columns of a public table that a role may SELECT. Empty when the role holds no column grant on it. */
export async function grantedColumns(executor: Executor, role: RoleName, table: string): Promise<string[]> {
  return offenders(
    executor,
    sql`select a.attname::text as offender from pg_attribute a
        where a.attrelid = to_regclass(format('public.%I', ${table}::text)) and a.attnum > 0 and not a.attisdropped
          and has_column_privilege(${role}::text, a.attrelid, a.attnum, 'SELECT')
        order by a.attnum`,
  );
}

/** Quotes a catalog identifier for use in test SQL. */
export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
```

- [ ] **Step 7: Create `server/db/testing/leak-matrix.ts`**

To cover a new table or screen in a later phase, append to `READ_PATHS` (queries that should succeed, with `mustContain` so an empty result cannot pass) or to `PROBES` (statements that must be denied). The test file needs no change.

```typescript
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { TenantRoleName } from "@/server/db/roles";
import { campaign } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { selectCampaigns, selectOrganisations } from "@/server/db/tenant-reads";
import type { SeedWorld, SeededOrganisation } from "@/server/db/testing/seed";

/**
 * The leak matrix: every read path, run as every tenant role for every organisation of that kind, with the response
 * (or the error message) searched for anything the viewer must not see.
 *
 * To cover a new table or screen, append to READ_PATHS (queries that should succeed) or PROBES (statements that must
 * be denied) below. The test file runs the whole matrix, so a new entry is checked for both roles and both
 * organisations of each kind without any new test code.
 */

/** Who is looking: a tenant role and one seeded organisation of that kind. */
export interface Viewer {
  readonly role: TenantRoleName;
  readonly organisation: SeededOrganisation;
}

export interface ReadPath {
  readonly name: string;
  readonly run: (tx: ScopedTransaction, viewer: Viewer, world: SeedWorld) => Promise<unknown>;
  /** Strings that must appear in the result, so a path that returns nothing at all cannot pass as "no leaks". */
  readonly mustContain: (viewer: Viewer, world: SeedWorld) => readonly string[];
}

export interface Probe {
  readonly name: string;
  /** Test-only SQL, never built from input. */
  readonly statement: string;
  /** What the error must say. Always a plain permission error, never a description of data. */
  readonly expectedError: RegExp;
}

/** The campaigns this viewer is allowed to know about. */
export function ownCampaigns(viewer: Viewer, world: SeedWorld): SeedWorld["campaigns"][number][] {
  return world.campaigns.filter((row) => (viewer.role === "leads_client" ? row.client : row.agency).id === viewer.organisation.id);
}

export const READ_PATHS: readonly ReadPath[] = [
  {
    name: "organisations, typed column list",
    run: (tx, viewer) => selectOrganisations(tx, viewer.role),
    mustContain: (viewer) => [viewer.organisation.publicRef, viewer.organisation.name],
  },
  {
    name: "campaigns, typed column list",
    run: (tx, viewer) => selectCampaigns(tx, viewer.role),
    mustContain: (viewer, world) => ownCampaigns(viewer, world).flatMap((row) => [row.publicRef, row.name]),
  },
  {
    name: "campaigns, filtered and ordered on granted columns",
    run: (tx, viewer) =>
      selectCampaigns(tx, viewer.role)
        .where(and(isNotNull(campaign.publicRef), eq(campaign.status, "draft")))
        .orderBy(asc(campaign.name)),
    mustContain: (viewer, world) => ownCampaigns(viewer, world).map((row) => row.publicRef),
  },
  {
    // Asks for every campaign in the world by reference, including the ones the viewer must not see.
    name: "campaign by reference, for every reference in the world",
    run: async (tx, viewer, world) => {
      const found = [];
      for (const row of world.campaigns) found.push(await selectCampaigns(tx, viewer.role).where(eq(campaign.publicRef, row.publicRef)));
      return found;
    },
    mustContain: (viewer, world) => ownCampaigns(viewer, world).map((row) => row.publicRef),
  },
];

const DENIED_TABLE = /permission denied for table (campaign|organisation)$/m;

export const PROBES: readonly Probe[] = [
  { name: "select * from campaign", statement: "select * from campaign", expectedError: DENIED_TABLE },
  { name: "select * from organisation", statement: "select * from organisation", expectedError: DENIED_TABLE },
  { name: "client organisation id", statement: "select client_org_id from campaign", expectedError: DENIED_TABLE },
  { name: "agency organisation id", statement: "select agency_org_id from campaign", expectedError: DENIED_TABLE },
  { name: "internal notes", statement: "select internal_notes from campaign", expectedError: DENIED_TABLE },
  { name: "organisation id", statement: "select id from organisation", expectedError: DENIED_TABLE },
  { name: "probe by WHERE on a hidden column", statement: "select id from campaign where agency_org_id is not null", expectedError: DENIED_TABLE },
  { name: "probe by ORDER BY on a hidden column", statement: "select id from campaign order by client_org_id", expectedError: DENIED_TABLE },
  { name: "probe by GROUP BY on a hidden column", statement: "select count(*) from campaign group by internal_notes", expectedError: DENIED_TABLE },
  {
    name: "join through the hidden organisation ids",
    statement: "select c.id from campaign c join organisation o on o.id = c.client_org_id",
    expectedError: DENIED_TABLE,
  },
  { name: "write: insert", statement: "insert into campaign (public_ref, name) values ('CMP-0000', 'x')", expectedError: DENIED_TABLE },
  { name: "write: update", statement: "update campaign set name = 'x'", expectedError: DENIED_TABLE },
  { name: "write: delete", statement: "delete from campaign", expectedError: DENIED_TABLE },
  { name: "write: truncate", statement: "truncate campaign", expectedError: DENIED_TABLE },
  { name: "migration bookkeeping", statement: "select * from drizzle.__drizzle_migrations", expectedError: /permission denied for schema drizzle/ },
  { name: "role password hashes", statement: "select rolpassword from pg_authid", expectedError: /permission denied for table pg_authid/ },
  { name: "create a table", statement: "create table leak (x int)", expectedError: /permission denied for schema public/ },
  { name: "create a temporary table", statement: "create temp table leak (x int)", expectedError: /permission denied to create temporary tables/ },
];

/**
 * Every string in the world a viewer must not find, whether in a result or in an error message:
 * - every organisation id, the viewer's own included, because tenants never read an organisation id column;
 * - the reference and name of every other organisation, and the brand of every other client, except that an agency
 *   may know the brand of the clients of its own campaigns (never their legal names);
 * - every campaign's internal notes, and the id, reference and name of every campaign that is not the viewer's.
 */
export function forbiddenTokens(viewer: Viewer, world: SeedWorld): string[] {
  const own = ownCampaigns(viewer, world);
  const brandVisibleFor = new Set(viewer.role === "leads_agency" ? own.map((row) => row.client.id) : []);
  const tokens: string[] = [];
  for (const org of [world.fynix, ...world.clients, ...world.agencies]) {
    tokens.push(org.id);
    if (org.id === viewer.organisation.id) continue;
    tokens.push(org.publicRef, org.name);
    if (org.brandName !== null && !brandVisibleFor.has(org.id)) tokens.push(org.brandName);
  }
  for (const row of world.campaigns) {
    tokens.push(row.internalNotes);
    if (!own.includes(row)) tokens.push(row.id, row.publicRef, row.name);
  }
  return [...new Set(tokens)];
}

/** The forbidden tokens that appear in `text`. */
export function findLeaks(text: string, forbidden: readonly string[]): string[] {
  return forbidden.filter((token) => text.includes(token));
}
```

- [ ] **Step 8: Write the structural test file**

The first block runs every check on the migrated database. The second runs every check against a broken object created and rolled back inside a transaction: role checks use a superuser connection (`DATABASE_URL_ADMIN`) for a rolled-back `ALTER ROLE`, `CREATE ROLE` or `GRANT`, because the owner may not change roles. Nothing is committed. The third and fourth blocks run as the real roles: `select *` and an untyped Drizzle select fail, `count(*)` counts only own rows, `pg_stats` shows nothing (statistics could otherwise reveal most-common values of hidden columns), policies work although the role cannot read the column they compare, no scope means no rows from every table it can read, a table with no grant is unreadable, no role can `SET ROLE` or `SET SESSION AUTHORIZATION` to any other, a failed transaction clears the scope on a single-connection pool, and denied writes say `permission denied` without echoing row data.

```typescript
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "@/server/db/pool";
import { ROLE_NAMES, RUNTIME_ROLES, TENANT_ROLES, urlVariable, type RoleName, type RuntimeRoleName, type TenantRoleName } from "@/server/db/roles";
import { campaign } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { getToolingEnv } from "@/server/env";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { findLeaks } from "@/server/db/testing/leak-matrix";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";
import {
  creationPrivileges,
  definerFunctionsWithoutSearchPath,
  grantsToPublic,
  grantedColumns,
  grantsWithoutPolicy,
  publicTables,
  quoteIdentifier,
  roleMemberships,
  roleProblems,
  scopeFunctionProblems,
  tablesWithoutRowLevelSecurity,
  tenantTableLevelGrants,
  viewsThatBypassRowLevelSecurity,
  type Executor,
} from "@/server/db/testing/structure";

/**
 * Structural tests. Every check reads the catalogs, so it covers each table, view, function and role that exists,
 * including ones later phases add. A check that finds nothing might be broken, so each also runs against a
 * deliberately broken object (created and rolled back inside a transaction) and must find it.
 */

let dbs: TestDatabases;
let admin: DatabaseHandle;
let world: SeedWorld;
const USER = "33333333-3333-4333-8333-333333333333";

beforeAll(() => {
  dbs = openTestDatabases();
  admin = createDatabase(getToolingEnv().DATABASE_URL_ADMIN, { max: 1 });
});
afterAll(async () => {
  await Promise.all([dbs?.closeAll(), admin?.close()]);
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});

class Rollback extends Error {}

/** Runs `setup` and then `check` in one transaction that is always rolled back, so nothing is left behind. */
async function findInBrokenState(handle: DatabaseHandle, setup: readonly string[], check: (executor: Executor) => Promise<string[]>): Promise<string[]> {
  let found: string[] = [];
  try {
    await handle.db.transaction(async (tx) => {
      for (const statement of setup) await tx.execute(sql.raw(statement));
      found = await check(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return found;
}

describe("catalog checks hold on the migrated database", () => {
  it("row-level security is enabled on every table", async () => {
    expect(await tablesWithoutRowLevelSecurity(dbs.owner.db)).toEqual([]);
  });

  it("every view is security_invoker, and there are no materialized views", async () => {
    expect(await viewsThatBypassRowLevelSecurity(dbs.owner.db)).toEqual([]);
  });

  it("tenant roles hold no table-level privilege, only column grants", async () => {
    expect(await tenantTableLevelGrants(dbs.owner.db)).toEqual([]);
  });

  it("nothing is granted to PUBLIC: no relation, no column, no function", async () => {
    expect(await grantsToPublic(dbs.owner.db)).toEqual([]);
  });

  it("every role that holds a grant on a table has a policy for it", async () => {
    expect(await grantsWithoutPolicy(dbs.owner.db)).toEqual([]);
  });

  it("the six roles exist, can log in and are NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION", async () => {
    expect(await roleProblems(dbs.owner.db)).toEqual([]);
  });

  it("no role is a member of another, so none can SET ROLE through membership", async () => {
    expect(await roleMemberships(dbs.owner.db)).toEqual([]);
  });

  it("no runtime role can create objects or temporary tables", async () => {
    expect(await creationPrivileges(dbs.owner.db)).toEqual([]);
  });

  it("SECURITY DEFINER functions pin their search_path", async () => {
    expect(await definerFunctionsWithoutSearchPath(dbs.owner.db)).toEqual([]);
  });

  it("the scope functions stay inlinable", async () => {
    expect(await scopeFunctionProblems(dbs.owner.db)).toEqual([]);
  });
});

describe("each catalog check finds a deliberately broken object", () => {
  it("row-level security off", async () => {
    const found = await findInBrokenState(dbs.owner, ["create table public.broken_no_rls (id int)"], tablesWithoutRowLevelSecurity);
    expect(found).toEqual(["broken_no_rls"]);
  });

  it("a view without security_invoker, and a materialized view; but not security_invoker spelled on", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create view public.broken_view as select 1 as x",
        "create materialized view public.broken_matview as select 1 as x",
        "create view public.fine_view_on with (security_invoker = on) as select 1 as x",
        "create view public.fine_view_true with (security_invoker = true) as select 1 as x",
      ],
      viewsThatBypassRowLevelSecurity,
    );
    expect(found).toEqual(["broken_matview", "broken_view"]);
  });

  it("a table-level grant to a tenant role, but not a column grant", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_grants (id int, secret int)",
        "grant select on public.broken_grants to leads_client",
        "grant insert on public.broken_grants to leads_agency",
        "create table public.fine_grants (id int, secret int)",
        "grant select (id) on public.fine_grants to leads_client",
      ],
      tenantTableLevelGrants,
    );
    expect(found).toEqual(["leads_agency.broken_grants", "leads_client.broken_grants"]);
  });

  it("a grant to PUBLIC on a table, a column and a function", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_public_table (id int)",
        "grant select on public.broken_public_table to public",
        "create table public.broken_public_column (id int)",
        "grant select (id) on public.broken_public_column to public",
        "create function public.broken_public_fn() returns int language sql as 'select 1'",
        "grant execute on function public.broken_public_fn() to public",
      ],
      grantsToPublic,
    );
    expect(found).toEqual(["broken_public_column.id", "broken_public_fn()", "broken_public_table"]);
  });

  it("a grant with no policy", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_no_policy (id int)",
        "alter table public.broken_no_policy enable row level security",
        "grant select (id) on public.broken_no_policy to leads_client",
      ],
      grantsWithoutPolicy,
    );
    expect(found).toEqual(["leads_client.broken_no_policy"]);
  });

  it("a role with CREATEDB, a stray leads_ role, and a membership (as superuser, rolled back)", async () => {
    const attributes = await findInBrokenState(admin, ["alter role leads_public createdb", "create role leads_stray"], roleProblems);
    expect(attributes).toEqual(["leads_public has a forbidden attribute", "leads_stray is not one of the six roles"]);
    const memberships = await findInBrokenState(admin, ["grant leads_client to leads_agency"], roleMemberships);
    expect(memberships).toEqual(["leads_client has member leads_agency"]);
  });

  it("CREATE on the schema and TEMPORARY on the database", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "grant create on schema public to leads_client",
        "do $$ begin execute format('grant temporary on database %I to leads_agency', current_database()); end $$",
      ],
      creationPrivileges,
    );
    expect(found).toEqual(["leads_agency can create temporary tables", "leads_client can create in schema public"]);
  });

  it("a SECURITY DEFINER function without a pinned search_path, but not one with it", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create function public.broken_definer() returns int language sql security definer as 'select 1'",
        "create function public.fine_definer() returns int language sql security definer set search_path = pg_catalog, public as 'select 1'",
      ],
      definerFunctionsWithoutSearchPath,
    );
    expect(found).toEqual(["broken_definer"]);
  });

  it("a scope function that gains a SET clause and so stops being inlinable", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      ["create or replace function public.app_current_org_id() returns uuid language sql stable set search_path = pg_catalog as $$ select null::uuid $$"],
      scopeFunctionProblems,
    );
    expect(found).toEqual(["app_current_org_id"]);
  });
});

describe("tenant roles", () => {
  const scoped = (role: TenantRoleName) => ({ db: dbs.roles[role].db, scope: { orgId: role === "leads_client" ? world.kestrel.id : world.brightpath.id, userId: USER } });

  it.each(TENANT_ROLES)("%s: `select *` fails on every table it holds a column grant on, whichever tables exist", async (role) => {
    const { db, scope } = scoped(role);
    const withGrants: string[] = [];
    for (const table of await publicTables(dbs.owner.db)) {
      if ((await grantedColumns(dbs.owner.db, role, table)).length === 0) continue;
      withGrants.push(table);
      const message = await captureErrorText(queryAs(db, scope, `select * from ${quoteIdentifier(table)}`));
      expect(message).toContain(`permission denied for table ${table}`);
    }
    expect(withGrants).toEqual(["campaign", "organisation"]);
  });

  it.each(TENANT_ROLES)("%s: a Drizzle select with no column list fails the same way", async (role) => {
    const { db, scope } = scoped(role);
    const message = await captureErrorText(withScope(db, scope, (tx) => tx.select().from(campaign)));
    expect(message).toContain("permission denied for table campaign");
  });

  it.each(TENANT_ROLES)("%s: count(*) works and counts only its own rows", async (role) => {
    const { db, scope } = scoped(role);
    const rows = await queryAs(db, scope, "select count(*)::int as n from campaign");
    expect(rows).toEqual([{ n: 2 }]);
  });

  it.each(TENANT_ROLES)("%s: statistics views show nothing, so most-common-values cannot reveal hidden columns", async (role) => {
    await dbs.owner.db.execute(sql`analyze public.campaign`);
    await dbs.owner.db.execute(sql`analyze public.organisation`);
    const { db, scope } = scoped(role);
    expect(await queryAs(db, scope, "select * from pg_stats where schemaname = 'public'")).toEqual([]);
  });

  it.each(TENANT_ROLES)("%s: policies work although the role cannot read the column they compare", async (role) => {
    const hiddenColumn = role === "leads_client" ? "client_org_id" : "agency_org_id";
    const granted = await dbs.owner.db.execute<{ allowed: boolean }>(
      sql.raw(`select has_column_privilege('${role}', 'public.campaign', '${hiddenColumn}', 'SELECT') as allowed`),
    );
    expect(granted.rows).toEqual([{ allowed: false }]);
    const { db, scope } = scoped(role);
    expect(await queryAs(db, scope, "select public_ref from campaign order by public_ref")).toHaveLength(2);
  });
});

describe("every role", () => {
  const unscoped = (role: RuntimeRoleName) => dbs.roles[role].db;

  it.each(TENANT_ROLES)("%s: no scope set returns zero rows from every table it can read, although they hold rows", async (role) => {
    let seededRows = 0;
    for (const table of await publicTables(dbs.owner.db)) {
      const columns = await grantedColumns(dbs.owner.db, role, table);
      if (columns.length === 0) continue;
      const name = quoteIdentifier(table);
      const seeded = await dbs.owner.db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${name}`));
      seededRows += seeded.rows[0]?.n ?? 0;
      expect(await queryAs(unscoped(role), null, `select ${columns.map(quoteIdentifier).join(", ")} from ${name}`), table).toEqual([]);
    }
    expect(seededRows).toBeGreaterThan(0);
  });

  it.each(RUNTIME_ROLES)("%s: every table it holds no grant on is unreadable", async (role) => {
    let checked = 0;
    for (const table of await publicTables(dbs.owner.db)) {
      if ((await grantedColumns(dbs.owner.db, role, table)).length > 0) continue;
      // leads_fynix holds table-level grants, which grantedColumns also reports, so it never reaches here.
      checked += 1;
      const message = await captureErrorText(queryAs(unscoped(role), null, `select * from ${quoteIdentifier(table)}`));
      expect(message).toContain(`permission denied for table ${table}`);
    }
    // Only leads_auth and leads_public hold nothing on today's two tables; the other roles have a grant on both.
    expect(checked).toBe(role === "leads_auth" || role === "leads_public" ? 2 : 0);
  });

  const pairs = RUNTIME_ROLES.flatMap((from) => ROLE_NAMES.filter((to) => to !== from).map((to) => [from, to] as [RuntimeRoleName, RoleName]));
  it.each(pairs)("%s cannot become %s with SET ROLE", async (from, to) => {
    const message = await captureErrorText(queryAs(unscoped(from), null, `set local role ${to}`));
    expect(message).toMatch(/permission denied to set role/);
  });

  it.each(pairs)("%s cannot become %s with SET SESSION AUTHORIZATION", async (from, to) => {
    const message = await captureErrorText(queryAs(unscoped(from), null, `set local session authorization ${to}`));
    expect(message).toMatch(/permission denied to set session authorization/);
  });

  it.each(TENANT_ROLES)("%s: a failed transaction clears the scope on a single-connection pool", async (role) => {
    const env = getToolingEnv();
    const single = createDatabase(env[urlVariable(role, "test")], { max: 1 });
    try {
        const orgId = role === "leads_client" ? world.kestrel.id : world.brightpath.id;
      const failure = await captureErrorText(
        withScope(single.db, { orgId, userId: USER }, async (tx) => {
          const inside = await tx.execute<{ id: string | null }>(sql`select current_setting('app.org_id', true) as id`);
          expect(inside.rows[0]?.id).toBe(orgId);
          throw new Error("work failed");
        }),
      );
      expect(failure).toContain("work failed");
      // The same single connection, straight afterwards: no scope, no rows.
      const after = await single.db.execute<{ id: string | null }>(sql`select current_setting('app.org_id', true) as id`);
      expect(after.rows[0]?.id ?? "").toBe("");
      expect(await queryAs(single.db, null, "select public_ref from campaign")).toEqual([]);
    } finally {
      await single.close();
    }
  });
});

describe("denied writes", () => {
  const everything = (): string[] => [
    ...[world.fynix, ...world.clients, ...world.agencies].flatMap((org) => [org.id, org.publicRef, org.name, org.brandName ?? ""]),
    ...world.campaigns.flatMap((row) => [row.id, row.publicRef, row.name, row.internalNotes]),
  ].filter((token) => token !== "");

  it.each(TENANT_ROLES)("%s: insert, update, delete and truncate say permission denied and echo no row data", async (role) => {
    const db = dbs.roles[role].db;
    const scope = { orgId: role === "leads_client" ? world.kestrel.id : world.brightpath.id, userId: USER };
    const statements = [
      "insert into campaign (public_ref, name, client_org_id, agency_org_id, start_date, end_date, monthly_target, total_target) values ('CMP-0000', 'x', gen_random_uuid(), gen_random_uuid(), '2026-12-01', '2026-12-02', 1, 1)",
      "update campaign set name = 'changed'",
      "delete from campaign",
      "truncate campaign",
      "update organisation set name = 'changed'",
    ];
    for (const statement of statements) {
      const message = await captureErrorText(queryAs(db, scope, statement));
      expect(message).toMatch(/permission denied for table (campaign|organisation)/);
      expect(findLeaks(message, everything())).toEqual([]);
    }
  });

  it("an update that is denied leaves the rows untouched", async () => {
    await captureErrorText(queryAs(dbs.roles.leads_client.db, { orgId: world.kestrel.id, userId: USER }, "update campaign set name = 'changed'"));
    const names = await dbs.owner.db.execute<{ name: string }>(sql`select name from campaign order by name`);
    expect(names.rows.map((row) => row.name)).toEqual(world.campaigns.map((row) => row.name).sort());
  });
});
```

- [ ] **Step 9: Write the behaviour test file**

```typescript
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_COLUMNS, columnNames } from "@/server/db/columns";
import { TENANT_ROLES } from "@/server/db/roles";
import { campaign, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { selectCampaigns } from "@/server/db/tenant-reads";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** The behaviour of the organisation and campaign tables: what each role can read and write, and what the database refuses. */

let dbs: TestDatabases;
let world: SeedWorld;
const USER = "55555555-5555-4555-8555-555555555555";

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});

const asFynix = <T>(work: Parameters<typeof withScope<T>>[2]) => withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: USER }, work);

describe("Fynix", () => {
  it("reads every organisation and every campaign, hidden columns included", async () => {
    const campaigns = await asFynix((tx) => tx.select().from(campaign));
    expect(campaigns).toHaveLength(4);
    expect(campaigns.map((row) => row.internalNotes).sort()).toEqual(world.campaigns.map((row) => row.internalNotes).sort());
    expect(await asFynix((tx) => tx.select().from(organisation))).toHaveLength(5);
  });

  it("creates and updates organisations and campaigns", async () => {
    await asFynix(async (tx) => {
      await tx.insert(organisation).values({ publicRef: "ORG-3C4D", kind: "agency", name: "Ridgeway Ltd" });
      await tx.update(campaign).set({ status: "active" }).where(eq(campaign.publicRef, "CMP-7Q2X"));
    });
    const rows = await asFynix((tx) => tx.select({ status: campaign.status }).from(campaign).where(eq(campaign.publicRef, "CMP-7Q2X")));
    expect(rows).toEqual([{ status: "active" }]);
  });

  it("cannot delete or truncate: an organisation is archived, not removed", async () => {
    const asFynixSql = (statement: string) => queryAs(dbs.roles.leads_fynix.db, { orgId: null, userId: USER }, statement);
    expect(await captureErrorText(asFynixSql("delete from campaign"))).toContain("permission denied for table campaign");
    expect(await captureErrorText(asFynixSql("delete from organisation"))).toContain("permission denied for table organisation");
    expect(await captureErrorText(asFynixSql("truncate campaign"))).toContain("permission denied for table campaign");
  });
});

describe("tenant column lists match the grants", () => {
  const granted = async (role: string, table: string): Promise<string[]> => {
    const result = await dbs.owner.db.execute<{ column_name: string }>(
      sql.raw(`select a.attname::text as column_name from pg_attribute a
        where a.attrelid = 'public.${table}'::regclass and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('${role}', a.attrelid, a.attnum, 'SELECT') order by 1`),
    );
    return result.rows.map((row) => row.column_name);
  };

  it.each(TENANT_ROLES)("%s: columns.ts names exactly the columns the database granted", async (role) => {
    expect(await granted(role, "campaign")).toEqual(columnNames(TENANT_COLUMNS[role].campaign).sort());
    expect(await granted(role, "organisation")).toEqual(columnNames(TENANT_COLUMNS[role].organisation).sort());
  });
});

describe("the client brand copy", () => {
  const brandOf = async (publicRef: string): Promise<string | undefined> => {
    const rows = await dbs.owner.db.select({ brand: campaign.clientBrandName }).from(campaign).where(eq(campaign.publicRef, publicRef));
    return rows[0]?.brand;
  };

  it("is filled from the client when a campaign is created", async () => {
    expect(await brandOf("CMP-7Q2X")).toBe("Kestrel");
    expect(await brandOf("CMP-4M6R")).toBe("Halden");
  });

  it("follows a rename of the client's brand, and the agency sees the new name", async () => {
    await asFynix((tx) => tx.update(organisation).set({ brandName: "Kestrel Freight" }).where(eq(organisation.publicRef, "ORG-4K9P")));
    expect(await brandOf("CMP-7Q2X")).toBe("Kestrel Freight");
    expect(await brandOf("CMP-8T3W")).toBe("Kestrel Freight");
    expect(await brandOf("CMP-4M6R")).toBe("Halden");
    const seen = await withScope(dbs.roles.leads_agency.db, { orgId: world.brightpath.id, userId: USER }, (tx) => selectCampaigns(tx, "leads_agency"));
    expect(seen.map((row) => row.clientBrandName).sort()).toEqual(["Halden", "Kestrel Freight"]);
  });

  it("is filled again when a campaign moves to another client, and cannot be set by the caller", async () => {
    await asFynix((tx) => tx.update(campaign).set({ clientOrgId: world.halden.id, clientBrandName: "Spoofed" }).where(eq(campaign.publicRef, "CMP-7Q2X")));
    expect(await brandOf("CMP-7Q2X")).toBe("Halden");
  });
});

describe("integrity the database enforces", () => {
  const baseCampaign = () => ({
    publicRef: "CMP-9X9X",
    name: "New campaign",
    clientOrgId: world.kestrel.id,
    agencyOrgId: world.brightpath.id,
    startDate: "2026-12-01",
    endDate: "2027-01-31",
    monthlyTarget: 10,
    totalTarget: 30,
  });

  it("refuses an agency as the client, and a client as the agency", async () => {
    const agencyAsClient = await captureErrorText(asFynix((tx) => tx.insert(campaign).values({ ...baseCampaign(), clientOrgId: world.brightpath.id })));
    expect(agencyAsClient).toContain("campaign_client_org_fk");
    const clientAsAgency = await captureErrorText(asFynix((tx) => tx.insert(campaign).values({ ...baseCampaign(), agencyOrgId: world.kestrel.id })));
    expect(clientAsAgency).toContain("campaign_agency_org_fk");
  });

  it("refuses to write the constant kind columns", async () => {
    const message = await captureErrorText(
      asFynix((tx) => tx.execute(sql`insert into campaign (public_ref, name, client_org_id, client_org_kind, agency_org_id, start_date, end_date, monthly_target, total_target)
        values ('CMP-9X9X', 'x', ${world.kestrel.id}, 'agency', ${world.brightpath.id}, '2026-12-01', '2027-01-01', 1, 1)`)),
    );
    expect(message).toContain("cannot insert a non-DEFAULT value into column");
  });

  it.each([
    ["a reference in the wrong shape", { publicRef: "CMP-abc" }, "campaign_public_ref_format"],
    ["an end date before the start date", { endDate: "2026-11-30" }, "campaign_dates_in_order"],
    ["a negative target", { monthlyTarget: -1 }, "campaign_targets_not_negative"],
    ["a reference already in use", { publicRef: "CMP-7Q2X" }, "campaign_public_ref_unique"],
  ])("refuses %s", async (_label, change, constraint) => {
    const message = await captureErrorText(asFynix((tx) => tx.insert(campaign).values({ ...baseCampaign(), ...change })));
    expect(message).toContain(constraint);
  });

  it("refuses a client organisation without a brand name", async () => {
    const message = await captureErrorText(asFynix((tx) => tx.insert(organisation).values({ publicRef: "ORG-5E6F", kind: "client", name: "No Brand Ltd" })));
    expect(message).toContain("organisation_client_has_brand");
  });
});

describe("the scope functions", () => {
  it("are inlined into the policy, so the planner sees the setting and not a function call", async () => {
    const plan = await dbs.owner.db.execute<{ "QUERY PLAN": string }>(sql`explain (verbose, costs off) select public.app_current_org_id()`);
    const text = plan.rows.map((row) => row["QUERY PLAN"]).join("\n");
    expect(text).toContain("current_setting('app.org_id'");
    expect(text).not.toContain("app_current_org_id");
  });

  it("return NULL with no scope and the organisation with one", async () => {
    expect(await queryAs(dbs.roles.leads_client.db, null, "select public.app_current_org_id() as org")).toEqual([{ org: null }]);
    expect(await queryAs(dbs.roles.leads_client.db, { orgId: world.kestrel.id, userId: USER }, "select public.app_current_org_id() as org, public.app_current_user_id() as usr")).toEqual([
      { org: world.kestrel.id, usr: USER },
    ]);
  });
});
```

- [ ] **Step 10: Write the leak matrix test file**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";
import { campaign } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { PROBES, READ_PATHS, findLeaks, forbiddenTokens, type Viewer } from "@/server/db/testing/leak-matrix";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * Runs the whole matrix: every read path and every probe, as both tenant roles, for both organisations of each kind.
 * What a viewer must not see is computed from the seed (see forbiddenTokens), and the search covers results and
 * error messages alike. The paths and probes live in testing/leak-matrix.ts, so later phases extend the matrix by
 * adding entries there.
 */

let dbs: TestDatabases;
let world: SeedWorld;
const USER = "44444444-4444-4444-8444-444444444444";

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});

function viewers(): Viewer[] {
  return [
    ...world.clients.map((organisation): Viewer => ({ role: "leads_client", organisation })),
    ...world.agencies.map((organisation): Viewer => ({ role: "leads_agency", organisation })),
  ];
}

describe.each(TENANT_ROLES)("leak matrix as %s", (role: TenantRoleName) => {
  const label = (viewer: Viewer): string => viewer.organisation.name;

  it.each(READ_PATHS.map((path) => path.name))("read path: %s leaks nothing and is not empty", async (pathName) => {
    const path = READ_PATHS.find((candidate) => candidate.name === pathName);
    if (path === undefined) throw new Error(`Unknown read path ${pathName}`);
    for (const viewer of viewers().filter((candidate) => candidate.role === role)) {
      const result = await withScope(dbs.roles[role].db, { orgId: viewer.organisation.id, userId: USER }, (tx) => path.run(tx, viewer, world));
      const text = JSON.stringify(result);
      expect(findLeaks(text, forbiddenTokens(viewer, world)), `${label(viewer)} saw something it must not`).toEqual([]);
      for (const expected of path.mustContain(viewer, world)) {
        expect(text, `${label(viewer)} should see ${expected}`).toContain(expected);
      }
    }
  });

  it.each(PROBES.map((probe) => probe.name))("probe: %s is denied with a plain permission error", async (probeName) => {
    const probe = PROBES.find((candidate) => candidate.name === probeName);
    if (probe === undefined) throw new Error(`Unknown probe ${probeName}`);
    for (const viewer of viewers().filter((candidate) => candidate.role === role)) {
      const message = await captureErrorText(queryAs(dbs.roles[role].db, { orgId: viewer.organisation.id, userId: USER }, probe.statement));
      expect(message, `${label(viewer)}: ${probe.statement}`).toMatch(probe.expectedError);
      expect(findLeaks(message, forbiddenTokens(viewer, world)), `${label(viewer)} saw something in an error message`).toEqual([]);
    }
  });

  it("each organisation of the kind sees exactly its own campaigns and none of the other's", async () => {
    for (const viewer of viewers().filter((candidate) => candidate.role === role)) {
      const rows = await queryAs(dbs.roles[role].db, { orgId: viewer.organisation.id, userId: USER }, "select public_ref from campaign order by public_ref");
      const expected = world.campaigns.filter((row) => (role === "leads_client" ? row.client : row.agency).id === viewer.organisation.id).map((row) => row.publicRef).sort();
      expect(rows.map((row) => row.public_ref)).toEqual(expected);
      expect(expected).toHaveLength(2);
    }
  });
});

describe("the matrix itself", () => {
  it("detects a leak: what Fynix may read trips the forbidden list of a client and of an agency", async () => {
    const everything = JSON.stringify(await dbs.roles.leads_fynix.db.select().from(campaign));
    const client: Viewer = { role: "leads_client", organisation: world.kestrel };
    const agency: Viewer = { role: "leads_agency", organisation: world.brightpath };
    const clientLeaks = findLeaks(everything, forbiddenTokens(client, world));
    const agencyLeaks = findLeaks(everything, forbiddenTokens(agency, world));
    expect(clientLeaks).toContain(world.brightpath.id);
    expect(clientLeaks).toContain(world.campaigns[1]?.internalNotes);
    expect(agencyLeaks).toContain(world.kestrel.id);
    expect(agencyLeaks).toContain(world.campaigns[2]?.name);
  });
});
```

- [ ] **Step 11: Migrate the test database only as far as the tables, and watch the tests fail**

The test database is empty. Apply migrations 0000 and 0001 only, so the tables and functions exist but there are no grants, no policies and no triggers.

```bash
pnpm db:migrate:test --stop-after=0001_organisation_campaign
pnpm exec vitest run --config vitest.integration.config.mts server/db/structure server/db/rls server/db/leak-matrix
```

Expected: `Migrations applied to the test database, stopping after 0001_organisation_campaign.`, then FAIL: 39 tests fail and 116 pass (the passing ones are checks that hold vacuously when nothing is granted, such as the SET ROLE tests). The failures include `row-level security is enabled on every table`, every read path of the leak matrix (`permission denied for table campaign`), every Fynix test, the brand copy tests, the integrity tests and `columns.ts names exactly the columns the database granted`. They fail for the right reason: nothing grants anything yet.

- [ ] **Step 12: Apply the rest of the migrations and watch them pass**

```bash
pnpm db:migrate:test
pnpm exec vitest run --config vitest.integration.config.mts server/db/structure server/db/rls server/db/leak-matrix
```

Expected: `Migrations applied to the test database.`, then PASS: 3 files, 155 tests (structure 91, leak matrix 47, rls 17).

- [ ] **Step 13: Prove the matrix can fail, then undo it**

Weaken the agency policy so an agency can read every campaign, and run the matrix:

```bash
psql -d fynix_leads_test -c 'drop policy campaign_agency_own on campaign' -c 'create policy campaign_agency_own on campaign for select to leads_agency using (true)'
pnpm exec vitest run --config vitest.integration.config.mts server/db/structure server/db/rls server/db/leak-matrix
```

Expected: FAIL, 9 tests, all for `leads_agency`: the three campaign read paths ("leaks nothing"), "each organisation of the kind sees exactly its own campaigns", the brand copy test, `count(*)`, `policies work`, `no scope set returns zero rows` and `a failed transaction clears the scope`. Put the policy back exactly as the migration has it:

```bash
psql -d fynix_leads_test -c 'drop policy campaign_agency_own on campaign' -c 'create policy campaign_agency_own on campaign as permissive for select to leads_agency using (agency_org_id = public.app_current_org_id())'
pnpm exec vitest run --config vitest.integration.config.mts server/db/structure server/db/rls server/db/leak-matrix
```

Expected: PASS again, 155 tests.

Other mutations worth trying once, each reverted with the matching `revoke`/`drop` (or by recreating the test database with `dropdb fynix_leads_test && pnpm db:create && pnpm db:migrate:test`): `grant select (agency_org_id) on campaign to leads_client` fails 3 tests (the probe, the WHERE probe, the column-list drift test); `grant select on campaign to leads_client` fails 13 (structure and `select *`); `create view public.campaign_all as select id, public_ref from campaign` fails the view check.

- [ ] **Step 14: Typecheck, lint and commit**

```bash
pnpm typecheck
pnpm lint
git add server/db/testing server/db/structure.integration.test.ts server/db/rls.integration.test.ts server/db/leak-matrix.integration.test.ts
git commit -m "Add the integration harness, structural checks and the leak matrix"
```

---

## Task 9: The migration journal test

**Files:**
- Create: `server/db/migration-journal.test.ts`

drizzle-kit writes `when` from the machine clock. The migrator (like drizzle's own) applies a migration only if its `when` is greater than the newest one already recorded, so an entry whose `when` is not above the previous one is silently skipped on every database that already ran the earlier one. This test needs no database. `drizzle-kit generate --custom` writes a snapshot for hand-written SQL too, so the whitelist of migrations without a snapshot starts empty and only shrinks.

- [ ] **Step 1: Write the test**

```typescript
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the migration journal without a database. The migrator applies a migration only when its `when` is greater
 * than the newest one already recorded, so an entry whose `when` is not above the one before it is silently skipped
 * on every database that has already run the earlier one. drizzle-kit writes `when` from the machine's clock: if that
 * clock is behind an entry already in the journal, edit the new entry's `when` by hand to a larger value.
 */

const MIGRATIONS = fileURLToPath(new URL("./migrations", import.meta.url));
const META = join(MIGRATIONS, "meta");

interface JournalEntry {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
}
interface Snapshot {
  readonly id: string;
  readonly prevId: string;
}

/**
 * Migrations that have no `meta/NNNN_snapshot.json`. Empty today: `drizzle-kit generate --custom` writes a snapshot for
 * hand-written SQL too, so every migration, written or generated, has one. Add a tag here only for SQL that really
 * could not get a snapshot, with a comment saying why. The list only shrinks.
 */
const WITHOUT_SNAPSHOT: ReadonlySet<string> = new Set([]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readJournal(): JournalEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(join(META, "_journal.json"), "utf8"));
  const list = isRecord(parsed) ? parsed.entries : undefined;
  if (!Array.isArray(list)) throw new Error("The migration journal has no entries list.");
  return list.map((item: unknown): JournalEntry => {
    if (!isRecord(item) || typeof item.idx !== "number" || typeof item.when !== "number" || typeof item.tag !== "string") {
      throw new Error(`A migration journal entry is malformed: ${JSON.stringify(item)}`);
    }
    return { idx: item.idx, when: item.when, tag: item.tag };
  });
}

function readSnapshot(tag: string): Snapshot {
  const parsed: unknown = JSON.parse(readFileSync(join(META, `${tag.slice(0, 4)}_snapshot.json`), "utf8"));
  if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.prevId !== "string") {
    throw new Error(`The snapshot for ${tag} has no id and prevId.`);
  }
  return { id: parsed.id, prevId: parsed.prevId };
}

const entries = readJournal();
const number = (tag: string): number => Number(tag.slice(0, 4));

describe("migration journal", () => {
  it("is not empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("numbers its entries from 0 without gaps", () => {
    expect(entries.map((entry) => entry.idx)).toEqual(entries.map((_, index) => index));
  });

  it("has strictly increasing `when` values, so no new migration can be skipped as already applied", () => {
    const offenders = entries.flatMap((entry, index) => {
      const previous = entries[index - 1];
      return previous !== undefined && entry.when <= previous.when ? [`${entry.tag} (${entry.when}) is not above ${previous.tag} (${previous.when})`] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("names each tag with its migration number, in order, once", () => {
    expect(entries.every((entry) => /^\d{4}_[a-z0-9_]+$/.test(entry.tag))).toBe(true);
    expect(entries.map((entry) => number(entry.tag))).toEqual(entries.map((_, index) => index));
  });

  it("has a SQL file for every entry and no SQL file outside the journal", () => {
    const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).map((name) => name.slice(0, -4)).sort();
    expect(files).toEqual(entries.map((entry) => entry.tag).sort());
  });

  it("has a snapshot for every entry except the whitelisted ones, and the whitelist has no stale names", () => {
    const missing = entries
      .filter((entry) => !WITHOUT_SNAPSHOT.has(entry.tag))
      .flatMap((entry) => {
        try {
          readSnapshot(entry.tag);
          return [];
        } catch {
          return [entry.tag];
        }
      });
    expect(missing).toEqual([]);
    expect([...WITHOUT_SNAPSHOT].filter((tag) => !entries.some((entry) => entry.tag === tag))).toEqual([]);
  });

  it("chains each snapshot to the one before it", () => {
    const chain = entries.filter((entry) => !WITHOUT_SNAPSHOT.has(entry.tag));
    const broken = chain.flatMap((entry, index) => {
      const previous = chain[index - 1];
      if (previous === undefined) return readSnapshot(entry.tag).prevId === "00000000-0000-0000-0000-000000000000" ? [] : [`${entry.tag} does not start the chain`];
      return readSnapshot(entry.tag).prevId === readSnapshot(previous.tag).id ? [] : [`${entry.tag} does not follow ${previous.tag}`];
    });
    expect(broken).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

```bash
pnpm exec vitest run server/db/migration-journal
```

Expected: PASS, 7 tests. (The migrations already exist from Task 5, so the test passes at once. Steps 3 and 4 prove it can fail.)

- [ ] **Step 3: Break the order of `when` and watch it fail**

```bash
cp server/db/migrations/meta/_journal.json /tmp/journal.backup.json
node -e '
  const fs = require("fs");
  const p = "server/db/migrations/meta/_journal.json";
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.entries[3].when = j.entries[1].when - 1;
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
'
pnpm exec vitest run server/db/migration-journal
cp /tmp/journal.backup.json server/db/migrations/meta/_journal.json
```

Expected: FAIL, `has strictly increasing "when" values` with a line like `0003_campaign_grants (...) is not above 0002_organisation_grants (...)`. After the restore, `git diff --stat server/db/migrations` prints nothing.

- [ ] **Step 4: Remove a SQL file and watch the other check fail**

```bash
mv server/db/migrations/0004_campaign_brand_sync.sql /tmp/
pnpm exec vitest run server/db/migration-journal
mv /tmp/0004_campaign_brand_sync.sql server/db/migrations/
```

Expected: FAIL, `has a SQL file for every entry and no SQL file outside the journal`, naming `0004_campaign_brand_sync`. After the move back, the test passes.

- [ ] **Step 5: Commit**

```bash
pnpm lint
git add server/db/migration-journal.test.ts
git commit -m "Add the migration journal test"
```

---

## Task 10: The migrator integration test, the dev seed, and the full integration run

**Files:**
- Create: `server/db/migrator.integration.test.ts`, `scripts/db-seed.ts`

The configuration (`vitest.integration.config.mts`: one file at a time, `server/**/*.integration.test.ts`, `server-only` stubbed) was created in Task 1 because Task 8 needed it. The `test:integration` script (migrate `fynix_leads_test`, then run the suite) was added in Task 1. This task adds the last two pieces and proves the whole thing.

- [ ] **Step 1: Write the migrator integration test**

It runs in a throwaway schema of the test database, with migrations written to a temporary folder, and drops the schema afterwards. It proves four things: each migration commits on its own (an enum value added in one migration and used in the next works); drizzle's own `migrate()` fails on the same files with `unsafe use of new value`, which is the reason this migrator exists; a failing migration is rolled back alone, keeps the earlier ones and stops the run, and the error names it; and `stopAfter` stops and resumes.

```typescript
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MigrationFailedError, runMigrations } from "@/server/db/migrator";
import { openTestDatabases, type TestDatabases } from "@/server/db/testing";

/**
 * The migrator against a real database, in a throwaway schema of the test database (dropped afterwards), with
 * migrations written to a temporary folder. The real migrations are not involved.
 */

let dbs: TestDatabases;
const folders: string[] = [];
const schemas: string[] = [];

beforeAll(() => {
  dbs = openTestDatabases();
});
afterEach(async () => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  for (const schema of schemas.splice(0)) await dbs.owner.db.$client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});
afterAll(async () => {
  await dbs?.closeAll();
});

/** A migration folder in drizzle-kit's layout: a journal and numbered SQL files. */
function writeMigrations(files: readonly { readonly tag: string; readonly sql: string }[]): string {
  const folder = mkdtempSync(join(tmpdir(), "migrator-"));
  folders.push(folder);
  mkdirSync(join(folder, "meta"));
  const entries = files.map((file, index) => ({ idx: index, version: "7", when: 1_800_000_000_000 + index * 1000, tag: file.tag, breakpoints: true }));
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify({ version: "7", dialect: "postgresql", entries }));
  for (const file of files) writeFileSync(join(folder, `${file.tag}.sql`), file.sql);
  return folder;
}

function newSchema(): string {
  const schema = `migrator_probe_${randomBytes(4).toString("hex")}`;
  schemas.push(schema);
  return schema;
}

/** An enum value added in one migration and used in the next: the case a single transaction cannot run. */
function enumMigrations(schema: string): { tag: string; sql: string }[] {
  return [
    { tag: "0000_create", sql: `CREATE SCHEMA IF NOT EXISTS "${schema}";\n--> statement-breakpoint\nCREATE TYPE "${schema}".mood AS ENUM ('happy');\n--> statement-breakpoint\nCREATE TABLE "${schema}".entry (mood "${schema}".mood NOT NULL);` },
    { tag: "0001_add_value", sql: `ALTER TYPE "${schema}".mood ADD VALUE 'sad';` },
    { tag: "0002_use_value", sql: `INSERT INTO "${schema}".entry (mood) VALUES ('sad');` },
  ];
}

const rowCount = async (schema: string): Promise<number> => (await dbs.owner.db.$client.query(`SELECT count(*)::int AS n FROM "${schema}".entry`)).rows[0].n;
const applied = async (schema: string): Promise<number> => (await dbs.owner.db.$client.query(`SELECT count(*)::int AS n FROM "${schema}".__drizzle_migrations`)).rows[0].n;

describe("runMigrations", () => {
  it("commits each migration on its own, so an enum value can be added and used by the next migration", async () => {
    const schema = newSchema();
    await runMigrations(dbs.owner.db.$client, writeMigrations(enumMigrations(schema)), { bookkeepingSchema: schema });
    expect(await rowCount(schema)).toBe(1);
    expect(await applied(schema)).toBe(3);
  });

  it("is the reason the migrator exists: drizzle's own migrate() runs the same files in one transaction and fails", async () => {
    const schema = newSchema();
    const folder = writeMigrations(enumMigrations(schema));
    const message = await migrate(drizzle(dbs.owner.db.$client), { migrationsFolder: folder, migrationsSchema: schema }).then(
      () => "",
      (error: unknown) => String((error as { cause?: unknown }).cause ?? error),
    );
    expect(message).toMatch(/unsafe use of new value/);
  });

  it("applies nothing twice", async () => {
    const schema = newSchema();
    const folder = writeMigrations(enumMigrations(schema));
    await runMigrations(dbs.owner.db.$client, folder, { bookkeepingSchema: schema });
    await runMigrations(dbs.owner.db.$client, folder, { bookkeepingSchema: schema });
    expect(await applied(schema)).toBe(3);
    expect(await rowCount(schema)).toBe(1);
  });

  it("rolls back a failing migration by itself, keeps the earlier ones and applies nothing after it", async () => {
    const schema = newSchema();
    const files = [
      ...enumMigrations(schema).slice(0, 2),
      { tag: "0002_breaks", sql: `CREATE TABLE "${schema}".half_done (id int);\n--> statement-breakpoint\nSELECT 1/0;` },
      { tag: "0003_never_runs", sql: `CREATE TABLE "${schema}".never (id int);` },
    ];
    const failure = await runMigrations(dbs.owner.db.$client, writeMigrations(files), { bookkeepingSchema: schema }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(MigrationFailedError);
    expect((failure as MigrationFailedError).message).toContain("0002_breaks");
    expect((failure as MigrationFailedError).message).toContain("division by zero");
    expect(await applied(schema)).toBe(2);
    const tables = await dbs.owner.db.$client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1`, [schema]);
    expect(tables.rows.map((row) => row.table_name)).toEqual(["__drizzle_migrations", "entry"]);
  });

  it("stops after the named migration and resumes from there", async () => {
    const schema = newSchema();
    const folder = writeMigrations(enumMigrations(schema));
    await runMigrations(dbs.owner.db.$client, folder, { bookkeepingSchema: schema, stopAfter: "0001_add_value" });
    expect(await applied(schema)).toBe(2);
    expect(await rowCount(schema)).toBe(0);
    await runMigrations(dbs.owner.db.$client, folder, { bookkeepingSchema: schema });
    expect(await rowCount(schema)).toBe(1);
  });

  it("rejects a stop-after tag that is not in the journal, before touching the database", async () => {
    const schema = newSchema();
    await expect(runMigrations(dbs.owner.db.$client, writeMigrations(enumMigrations(schema)), { bookkeepingSchema: schema, stopAfter: "0009_missing" })).rejects.toThrow(
      'stopAfter names "0009_missing"',
    );
  });
});
```

- [ ] **Step 2: Run it**

```bash
pnpm exec vitest run --config vitest.integration.config.mts server/db/migrator
```

Expected: PASS, 6 tests.

- [ ] **Step 3: Create the dev seed script**

It writes the same world the tests use into the dev database through the owner connection, and refuses a database that already holds an organisation, so it cannot overwrite anything.

```typescript
import { count } from "drizzle-orm";
import { createDatabase } from "@/server/db/pool";
import { organisation } from "@/server/db/schema";
import { seedWorld } from "@/server/db/testing/seed";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Fills the dev database with the same two clients, two agencies and four campaigns the tests use, so the screens
// have something to show. It never overwrites: it refuses a database that already holds an organisation.
runScript(async () => {
  loadEnvLocal();
  const owner = createDatabase(getToolingEnv().DATABASE_URL_OWNER, { max: 1 });
  try {
    const existing = await owner.db.select({ n: count() }).from(organisation);
    if ((existing[0]?.n ?? 0) > 0) throw new Error("The dev database already holds organisations, so nothing was seeded.");
    const world = await seedWorld(owner);
    console.log(`Seeded ${world.clients.length} clients, ${world.agencies.length} agencies and ${world.campaigns.length} campaigns.`);
  } finally {
    await owner.close();
  }
});
```

- [ ] **Step 4: Run it twice**

```bash
pnpm db:seed
pnpm db:seed
```

Expected: `Seeded 2 clients, 2 agencies and 4 campaigns.`, then `The dev database already holds organisations, so nothing was seeded.` with exit status 1.

- [ ] **Step 5: Run the whole integration suite through its script**

```bash
pnpm test:integration
```

Expected: `Migrations applied to the test database.` (nothing left to apply, the run is a no-op), then 4 test files and 161 tests pass: structure 91, leak matrix 47, rls 17, migrator 6.

- [ ] **Step 6: Run every gate**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all pass. `pnpm test` runs the existing `lib/` tests plus 56 new unit tests in 9 files under `server/`. `pnpm build` is unchanged by this phase: no route imports `server/db/client.ts` yet.

- [ ] **Step 7: Commit**

```bash
git add server/db/migrator.integration.test.ts scripts/db-seed.ts
git commit -m "Add the migrator integration test and the dev seed command"
```

---

## Task 11: CI `database` job

**Files:**
- Modify: `.github/workflows/ci.yml`

The existing `checks` job stays exactly as it is (it needs no database). The new job follows the sibling platform repository's: a `postgres:16` service, trust authentication for the runner user, throwaway secrets from `pnpm env:init`, every migration on an empty database, then the integration suite. Differences: the databases are created by `pnpm db:create` (owned by `leads_owner`, hardened) rather than `createdb`, because that is what a new machine does.

- [ ] **Step 1: Update the header comment**

The first lines of the file say there is one job. Replace

```yaml
# The checks that must pass before code reaches main or development.
#
# One job: the checks share one install and the whole run takes a few minutes, so splitting them would pay the
# install cost several times for no gain.
```

with

```yaml
# The checks that must pass before code reaches main or development.
#
# Two jobs. `checks` is lint, typecheck, test and build: they share one install, so splitting them would pay the
# install cost several times for no gain. `database` needs a Postgres service and is slower, so it runs beside
# `checks` instead of adding to it.
```

- [ ] **Step 2: Append the job at the end of the file**

Add this after the last step of `checks` (keep one blank line before it, and keep `jobs:` indentation: the job name is indented two spaces):

```yaml
  # Every migration on an empty database, then the integration tests. This is the check that the row-level security
  # and column-grant design holds on a real Postgres, so it must stay a separate job: `checks` needs no database.
  database:
    name: Migrations and integration tests
    runs-on: ubuntu-latest
    timeout-minutes: 15

    # Production runs Postgres 16. The superuser is named after the runner's OS user and local connections need no
    # password, because that is what `pnpm env:init` writes for the admin connection
    # (`postgresql://<os user>@localhost:5432/postgres`). The six application roles still log in as themselves, so
    # row-level security and column grants are exercised for real.
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: runner
          POSTGRES_HOST_AUTH_METHOD: trust
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U runner"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    steps:
      - uses: actions/checkout@v5

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      # Throwaway secrets for this run only, written to the git-ignored .env.local the scripts read.
      - name: Generate the local environment
        run: pnpm env:init

      - name: Create the roles
        run: pnpm db:roles

      # fynix_leads and fynix_leads_test, owned by leads_owner, as on a new machine.
      - name: Create the databases
        run: pnpm db:create

      # Every migration, in order, on an empty database: the check this job exists for.
      - name: Migrate an empty database
        run: pnpm db:migrate

      # Migrates the empty test database the same way, then runs the integration suites against it.
      - name: Integration tests
        run: pnpm test:integration
```

- [ ] **Step 3: Validate the file parses and has both jobs**

```bash
python3 -c "
import yaml
d = yaml.safe_load(open('.github/workflows/ci.yml'))
print(sorted(d['jobs']))
print([s.get('name', s.get('uses')) for s in d['jobs']['database']['steps']])
"
```

Expected:

```
['checks', 'database']
['actions/checkout@v5', 'pnpm/action-setup@v4', 'actions/setup-node@v5', 'Install', 'Generate the local environment', 'Create the roles', 'Create the databases', 'Migrate an empty database', 'Integration tests']
```

If `python3` has no `yaml` module, `pnpm dlx js-yaml .github/workflows/ci.yml > /dev/null` does the same check.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Run migrations and integration tests in a database CI job"
```

The job can only be proven by a push; this plan never pushes. When the owner pushes `development`, watch the `database` job. The commands it runs are the ones in Tasks 2, 3, 5 and 10, which were all run locally from an empty cluster state.

---

## Task 12: Documentation

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Replace `CLAUDE.md`**

The changes against the current file: the opening paragraph no longer says there is no database; the plans line and the stack line mention phase 1 and Postgres; a new "Database" rule block sits before "Dev server"; the command list gains the new scripts; and the "before calling a change done" line adds the integration run. Everything else is unchanged. Replace the whole file with:

````markdown
@AGENTS.md

# fynix-leads

Lead generation tracking portal. A client reviews leads that the Fynix team submits and approves, rejects or asks for clarification. An agency does the work behind Fynix. Fynix runs both. The screens are still a clickable prototype on sample data (phase 0): nothing is saved and there is no sign-in or email yet. Phase 1 is replacing the foundations underneath them, starting with the database layer (1A, in `server/db/`).

## Where things are

- Spec and decisions: `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md` (open questions in section 16).
- Plans: `docs/superpowers/plans/` (phase 0, the restyle to the hybrid design, the phase 1 master plan and the detailed plan for each sub-phase, `2026-11-11-phase-1a-foundation.md` first).
- Approved look: `docs/superpowers/specs/design-directions-v2/` (`d-hybrid` is the chosen design; open `index.html` there to compare directions).
- Design system: `DESIGN.md` is authoritative (tokens, shapes, shadows, components, banned patterns, approved exceptions).

Stack: Next.js 16 (App Router, Cache Components) · React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui on Base UI · Phosphor icons · Geist · TanStack Table v9 · PostgreSQL 16 with Drizzle ORM and `pg` · zod · Vitest. pnpm, Node 24.

## Rules

- Work on `development`. `main` is production and only changes through a PR. Remote: `github.com/digibranders/fynix-leads` (private). Its default branch is `development`; `main` does not exist yet, so create it as the PR base when this goes to production.
- **Design:** the mockups in `d-hybrid` are the visual authority, the owner rejected both boxy outlined UI and borderless clutter ("structured softness"). Never settle a design language from text alone: show a visual first. Layout switches by CSS breakpoints only, never by JavaScript.
- **Isolation:** the client never sees agency identity; the agency never sees client people, rep names or emails. Agency screens receive only data shaped by `lib/leads/agency-view.ts`. Shared client code must never import `lib/sample/data` (`lib/sample/isolation.test.ts` enforces it). When you add a screen, check the page source and its JavaScript chunks for forbidden names.
- **Logic:** domain rules live in `lib/` as plain TypeScript with tests next to them. Components render; they do not decide business rules. Which month a delivered lead counts toward is an open question and is decided in one place: `lib/domain/counting-month.ts`.
- **Copy:** sentence case, plain verbs, no exclamation marks, no em or en dashes in any text.
- **Database (`server/db/`, scripts in `scripts/`):** `lib/` stays pure and never imports `server/` or a database driver (`server/db/boundaries.test.ts` enforces it).
  - **Six login roles, one connection pool each, no `SET ROLE`:** `leads_owner` (migrations only), `leads_auth`, `leads_fynix`, `leads_client`, `leads_agency`, `leads_public`. Who connects decides what a request can see. Tenant requests go through `withOrgScope` (and Fynix through `withFynixScope`) in `server/db/scope.ts`, which sets `app.org_id` and `app.user_id` for one transaction. Never query a tenant pool any other way.
  - **Tenant roles never get a table-level grant.** `leads_client` and `leads_agency` hold `SELECT` on named columns only, so `select *` fails by design. Every tenant read starts from a typed column list in `server/db/columns.ts` through `server/db/tenant-reads.ts`. Do not write a Drizzle `select()` with no columns (the boundary test fails it).
  - **Every table** enables row-level security and gets a policy for each role that holds a grant, in the same hand-written `NNNN_<table>_grants.sql` migration. `server/db/structure.integration.test.ts` checks this for every table automatically.
  - **Views must be `WITH (security_invoker = true)`.** An ordinary view runs as its owner and bypasses row-level security. Materialized views are not allowed.
  - **Adding a table or column:** edit `server/db/schema/`, run `pnpm db:generate`, add a hand-written grants migration (`pnpm db:generate --custom --name=<table>_grants`), update the lists in `server/db/columns.ts` in the same commit, and add read paths and probes to `server/db/testing/leak-matrix.ts`. Migrations must be additive because a deploy migrates before it builds. Never edit an applied migration.
  - **Known limit:** a role can call `set_config('app.org_id', ...)` itself, so row-level security protects against a query bug, not against SQL injection into a tenant connection. Organisation ids are random UUIDs that tenant roles cannot read.
  - **Dev databases** are `fynix_leads` and `fynix_leads_test` on the Postgres 16 already running on this machine, shared with other projects. Create only those and the `leads_*` roles. The test harness refuses any database whose name does not end in `_test`.
- **Dev server:** `pnpm dev` serves http://localhost:3020. Next.js allows one dev server per project, so reuse the running one. Do not stop a server unless the owner says so.

## Commands

```bash
pnpm dev          # http://localhost:3020
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration   # migrates fynix_leads_test, then runs the database tests
pnpm build

pnpm env:init           # once per machine: writes .env.local (mode 600, never overwrites)
pnpm env:check          # names the missing or malformed variables, never their values
pnpm db:roles           # creates the six roles
pnpm db:create          # creates fynix_leads and fynix_leads_test
pnpm db:migrate         # applies migrations to fynix_leads
pnpm db:seed            # two clients, two agencies, four campaigns (refuses a non-empty database)
pnpm db:generate        # SQL from server/db/schema/; add --custom --name=<name> for hand-written SQL
```

Before calling a change done, run lint, typecheck, test and build. Add `pnpm test:integration` when the change touches `server/db/`, a migration or a grant.
````

- [ ] **Step 2: Replace `README.md`**

This holds the local setup steps for a new machine. Replace the whole file with:

````markdown
# Fynix Leads

Lead generation tracking for Fynix campaigns. A client reviews leads, an agency submits them, and Fynix runs both. The screens are a phase 0 prototype on sample data (three screens, built in the approved hybrid design). Phase 1 is putting a real foundation under them: a PostgreSQL database that itself enforces the client and agency isolation, then sign-in, organisations and campaigns.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3020
```

Screens: `/` (index), `/client/review`, `/client/leads/LD-4K9P`, `/agency/leads`, `/dev/system` (design system).

## Set up the database on a new machine

The prototype screens need no database. The database layer, its scripts and its tests do.

1. Install PostgreSQL 16 and start it on `localhost:5432`. Your operating system user must be a Postgres superuser (`createuser -s "$USER"` if it is not). The scripts connect as that user, to the `postgres` database, only to create roles and databases.
2. `pnpm install`
3. `pnpm env:init` writes `.env.local` with random passwords, mode 600. It never overwrites an existing file. `pnpm env:check` lists any missing or malformed variable by name.
4. `pnpm db:roles` creates six login roles: `leads_owner`, `leads_auth`, `leads_fynix`, `leads_client`, `leads_agency`, `leads_public`.
5. `pnpm db:create` creates `fynix_leads` and `fynix_leads_test`, owned by `leads_owner`, with public access removed.
6. `pnpm db:migrate` applies the migrations to `fynix_leads`. Optionally `pnpm db:seed` adds two clients, two agencies and four campaigns.
7. `pnpm test:integration` migrates `fynix_leads_test` and runs the database tests.

Roles are cluster-wide. If other projects share this Postgres server, `pnpm db:roles` only touches roles whose names start with `leads_`, but it resets their passwords for every checkout that shares the cluster. The test helper refuses any database whose name does not end in `_test`.

## Check it

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration   # needs the database set up as above
```

## How the database enforces isolation

- Each of the six roles has its own connection pool and login. A request opens the pool of its role and sets its organisation for one transaction.
- `leads_client` and `leads_agency` hold `SELECT` on named columns only, never on a whole table, so `select *` fails. Row-level security limits them to their own organisation's rows.
- Every view must be `WITH (security_invoker = true)`. Every table enables row-level security. Structural tests check both for every table, including ones added later.
- A leak matrix runs every read path as every role against two clients and two agencies and searches the results and error messages for anything the viewer must not see.

Details and the working rules are in `CLAUDE.md`.

## Read first

- `CLAUDE.md`: working rules for this repo.
- `DESIGN.md`: the design system.
- `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md`: what the product does and the open questions.
- `docs/superpowers/plans/2026-11-11-phase-1-accounts-and-campaigns.md`: the phase 1 master plan. `2026-11-11-phase-1a-foundation.md` is the detailed plan for the database foundation.
- `docs/superpowers/specs/design-directions-v2/index.html`: the design directions and the approved hybrid.
````

- [ ] **Step 3: Check the copy rule**

```bash
node -e '
  const fs = require("fs");
  for (const f of ["CLAUDE.md", "README.md", "docs/superpowers/plans/2026-11-11-phase-1a-foundation.md"]) {
    if (/[\u2013\u2014]/.test(fs.readFileSync(f, "utf8"))) { console.error("dash in " + f); process.exit(1); }
  }
  console.log("No em or en dashes.");
'
```

Expected: `No em or en dashes.`

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "Document the database layer, its rules and the new-machine setup"
```

---

## Self-review

**1. Spec coverage against the master plan 1A deliverables and exit criteria**

| 1A deliverable or criterion | Where |
|---|---|
| `server/db` structure | File structure table; Tasks 4 to 8 |
| Env tooling | Task 2 (`env:init`, `env:check`, zod schema, `.env.example`) |
| Roles script | Task 3 (`db-roles.ts`, `db-create.ts`, `provision.ts`) |
| Migrator (per-migration commit) | Task 4; proven in Task 10 |
| Scope helper | Task 6 |
| Test harness with leak-matrix skeleton | Task 8 (`READ_PATHS`, `PROBES`, `forbiddenTokens`) |
| Structural tests, applying to every table | Task 8 (`structure.ts` and the self-tests) |
| Journal test | Task 9 |
| CI `database` job | Task 11 |
| Dev seed command | Task 10 |
| Exit: an empty database migrates cleanly | Task 5 Step 6 (dev), Task 8 Step 12 and Task 10 Step 5 (test); CI Task 11 |
| Exit: a scoped role sees only its rows | `leak-matrix.integration.test.ts` ("sees exactly its own campaigns"), every read path |
| Exit: `select *` fails for tenant roles | `structure.integration.test.ts`, every table a tenant role holds a grant on, plus a Drizzle untyped select |
| Exit: the harness refuses non-test databases | `testing/index.test.ts` (`testDatabaseName`, `resetDatabase`), Task 8 Step 4 |
| Exit: CI green | Task 11 (proven on first push; commands proven locally) |

The requested structural tests, one by one: RLS on every table (`tablesWithoutRowLevelSecurity`); every view `security_invoker` (`viewsThatBypassRowLevelSecurity`, also bans materialized views); tenant roles no table-level `SELECT` (`tenantTableLevelGrants`, which covers every privilege, not only `SELECT`); `select *` and an untyped select fail; every role NOSUPERUSER and NOBYPASSRLS with no membership (`roleProblems`, `roleMemberships`); no `SET ROLE` or `SET SESSION AUTHORIZATION` for any runtime role to any other (every ordered pair, 50 tests); tenant roles cannot read tables they have no grant on; no scope means zero rows; a failed transaction clears the scope on a single-connection pool; denied writes assert the error text and that it echoes no row data. The leak matrix covers both tenant roles, both organisations of each kind, results and error text.

Gaps and judgement calls, stated plainly: the matrix covers the two tables of this slice, so read paths for leads, members and auth tables arrive with those tables (the registry and the automatic structural checks are what carry over). The CI job is not run until a push. Agency access to client brand uses a copy column, not organisation rows (decision C1).

**2. Placeholder scan.** The plan has no unfinished markers, no step that points at another task instead of showing its code, no step that describes code without showing it. Every file is shown in full where it is created. The two files that are edited in place (`package.json`, `.gitignore`, `ci.yml` header) show the exact old and new text. The one non-literal instruction is "check the generated SQL matches" in Task 5 Step 3, which shows the generated file for comparison because drizzle-kit, not the engineer, writes it.

**3. Type and name consistency.** Names used across tasks, checked against the code: `RoleName`, `RuntimeRoleName`, `TenantRoleName`, `ROLE_NAMES`, `RUNTIME_ROLES`, `TENANT_ROLES`, `OWNER_ROLE`, `DATABASES`, `urlVariable(role, target)`, `passwordVariable(role)` (Task 2) are the ones Tasks 3, 4, 6 and 8 import. `Database` and `DatabaseHandle` come from `pool.ts` (Task 6) in Tasks 8 and 10. `ScopedTransaction`, `withScope`, `withOrgScope`, `withFynixScope`, `assertUuid` (Task 6) are used by `tenant-reads.ts`, `testing/index.ts` and all integration tests. `TENANT_COLUMNS`, `columnNames` (Task 7) are used by the drift test. `runMigrations(pool, folder, { stopAfter, bookkeepingSchema })` (Task 4) is used by `db-migrate.ts` and the migrator test. `SeedWorld`, `SeededOrganisation`, `SeededCampaign`, `seedWorld` (Task 8) are used by the leak matrix, the tests and `db-seed.ts`. Migration tags (`0000_functions` to `0004_campaign_brand_sync`) match between Tasks 5, 8, 9 and 12. The whole file set was compiled together (`tsc --noEmit`) and linted with the repository's ESLint configuration.

---

## Verification appendix

All of this was run against PostgreSQL 16.14 (Homebrew, the shared local cluster), Node 24.14.0, pnpm 11.3.0 (the pinned `packageManager`, run through `npx pnpm@11.3.0`), in a scratch copy of the planned file layout. Every code block in this plan is the content of the scratch file that was run, inserted by a script, so plan and tested code cannot drift. Two things differ between the scratch run and the plan: the databases were `leads_plan_scratch` and `leads_plan_scratch_test` (the `DATABASES` constant in `server/db/roles.ts`; the plan shows `fynix_leads` and `fynix_leads_test`), and the scratch project had no Next.js app (only `next`, `react` and `eslint-config-next` installed, to run the repository's lint rules). The six role names were the real ones.

**Clean-machine replay** (cluster with no `leads_*` roles and no scratch databases; `.env.local` removed), commands and results, in order:

| Command | Result |
|---|---|
| `pnpm env:init` | wrote `.env.local`, `-rw-------` |
| `pnpm env:check` | `Environment OK.` |
| `pnpm env:init` again | refused, `already exists, so nothing was changed`, exit 1 |
| `pnpm db:migrate` before the roles exist | `role "leads_owner" does not exist`, exit 1 |
| `pnpm db:roles` | six `Created role` lines |
| `pnpm db:create` (also tried before `db:roles`) | before: `Role leads_owner does not exist. Run "pnpm db:roles" first.`; after: both databases created and hardened |
| catalog queries | six roles `login=t super=f createdb=f createrole=f bypassrls=f replication=f`; 0 role memberships; both databases owned by `leads_owner`, `datacl` without the PUBLIC `=Tc/` entry |
| `pnpm db:migrate` on the empty dev database | `Migrations applied to the dev database.` (5 migrations) |
| `pnpm db:generate` | `No schema changes, nothing to migrate` (snapshots consistent, custom migrations included) |
| `pnpm db:migrate:test --stop-after=0001_organisation_campaign`, then the integration suite | 39 failed, 122 passed of 161 (the plan's three Task 8 files: 39 failed, 116 passed of 155) |
| `pnpm db:migrate:test`, then `pnpm test:integration` | 4 files, 161 tests, all pass |
| `pnpm test` | 9 files, 56 tests pass |
| `pnpm typecheck` (`tsc --noEmit`, strict) and `pnpm lint` (the repository ESLint config, 44 files) | clean, 0 problems |
| `pnpm db:seed` twice | seeded 2 clients, 2 agencies, 4 campaigns; second run refused, exit 1 |
| `pnpm db:roles` and `pnpm db:create` a second time | `Updated role ...`, `Hardened database ...`, no error (idempotent) |

Test counts by file: `env.test.ts` 9, `env-init.test.ts` 2, `provision.test.ts` 1, `migrate-guards.test.ts` 3, `scope.test.ts` 15, `columns.test.ts` 6, `boundaries.test.ts` 4, `migration-journal.test.ts` 7, `testing/index.test.ts` 9 (unit, 56 in all); `structure.integration.test.ts` 91, `leak-matrix.integration.test.ts` 47, `rls.integration.test.ts` 17, `migrator.integration.test.ts` 6 (integration, 161 in all).

**The "should fail" assertions fail for the right reason.** Run as the real login roles (`psql -U leads_client ... -h localhost`):

```
set role leads_fynix                    ERROR:  permission denied to set role "leads_fynix"
set session authorization leads_fynix   ERROR:  permission denied to set session authorization "leads_fynix"
select * from campaign                  ERROR:  permission denied for table campaign
select agency_org_id from campaign      ERROR:  permission denied for table campaign
insert into campaign(public_ref) ...    ERROR:  permission denied for table campaign
```

The same session as `leads_client` with its organisation set: `select * from pg_stats where tablename in ('campaign','organisation')` returned 0 rows after `ANALYZE`; `select count(*) from campaign` returned only its own count; `select rolpassword from pg_authid` gave `permission denied for table pg_authid`; `select * from drizzle.__drizzle_migrations` gave `permission denied for schema drizzle`; `create temp table` gave `permission denied to create temporary tables in database`; `create table` gave `permission denied for schema public`.

**The policy functions are inlined.** `explain (verbose, costs off) select public.app_current_org_id()` prints `Output: (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid`, and the plan of a tenant's `select public_ref from campaign` shows `Filter: (campaign.client_org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)`, with no function call. The same check is a test (`the scope functions are inlined into the policy`).

**The checks can fail** (mutation runs against a freshly migrated `_test` database, each followed by a rebuild of the database):

| Mutation | Failing tests |
|---|---|
| `grant select (agency_org_id) on campaign to leads_client` | 3: the leak probe for the agency id, the WHERE probe, the columns.ts drift test |
| `grant select on campaign to leads_client` | 13: `select *` and Drizzle untyped select, the table-level check, six leak probes, drift, policy test |
| agency policy replaced by `using (true)` | 9, all `leads_agency`: three campaign read paths, own-campaigns test, brand copy test, `count(*)`, policy test, zero-rows-without-scope, failed-transaction scope test |
| `grant select (id) on organisation to leads_client` | 2: the leak probe for `id` and the drift test |
| a view over `campaign` without `security_invoker`, granted to `leads_client` | 4: the view check, the table-level grant check, and both self-tests |

The journal test failed when `when` was moved out of order (`0003_campaign_grants ... is not above 0002_organisation_grants ...`) and when a SQL file was removed. `boundaries.test.ts` caught the text `db.select().from(campaign)` in a comment in `columns.ts` while the plan was being written, which is why that comment is worded the way it is.

**The migrator.** Against a throwaway schema: an enum value added in migration 1 and used in migration 2 works with `runMigrations` and fails with `unsafe use of new value` under drizzle-orm's own `migrate()`; a migration that fails halfway is rolled back alone, earlier ones stay, later ones do not run, and the error names it.

**pnpm 11.** `pnpm add` of drizzle-kit and tsx ended in `ERR_PNPM_IGNORED_BUILDS: esbuild@...`; pnpm wrote `esbuild: set this to true or false` into `pnpm-workspace.yaml`; setting it to `false` let `pnpm install` finish and both `tsx` and `drizzle-kit` ran. `pnpm db:generate --custom --name=probe` forwards the flags to drizzle-kit.

**Not verified.** The GitHub Actions job itself (the workflow file was parsed as YAML and has the intended structure; it runs the same commands as the local replay); `next build` and `pnpm typecheck` with `next typegen` in the real repository (the scratch project compiled the same files with `tsc --noEmit`, strict, and the plan touches no route or component); the real database names `fynix_leads` and `fynix_leads_test` (the constant is the only difference); a second machine. The `postgres:16` container and `POSTGRES_HOST_AUTH_METHOD: trust` follow the sibling repository's working job.

**Clean-up.** The scratch databases and all six roles were dropped, and the scratch `.env.local` deleted. Afterwards `psql -l | grep -i leads` printed nothing, `\du | grep -i leads` printed nothing, and `select count(*) from pg_roles where rolname like 'leads%'` and `select count(*) from pg_database where datname like 'leads%' or datname like 'fynix_leads%'` both returned 0.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-11-phase-1a-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - a fresh subagent per task, review between tasks, fast iteration. Required sub-skill: superpowers:subagent-driven-development.

**2. Inline Execution** - execute tasks in this session using superpowers:executing-plans, with batch execution and checkpoints for review.

Which approach?
