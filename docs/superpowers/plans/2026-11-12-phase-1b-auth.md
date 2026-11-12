# Phase 1B: Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sign-in for the three kinds of user, enforced where it cannot be forgotten: Better Auth (email and password, no public sign-up) behind our own guards, the auth tables readable by exactly one database role, a `member` table that turns a session into an organisation and a role pool, a password policy with a breached-password check, Postgres rate limits, a password reset that writes its link to an outbox stub, and `pnpm admin:create` for the first Fynix admin. Part B then builds the sign-in, forgot-password and reset-password pages, but only after the owner has approved visual comps.

**Architecture:** Better Auth runs on the `leads_auth` pool only, and its HTTP handler is never mounted: sign-in, reset, sign-out and account creation are server code in `server/auth/` that calls `auth.api`, behind our rate limits and password policy. A request resolves session, then `member`, then organisation kind, then the role pool, and plugs into the existing scope helper (`withFynixScope`, `withOrgScope`). Rate limits and the outbox stub use `leads_public`. No new mechanism replaces a 1A one: every new table gets row-level security, a policy per role that holds a grant, an entry in the access matrix and probes in the leak matrix.

**Tech Stack:** Better Auth 1.7.20 (new, pinned exactly), on the 1A stack: PostgreSQL 16, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, zod 4.6.7, Vitest 5.1.0, Next.js 16.4.6, Node 24, pnpm 11.3.0. No other new dependency: the breach check uses `fetch` and `node:crypto`, the admin prompt uses `node:process`.

**Master plan:** `docs/superpowers/plans/2026-11-11-phase-1-accounts-and-campaigns.md` (decisions D1 to D9, section 3 "Authentication (Better Auth)" and "Rate limits", section 4 data model, section 6 row 1B, section 7 gates, section 8 risks). **Spec:** `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md` sections 4, 5, 12 and 14. **1A plan:** `docs/superpowers/plans/2026-11-11-phase-1a-foundation.md` (built and merged on `development`, commit `6df399a`).

**Exit criteria for 1B (master plan section 6):** sign in and out work for the three kinds; sessions expire as specified; tenant roles cannot read the auth tables (tested). The table in the self-review at the end shows which task proves each, and the guards the master plan lists (three Better Auth quirks, password policy, rate limits, reset, `admin:create`).

---

## How to work through this plan

- Work on the `development` branch in `/Users/a12345/Desktop/AI/Fynix Digital/fynix-leads`. Commit after each task. Never push, never commit to `main`.
- Commit messages are plain: no attribution lines, no em or en dashes (the copy rule covers commit messages, code, comments and docs).
- Run every command from the repository root. A block headed **File** is the complete content of that file. A block headed **Edit** shows the exact text to find (it occurs once) and the text to put in its place.
- The plan has two parts. **Part A** is server code with no UI and every line of it was run. **Part B** builds three new screens, so it opens with a task that produces visual comps for the owner to approve, and the component markup is written only after that approval (the owner's standing rule). Part B states routes, data flow, form states, accessibility, tests and acceptance checks, and marks every place where markup is finalised after comp approval.
- TDD order inside a task: write the test, run it and see it fail for the stated reason, write the code, run it and see it pass. Where a step says "Expected: FAIL", a pass means the test is wrong.
- Read `AGENTS.md` before touching Next.js code. Part A touches no route and no component; it adds `server/auth/actions.ts` and `server/auth/guard.ts`, which use `next/headers` and `next/navigation`. Part B reads `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md` and `forms.md` first.
- This machine runs one Postgres 16 shared with other projects. This plan creates no new role and no new database. The dev and test databases are the 1A ones.
- Machines that ran `pnpm env:init` before this phase lack three variables (Task 1, Step 8 shows the one-line fix).
- Typing in the plan: no `any`, no casts except where a test needs a fake and says so. Use the `@/` import alias.

## Decisions in this plan that sharpen or correct the master plan

| # | Decision | Why |
|---|---|---|
| B1 | Pin Better Auth **1.7.20**, not the newest 1.7.21. | 1.7.21 was published on 2026-11-11, less than a day before this plan. pnpm 11 holds back releases younger than a day and only installs one after writing a `minimumReleaseAgeExclude` entry for eight packages. An authentication library is where a cooling-off period belongs, so the newest release that passes pnpm's own gate is pinned. The whole suite also passed on 1.7.21 (verification appendix), so the bump is one line once it has aged. |
| B2 | Auth ids are UUIDs: `advanced.database.generateId: "uuid"` and `uuid` columns with a database default. | The scope helper rejects any `app.user_id` that is not a UUID, and later tables (`terms_acceptance`, `audit_log`) reference users. Better Auth's default 21 character text ids would force a second id type. With `"uuid"` the id of a never-stored duplicate user (guard 2) is also a valid UUID, so the row check is a plain query. |
| B3 | Better Auth's HTTP handler is never mounted. A source test fails if a route serves it. | Its built-in routes would be a second way to sign in that skips our Postgres rate limits and our password rules. Everything the app needs is `auth.api.*` called from server code. |
| B4 | `member` carries `org_kind`, pinned by a composite foreign key to `organisation(id, kind)`, has one row per user, and has a `status` (`active`, `suspended`). `leads_auth` reads five columns of it and has no grant on `organisation`. | The master plan says session resolution needs organisation id and kind and that `leads_auth` reads `member`. Copying the kind (the campaign pattern from 1A) means no grant on `organisation` is needed. One row per user means a session resolves to exactly one role. Nothing is deleted (D8), so a suspension needs a status, and resolution must refuse a suspended member on the very next request. |
| B5 | In 1B **only `leads_auth` holds any privilege on `user`, `session`, `account`, `verification` and `member`**. `leads_fynix` gets none of them. This replaces the master plan's "Fynix: all" for the auth tables. | The owner's brief for 1B is that only `leads_auth` touches the auth tables. Phase 1C adds the Fynix grants (member writes, a column-limited read of user names and emails) together with the admin screens that need them, each with its own test. The access matrix test lists the roles for every table, so a widening is a visible edit. |
| B6 | Session lifetimes are fixed: 14 days for client and agency, 12 hours for Fynix. A session-create hook sets `expires_at` by organisation kind, Better Auth's refresh is off, and session resolution checks the age a second time from `created_at`. | Better Auth has one global lifetime. Left alone, its refresh would turn a Fynix session into a 14 day one after a day of use. The second check means a configuration slip cannot lengthen a Fynix session. Known and accepted: the cookie's `Max-Age` is the longest lifetime (14 days), so a Fynix browser keeps a dead cookie for up to 14 days; the server refuses it. |
| B7 | Breached passwords are checked through the Have I Been Pwned k-anonymity range API (five hash characters leave the machine) behind an injectable `BreachChecker`. **When the service is down the password is refused** with "try again in a minute". `PASSWORD_BREACH_CHECK=off` exists for development without a network and the environment schema refuses it on an https origin. | Failing open would silently lower the bar for every invite and reset during an outage that nobody would notice. The outage is rare, a person can retry, and the Fynix admin password is the weakest link until gate G1. Tests use a fake, so they never reach the network. |
| B8 | The network address for rate limits is `x-real-ip` only; `x-forwarded-for` is never read. Reset requests (per network, per account) and reset token attempts get limits as well as sign-in. | nginx appends to `x-forwarded-for`, so its first entry is whatever the client sent, and the sibling repository's limiter reads exactly that. nginx can overwrite `x-real-ip` (a phase 6 deployment requirement, written into `CLAUDE.md`). The spec asks for limits on sign-in, invite and reset; invites are 1C. |
| B9 | The reset flow does need the outbox, so the minimal `email_outbox` table is added (recipient, template, subject, body, status) with a development transport. `leads_public` has `INSERT` on the whole table and no `SELECT`; nothing reads it but the owner (`pnpm mail:last`). | The reset link has to go somewhere a developer can open it. The grant is table-wide because Drizzle names every column in an `INSERT` (the defaulted ones as `DEFAULT`) and Postgres wants the privilege on each column named. Phase 1C adds the Brevo transport and the remaining columns. |
| B10 | `pnpm admin:create` writes the Fynix organisation and the first membership as the owner role (like `pnpm db:seed`), creates the account through the normal grant and password rules, and removes the account again if the membership cannot be written. The single Fynix organisation has the fixed reference `ORG-FYNX` and a partial unique index allows no second one. | The first admin must exist before anything can act as one, so the bootstrap cannot go through the Fynix role. Everything after it does. |
| B11 | The second-factor extension point is `secondFactorSatisfied` in `server/auth/second-factor.ts`. `resolveSessionContext` calls it for every session and treats `false` as "not signed in". Today it returns `true` for every session. | Decision D3 and gate G1: password only now, a second factor before any real data. G1 then changes one function. No second factor is built here. |
| B12 | Better Auth's cookie cache is off, its cookies get the prefix `fynix-leads`, and it reads the client address from `x-real-ip`. Cookies are host-only (a source test refuses `crossSubDomainCookies`). | A cached session would keep working after a revoke. The prefix makes the cookie name ours and lets `lib/auth/session-cookie.ts` tell "no cookie" from "ended session". |
| B13 | The seed gains users: `SeededOrganisation` gets a `kind`, `seedWorld(owner, { withUsers })` writes one user per organisation with a credential account, a live session and a reset token, and the leak matrix forbids every one of those values to every tenant. | The leak matrix has to be able to find a leaked email, hash or token. The auth tests pass `withUsers: false` and create real users through the grant. |
| B14 | The reset link is `/reset-password?token=...` on `APP_ORIGIN`. Part B serves that page with `Referrer-Policy: no-referrer`. | The token is a query value on a page that links nowhere else; no referrer header means it cannot leak onward. |
| B15 | The post sign-in `next` value goes through `safeNextPath` (a path on this site only, never an auth page). Server actions return an `AuthFormState` that carries the typed email and never the password. | An open redirect after sign-in is a standard phishing route. React 19 resets a form after its action runs, so a failed attempt would blank the email field unless the state carries it back (found while checking Part B against a throwaway page). |

## File structure

New files:

| File | Responsibility |
|---|---|
| `server/db/schema/auth.ts` | Drizzle tables `user`, `session`, `account`, `verification` (Better Auth's fields, uuid ids). |
| `server/db/schema/member.ts`, `rate-limit.ts`, `email-outbox.ts` | The `member`, `rate_limit` and `email_outbox` tables. |
| `server/db/migrations/0006_auth_and_member.sql` | Generated DDL for all of the above plus the one-Fynix-organisation index. |
| `server/db/migrations/0007_auth_grants.sql` to `0010_email_outbox_grants.sql` | Hand-written row-level security, grants and policies, one file per group of tables. |
| `lib/auth/password-policy.ts` | The length rule and its hint. Pure, usable by forms. |
| `lib/auth/email.ts`, `session-lifetime.ts`, `rate-limit-rules.ts`, `next-path.ts`, `messages.ts`, `form-state.ts`, `session-cookie.ts` | Pure rules and copy: address normalising, lifetimes by kind, the rate limit rules, the safe `next` path, every message a person reads, the action state type, the cookie names. |
| `server/auth/breach-check.ts` | `BreachChecker`, the Have I Been Pwned client, the "unavailable" error. |
| `server/auth/mail.ts` | `MailTransport`, the development outbox transport, the reset message and mailer. |
| `server/auth/account-creation-grant.ts` | `withAccountCreationGrant`: the only way an account is created. |
| `server/auth/rate-limit.ts` | Postgres fixed-window limits keyed by SHA-256, as `leads_public`. |
| `server/auth/membership.ts`, `errors.ts` | The membership read as `leads_auth`; Better Auth error codes. |
| `server/auth/create-auth.ts` | `createAuth`: the Better Auth instance, the password hook, the secret guard, the create-user and create-session hooks. |
| `server/auth/create-account.ts` | `createAccountWithGrant`, with the stored-row check (guard 2). |
| `server/auth/sign-in.ts`, `password-reset.ts` | The sign-in and reset services (rate limits first, then Better Auth). |
| `server/auth/second-factor.ts`, `session-context.ts` | The G1 extension point; session to member to kind to role. |
| `server/auth/client-address.ts` | The network address for rate limits. |
| `server/auth/with-session.ts` | Resolved session to role pool, through the existing scope helpers (`server-only`). |
| `server/auth/index.ts` | `getAuth`, `getAuthServices`, `getSessionContext` for the running app (`server-only`). |
| `server/auth/guard.ts`, `actions.ts` | `requireSessionContext` (`server-only`); the server actions for the forms (`use server`). |
| `server/auth/admin-create.ts`, `server/prompt.ts` | Create the first Fynix admin; read a password without echo. |
| `scripts/admin-create.ts`, `scripts/mail-last.ts` | `pnpm admin:create`, `pnpm mail:last`. |
| `server/auth/testing.ts` | The auth integration harness: real Better Auth on the test database, a fake breach service. |
| `server/auth/*.test.ts`, `*.integration.test.ts`, `lib/auth/*.test.ts` | Unit and integration tests. |
| `server/env-auth.test.ts` | Tests for the three new environment variables. |

Edited files: `package.json`, `server/env.ts`, `server/env-init.ts`, `.env.example`, `server/db/schema/enums.ts`, `index.ts`, `organisation.ts`, `server/db/testing/seed.ts`, `structure.ts`, `leak-matrix.ts`, `server/db/structure.integration.test.ts`, `CLAUDE.md`, `README.md`. Part B adds routes under `app/`.

---

# PART A: Server (no UI)

## Task 1: Dependency, scripts and the sign-in environment variables

**Files:**
- Modify: `package.json`, `server/env.ts`, `server/env-init.ts`, `.env.example`
- Create: `server/env-auth.test.ts`

Three variables join the runtime environment: `BETTER_AUTH_SECRET` (signs the session cookie), `APP_ORIGIN` (the origin the app is served from, also the only origin Better Auth trusts) and the optional `PASSWORD_BREACH_CHECK`. `pnpm env:init` writes them for new machines.

- [ ] **Step 1: Confirm a clean start**

```bash
cd "/Users/a12345/Desktop/AI/Fynix Digital/fynix-leads"
git checkout development
git status --short
pnpm test
pnpm test:integration
```

Expected: no output from `git status` (commit this plan first if it is listed). `pnpm test`: 35 files, 504 tests pass. `pnpm test:integration`: 4 files, 162 tests pass. These are the 1A numbers this plan builds on.

- [ ] **Step 2: Add Better Auth, pinned exactly**

```bash
pnpm add -E better-auth@1.7.20
git diff --stat package.json pnpm-lock.yaml pnpm-workspace.yaml
```

Expected: `package.json` gains `"better-auth": "1.7.20"` under `dependencies` and `pnpm-lock.yaml` changes. `pnpm-workspace.yaml` must **not** change: 1.7.20 is older than pnpm's one day release-age gate, so pnpm adds no `minimumReleaseAgeExclude` entry. (`pnpm add -E better-auth@1.7.21` would add eight, which is why 1.7.20 is pinned: decision B1.) If a `minimumReleaseAgeExclude` block appears, revert `pnpm-workspace.yaml` and check the version you asked for.

- [ ] **Step 3: Write the failing environment test**

**File:** `server/env-auth.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { buildEnvFile, generateSecrets } from "@/server/env-init";
import { describeEnvProblems, runtimeEnvSchema } from "@/server/env";

/** The environment `pnpm env:init` writes, which the phase 1B variables are part of. */
function environment(): Record<string, string> {
  const entries = buildEnvFile(generateSecrets("tester"))
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const);
  return Object.fromEntries(entries);
}

const problems = (source: Record<string, string>): string[] => describeEnvProblems(source, runtimeEnvSchema);

describe("the sign-in variables", () => {
  it("env:init writes a 64 character secret, a local origin and the breach check on", () => {
    const env = environment();
    expect(env.BETTER_AUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(env.APP_ORIGIN).toBe("http://localhost:3020");
    expect(env.PASSWORD_BREACH_CHECK).toBe("hibp");
    expect(problems(env)).toEqual([]);
  });

  it("names a secret under 32 characters and never prints it", () => {
    const result = problems({ ...environment(), BETTER_AUTH_SECRET: "x".repeat(31) });
    expect(result).toEqual(["BETTER_AUTH_SECRET: invalid, must be at least 32 characters"]);
  });

  it.each(["https://leads.fynix.digital/", "https://leads.fynix.digital/app", "leads.fynix.digital", "ftp://leads.fynix.digital"])("refuses the origin %s", (value) => {
    expect(problems({ ...environment(), APP_ORIGIN: value })).toEqual(["APP_ORIGIN: invalid, must be an http:// or https:// origin, with no path and no trailing slash"]);
  });

  it("accepts https and http origins", () => {
    expect(problems({ ...environment(), APP_ORIGIN: "https://leads.fynix.digital" })).toEqual([]);
    expect(problems({ ...environment(), APP_ORIGIN: "http://app.localhost:3020" })).toEqual([]);
  });

  it("treats an empty PASSWORD_BREACH_CHECK as unset, and refuses an unknown value", () => {
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "" })).toEqual([]);
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "maybe" })).toHaveLength(1);
  });

  it("allows the breach check to be off on http and refuses it on https", () => {
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off" })).toEqual([]);
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off", APP_ORIGIN: "https://leads.fynix.digital" })).toEqual([
      "PASSWORD_BREACH_CHECK: invalid, off is not allowed on an https deployment",
    ]);
  });
});
```

- [ ] **Step 4: Run it and see it fail**

```bash
pnpm exec vitest run server/env-auth.test.ts
```

Expected: FAIL, 8 of the 9 tests fail (everything except `accepts https and http origins`), for example `TypeError: .toMatch() expects to receive a string, but got undefined` for the generated secret.

- [ ] **Step 5: Extend the environment schema**

**Edit:** `server/env.ts`

Replace:

```typescript
const postgresUrl = z.string().refine(isPostgresUrl, "must be a postgres:// or postgresql:// URL");
```

With:

```typescript
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}

const postgresUrl = z.string().refine(isPostgresUrl, "must be a postgres:// or postgresql:// URL");
const origin = z.string().refine(isOrigin, "must be an http:// or https:// origin, with no path and no trailing slash");
/** A variable left empty in an env file counts as not set. */
const emptyAsMissing = (value: unknown): unknown => (value === "" ? undefined : value);
```

**Edit:** `server/env.ts`

Replace:

```typescript
/** What the running app needs: one connection string per runtime role. The owner role is never in the app. */
export const runtimeEnvSchema = z.object({
  DATABASE_URL_AUTH: postgresUrl,
  DATABASE_URL_FYNIX: postgresUrl,
  DATABASE_URL_CLIENT: postgresUrl,
  DATABASE_URL_AGENCY: postgresUrl,
  DATABASE_URL_PUBLIC: postgresUrl,
});
```

With:

```typescript
/**
 * What the running app needs: one connection string per runtime role (the owner role is never in the app), the secret
 * that signs sessions, and the origin the app is served from.
 */
export const runtimeEnvSchema = z
  .object({
    DATABASE_URL_AUTH: postgresUrl,
    DATABASE_URL_FYNIX: postgresUrl,
    DATABASE_URL_CLIENT: postgresUrl,
    DATABASE_URL_AGENCY: postgresUrl,
    DATABASE_URL_PUBLIC: postgresUrl,
    /** Signs the session cookie. A shorter one is refused here and again in createAuth, because Better Auth only warns. */
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    APP_ORIGIN: origin,
    /** `off` skips the breached-password check, for development without a network. Unset means `hibp`. */
    PASSWORD_BREACH_CHECK: z.preprocess(emptyAsMissing, z.enum(["hibp", "off"]).optional()),
  })
  .refine((env) => !(env.PASSWORD_BREACH_CHECK === "off" && env.APP_ORIGIN.startsWith("https://")), {
    path: ["PASSWORD_BREACH_CHECK"],
    message: "off is not allowed on an https deployment",
  });
```

**Edit:** `server/env.ts`

Replace:

```typescript
  const runtime = RUNTIME_ROLES.map((role) => urlVariable(role, "dev"));
```

With:

```typescript
  const runtime = [...RUNTIME_ROLES.map((role) => urlVariable(role, "dev")), "BETTER_AUTH_SECRET", "APP_ORIGIN", "PASSWORD_BREACH_CHECK"];
```

- [ ] **Step 6: Make `env:init` write them**

**Edit:** `server/env-init.ts`

Replace:

```typescript
  readonly passwords: Readonly<Record<RoleName, string>>;
}
```

With:

```typescript
  readonly passwords: Readonly<Record<RoleName, string>>;
  /** Signs session cookies: 32 random bytes as hex, 64 characters. */
  readonly authSecret: string;
}
```

**Edit:** `server/env-init.ts`

Replace:

```typescript
  return { superuser, passwords };
```

With:

```typescript
  return { superuser, passwords, authSecret: randomBytes(32).toString("hex") };
```

**Edit:** `server/env-init.ts`

Replace:

```typescript
    "# Integration tests: the same roles on the test database.",
```

With:

```typescript
    "# Sign-in: the secret that signs session cookies, and the origin the app is served from.",
    `BETTER_AUTH_SECRET=${secrets.authSecret}`,
    "APP_ORIGIN=http://localhost:3020",
    "# `hibp` checks new passwords against known breaches. `off` skips the check (development without a network only).",
    "PASSWORD_BREACH_CHECK=hibp",
    "",
    "# Integration tests: the same roles on the test database.",
```

**Edit:** `.env.example`

Replace:

```
DATABASE_URL_PUBLIC=

# Integration tests
```

With:

```
DATABASE_URL_PUBLIC=

# The running app: the secret that signs session cookies (32 characters or more, random) and the origin it is served
# from, with no path and no trailing slash. PASSWORD_BREACH_CHECK is optional: hibp (the default) or off, which skips the
# breached-password check for development without a network and is refused on an https origin.
BETTER_AUTH_SECRET=
APP_ORIGIN=
PASSWORD_BREACH_CHECK=

# Integration tests
```

- [ ] **Step 7: Add the two scripts to `package.json`**

**Edit:** `package.json`

Replace:

```json
    "db:seed": "tsx scripts/db-seed.ts"
```

With:

```json
    "db:seed": "tsx scripts/db-seed.ts",
    "admin:create": "tsx scripts/admin-create.ts",
    "mail:last": "tsx scripts/mail-last.ts"
```

- [ ] **Step 8: Run the tests, and fix this machine's `.env.local`**

```bash
pnpm test
pnpm env:check
```

Expected: `pnpm test`: 36 files, 513 tests pass (the 504 of 1A and the 9 new ones). `pnpm env:check` names the three variables as missing, because your `.env.local` predates them. Append them (new machines get them from `pnpm env:init`):

```bash
printf 'BETTER_AUTH_SECRET=%s\nAPP_ORIGIN=http://localhost:3020\nPASSWORD_BREACH_CHECK=hibp\n' "$(openssl rand -hex 32)" >> .env.local
pnpm env:check
```

Expected: `Environment OK.` The existing `.env.example` test passes because it compares the file with the schema.

- [ ] **Step 9: Commit**

```bash
pnpm lint
git add package.json pnpm-lock.yaml server/env.ts server/env-init.ts server/env-auth.test.ts .env.example
git commit -m "Add Better Auth 1.7.20 and the sign-in environment variables"
```

---

## Task 2: Schema, generated DDL, grants and policies

**Files:**
- Create: `server/db/schema/auth.ts`, `member.ts`, `rate-limit.ts`, `email-outbox.ts`
- Modify: `server/db/schema/enums.ts`, `index.ts`, `organisation.ts`
- Create (by drizzle-kit, then edited): `server/db/migrations/0006_auth_and_member.sql` to `0010_email_outbox_grants.sql` and their snapshots

What the migrations do:

- **0006** is generated DDL for the four auth tables, `member`, `rate_limit`, `email_outbox`, four enums and the partial unique index that allows one Fynix organisation.
- **0007 to 0010** are hand-written (`pnpm db:generate --custom`): row-level security, grants and policies. Only `leads_auth` is granted anything on the auth tables and on `member`; only `leads_public` on `rate_limit` and `email_outbox`. No tenant role gets anything.

- [ ] **Step 1: Enums**

**File:** `server/db/schema/enums.ts`

```typescript
import { pgEnum } from "drizzle-orm/pg-core";

export const organisationKind = pgEnum("organisation_kind", ["fynix", "client", "agency"]);
export const organisationStatus = pgEnum("organisation_status", ["active", "archived"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "active", "paused", "completed"]);
export const memberRole = pgEnum("member_role", ["member", "manager"]);
export const memberStatus = pgEnum("member_status", ["active", "suspended"]);
export const emailTemplate = pgEnum("email_template", ["password_reset"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed"]);
```

- [ ] **Step 2: The auth tables**

**File:** `server/db/schema/auth.ts`

```typescript
import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Better Auth's four tables. Property names are the field names Better Auth uses, so the adapter maps them with no
 * configuration; column names are snake_case. Ids are UUIDs, generated by Better Auth (`advanced.database.generateId`
 * is "uuid" in server/auth/create-auth.ts) and defaulted by the database, so `app.user_id` in the scope helper is
 * always a UUID. Only `leads_auth` holds any privilege on these tables (migration 0007).
 */

export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Always stored in lower case: Better Auth lowercases it, and the check below keeps anything else from writing it. */
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("user_email_lowercase", sql`${table.email} = lower(${table.email})`)],
);

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    /** The scrypt hash of the password. Never readable by anyone but `leads_auth`. */
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

/** Password reset tokens live here: `identifier` is `reset-password:<token>`, `value` is the user id. */
export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
```

- [ ] **Step 3: `member`, `rate_limit`, `email_outbox`**

**File:** `server/db/schema/member.ts`

```typescript
import { foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { memberRole, memberStatus, organisationKind } from "./enums";
import { organisation } from "./organisation";

/**
 * Which organisation a user belongs to, and so which kind of user they are. Session resolution reads this one table
 * (as `leads_auth`) to learn the organisation id and kind and so pick the role pool.
 *
 * - One row per user (`member_user_unique`): a person belongs to exactly one organisation, so a session resolves to
 *   exactly one role. Someone who works for a client and an agency uses two email addresses.
 * - `org_kind` is a copy of the organisation's kind, pinned by the composite foreign key, so session resolution
 *   needs no grant on `organisation`.
 * - A suspended member keeps their rows but cannot sign in and their sessions stop resolving.
 * Phase 1C adds the admin features (invite, suspend, alias).
 */
export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    orgId: uuid("org_id").notNull(),
    orgKind: organisationKind("org_kind").notNull(),
    role: memberRole("role").notNull().default("member"),
    displayName: text("display_name").notNull(),
    status: memberStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("member_user_unique").on(table.userId),
    foreignKey({ name: "member_org_fk", columns: [table.orgId, table.orgKind], foreignColumns: [organisation.id, organisation.kind] }),
    index("member_org_idx").on(table.orgId),
  ],
);
```

**File:** `server/db/schema/rate-limit.ts`

```typescript
import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window counters for the rate limits (server/auth/rate-limit.ts). One row per key per window. `key_hash` is the
 * SHA-256 of the key, so no email address and no network address is ever stored. Only `leads_public` reads or writes it.
 */
export const rateLimit = pgTable(
  "rate_limit",
  {
    keyHash: text("key_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.keyHash, table.windowStart] }), check("rate_limit_count_positive", sql`${table.count} >= 1`)],
);
```

**File:** `server/db/schema/email-outbox.ts`

```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { emailTemplate, outboxStatus } from "./enums";

/**
 * Messages waiting to be sent. Phase 1B only writes it (the development transport, server/auth/mail.ts) so the
 * password reset flow has somewhere to put its link; nothing reads it but a developer. Phase 1C adds the Brevo transport,
 * the attempts and provider columns, and the purge of link emails.
 */
export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipient: text("recipient").notNull(),
  template: emailTemplate("template").notNull(),
  subject: text("subject").notNull(),
  /** Plain text. In development this holds the reset link, which is the point. */
  body: text("body").notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**File:** `server/db/schema/index.ts`

```typescript
export * from "./enums";
export * from "./organisation";
export * from "./campaign";
export * from "./auth";
export * from "./member";
export * from "./rate-limit";
export * from "./email-outbox";
```

**Edit:** `server/db/schema/organisation.ts`

Replace:

```typescript
import { check, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
```

With:

```typescript
import { check, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
```

**Edit:** `server/db/schema/organisation.ts`

Replace:

```typescript
    check("organisation_client_has_brand", sql`${table.kind} <> 'client' OR ${table.brandName} IS NOT NULL`),
  ],
```

With:

```typescript
    check("organisation_client_has_brand", sql`${table.kind} <> 'client' OR ${table.brandName} IS NOT NULL`),
    // There is exactly one Fynix organisation. `pnpm admin:create` finds it or creates it, and member rows of kind
    // `fynix` point at it.
    uniqueIndex("organisation_one_fynix").on(table.kind).where(sql`${table.kind} = 'fynix'`),
  ],
```

- [ ] **Step 4: Generate the DDL and the four empty custom migrations**

```bash
pnpm db:generate --name=auth_and_member
pnpm db:generate --custom --name=auth_grants
pnpm db:generate --custom --name=member_grants
pnpm db:generate --custom --name=rate_limit_grants
pnpm db:generate --custom --name=email_outbox_grants
```

Expected: five new SQL files `0006` to `0010` and five snapshots in `server/db/migrations/meta/`, and five new journal entries. Open `0006_auth_and_member.sql` and compare it with this (drizzle-kit wrote it; yours must match exactly):

```sql
CREATE TYPE "public"."email_template" AS ENUM('password_reset');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('member', 'manager');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_email_lowercase" CHECK ("user"."email" = lower("user"."email"))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"org_kind" "organisation_kind" NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"display_name" text NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limit_key_hash_window_start_pk" PRIMARY KEY("key_hash","window_start"),
	CONSTRAINT "rate_limit_count_positive" CHECK ("rate_limit"."count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient" text NOT NULL,
	"template" "email_template" NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_org_fk" FOREIGN KEY ("org_id","org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "member_user_unique" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_org_idx" ON "member" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_one_fynix" ON "organisation" USING btree ("kind") WHERE "organisation"."kind" = 'fynix';
```

drizzle-kit takes each journal `when` from the machine clock. The journal test (`migration-journal.test.ts`) requires every `when` to be above the one before; the 1A entries are dated 2026-11-11, so a normal clock passes. If it does not, edit the new `when` values by hand to larger numbers.

- [ ] **Step 5: Write the four grants migrations**

**File:** `server/db/migrations/0007_auth_grants.sql`

```sql
-- Row-level security and grants for Better Auth's four tables. See 0002 for the rules.
--
-- Only leads_auth holds any privilege on these tables, and the structural test (server/db/structure.integration.test.ts,
-- "only leads_auth touches the auth table") fails if any other runtime role ever does. The tenant roles and leads_public
-- get nothing, so a query bug or an injected statement on a tenant connection cannot read an email address, a password
-- hash, a session token or a reset token.
--
-- Grants are the least Better Auth needs for the flows this app uses: no DELETE on user or account (nothing is deleted),
-- and DELETE on session (sign out, expiry, revoke on password reset) and verification (a reset token is consumed).
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "user" TO leads_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "session" TO leads_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "account" TO leads_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "verification" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "user_auth_all" ON "user" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "session_auth_all" ON "session" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "account_auth_all" ON "account" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "verification_auth_all" ON "verification" AS PERMISSIVE FOR ALL TO leads_auth USING (true) WITH CHECK (true);
```

**File:** `server/db/migrations/0008_member_grants.sql`

```sql
-- Row-level security and grants for member. See 0002 for the rules.
--
-- leads_auth reads the five columns session resolution needs (who, which organisation, what kind, what role, active or
-- not), and cannot write the table: a compromised sign-in code path cannot move a user into another organisation or
-- reactivate a suspended one. Nobody else holds a grant yet. Fynix gets its write grant in phase 1C with the admin
-- screens; the client and agency roles get a column-limited read of their organisation-mates in phase 1E.
ALTER TABLE "member" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ("user_id", "org_id", "org_kind", "role", "status") ON "member" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "member_auth_read" ON "member" AS PERMISSIVE FOR SELECT TO leads_auth USING (true);
```

**File:** `server/db/migrations/0009_rate_limit_grants.sql`

```sql
-- Row-level security and grants for rate_limit. See 0002 for the rules.
--
-- Only leads_public, the role for callers who are not signed in. A rate-limit call is an upsert and a delete of the
-- key's older windows, plus a purge of stale rows, so it needs all four privileges on this one table and nothing else.
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limit" TO leads_public;
--> statement-breakpoint
CREATE POLICY "rate_limit_public_all" ON "rate_limit" AS PERMISSIVE FOR ALL TO leads_public USING (true) WITH CHECK (true);
```

**File:** `server/db/migrations/0010_email_outbox_grants.sql`

```sql
-- Row-level security and grants for email_outbox. See 0002 for the rules.
--
-- leads_public may add a message and nothing else: it cannot read what is queued, so the reset flow, which runs for a
-- caller who is not signed in, cannot be used to read another person's reset link. The grant is on the whole table because
-- Drizzle names every column in an INSERT (the defaulted ones as DEFAULT), and Postgres wants the privilege on each column
-- named. The policy has no SELECT side, and no role has a SELECT grant, so nothing but the owner (and so a developer,
-- through `pnpm mail:last`) reads the table.
ALTER TABLE "email_outbox" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT INSERT ON "email_outbox" TO leads_public;
--> statement-breakpoint
CREATE POLICY "email_outbox_public_insert" ON "email_outbox" AS PERMISSIVE FOR INSERT TO leads_public WITH CHECK (true);
```

- [ ] **Step 6: Migrate and confirm the snapshots are consistent**

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:test
pnpm test
```

Expected: `pnpm db:generate` prints `No schema changes, nothing to migrate`; both migrate commands print `Migrations applied to the ... database.`; `pnpm test`: 36 files, 513 tests pass (the journal test passes with the new entries).

- [ ] **Step 7: Run the integration suite and see exactly one test fail**

```bash
pnpm exec vitest run --config vitest.integration.config.mts
```

Expected: FAIL, 5 tests, all of the form `<role>: every table it holds no grant on is unreadable`, in `structure.integration.test.ts`. That test hard-coded how many tables each role holds nothing on ("2"), which was true for two tables and is not true for nine. Task 3 replaces it with a test driven by an explicit access matrix. Nothing else fails: the new tables are already covered by the automatic checks (row-level security on, a policy for each role that holds a grant, no PUBLIC grant, no table-level grant for a tenant).

- [ ] **Step 8: Commit**

```bash
git add server/db/schema server/db/migrations
git commit -m "Add the auth tables, member, rate limits and the outbox, with grants only for leads_auth and leads_public"
```

---

## Task 3: The access matrix, seeded users and the leak matrix probes

**Files:** Modify `server/db/testing/structure.ts`, `server/db/structure.integration.test.ts`, `server/db/testing/seed.ts`, `server/db/testing/leak-matrix.ts`

This task is what makes "tenant roles cannot read the auth tables" a test and not a hope:

- `rolesWithAnyPrivilege(table)` returns every runtime role that holds any privilege on a table, at table or column level (read, insert, update, delete, truncate, references, trigger).
- An **access matrix** lists, for every table, the roles that may touch it. It must list every table, so adding a table without saying who may touch it fails.
- The four auth tables are asserted to belong to `leads_auth` alone.
- The seed gets users with distinct emails, password hashes, session tokens and reset tokens; the leak matrix forbids all of them to every tenant, and gains probes that read and write every new table.

- [ ] **Step 1: Add `rolesWithAnyPrivilege`**

**Edit:** `server/db/testing/structure.ts`

Replace:

```typescript
/** Quotes a catalog identifier for use in test SQL. */
```

With:

```typescript
/**
 * The runtime roles that hold any privilege on a public table, at table level or on any column: read, insert, update,
 * delete, truncate, references or trigger. The access matrix in structure.integration.test.ts compares this with what
 * each table is meant to allow, so a grant nobody intended shows up as a test failure naming the table and the role.
 */
export function rolesWithAnyPrivilege(executor: Executor, table: string): Promise<string[]> {
  return offenders(
    executor,
    sql`select r.rolname::text as offender
        from pg_roles r cross join lateral (select to_regclass(format('public.%I', ${table}::text)) as rel) t
        where r.rolname in (${sql.raw(RUNTIME)}) and t.rel is not null
          and (has_any_column_privilege(r.oid, t.rel, 'SELECT') or has_any_column_privilege(r.oid, t.rel, 'INSERT')
            or has_any_column_privilege(r.oid, t.rel, 'UPDATE') or has_any_column_privilege(r.oid, t.rel, 'REFERENCES')
            or has_table_privilege(r.oid, t.rel, 'DELETE') or has_table_privilege(r.oid, t.rel, 'TRUNCATE')
            or has_table_privilege(r.oid, t.rel, 'TRIGGER'))
        order by 1`,
  );
}

/** Quotes a catalog identifier for use in test SQL. */
```

- [ ] **Step 2: Add the access matrix tests, and replace the hard-coded count**

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
  publicTables,
  quoteIdentifier,
  roleMemberships,
  roleProblems,
```

With:

```typescript
  publicTables,
  quoteIdentifier,
  roleMemberships,
  roleProblems,
  rolesWithAnyPrivilege,
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
describe("each catalog check finds a deliberately broken object", () => {
```

With:

```typescript
/**
 * Which runtime roles hold any privilege on each table. Every table must be listed, so adding a table without saying who
 * may touch it fails here. The four auth tables belong to leads_auth alone: a tenant role, leads_fynix and leads_public
 * holding any privilege on them is a failure, and widening this list is a deliberate change that shows up in review.
 */
const EXPECTED_ACCESS: Readonly<Record<string, readonly RuntimeRoleName[]>> = {
  organisation: ["leads_fynix", "leads_client", "leads_agency"],
  campaign: ["leads_fynix", "leads_client", "leads_agency"],
  user: ["leads_auth"],
  session: ["leads_auth"],
  account: ["leads_auth"],
  verification: ["leads_auth"],
  member: ["leads_auth"],
  rate_limit: ["leads_public"],
  email_outbox: ["leads_public"],
};
const AUTH_TABLES = ["user", "session", "account", "verification"] as const;

describe("access matrix", () => {
  it("lists every table, and no table that does not exist", async () => {
    expect(Object.keys(EXPECTED_ACCESS).sort()).toEqual(await publicTables(dbs.owner.db));
  });

  it.each(Object.entries(EXPECTED_ACCESS))("%s is touched by exactly the roles the matrix names", async (table, roles) => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, table)).toEqual([...roles].sort());
  });

  it.each(AUTH_TABLES)("only leads_auth touches the auth table %s", async (table) => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, table)).toEqual(["leads_auth"]);
  });

  it("only leads_auth reads member, and it cannot write it", async () => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, "member")).toEqual(["leads_auth"]);
    for (const privilege of ["INSERT", "UPDATE"]) {
      const allowed = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_any_column_privilege('leads_auth', 'public.member', '${privilege}') as allowed`));
      expect(allowed.rows, privilege).toEqual([{ allowed: false }]);
    }
  });

  it("leads_public may add to the outbox and nothing else: it cannot read, change or remove what is queued", async () => {
    const db = dbs.roles.leads_public.db;
    await queryAs(db, null, "insert into email_outbox (recipient, template, subject, body) values ('a@example.com', 'password_reset', 's', 'b')");
    for (const statement of ["select * from email_outbox", "select body from email_outbox", "update email_outbox set body = 'x'", "delete from email_outbox"]) {
      expect(await captureErrorText(queryAs(db, null, statement)), statement).toContain("permission denied for table email_outbox");
    }
  });

  it("every role other than leads_auth is refused each auth table, whatever it asks for", async () => {
    for (const role of RUNTIME_ROLES.filter((candidate) => candidate !== "leads_auth")) {
      const scope = role === "leads_client" ? { orgId: world.kestrel.id, userId: USER } : role === "leads_agency" ? { orgId: world.brightpath.id, userId: USER } : { orgId: null, userId: USER };
      for (const table of AUTH_TABLES) {
        for (const statement of [`select * from ${quoteIdentifier(table)}`, `select id from ${quoteIdentifier(table)}`, `delete from ${quoteIdentifier(table)}`]) {
          const message = await captureErrorText(queryAs(dbs.roles[role].db, scope, statement));
          expect(message, `${role}: ${statement}`).toContain(`permission denied for table ${table}`);
        }
      }
    }
  });
});

describe("each catalog check finds a deliberately broken object", () => {
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
  it("CREATE on the schema and TEMPORARY on the database", async () => {
```

With:

```typescript
  it("any privilege on a table, at table or column level, for a role the matrix does not expect", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_access (a int, b int)",
        "grant insert (a) on public.broken_access to leads_client",
        "grant truncate on public.broken_access to leads_agency",
        "grant select (b) on public.broken_access to leads_public",
        "grant references (a) on public.broken_access to leads_fynix",
      ],
      (executor) => rolesWithAnyPrivilege(executor, "broken_access"),
    );
    expect(found).toEqual(["leads_agency", "leads_client", "leads_fynix", "leads_public"]);
  });

  it("CREATE on the schema and TEMPORARY on the database", async () => {
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
      if ((await grantedColumns(dbs.owner.db, role, table)).length > 0) continue;
      // leads_fynix holds table-level grants, which grantedColumns also reports, so it never reaches here.
      checked += 1;
      const message = await captureErrorText(queryAs(unscoped(role), null, `select * from ${quoteIdentifier(table)}`));
      expect(message).toContain(`permission denied for table ${table}`);
    }
    // Only leads_auth and leads_public hold nothing on today's two tables; the other roles have a grant on both.
    expect(checked).toBe(role === "leads_auth" || role === "leads_public" ? 2 : 0);
```

With:

```typescript
      if (EXPECTED_ACCESS[table]?.includes(role)) continue;
      checked += 1;
      const message = await captureErrorText(queryAs(unscoped(role), null, `select * from ${quoteIdentifier(table)}`));
      expect(message).toContain(`permission denied for table ${table}`);
    }
    // The access matrix says which tables a role may touch; the access matrix tests prove the database agrees.
    expect(checked).toBe(Object.values(EXPECTED_ACCESS).filter((roles) => !roles.includes(role)).length);
```

(The test's title keeps the old name and `grantedColumns` is still used elsewhere in the file, so no import changes.)

- [ ] **Step 3: Give the seed users**

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
import { campaign, organisation } from "@/server/db/schema";
```

With:

```typescript
import { account, campaign, member, organisation, session, user, verification } from "@/server/db/schema";
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  readonly name: string;
  readonly brandName: string | null;
}

export interface SeededCampaign {
```

With:

```typescript
  readonly name: string;
  readonly brandName: string | null;
  readonly kind: "fynix" | "client" | "agency";
}

export interface SeededCampaign {
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
/**
 * Two client organisations, two agencies and a campaign for every pairing, so each tenant has rows that are its own
```

With:

```typescript
/** A person with a sign-in, and every secret that belongs to them, each distinct and findable as plain text. */
export interface SeededUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly organisation: SeededOrganisation;
  readonly passwordHash: string;
  readonly sessionToken: string;
  readonly resetToken: string;
}

/**
 * Two client organisations, two agencies and a campaign for every pairing, so each tenant has rows that are its own
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  /** Same objects as `brightpath` and `northgate`, in order. */
  readonly agencies: readonly SeededOrganisation[];
}
```

With:

```typescript
  /** Same objects as `brightpath` and `northgate`, in order. */
  readonly agencies: readonly SeededOrganisation[];
  /** One user per organisation, each with a password hash, a live session token and a reset token. */
  readonly users: readonly SeededUser[];
}
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
/** Writes through the owner connection, which bypasses row-level security. Test and dev databases only. */
export async function seedWorld(owner: DatabaseHandle): Promise<SeedWorld> {
```

With:

```typescript
/**
 * One user per organisation, written straight into the auth tables (no sign-in involved), with the rows a real sign-in
 * and a reset request would leave: a credential account, a live session and a reset token. The values are not valid
 * credentials; they exist so the leak matrix can search for them.
 */
async function seedUsers(owner: DatabaseHandle, organisations: readonly SeededOrganisation[]): Promise<SeededUser[]> {
  const { db } = owner;
  const users: SeededUser[] = [];
  for (const [index, organisation] of organisations.entries()) {
    const n = index + 1;
    const email = `person${n}@${organisation.publicRef.toLowerCase()}.example`;
    const name = `Person ${n} of ${organisation.publicRef}`;
    const row = firstRow(await db.insert(user).values({ email, name }).returning({ id: user.id }), `user ${email}`);
    const passwordHash = `HASH-${n}-not-a-real-scrypt-hash`;
    const sessionToken = `SESSION-TOKEN-${n}-not-a-real-token`;
    const resetToken = `RESET-TOKEN-${n}-not-a-real-token`;
    await db.insert(account).values({ accountId: row.id, providerId: "credential", userId: row.id, password: passwordHash });
    await db.insert(session).values({ token: sessionToken, userId: row.id, expiresAt: new Date(Date.now() + 3_600_000) });
    await db.insert(verification).values({ identifier: `reset-password:${resetToken}`, value: row.id, expiresAt: new Date(Date.now() + 3_600_000) });
    await db.insert(member).values({ userId: row.id, orgId: organisation.id, orgKind: organisation.kind, displayName: name });
    users.push({ id: row.id, email, name, organisation, passwordHash, sessionToken, resetToken });
  }
  return users;
}

/**
 * Writes through the owner connection, which bypasses row-level security. Test and dev databases only. Users are seeded
 * unless `withUsers` is false, which the auth tests use because they create real users through the account grant.
 */
export async function seedWorld(owner: DatabaseHandle, options: { readonly withUsers?: boolean } = {}): Promise<SeedWorld> {
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
    return { id: row.id, publicRef, name, brandName };
```

With:

```typescript
    return { id: row.id, publicRef, name, brandName, kind };
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate] };
```

With:

```typescript
  const users = options.withUsers === false ? [] : await seedUsers(owner, [fynix, kestrel, halden, brightpath, northgate]);
  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate], users };
```

- [ ] **Step 4: Extend the leak matrix**

**Edit:** `server/db/testing/leak-matrix.ts`

Replace:

```typescript
const DENIED_TABLE = /permission denied for table (campaign|organisation)$/m;
```

With:

```typescript
const DENIED_TABLE = /permission denied for table [a-z_]+$/m;
```

**Edit:** `server/db/testing/leak-matrix.ts`

Replace:

```typescript
  { name: "create a temporary table", statement: "create temp table leak (x int)", expectedError: /permission denied to create temporary tables/ },
];
```

With:

```typescript
  { name: "create a temporary table", statement: "create temp table leak (x int)", expectedError: /permission denied to create temporary tables/ },
  // Phase 1B: the auth tables, the member table and the tables only leads_public uses. No tenant role may read or write any of them.
  { name: "auth: every user", statement: 'select * from "user"', expectedError: DENIED_TABLE },
  { name: "auth: email addresses", statement: 'select email from "user"', expectedError: DENIED_TABLE },
  { name: "auth: probe users by WHERE on the email", statement: `select id from "user" where email like '%@%'`, expectedError: DENIED_TABLE },
  { name: "auth: password hashes", statement: "select password from account", expectedError: DENIED_TABLE },
  { name: "auth: session tokens", statement: "select token from session", expectedError: DENIED_TABLE },
  { name: "auth: reset tokens", statement: "select identifier, value from verification", expectedError: DENIED_TABLE },
  { name: "auth: join every auth table", statement: 'select u.email, a.password, s.token from "user" u join account a on a.user_id = u.id join session s on s.user_id = u.id', expectedError: DENIED_TABLE },
  { name: "member: every membership", statement: "select * from member", expectedError: DENIED_TABLE },
  { name: "member: organisation of a user", statement: "select user_id, org_id from member", expectedError: DENIED_TABLE },
  { name: "rate limits", statement: "select * from rate_limit", expectedError: DENIED_TABLE },
  { name: "email outbox", statement: "select * from email_outbox", expectedError: DENIED_TABLE },
  { name: "write: create a user", statement: `insert into "user" (name, email) values ('x', 'x@example.com')`, expectedError: DENIED_TABLE },
  { name: "write: replace a password hash", statement: "update account set password = 'x'", expectedError: DENIED_TABLE },
  { name: "write: end every session", statement: "delete from session", expectedError: DENIED_TABLE },
  { name: "write: move a member to another organisation", statement: "update member set org_id = org_id", expectedError: DENIED_TABLE },
  { name: "write: queue an email", statement: "insert into email_outbox (recipient, template, subject, body) values ('a@example.com', 'password_reset', 's', 'b')", expectedError: DENIED_TABLE },
  { name: "write: reset a rate limit", statement: "delete from rate_limit", expectedError: DENIED_TABLE },
];
```

**Edit:** `server/db/testing/leak-matrix.ts`

Replace:

```typescript
  return [...new Set(tokens)];
}
```

With:

```typescript
  // Phase 1B: no tenant role reads anything about any user, its own colleagues included. Phase 1E gives tenants a
  // column-limited read of their organisation-mates through `member`, and narrows this loop to the other side's users.
  for (const person of world.users) tokens.push(person.id, person.email, person.name, person.passwordHash, person.sessionToken, person.resetToken);
  return [...new Set(tokens)];
}
```

- [ ] **Step 5: Run the integration suite**

```bash
pnpm test:integration
```

Expected: 4 files, 214 tests, all pass (the 162 of 1A plus the access matrix tests, the outbox test, the self-test, and the new probes for both tenant roles and both organisations of each kind). `pnpm typecheck` and `pnpm lint` are clean.

- [ ] **Step 6: Prove the matrix can fail**

Run these in turn against the test database as the Postgres superuser (use your OS user; the role names are the real ones), run the two files, then undo with the matching `REVOKE` or `ENABLE`:

```bash
pnpm db:migrate:test
psql -d fynix_leads_test -qc 'GRANT SELECT ON "user" TO leads_client'
pnpm exec vitest run --config vitest.integration.config.mts server/db/structure server/db/leak-matrix
psql -d fynix_leads_test -qc 'REVOKE SELECT ON "user" FROM leads_client'
```

Expected: FAIL. The names of the failing tests are in the verification appendix (12 fail for a table-level grant on `user`: the access matrix entries, the table-level check, the policy check, `select *`, the leak probes for the auth tables). After the `REVOKE` the suite passes again. The other mutations are in the appendix too.

- [ ] **Step 7: Commit**

```bash
git add server/db/testing server/db/structure.integration.test.ts
git commit -m "Add the access matrix, seeded users and leak probes for the auth tables"
```

---

## Task 4: Pure rules and copy in `lib/auth`

**Files:** Create `lib/auth/password-policy.ts`, `email.ts`, `session-lifetime.ts`, `rate-limit-rules.ts`, `next-path.ts`, `messages.ts`, `form-state.ts`, `session-cookie.ts` and a test next to each (except `form-state.ts`, which is types and a constant).

`lib/` stays pure (the 1A boundary test forbids a database or `server/` import there), so the rules that forms and servers share live here: the password length rule, session and reset lifetimes, the rate-limit rules, the safe `next` path, the exact words a person reads, the action state type and the cookie names.

- [ ] **Step 1: Write the tests**

**File:** `lib/auth/password-policy.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE, passwordLengthProblem } from "./password-policy";

describe("passwordLengthProblem", () => {
  it("accepts exactly the minimum and exactly the maximum", () => {
    expect(passwordLengthProblem("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordLengthProblem("a".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
  });

  it("refuses one character under the minimum and one over the maximum, and says how many to use", () => {
    expect(passwordLengthProblem("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe("Use at least 12 characters.");
    expect(passwordLengthProblem("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe("Use at most 128 characters.");
    expect(passwordLengthProblem("")).toBe("Use at least 12 characters.");
  });

  it("states the same minimum in the hint", () => {
    expect(PASSWORD_RULE).toContain(String(PASSWORD_MIN_LENGTH));
  });
});
```

**File:** `lib/auth/email.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { normaliseEmail } from "./email";

describe("normaliseEmail", () => {
  it("trims and lower-cases", () => {
    expect(normaliseEmail("  Priya.Sharma@Example.COM \n")).toBe("priya.sharma@example.com");
  });
});
```

**File:** `lib/auth/session-lifetime.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { PASSWORD_RESET_LIFETIME_SECONDS, SESSION_LIFETIME_SECONDS, sessionLifetimeSeconds, sessionTooOld } from "./session-lifetime";

describe("session lifetimes", () => {
  it("are 14 days for client and agency, 12 hours for Fynix, and a reset link lasts one hour", () => {
    expect(SESSION_LIFETIME_SECONDS).toEqual({ fynix: 43_200, client: 1_209_600, agency: 1_209_600 });
    expect(sessionLifetimeSeconds("fynix")).toBe(43_200);
    expect(PASSWORD_RESET_LIFETIME_SECONDS).toBe(3_600);
  });
});

describe("sessionTooOld", () => {
  const start = new Date("2026-12-01T09:00:00Z");
  const after = (seconds: number): Date => new Date(start.getTime() + seconds * 1000);

  it("is false just before the lifetime and true at it, for each kind", () => {
    expect(sessionTooOld("fynix", start, after(43_199))).toBe(false);
    expect(sessionTooOld("fynix", start, after(43_200))).toBe(true);
    expect(sessionTooOld("client", start, after(1_209_599))).toBe(false);
    expect(sessionTooOld("agency", start, after(1_209_600))).toBe(true);
  });

  it("treats a Fynix session as old after 13 hours although a client session of that age is fine", () => {
    expect(sessionTooOld("fynix", start, after(13 * 3600))).toBe(true);
    expect(sessionTooOld("client", start, after(13 * 3600))).toBe(false);
  });
});
```

**File:** `lib/auth/rate-limit-rules.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { resetCompleteChecks, resetRequestChecks, retryMessage, signInChecks } from "./rate-limit-rules";

describe("signInChecks", () => {
  const checks = signInChecks("a@example.com", "203.0.113.9");

  it("checks the network, then the account on that network, then the account, in that order", () => {
    expect(checks.map((check) => check.key)).toEqual([
      "sign-in:network:203.0.113.9",
      "sign-in:account-network:a@example.com:203.0.113.9",
      "sign-in:account:a@example.com",
    ]);
  });

  it("holds the account on one network to a tighter budget than the network, and the account overall to a higher ceiling", () => {
    const [network, accountNetwork, account] = checks;
    expect(accountNetwork?.rule.limit).toBeLessThan(network?.rule.limit ?? 0);
    expect(account?.rule.limit).toBeGreaterThan(network?.rule.limit ?? 0);
    expect(checks.every((check) => check.rule.windowSeconds === 900)).toBe(true);
  });
});

describe("resetRequestChecks and resetCompleteChecks", () => {
  it("limit an account to three reset emails an hour, and a network to ten", () => {
    const [network, account] = resetRequestChecks("a@example.com", "203.0.113.9");
    expect(network?.rule).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(account?.rule).toEqual({ limit: 3, windowSeconds: 3600 });
  });

  it("limit token attempts per network", () => {
    expect(resetCompleteChecks("203.0.113.9")).toEqual([{ key: "reset-complete:network:203.0.113.9", rule: { limit: 20, windowSeconds: 3600 } }]);
  });

  it("use different keys for different actions, so one budget cannot be spent on another", () => {
    const keys = [...signInChecks("a@example.com", "x"), ...resetRequestChecks("a@example.com", "x"), ...resetCompleteChecks("x")].map((check) => check.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("retryMessage", () => {
  it("rounds up to whole minutes and never says 0", () => {
    expect(retryMessage(1)).toBe("Too many attempts. Try again in 1 minute.");
    expect(retryMessage(61)).toBe("Too many attempts. Try again in 2 minutes.");
    expect(retryMessage(0)).toBe("Too many attempts. Try again in 1 minute.");
  });
});
```

**File:** `lib/auth/next-path.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it.each(["/", "/welcome", "/client/review", "/client/leads/LD-4K9P?tab=activity", "/agency/leads#top"])("accepts the path %s", (value) => {
    expect(safeNextPath(value)).toBe(value);
  });

  it.each([
    ["another site by scheme", "https://evil.example/"],
    ["a protocol-relative URL", "//evil.example"],
    ["a slash and a backslash", "/\\evil.example"],
    ["a backslash anywhere", "/ok\\path"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a relative path", "welcome"],
    ["a control character", "/welcome\r\nSet-Cookie: x=1"],
    ["a tab, which some browsers strip", "/\t/evil.example"],
    ["an empty string", ""],
    ["a path that is too long", `/${"a".repeat(200)}`],
    ["the sign-in page", "/sign-in"],
    ["the reset page with a query", "/reset-password?token=abc"],
    ["the forgot page with a fragment", "/forgot-password#x"],
  ])("refuses %s", (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("refuses a value that is not a string", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
    expect(safeNextPath(["/welcome"])).toBeNull();
  });
});
```

**File:** `lib/auth/messages.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import * as messages from "./messages";

describe("messages", () => {
  it("say the same thing for a wrong password and an unknown address, because they are one result", () => {
    expect(messages.signInMessage("invalid-credentials")).toBe("That email and password do not match an account.");
  });

  it("do not reveal whether an address has an account when a reset is asked for", () => {
    expect(messages.RESET_REQUESTED_NOTICE).toMatch(/^If that address has an account/);
  });

  it("state the one hour a reset link works, which is the lifetime in session-lifetime.ts", async () => {
    const { PASSWORD_RESET_LIFETIME_SECONDS } = await import("./session-lifetime");
    expect(messages.RESET_REQUESTED_NOTICE).toContain(`${PASSWORD_RESET_LIFETIME_SECONDS / 60} minutes`);
  });

  it("use sentence case, end with a full stop, and have no exclamation mark, em dash or en dash", () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    const texts: string[] = [];
    for (const value of Object.values(messages)) if (typeof value === "string") texts.push(value);
    texts.push(messages.signInMessage("invalid-credentials"), messages.signInMessage("not-active"), messages.retryMessage(90));
    expect(texts.length).toBeGreaterThan(6);
    for (const text of texts) {
      expect(text, text).toMatch(/^[A-Z][^!]*\.$/);
      expect(dashes.test(text), text).toBe(false);
    }
  });
});
```

**File:** `lib/auth/session-cookie.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { hasSessionCookie } from "./session-cookie";

const jar = (...names: string[]) => ({ has: (name: string) => names.includes(name) });

describe("hasSessionCookie", () => {
  it("is true for either spelling and false for other cookies", () => {
    expect(hasSessionCookie(jar("fynix-leads.session_token"))).toBe(true);
    expect(hasSessionCookie(jar("__Secure-fynix-leads.session_token"))).toBe(true);
    expect(hasSessionCookie(jar("session", "theme"))).toBe(false);
    expect(hasSessionCookie(jar())).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm exec vitest run lib/auth
```

Expected: FAIL, 7 files fail to load, for example `Cannot find module './email'`, `'./messages'`, `'./next-path'`.

- [ ] **Step 3: Write the modules**

**File:** `lib/auth/password-policy.ts`

```typescript
/**
 * The length rule for a new password, in a module with no imports so a form can show the same rule the server enforces.
 * The server adds a breached-password check on top (server/auth/breach-check.ts); that part needs the network and
 * cannot run in a browser form.
 *
 * It applies only where a password is chosen: setting up an account, reset and change. Signing in accepts whatever the
 * account has, so a password set under an older rule keeps working.
 */
export const PASSWORD_MIN_LENGTH = 12;
/** Better Auth's own upper bound, and a limit on the work hashing a password costs. */
export const PASSWORD_MAX_LENGTH = 128;

/** The rule in one line, for the hint under a password field. */
export const PASSWORD_RULE = `Use at least ${PASSWORD_MIN_LENGTH} characters. Passwords that appear in known data breaches are refused.`;

/** The first thing wrong with the length of a new password, worded so the person can fix it, or `null` when it is fine. */
export function passwordLengthProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  return null;
}
```

**File:** `lib/auth/email.ts`

```typescript
/** The one spelling of an email address the app stores and compares: trimmed and lower case. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

**File:** `lib/auth/session-lifetime.ts`

```typescript
/** The three kinds of organisation, and so of user. server/auth/session-lifetime.test.ts checks this matches the database enum. */
export type OrganisationKind = "fynix" | "client" | "agency";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/**
 * How long a session lasts from the moment of sign-in, by the kind of the user's organisation (spec section 12 and the
 * master plan, section 3). Fixed, not sliding: a session is never extended while in use, so a Fynix session is over 12
 * hours after sign-in whatever the user does. The Fynix admin sees both parties' identities, so it gets the short one.
 */
export const SESSION_LIFETIME_SECONDS = {
  fynix: 12 * HOUR,
  client: 14 * DAY,
  agency: 14 * DAY,
} as const satisfies Record<OrganisationKind, number>;

/** How long a password reset link works. Short: until it is used it is as good as the password. */
export const PASSWORD_RESET_LIFETIME_SECONDS = HOUR;

/** The lifetime for a kind, in seconds. */
export function sessionLifetimeSeconds(kind: OrganisationKind): number {
  return SESSION_LIFETIME_SECONDS[kind];
}

/** True when a session that started at `createdAt` is older than the kind allows at `now`. */
export function sessionTooOld(kind: OrganisationKind, createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= SESSION_LIFETIME_SECONDS[kind] * 1000;
}
```

**File:** `lib/auth/rate-limit-rules.ts`

```typescript
export interface RateLimitRule {
  /** The most hits one key may make in one window. */
  readonly limit: number;
  readonly windowSeconds: number;
}

/** One counter to consume: a key (hashed before it is stored) and the rule it is held to. */
export interface RateLimitCheck {
  readonly key: string;
  readonly rule: RateLimitRule;
}

const FIFTEEN_MINUTES = 15 * 60;
const ONE_HOUR = 60 * 60;

/**
 * Sign-in limits, in the order they are consumed. The first block stops the rest, so a blocked network cannot keep
 * adding rows by cycling email addresses.
 * 1. Per network: one address trying many accounts.
 * 2. Per account from that network: guessing one password.
 * 3. Per account from anywhere: a high ceiling, so a stranger cannot lock a real user out with a few requests.
 * `email` must already be normalised (see normaliseEmail). The keys carry no surface (client, agency or Fynix): the
 * same account is attacked through any of them, so they share one budget.
 */
export function signInChecks(email: string, address: string): readonly RateLimitCheck[] {
  return [
    { key: `sign-in:network:${address}`, rule: { limit: 20, windowSeconds: FIFTEEN_MINUTES } },
    { key: `sign-in:account-network:${email}:${address}`, rule: { limit: 8, windowSeconds: FIFTEEN_MINUTES } },
    { key: `sign-in:account:${email}`, rule: { limit: 50, windowSeconds: FIFTEEN_MINUTES } },
  ];
}

/**
 * Asking for a reset link sends an email, so these protect the inbox of the person asked about as much as the app:
 * a network cannot ask for many accounts, and one account cannot be asked about more than three times an hour.
 * The same keys are consumed whether or not the address has an account, so the limit reveals nothing.
 */
export function resetRequestChecks(email: string, address: string): readonly RateLimitCheck[] {
  return [
    { key: `reset-request:network:${address}`, rule: { limit: 10, windowSeconds: ONE_HOUR } },
    { key: `reset-request:account:${email}`, rule: { limit: 3, windowSeconds: ONE_HOUR } },
  ];
}

/** Submitting a reset token: bounds how many tokens one network can try. */
export function resetCompleteChecks(address: string): readonly RateLimitCheck[] {
  return [{ key: `reset-complete:network:${address}`, rule: { limit: 20, windowSeconds: ONE_HOUR } }];
}

/** "Try again in 3 minutes", from the seconds left in the window. */
export function retryMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
```

**File:** `lib/auth/next-path.ts`

```typescript
const MAX_LENGTH = 200;
/** The pages that sign a person in or out of a loop: sending someone back to one of them after signing in would go round again. */
const AUTH_PATHS: ReadonlySet<string> = new Set(["/sign-in", "/forgot-password", "/reset-password"]);
/** An origin that cannot be real, used only to ask the URL parser where a path really points. */
const PLACEHOLDER_ORIGIN = "http://placeholder.invalid";

function hasControlOrBackslash(value: string): boolean {
  return [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "\\");
}

/**
 * The page to send a person to after they sign in, taken from a `next` field, or `null` when it is not safe. Only a path
 * on this site passes: it must start with one slash, and `//host`, `/\host`, a scheme, a backslash or a control character
 * (browsers read several of them as another site) are refused, as is anything long or pointing at an auth page. The caller
 * falls back to the default landing page when this returns `null`.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//") || hasControlOrBackslash(value)) return null;
  const path = value.split(/[?#]/)[0] ?? "";
  if (AUTH_PATHS.has(path)) return null;
  try {
    if (new URL(value, PLACEHOLDER_ORIGIN).origin !== PLACEHOLDER_ORIGIN) return null;
  } catch {
    return null;
  }
  return value;
}
```

**File:** `lib/auth/messages.ts`

```typescript
import { retryMessage } from "./rate-limit-rules";

/**
 * The words a person reads for each result of the three flows. Plain sentences in sentence case, no dashes. The sign-in
 * messages never say which of the address and the password was wrong, nor whether the address has an account.
 */

export const GENERIC_FAILURE = "Something went wrong. Try again in a moment.";

export function signInMessage(status: "invalid-credentials" | "not-active"): string {
  return status === "invalid-credentials" ? "That email and password do not match an account." : "This account cannot sign in right now. Ask your Fynix contact for help.";
}

export const SESSION_ENDED_NOTICE = "Your session has ended. Sign in again.";
export const PASSWORD_CHANGED_NOTICE = "Your password has been changed. Sign in with the new one.";
export const SIGNED_OUT_NOTICE = "You have signed out.";

/** Shown whether or not the address has an account, so the page does not reveal which do. */
export const RESET_REQUESTED_NOTICE = "If that address has an account, a reset link is on its way. It works for 60 minutes.";

export const RESET_LINK_INVALID = "This link is no longer valid. Ask for a new one.";
export const BREACH_CHECK_UNAVAILABLE = "We could not check that password just now. Try again in a minute.";

export { retryMessage };
```

**File:** `lib/auth/form-state.ts`

```typescript
/**
 * What a server action hands back to its form, through React's `useActionState`. A form renders from this alone, and
 * the password is never in it: only the email address, so a failed attempt does not blank the field it came from
 * (React 19 resets a form after its action runs).
 */
export type AuthFormState =
  | { readonly status: "idle" }
  /** The attempt failed in a way the person can fix, or can only retry. `message` is ready to show. */
  | { readonly status: "error"; readonly message: string; readonly email: string }
  | { readonly status: "rate-limited"; readonly message: string; readonly email: string }
  /** A reset link was asked for. The same whether or not the address has an account. */
  | { readonly status: "sent"; readonly email: string }
  /** The reset link is dead: never issued, used already or older than an hour. The page offers a new one. */
  | { readonly status: "invalid-link" };

export const IDLE: AuthFormState = { status: "idle" };
```

**File:** `lib/auth/session-cookie.ts`

```typescript
/**
 * The names the session cookie can have: with a `__Secure-` prefix on https, without on http (Better Auth chooses from the
 * origin). A request that carries one but resolves to no session has an ended session, which is worth saying to the person;
 * a request that carries none is just not signed in. server/auth/create-auth.integration.test.ts checks these against the
 * name Better Auth really sets.
 */
export const SESSION_COOKIE_NAMES: readonly string[] = ["fynix-leads.session_token", "__Secure-fynix-leads.session_token"];

export function hasSessionCookie(cookies: { has(name: string): boolean }): boolean {
  return SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
pnpm exec vitest run lib/auth
pnpm test
pnpm lint
```

Expected: `lib/auth`: 7 files, 37 tests pass; `pnpm test`: 43 files, 558 tests pass; lint prints nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/auth
git commit -m "Add the pure auth rules: password length, lifetimes, rate limits, safe next path and messages"
```

---

## Task 5: The breached-password check, the mail transport and the account creation grant

**Files:** Create `server/auth/breach-check.ts`, `mail.ts`, `account-creation-grant.ts` and a `.test.ts` for each.

- `breach-check.ts`: the Have I Been Pwned range API behind an injectable `BreachChecker`. What happens when the service is down is decided here: the checker throws `BreachCheckUnavailableError`, never "not breached", and `createAuth` (Task 7) refuses the password with "try again in a minute" (decision B7).
- `mail.ts`: a `MailTransport`, the development transport that writes `email_outbox` through `leads_public`, and the reset mailer that builds a link to this app's own page.
- `account-creation-grant.ts`: the only way an account is created (an `AsyncLocalStorage` grant for one exact address).

- [ ] **Step 1: Write the tests**

**File:** `server/auth/breach-check.test.ts`

```typescript
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BreachCheckUnavailableError, hibpBreachChecker, noBreachCheck } from "./breach-check";

const PASSWORD = "correct-horse-battery-staple";
const digest = createHash("sha1").update(PASSWORD).digest("hex").toUpperCase();
const [PREFIX, SUFFIX] = [digest.slice(0, 5), digest.slice(5)];

interface Call {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/** A fake `fetch` that records its calls and answers with `body`. */
function fakeFetch(body: string, status = 200): { readonly fetch: typeof fetch; readonly calls: Call[] } {
  const calls: Call[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    return new Response(body, { status });
  };
  return { fetch: impl as typeof fetch, calls };
}

describe("hibpBreachChecker", () => {
  it("sends only the first five characters of the SHA-1 and asks for padding", async () => {
    const { fetch: fake, calls } = fakeFetch(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${SUFFIX}:42\r\n`);
    await hibpBreachChecker({ fetch: fake }).isBreached(PASSWORD);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(calls[0]?.headers["add-padding"]).toBe("true");
    expect(calls[0]?.url).not.toContain(SUFFIX);
    expect(calls[0]?.url).not.toContain(PASSWORD);
  });

  it("reports a password whose suffix is in the answer with a count above zero", async () => {
    const { fetch: fake } = fakeFetch(`AAAAA45C4D1DEF81644B54AB7F969B88D65:3\r\n${SUFFIX}:42\r\n`);
    expect(await hibpBreachChecker({ fetch: fake }).isBreached(PASSWORD)).toBe(true);
  });

  it("does not report a password that is absent, or present only as a padding entry with a count of 0", async () => {
    const { fetch: absent } = fakeFetch("AAAAA45C4D1DEF81644B54AB7F969B88D65:3\r\n");
    expect(await hibpBreachChecker({ fetch: absent }).isBreached(PASSWORD)).toBe(false);
    const { fetch: padding } = fakeFetch(`${SUFFIX}:0\r\n`);
    expect(await hibpBreachChecker({ fetch: padding }).isBreached(PASSWORD)).toBe(false);
  });

  it("throws BreachCheckUnavailableError on a server error, a network failure and a timeout, never answering false", async () => {
    const { fetch: serverError } = fakeFetch("", 503);
    await expect(hibpBreachChecker({ fetch: serverError }).isBreached(PASSWORD)).rejects.toBeInstanceOf(BreachCheckUnavailableError);

    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(hibpBreachChecker({ fetch: offline }).isBreached(PASSWORD)).rejects.toBeInstanceOf(BreachCheckUnavailableError);

    const hangs = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    await expect(hibpBreachChecker({ fetch: hangs, timeoutMs: 20 }).isBreached(PASSWORD)).rejects.toBeInstanceOf(BreachCheckUnavailableError);
  });

  it("does not put the password or its hash in the error", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const error = await hibpBreachChecker({ fetch: offline }).isBreached(PASSWORD).catch((caught: unknown) => caught);
    expect(String(error)).not.toContain(PASSWORD);
    expect(String(error)).not.toContain(SUFFIX);
  });
});

describe("noBreachCheck", () => {
  it("accepts everything", async () => {
    expect(await noBreachCheck.isBreached(PASSWORD)).toBe(false);
  });
});
```

**File:** `server/auth/mail.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { passwordResetMailer, passwordResetMessage, type MailMessage, type MailTransport } from "./mail";

function recordingTransport(): { readonly transport: MailTransport; readonly sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return { transport: { send: async (message) => void sent.push(message) }, sent };
}

describe("passwordResetMailer", () => {
  it("sends one message to the address, with a link to this app's reset page carrying the token", async () => {
    const { transport, sent } = recordingTransport();
    await passwordResetMailer(transport, "https://leads.fynix.digital", 60).sendPasswordReset({ email: "a@example.com", token: "tok-123" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("a@example.com");
    expect(sent[0]?.template).toBe("password_reset");
    expect(sent[0]?.text).toContain("https://leads.fynix.digital/reset-password?token=tok-123");
  });

  it("encodes a token that would otherwise change the link", async () => {
    const { transport, sent } = recordingTransport();
    await passwordResetMailer(transport, "http://localhost:3020", 60).sendPasswordReset({ email: "a@example.com", token: "a&b=c d" });
    expect(sent[0]?.text).toContain("http://localhost:3020/reset-password?token=a%26b%3Dc+d");
  });
});

describe("passwordResetMessage", () => {
  const message = passwordResetMessage({ to: "a@example.com", resetUrl: "https://x.example/reset-password?token=t", expiresInMinutes: 60 });

  it("states how long the link works and what to do if it was not asked for", () => {
    expect(message.text).toContain("within 60 minutes");
    expect(message.text).toContain("If you did not ask for this");
  });

  it("uses sentence case and no em or en dashes", () => {
    expect(message.subject).toBe("Reset your Fynix Leads password");
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(dashes.test(`${message.subject}${message.text}`)).toBe(false);
  });
});
```

**File:** `server/auth/account-creation-grant.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { hasAccountCreationGrant, withAccountCreationGrant } from "./account-creation-grant";

describe("withAccountCreationGrant", () => {
  it("grants only the exact address, case and spaces aside", async () => {
    await withAccountCreationGrant("  Priya@Example.com ", async () => {
      expect(hasAccountCreationGrant("priya@example.com")).toBe(true);
      expect(hasAccountCreationGrant("PRIYA@EXAMPLE.COM")).toBe(true);
      expect(hasAccountCreationGrant("someone-else@example.com")).toBe(false);
      expect(hasAccountCreationGrant("priya@example.com.evil.test")).toBe(false);
    });
  });

  it("grants nothing outside the callback, before or after", async () => {
    expect(hasAccountCreationGrant("priya@example.com")).toBe(false);
    await withAccountCreationGrant("priya@example.com", async () => undefined);
    expect(hasAccountCreationGrant("priya@example.com")).toBe(false);
  });

  it("does not leak into a concurrent callback for another address", async () => {
    const seen: boolean[] = [];
    await Promise.all([
      withAccountCreationGrant("a@example.com", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        seen.push(hasAccountCreationGrant("b@example.com"));
      }),
      withAccountCreationGrant("b@example.com", async () => {
        seen.push(hasAccountCreationGrant("b@example.com"));
      }),
    ]);
    expect(seen.sort()).toEqual([false, true]);
  });

  it("rejects a malformed address and a lookalike that only becomes valid when lower-cased", async () => {
    await expect(withAccountCreationGrant("not-an-email", async () => undefined)).rejects.toThrow("valid email address");
    // The Kelvin sign lower-cases to a plain k, so checking the lowered text would accept it. Built from its code point.
    await expect(withAccountCreationGrant(`${String.fromCharCode(0x212a)}elvin@example.com`, async () => undefined)).rejects.toThrow("valid email address");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm exec vitest run server/auth
```

Expected: FAIL, 3 files fail to load (`Cannot find module './breach-check'`, `'./mail'`, `'./account-creation-grant'`).

- [ ] **Step 3: Write the modules**

**File:** `server/auth/breach-check.ts`

```typescript
import { createHash } from "node:crypto";

/** Answers one question: does this password appear in a known data breach? */
export interface BreachChecker {
  isBreached(password: string): Promise<boolean>;
}

/**
 * The check could not be made (the service is down, slow or answered with an error). The caller must not read this as
 * "the password is fine": server/auth/create-auth.ts refuses the password with a message that asks the person to try again.
 */
export class BreachCheckUnavailableError extends Error {
  constructor(reason: string, options?: { readonly cause: unknown }) {
    super(`The breached-password service could not be reached: ${reason}`, options);
    this.name = "BreachCheckUnavailableError";
  }
}

export interface HibpOptions {
  /** Defaults to the global `fetch`. A test passes a fake, so no test reaches the network. */
  readonly fetch?: typeof fetch;
  /** Give up after this long and treat the service as unavailable. Defaults to 3 seconds. */
  readonly timeoutMs?: number;
  /** Defaults to Have I Been Pwned's range API. */
  readonly baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.pwnedpasswords.com";
const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Have I Been Pwned's k-anonymity range API: only the first five hex characters of the password's SHA-1 leave this
 * machine, never the password and never the full hash. The service answers with every hash suffix that shares those five
 * characters and how often it was seen, and the comparison happens here. `Add-Padding` asks for decoy entries with a
 * count of 0, so the size of the answer does not reveal how many real matches there were; a count of 0 is not a match.
 */
export function hibpBreachChecker(options: HibpOptions = {}): BreachChecker {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  return {
    async isBreached(password) {
      const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
      const prefix = digest.slice(0, 5);
      const suffix = digest.slice(5);
      let body: string;
      try {
        const response = await doFetch(`${baseUrl}/range/${prefix}`, {
          headers: { "Add-Padding": "true" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new BreachCheckUnavailableError(`status ${response.status}`);
        body = await response.text();
      } catch (error) {
        if (error instanceof BreachCheckUnavailableError) throw error;
        throw new BreachCheckUnavailableError(error instanceof Error ? error.name : "unknown error", { cause: error });
      }
      return body.split("\n").some((line) => {
        const [candidate, count] = line.trim().split(":");
        return candidate === suffix && Number(count) > 0;
      });
    },
  };
}

/** Accepts every password. For development on a machine with no network; the environment schema refuses it on https. */
export const noBreachCheck: BreachChecker = { isBreached: async () => false };

/** The checker the environment asks for: `off` only for development without a network, anything else is the real service. */
export function breachCheckerFor(mode: "hibp" | "off" | undefined): BreachChecker {
  return mode === "off" ? noBreachCheck : hibpBreachChecker();
}
```

**File:** `server/auth/mail.ts`

```typescript
import type { Database } from "@/server/db/pool";
import { emailOutbox } from "@/server/db/schema";

/** A message to send. Plain text only in phase 1B; phase 1C adds the HTML templates. */
export interface MailMessage {
  readonly to: string;
  readonly template: "password_reset";
  readonly subject: string;
  readonly text: string;
}

/** How a message leaves the app. */
export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/**
 * The development transport: writes the message to `email_outbox` and sends nothing (decision D4). Written through
 * `leads_public`, which may insert and nothing else, because a reset is requested by someone who is not signed in.
 * `pnpm mail:last` prints the newest message, which is how a developer gets the reset link. Phase 1C adds the Brevo
 * transport that sends the queued rows and purges the ones that carry a link.
 */
export function devOutboxTransport(publicDb: Database): MailTransport {
  return {
    async send(message) {
      await publicDb.insert(emailOutbox).values({ recipient: message.to, template: message.template, subject: message.subject, body: message.text });
    },
  };
}

export function passwordResetMessage(input: { readonly to: string; readonly resetUrl: string; readonly expiresInMinutes: number }): MailMessage {
  return {
    to: input.to,
    template: "password_reset",
    subject: "Reset your Fynix Leads password",
    text: [
      "Someone asked to reset the password for this email address on Fynix Leads.",
      "",
      `To choose a new password, open this link within ${input.expiresInMinutes} minutes:`,
      input.resetUrl,
      "",
      "If you did not ask for this, ignore this email. Your password stays the same.",
    ].join("\n"),
  };
}

/** What Better Auth's reset callback needs: the address and the one-time token. */
export interface ResetMailer {
  sendPasswordReset(input: { readonly email: string; readonly token: string }): Promise<void>;
}

/** Builds the link to this app's own reset page (Better Auth's HTTP routes are not served) and sends it through `transport`. */
export function passwordResetMailer(transport: MailTransport, origin: string, expiresInMinutes: number): ResetMailer {
  return {
    async sendPasswordReset({ email, token }) {
      const resetUrl = new URL("/reset-password", origin);
      resetUrl.searchParams.set("token", token);
      await transport.send(passwordResetMessage({ to: email, resetUrl: resetUrl.toString(), expiresInMinutes }));
    },
  };
}
```

**File:** `server/auth/account-creation-grant.ts`

```typescript
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { normaliseEmail } from "@/lib/auth/email";

interface AccountCreationGrant {
  readonly email: string;
}

const grants = new AsyncLocalStorage<AccountCreationGrant>();
const emailSchema = z.email();

/**
 * Runs `work` with permission to create an account for `email`, and for nothing else. There is no public sign-up: Better
 * Auth's create-user hook (server/auth/create-auth.ts) refuses every account unless it is made inside a grant for that
 * exact address, so a bug or a stray route cannot open an account. Declared `async` so a malformed address rejects the
 * returned promise instead of throwing synchronously.
 */
export async function withAccountCreationGrant<T>(email: string, work: () => Promise<T>): Promise<T> {
  // Validate before lowercasing: the Kelvin sign (U+212A) lowercases to a plain "k", so checking the lowered text would
  // accept an address that looks like another one.
  if (!emailSchema.safeParse(email.trim()).success) throw new Error("Account creation grants need a valid email address.");
  return grants.run({ email: normaliseEmail(email) }, work);
}

export function hasAccountCreationGrant(email: string): boolean {
  const grant = grants.getStore();
  return grant !== undefined && grant.email === normaliseEmail(email);
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
pnpm exec vitest run server/auth
pnpm test
pnpm typecheck
pnpm lint
```

Expected: `server/auth`: 3 files, 14 tests; `pnpm test`: 46 files, 572 tests; typecheck and lint clean. (`pnpm typecheck` runs `next typegen` first, then `tsc`.)

- [ ] **Step 5: Check the real service once**

The unit tests use a fake `fetch`. Once, with a network, run the real client (it sends five characters of a hash, nothing else):

```bash
cat > live-hibp.mts <<'EOF'
import { hibpBreachChecker } from "@/server/auth/breach-check";
const checker = hibpBreachChecker();
console.log("password ->", await checker.isBreached("password"));
console.log("random ->", await checker.isBreached("q7Zr-" + Math.random().toString(36).slice(2) + "-vX9!kLw2"));
EOF
pnpm exec tsx live-hibp.mts
rm live-hibp.mts
```

Expected: `password -> true`, then `random -> false`. Offline it prints a `BreachCheckUnavailableError` instead, which is the behaviour decision B7 describes.

- [ ] **Step 6: Commit**

```bash
git add server/auth
git commit -m "Add the breached-password check, the outbox mail transport and the account creation grant"
```

---

## Task 6: Rate limits in Postgres

**Files:** Create `server/auth/rate-limit.ts` and `server/auth/rate-limit.integration.test.ts`

Fixed-window upserts keyed by the SHA-256 of the key, as `leads_public`, never inside a transaction. The type of the first parameter is `Database` (a pool), which a transaction is not, so passing a `tx` is a compile error and the test proves it.

- [ ] **Step 1: Write the integration test**

**File:** `server/auth/rate-limit.integration.test.ts`

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit, firstBlockedLimit, keyHashFor, purgeStaleRateLimits } from "@/server/auth/rate-limit";
import { rateLimit } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";

/** The Postgres rate limits, on the real test database, as `leads_public`. */

let dbs: TestDatabases;
const NOW = new Date("2026-12-01T09:07:30Z");
const RULE = { limit: 3, windowSeconds: 900 } as const;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
});

const publicDb = () => dbs.roles.leads_public.db;
const rows = () => dbs.owner.db.select().from(rateLimit);

describe("consumeRateLimit", () => {
  it("allows up to the limit, counts down, then blocks and says how long until the window ends", async () => {
    const results = [];
    for (let hit = 0; hit < 5; hit += 1) results.push(await consumeRateLimit(publicDb(), "k", RULE, NOW));
    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false, false]);
    expect(results.map((result) => result.remaining)).toEqual([2, 1, 0, 0, 0]);
    // 09:07:30 is 450 seconds into the 09:00 window of 900 seconds.
    expect(results[3]?.retryAfterSeconds).toBe(450);
  });

  it("starts a new window afterwards and removes the key's older window", async () => {
    for (let hit = 0; hit < 4; hit += 1) await consumeRateLimit(publicDb(), "k", RULE, NOW);
    const later = new Date(NOW.getTime() + 900_000);
    expect((await consumeRateLimit(publicDb(), "k", RULE, later)).allowed).toBe(true);
    expect(await rows()).toHaveLength(1);
  });

  it("keeps keys apart", async () => {
    for (let hit = 0; hit < 4; hit += 1) await consumeRateLimit(publicDb(), "a", RULE, NOW);
    expect((await consumeRateLimit(publicDb(), "b", RULE, NOW)).allowed).toBe(true);
  });

  it("stores a hash of the key: no email address and no network address", async () => {
    await consumeRateLimit(publicDb(), "sign-in:account-network:pat@example.com:203.0.113.9", RULE, NOW);
    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.keyHash).toBe(keyHashFor("sign-in:account-network:pat@example.com:203.0.113.9"));
    expect(stored[0]?.keyHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(stored)).not.toContain("pat@example.com");
    expect(JSON.stringify(stored)).not.toContain("203.0.113.9");
  });

  it("counts concurrent hits exactly", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => consumeRateLimit(publicDb(), "busy", { limit: 10, windowSeconds: 900 }, NOW)));
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect((await rows())[0]?.count).toBe(40);
  });

  it("refuses an empty key, a bad rule and an invalid time", async () => {
    await expect(consumeRateLimit(publicDb(), " ", RULE, NOW)).rejects.toThrow("must not be empty");
    await expect(consumeRateLimit(publicDb(), "k", { limit: 0, windowSeconds: 60 }, NOW)).rejects.toThrow("positive whole number");
    await expect(consumeRateLimit(publicDb(), "k", { limit: 1, windowSeconds: 1.5 }, NOW)).rejects.toThrow("whole number of seconds");
    await expect(consumeRateLimit(publicDb(), "k", RULE, new Date(Number.NaN))).rejects.toThrow("valid Date");
  });

  it("is committed on the spot: it runs on the pool, outside any transaction, so a rolled-back request cannot take a hit back", async () => {
    class Rollback extends Error {}
    await dbs.roles.leads_public.db
      .transaction(async () => {
        await consumeRateLimit(publicDb(), "k", RULE, NOW);
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    expect(await rows()).toHaveLength(1);
  });

  it("cannot be handed a transaction: the compiler refuses it", () => {
    const compileOnly = (tx: ScopedTransaction): unknown =>
      // @ts-expect-error A transaction is not a Database. Rate limits run outside any transaction (see consumeRateLimit).
      consumeRateLimit(tx, "k", RULE, NOW);
    expect(compileOnly).toBeTypeOf("function");
  });
});

describe("firstBlockedLimit", () => {
  it("stops at the first block and does not touch the later keys", async () => {
    const checks = [
      { key: "one", rule: { limit: 1, windowSeconds: 900 } },
      { key: "two", rule: { limit: 1, windowSeconds: 900 } },
    ];
    expect(await firstBlockedLimit(publicDb(), checks, NOW)).toBeNull();
    const blocked = await firstBlockedLimit(publicDb(), checks, NOW);
    expect(blocked?.allowed).toBe(false);
    const counts = Object.fromEntries((await rows()).map((row) => [row.keyHash, row.count]));
    expect(counts[keyHashFor("one")]).toBe(2);
    expect(counts[keyHashFor("two")]).toBe(1);
  });
});

describe("purgeStaleRateLimits", () => {
  it("removes windows that ended before the cut-off, whichever key, and reports how many", async () => {
    await consumeRateLimit(publicDb(), "old", RULE, new Date("2026-11-01T00:00:00Z"));
    await consumeRateLimit(publicDb(), "recent", RULE, NOW);
    expect(await purgeStaleRateLimits(publicDb(), new Date("2026-12-01T00:00:00Z"))).toBe(1);
    expect((await rows()).map((row) => row.keyHash)).toEqual([keyHashFor("recent")]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm db:migrate:test
pnpm exec vitest run --config vitest.integration.config.mts server/auth/rate-limit
```

Expected: FAIL, the file fails to load (`Cannot find package '@/server/auth/rate-limit'`).

- [ ] **Step 3: Write the module**

**File:** `server/auth/rate-limit.ts`

```typescript
import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import type { RateLimitCheck, RateLimitRule } from "@/lib/auth/rate-limit-rules";
import type { Database } from "@/server/db/pool";
import { rateLimit } from "@/server/db/schema";

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Seconds until the window ends; 0 when the hit was allowed. */
  readonly retryAfterSeconds: number;
}

export function assertValidRule(rule: RateLimitRule): void {
  if (!Number.isSafeInteger(rule.limit) || rule.limit < 1) throw new RangeError(`A rate limit must be a positive whole number, received ${rule.limit}`);
  if (!Number.isSafeInteger(rule.windowSeconds) || rule.windowSeconds < 1) {
    throw new RangeError(`A rate limit window must be a positive whole number of seconds, received ${rule.windowSeconds}`);
  }
}

/** The start of the fixed window that contains `now`. Windows are aligned to the epoch, so every instance agrees on them. */
export function windowStartFor(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/** What is stored for a key: 43 characters, and no email address or network address. */
export function keyHashFor(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("base64url");
}

/**
 * Records one hit for `key` and says whether it is within the rule. The upsert is one statement, so concurrent hits are
 * counted exactly. Fixed windows allow up to twice the limit across a window boundary; these limits are a brake, not a
 * quota.
 *
 * Call it with the `leads_public` database and outside any transaction: inside one, the row lock on a busy key would be
 * held until the transaction ends, and a rolled-back request would take its hit back. A failure propagates: callers fail
 * closed rather than skip the limit.
 */
export async function consumeRateLimit(db: Database, key: string, rule: RateLimitRule, now: Date = new Date()): Promise<RateLimitResult> {
  if (key.trim() === "") throw new RangeError("A rate limit key must not be empty");
  if (!Number.isFinite(now.getTime())) throw new RangeError("The rate limit time must be a valid Date");
  assertValidRule(rule);

  const keyHash = keyHashFor(key);
  const windowStart = windowStartFor(now, rule.windowSeconds);
  const rows = await db
    .insert(rateLimit)
    .values({ keyHash, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimit.keyHash, rateLimit.windowStart], set: { count: sql`${rateLimit.count} + 1` } })
    .returning({ count: rateLimit.count });
  const hits = rows[0]?.count;
  if (hits === undefined) throw new Error("The rate limit upsert returned no row");

  // Older windows of this key are dead weight: keep one row per key.
  await db.delete(rateLimit).where(and(eq(rateLimit.keyHash, keyHash), lt(rateLimit.windowStart, windowStart)));

  if (hits <= rule.limit) return { allowed: true, remaining: rule.limit - hits, retryAfterSeconds: 0 };
  const windowEndMs = windowStart.getTime() + rule.windowSeconds * 1000;
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((windowEndMs - now.getTime()) / 1000) };
}

/**
 * Consumes each check in order and returns the first block, or `null` when every one allows the hit. Stopping at the
 * first block means a blocked network stops adding rows for the other keys.
 */
export async function firstBlockedLimit(db: Database, checks: readonly RateLimitCheck[], now: Date = new Date()): Promise<RateLimitResult | null> {
  for (const check of checks) {
    const result = await consumeRateLimit(db, check.key, check.rule, now);
    if (!result.allowed) return result;
  }
  return null;
}

/**
 * Removes every window that ended before `olderThan`, whichever key it belongs to: keys that are never seen again
 * leave a row behind that consumeRateLimit never cleans. Returns how many rows went. Phase 6 runs it from the cron
 * endpoint; until then it can be run by hand.
 */
export async function purgeStaleRateLimits(db: Database, olderThan: Date): Promise<number> {
  const removed = await db.delete(rateLimit).where(lt(rateLimit.windowStart, olderThan)).returning({ keyHash: rateLimit.keyHash });
  return removed.length;
}
```

- [ ] **Step 4: Run it and see it pass**

```bash
pnpm exec vitest run --config vitest.integration.config.mts server/auth/rate-limit
pnpm typecheck
```

Expected: 1 file, 10 tests pass. `pnpm typecheck` is clean, which also proves the `@ts-expect-error` line is needed (an unneeded directive is a type error).

- [ ] **Step 5: Commit**

```bash
git add server/auth/rate-limit.ts server/auth/rate-limit.integration.test.ts
git commit -m "Add Postgres rate limits keyed by a hash, run as leads_public outside any transaction"
```

---

## Task 7: The Better Auth instance, account creation, sign-in and session resolution

**Files:** Create `server/auth/membership.ts`, `errors.ts`, `create-auth.ts`, `create-account.ts`, `sign-in.ts`, `second-factor.ts`, `session-context.ts`, `testing.ts`; tests `create-auth.test.ts`, `auth-schema.test.ts`, `session-lifetime.test.ts`, `create-auth.integration.test.ts`, `sign-in.integration.test.ts`, `session-context.integration.test.ts`.

This is the core. It is written test first, so the harness (`testing.ts`) and the tests come before the code they exercise.

What the code does, in the order a request meets it:

- `createAuth` builds Better Auth on the `leads_auth` pool. It refuses a weak or default secret and `BETTER_AUTH_SECRETS` (**guard 3**), refuses every account created outside a grant by returning `false` from the create-user hook, never throwing a 403 (**guard 1**), runs the password policy before every route that chooses a password, gives each new session its lifetime by organisation kind, and refuses to make a session for a user with no active membership.
- `createAccountWithGrant` creates an account inside the grant and reads the row back (**guard 2**).
- `signInWithPassword` consumes the three rate limits first, then signs in, and returns one answer for an unknown address, a wrong password and a malformed request.
- `resolveSessionContext` turns a cookie into `{ kind, role, orgId, userId }`, or `null`.

Each of the three quirks has a **canary** test: it shows the quirk still exists in the pinned version. If a Better Auth upgrade removes one, the canary fails and tells you to look at the guard.

- [ ] **Step 1: The harness**

**File:** `server/auth/testing.ts`

```typescript
import { count, desc, eq } from "drizzle-orm";
import { BreachCheckUnavailableError, type BreachChecker } from "@/server/auth/breach-check";
import { createAccountWithGrant } from "@/server/auth/create-account";
import { createAuth, type Auth } from "@/server/auth/create-auth";
import { devOutboxTransport, passwordResetMailer } from "@/server/auth/mail";
import type { SessionResolution } from "@/server/auth/session-context";
import type { AuthServices } from "@/server/auth/sign-in";
import { emailOutbox, member, user } from "@/server/db/schema";
import { openTestDatabases, type TestDatabases } from "@/server/db/testing";
import type { SeededOrganisation } from "@/server/db/testing/seed";

/** Test harness for the auth integration tests: real Better Auth on the real test database, with a fake breach service. */

export const TEST_SECRET = "integration-test-secret-0123456789-abcdefghijklmnop";
export const TEST_ORIGIN = "http://localhost:3020";
export const GOOD_PASSWORD = "correct-horse-battery-staple";
export const NEW_PASSWORD = "another-long-passphrase-9";

/** A breach service that answers from a list, and can be switched to "unavailable". It never touches the network. */
export class FakeBreachChecker implements BreachChecker {
  readonly breached = new Set<string>();
  readonly checked: string[] = [];
  unavailable = false;

  async isBreached(password: string): Promise<boolean> {
    this.checked.push(password);
    if (this.unavailable) throw new BreachCheckUnavailableError("fake outage");
    return this.breached.has(password);
  }
}

export interface AuthRig {
  readonly dbs: TestDatabases;
  readonly auth: Auth;
  readonly breach: FakeBreachChecker;
  /** What the sign-in and reset services need. `now` can be set by a test to freeze or move the rate-limit clock. */
  readonly services: AuthServices;
  readonly resolution: SessionResolution;
  readonly close: () => Promise<void>;
}

export function openAuthRig(options: { readonly baseURL?: string; readonly now?: () => Date } = {}): AuthRig {
  const dbs = openTestDatabases();
  const breach = new FakeBreachChecker();
  const baseURL = options.baseURL ?? TEST_ORIGIN;
  const auth = createAuth({
    db: dbs.roles.leads_auth.db,
    secret: TEST_SECRET,
    baseURL,
    breachChecker: breach,
    mailer: passwordResetMailer(devOutboxTransport(dbs.roles.leads_public.db), baseURL, 60),
    nextCookies: false,
  });
  return {
    dbs,
    auth,
    breach,
    services: { auth, publicDb: dbs.roles.leads_public.db, now: options.now },
    resolution: { reader: auth, authDb: dbs.roles.leads_auth.db, now: options.now },
    close: () => dbs.closeAll(),
  };
}

export interface NewUser {
  readonly email: string;
  readonly password?: string;
  readonly role?: "member" | "manager";
  readonly status?: "active" | "suspended";
  /** Skip the membership, to test a user who belongs to nobody. */
  readonly withoutMembership?: boolean;
}

/** A real account through the grant, and a membership written by the owner, as `pnpm admin:create` and phase 1C's invites do. */
export async function createUserIn(rig: AuthRig, organisation: SeededOrganisation, input: NewUser): Promise<{ readonly userId: string; readonly email: string }> {
  const created = await createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email: input.email, name: `Name of ${input.email}`, password: input.password ?? GOOD_PASSWORD });
  if (input.withoutMembership !== true) {
    await rig.dbs.owner.db.insert(member).values({
      userId: created.userId,
      orgId: organisation.id,
      orgKind: organisation.kind,
      role: input.role ?? "member",
      status: input.status ?? "active",
      displayName: `Name of ${input.email}`,
    });
  }
  return created;
}

/** The request headers a browser would send after a sign-in: the cookie names and values from the `Set-Cookie` headers. */
export function requestHeadersFrom(setCookieSource: Headers): Headers {
  const cookies = setCookieSource.getSetCookie().map((line) => line.split(";")[0] ?? "");
  return new Headers({ cookie: cookies.join("; ") });
}

export async function countUsers(rig: AuthRig): Promise<number> {
  const rows = await rig.dbs.owner.db.select({ value: count() }).from(user);
  return rows[0]?.value ?? 0;
}

export async function outboxFor(rig: AuthRig, email: string): Promise<{ readonly recipient: string; readonly subject: string; readonly body: string }[]> {
  return rig.dbs.owner.db
    .select({ recipient: emailOutbox.recipient, subject: emailOutbox.subject, body: emailOutbox.body })
    .from(emailOutbox)
    .where(eq(emailOutbox.recipient, email))
    .orderBy(desc(emailOutbox.createdAt));
}

/** The reset token in the newest queued message for `email`. */
export async function latestResetToken(rig: AuthRig, email: string): Promise<string> {
  const newest = (await outboxFor(rig, email))[0];
  const link = newest?.body.split("\n").find((line) => line.startsWith("http"));
  const token = link === undefined ? null : new URL(link).searchParams.get("token");
  if (token === null) throw new Error(`No reset link was queued for ${email}`);
  return token;
}
```

- [ ] **Step 2: The unit tests**

**File:** `server/auth/create-auth.test.ts`

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBreachChecker } from "@/server/auth/testing";
import { assertUsableSecret, createAuth, MIN_SECRET_LENGTH } from "@/server/auth/create-auth";
import type { Database } from "@/server/db/pool";

const RANDOM_SECRET = "d41d8cd98f00b204e9800998ecf8427e5a3b7c9d1e2f4a6b8c0d2e4f6a8b0c1d";
/** Never used: the guards under test throw before anything touches the database. */
const NO_DATABASE = {} as unknown as Database;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("guard 3: the auth secret", () => {
  it("accepts a random secret of 32 characters or more", () => {
    expect(() => assertUsableSecret("x".repeat(MIN_SECRET_LENGTH))).not.toThrow();
    expect(() => assertUsableSecret(RANDOM_SECRET)).not.toThrow();
  });

  it.each(["", "short", "x".repeat(MIN_SECRET_LENGTH - 1)])("refuses %j, which Better Auth would only warn about", (secret) => {
    expect(() => assertUsableSecret(secret)).toThrow("at least 32 characters");
  });

  it("refuses Better Auth's published default even though it is longer than 32 characters", () => {
    expect(() => assertUsableSecret("better-auth-secret-12345678901234567890")).toThrow("public default");
  });

  it("refuses to start while BETTER_AUTH_SECRETS is set, because Better Auth would use it instead", () => {
    vi.stubEnv("BETTER_AUTH_SECRETS", "1:something-else-entirely-0123456789abcdef");
    expect(() => assertUsableSecret(RANDOM_SECRET)).toThrow("BETTER_AUTH_SECRETS");
  });

  it("createAuth applies it before it builds anything", () => {
    const config = { db: NO_DATABASE, baseURL: "http://localhost:3020", breachChecker: new FakeBreachChecker(), mailer: { sendPasswordReset: async () => undefined }, nextCookies: false };
    expect(() => createAuth({ ...config, secret: "x".repeat(31) })).toThrow("at least 32 characters");
    expect(() => createAuth({ ...config, secret: "" })).toThrow("at least 32 characters");
  });
});
```

**File:** `server/auth/auth-schema.test.ts`

```typescript
import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MIN_SECRET_LENGTH } from "@/server/auth/create-auth";
import { account, session, user, verification } from "@/server/db/schema";

/**
 * Better Auth reads and writes these four tables by the field names it declares. If a Better Auth upgrade adds, renames
 * or requires a field, this fails with the table and field named, before a sign-in does.
 */

const tables = getAuthTables({ emailAndPassword: { enabled: true } } as never);
const ours = { user, session, account, verification } as const;

describe("the auth tables match what Better Auth declares", () => {
  it.each(Object.entries(ours))("%s has exactly Better Auth's fields, plus id", (model, table) => {
    const declared = tables[model]?.fields ?? {};
    expect(Object.keys(getTableColumns(table)).sort()).toEqual(["id", ...Object.keys(declared)].sort());
  });

  it.each(Object.entries(ours))("%s: a field Better Auth requires is NOT NULL here, and an optional one is nullable", (model, table) => {
    const declared = tables[model]?.fields ?? {};
    const columns = getTableColumns(table) as Record<string, { notNull: boolean }>;
    for (const [name, field] of Object.entries(declared)) {
      expect(columns[name]?.notNull, `${model}.${name}`).toBe((field as { required?: boolean }).required !== false);
    }
  });

  it("is checked against a Better Auth that still has the secret rule this app relies on", () => {
    expect(MIN_SECRET_LENGTH).toBe(32);
  });
});
```

(`as never` is the one cast: `getAuthTables` wants Better Auth's full options type and the test passes only the part that matters. The second `as` reads a Drizzle column's `notNull` flag.)

**File:** `server/auth/session-lifetime.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { SESSION_LIFETIME_SECONDS } from "@/lib/auth/session-lifetime";
import { organisationKind } from "@/server/db/schema";

describe("session lifetimes and the database", () => {
  it("define a lifetime for exactly the organisation kinds the database has", () => {
    expect(Object.keys(SESSION_LIFETIME_SECONDS).sort()).toEqual([...organisationKind.enumValues].sort());
  });
});
```

- [ ] **Step 3: The integration tests**

**File:** `server/auth/create-auth.integration.test.ts`

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-cookie";
import { withAccountCreationGrant } from "@/server/auth/account-creation-grant";
import { AccountAlreadyExistsError, createAccountWithGrant } from "@/server/auth/create-account";
import { authErrorCode } from "@/server/auth/errors";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD, TEST_ORIGIN, TEST_SECRET, countUsers, createUserIn, openAuthRig, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import { account, session, user, verification } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * Better Auth on the real test database: the three known quirks and their guards, the password policy, sign-in and the
 * session and cookie rules. The reset flow, the rate limits and session resolution have their own files.
 */

let rig: AuthRig;
let world: SeedWorld;

beforeAll(() => {
  rig = openAuthRig();
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  world = await seedWorld(rig.dbs.owner, { withUsers: false });
  rig.breach.breached.clear();
  rig.breach.checked.length = 0;
  rig.breach.unavailable = false;
});

/** The error an operation must reject with. Fails the test if it succeeds. */
async function failure(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error("Expected the operation to fail, but it succeeded.");
    },
    (error: unknown) => error,
  );
}

const hasRow = async (email: string): Promise<boolean> => (await rig.dbs.owner.db.select({ id: user.id }).from(user).where(eq(user.email, email))).length > 0;

describe("guard 1: an account is created only inside a grant for its address", () => {
  const body = { name: "Pat Example", email: "pat@example.com", password: GOOD_PASSWORD };

  it("refuses a sign-up with no grant, and no row is written", async () => {
    expect(authErrorCode(await failure(rig.auth.api.signUpEmail({ body })))).toBe("FAILED_TO_CREATE_USER");
    expect(await countUsers(rig)).toBe(0);
    expect(await hasRow(body.email)).toBe(false);
  });

  it("refuses a sign-up when the grant names another address", async () => {
    const error = await failure(withAccountCreationGrant("someone-else@example.com", () => rig.auth.api.signUpEmail({ body })));
    expect(authErrorCode(error)).toBe("FAILED_TO_CREATE_USER");
    expect(await hasRow(body.email)).toBe(false);
  });

  it("creates the account inside a matching grant, with the address in lower case and a UUID id", async () => {
    const created = await createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { ...body, email: " Pat@Example.COM " });
    expect(created.email).toBe("pat@example.com");
    expect(created.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await hasRow("pat@example.com")).toBe(true);
  });

  it("canary: a 403 thrown from the create-user hook is answered as a success for a user that was never created (the reason the hook returns false)", async () => {
    const throwing = betterAuth({
      secret: TEST_SECRET,
      baseURL: TEST_ORIGIN,
      database: drizzleAdapter(rig.dbs.roles.leads_auth.db, { provider: "pg", schema: { user, session, account, verification } }),
      emailAndPassword: { enabled: true, autoSignIn: false },
      advanced: { database: { generateId: "uuid" } },
      databaseHooks: {
        user: {
          create: {
            before: async () => {
              throw new APIError("FORBIDDEN", { message: "no" });
            },
          },
        },
      },
    });
    const result = await throwing.api.signUpEmail({ body });
    expect(result.user.email).toBe(body.email);
    expect(await hasRow(body.email)).toBe(false);
  });
});

describe("guard 2: a sign-up for an address that exists reports it, instead of trusting the id Better Auth returns", () => {
  it("throws AccountAlreadyExistsError and leaves one row and the first password", async () => {
    await createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email: "dup@example.com", name: "First", password: GOOD_PASSWORD });
    const error = await failure(createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email: "DUP@example.com", name: "Second", password: NEW_PASSWORD }));
    expect(error).toBeInstanceOf(AccountAlreadyExistsError);
    expect(await countUsers(rig)).toBe(1);
    const rows = await rig.dbs.owner.db.select({ name: user.name }).from(user).where(eq(user.email, "dup@example.com"));
    expect(rows).toEqual([{ name: "First" }]);
  });

  it("canary: the raw call answers a duplicate with a success and an id that is not in the table", async () => {
    await createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email: "dup@example.com", name: "First", password: GOOD_PASSWORD });
    const raw = await withAccountCreationGrant("dup@example.com", () => rig.auth.api.signUpEmail({ body: { name: "Second", email: "dup@example.com", password: NEW_PASSWORD } }));
    expect(raw.user.id).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await rig.dbs.owner.db.select({ id: user.id }).from(user).where(eq(user.id, raw.user.id));
    expect(rows).toEqual([]);
  });
});

describe("guard 3: the secret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("canary: with no secret Better Auth signs with a default that is published in its source", async () => {
    // Better Auth falls back to these variables before it falls back to the default; blank them for this test.
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    const unsafe = betterAuth({
      secret: "",
      baseURL: TEST_ORIGIN,
      database: drizzleAdapter(rig.dbs.roles.leads_auth.db, { provider: "pg", schema: { user, session, account, verification } }),
    });
    expect((await unsafe.$context).secret).toBe("better-auth-secret-12345678901234567890");
  });
});

describe("password policy", () => {
  const attempt = (email: string, password: string) => createAccountWithGrant(rig.auth, rig.dbs.roles.leads_auth.db, { email, name: "Pat", password });

  it("refuses 11 characters, accepts 12, and asks the breach service about neither the short one nor a missing one", async () => {
    const error = await failure(attempt("short@example.com", "a".repeat(11)));
    expect(authErrorCode(error)).toBe("WEAK_PASSWORD");
    expect(rig.breach.checked).toEqual([]);
    expect(await hasRow("short@example.com")).toBe(false);

    await attempt("ok@example.com", "a1b2c3d4e5f6");
    expect(await hasRow("ok@example.com")).toBe(true);
    expect(rig.breach.checked).toEqual(["a1b2c3d4e5f6"]);
  });

  it("refuses more than 128 characters", async () => {
    expect(authErrorCode(await failure(attempt("long@example.com", "a".repeat(129))))).toBe("WEAK_PASSWORD");
  });

  it("refuses a password that is in a breach, creates nothing, and says so in words for the person", async () => {
    rig.breach.breached.add("password1234");
    const error = await failure(attempt("breach@example.com", "password1234"));
    expect(authErrorCode(error)).toBe("PASSWORD_BREACHED");
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).body?.message).toBe("That password has appeared in a data breach. Choose a different one.");
    expect(await hasRow("breach@example.com")).toBe(false);
  });

  it("refuses when the breach service is down, creates nothing, and says to try again", async () => {
    rig.breach.unavailable = true;
    const error = await failure(attempt("outage@example.com", GOOD_PASSWORD));
    expect(authErrorCode(error)).toBe("PASSWORD_CHECK_UNAVAILABLE");
    expect((error as APIError).body?.message).toBe("We could not check that password just now. Try again in a minute.");
    expect(await hasRow("outage@example.com")).toBe(false);
  });

  it("applies to a password change too, and keeps the old password when it refuses", async () => {
    await createUserIn(rig, world.kestrel, { email: "pat@example.com" });
    const signedIn = await signInWithPassword(rig.services, { email: "pat@example.com", password: GOOD_PASSWORD, address: "203.0.113.1" });
    if (signedIn.status !== "signed-in") throw new Error("setup: sign-in failed");
    const headers = requestHeadersFrom(signedIn.headers);

    expect(authErrorCode(await failure(rig.auth.api.changePassword({ body: { currentPassword: GOOD_PASSWORD, newPassword: "tooshort" }, headers })))).toBe("WEAK_PASSWORD");
    rig.breach.breached.add(NEW_PASSWORD);
    expect(authErrorCode(await failure(rig.auth.api.changePassword({ body: { currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD }, headers })))).toBe("PASSWORD_BREACHED");

    const again = await signInWithPassword(rig.services, { email: "pat@example.com", password: GOOD_PASSWORD, address: "203.0.113.1" });
    expect(again.status).toBe("signed-in");
  });

  it("does not apply at sign-in: a password that has since been found in a breach still signs in, so it can be changed", async () => {
    await createUserIn(rig, world.kestrel, { email: "pat@example.com" });
    rig.breach.breached.add(GOOD_PASSWORD);
    rig.breach.checked.length = 0;
    const result = await signInWithPassword(rig.services, { email: "pat@example.com", password: GOOD_PASSWORD, address: "203.0.113.1" });
    expect(result.status).toBe("signed-in");
    expect(rig.breach.checked).toEqual([]);
  });
});

describe("sign in", () => {
  const address = "203.0.113.20";

  it("signs in each kind of user, with the address in any case", async () => {
    await createUserIn(rig, world.fynix, { email: "admin@fynix.example" });
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    await createUserIn(rig, world.brightpath, { email: "agent@brightpath.example" });
    for (const email of ["Admin@Fynix.example", "client@KESTREL.example", " agent@brightpath.example "]) {
      const result = await signInWithPassword(rig.services, { email, password: GOOD_PASSWORD, address });
      expect(result.status, email).toBe("signed-in");
    }
  });

  it("gives one answer for a wrong password, an unknown address and a malformed one", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    for (const [email, password] of [
      ["client@kestrel.example", "wrong-password-entirely"],
      ["nobody@kestrel.example", GOOD_PASSWORD],
      ["not-an-email", GOOD_PASSWORD],
      ["client@kestrel.example", ""],
    ] as const) {
      expect(await signInWithPassword(rig.services, { email, password, address }), `${email} / ${password}`).toEqual({ status: "invalid-credentials" });
    }
  });

  it("makes no session for a user with no membership or a suspended one, and says so only after the right password", async () => {
    await createUserIn(rig, world.kestrel, { email: "nobody@kestrel.example", withoutMembership: true });
    await createUserIn(rig, world.kestrel, { email: "suspended@kestrel.example", status: "suspended" });
    expect(await signInWithPassword(rig.services, { email: "nobody@kestrel.example", password: GOOD_PASSWORD, address })).toEqual({ status: "not-active" });
    expect(await signInWithPassword(rig.services, { email: "suspended@kestrel.example", password: GOOD_PASSWORD, address })).toEqual({ status: "not-active" });
    expect(await signInWithPassword(rig.services, { email: "suspended@kestrel.example", password: "wrong-password-entirely", address })).toEqual({ status: "invalid-credentials" });
    const sessions = await rig.dbs.owner.db.select({ id: session.id }).from(session).innerJoin(user, eq(user.id, session.userId)).where(eq(user.email, "suspended@kestrel.example"));
    expect(sessions).toEqual([]);
  });
});

describe("sessions", () => {
  const lifetimeOf = async (email: string): Promise<number> => {
    const rows = await rig.dbs.owner.db
      .select({ createdAt: session.createdAt, expiresAt: session.expiresAt })
      .from(session)
      .innerJoin(user, eq(user.id, session.userId))
      .where(eq(user.email, email));
    const row = rows[0];
    if (row === undefined) throw new Error(`No session for ${email}`);
    return Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 1000);
  };

  it("last 14 days for a client and an agency user and 12 hours for a Fynix admin", async () => {
    await createUserIn(rig, world.fynix, { email: "admin@fynix.example" });
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    await createUserIn(rig, world.brightpath, { email: "agent@brightpath.example" });
    for (const email of ["admin@fynix.example", "client@kestrel.example", "agent@brightpath.example"]) {
      expect((await signInWithPassword(rig.services, { email, password: GOOD_PASSWORD, address: "203.0.113.30" })).status).toBe("signed-in");
    }
    expect(Math.abs((await lifetimeOf("admin@fynix.example")) - 43_200)).toBeLessThanOrEqual(5);
    expect(Math.abs((await lifetimeOf("client@kestrel.example")) - 1_209_600)).toBeLessThanOrEqual(5);
    expect(Math.abs((await lifetimeOf("agent@brightpath.example")) - 1_209_600)).toBeLessThanOrEqual(5);
  });

  it("are stored under a random id, with a token Better Auth signed, one row per sign-in", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    await signInWithPassword(rig.services, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: "203.0.113.31" });
    await signInWithPassword(rig.services, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: "203.0.113.31" });
    const rows = await rig.dbs.owner.db.select({ id: session.id, token: session.token }).from(session).innerJoin(user, eq(user.id, session.userId)).where(eq(user.email, "client@kestrel.example"));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.token)).size).toBe(2);
  });
});

describe("the session cookie", () => {
  const cookieLines = async (rigUnderTest: AuthRig, email: string): Promise<string[]> => {
    const result = await signInWithPassword(rigUnderTest.services, { email, password: GOOD_PASSWORD, address: "203.0.113.40" });
    if (result.status !== "signed-in") throw new Error("setup: sign-in failed");
    return result.headers.getSetCookie();
  };

  it("is host-only, HttpOnly, SameSite=Lax and not Secure on http", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    const lines = await cookieLines(rig, "client@kestrel.example");
    expect(lines).toHaveLength(1);
    const cookie = lines[0] ?? "";
    expect(cookie).toMatch(/^fynix-leads\.session_token=/);
    expect(SESSION_COOKIE_NAMES).toContain(cookie.split("=")[0]);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("is Secure, prefixed with __Secure- and still host-only on https", async () => {
    const secureRig = openAuthRig({ baseURL: "https://leads.example.test" });
    try {
      await createUserIn(secureRig, world.kestrel, { email: "client@kestrel.example" });
      const cookie = (await cookieLines(secureRig, "client@kestrel.example"))[0] ?? "";
      expect(cookie).toMatch(/^__Secure-fynix-leads\.session_token=/);
      expect(SESSION_COOKIE_NAMES).toContain(cookie.split("=")[0]);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).not.toMatch(/Domain=/i);
    } finally {
      await secureRig.close();
    }
  });
});
```

**File:** `server/auth/sign-in.integration.test.ts`

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signInChecks } from "@/lib/auth/rate-limit-rules";
import { keyHashFor } from "@/server/auth/rate-limit";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, createUserIn, openAuthRig, type AuthRig } from "@/server/auth/testing";
import { rateLimit } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** The sign-in service against the real Postgres rate limits: the clock is frozen at 09:07:30 so the window is known. */

let rig: AuthRig;
let world: SeedWorld;
const NOW = new Date("2026-12-01T09:07:30Z");

beforeAll(() => {
  rig = openAuthRig({ now: () => NOW });
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  world = await seedWorld(rig.dbs.owner, { withUsers: false });
});

const rows = () => rig.dbs.owner.db.select().from(rateLimit);

describe("sign-in is rate limited", () => {
  const ADDRESS = "203.0.113.50";

  it("blocks the ninth attempt from one network for one account, even with the right password, and not another network", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const wrong = await signInWithPassword(rig.services, { email: "client@kestrel.example", password: "wrong-password-entirely", address: ADDRESS });
      expect(wrong.status, `attempt ${attempt}`).toBe("invalid-credentials");
    }
    const blocked = await signInWithPassword(rig.services, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS });
    expect(blocked).toEqual({ status: "rate-limited", retryAfterSeconds: 450 });

    const elsewhere = await signInWithPassword(rig.services, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: "198.51.100.77" });
    expect(elsewhere.status).toBe("signed-in");
  });

  it("blocks a network that tries many accounts after 20 attempts", async () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const result = await signInWithPassword(rig.services, { email: `user${attempt}@example.com`, password: "wrong-password-entirely", address: ADDRESS });
      expect(result.status).toBe("invalid-credentials");
    }
    expect((await signInWithPassword(rig.services, { email: "user21@example.com", password: "x", address: ADDRESS })).status).toBe("rate-limited");
  });

  it("counts a successful sign-in too, and uses the three keys the rules name", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    await signInWithPassword(rig.services, { email: "Client@Kestrel.example", password: GOOD_PASSWORD, address: ADDRESS });
    const stored = (await rows()).map((row) => row.keyHash).sort();
    expect(stored).toEqual(signInChecks("client@kestrel.example", ADDRESS).map((check) => keyHashFor(check.key)).sort());
  });

  it("fails closed: when the limiter cannot run, nobody signs in", async () => {
    await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    const broken = { ...rig.services, publicDb: rig.dbs.roles.leads_client.db };
    await expect(signInWithPassword(broken, { email: "client@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS })).rejects.toThrow();
  });
});
```

**File:** `server/auth/session-context.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, createUserIn, openAuthRig, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import { campaign, member, session } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { selectCampaigns } from "@/server/db/tenant-reads";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** Session cookie to member to organisation kind to role pool, on the real test database. */

let rig: AuthRig;
let world: SeedWorld;
const ADDRESS = "203.0.113.60";
const HOUR_MS = 3_600_000;

beforeAll(() => {
  rig = openAuthRig();
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  world = await seedWorld(rig.dbs.owner, { withUsers: false });
});

/** Creates a user in `organisation`, signs in and returns the request headers a browser would then send. */
async function signedInHeaders(organisation: SeedWorld["fynix"], email: string, options: { readonly role?: "member" | "manager" } = {}): Promise<{ readonly headers: Headers; readonly userId: string }> {
  const { userId } = await createUserIn(rig, organisation, { email, role: options.role });
  const result = await signInWithPassword(rig.services, { email, password: GOOD_PASSWORD, address: ADDRESS });
  if (result.status !== "signed-in") throw new Error(`setup: ${email} could not sign in`);
  return { headers: requestHeadersFrom(result.headers), userId };
}

describe("resolveSessionContext", () => {
  it("resolves a Fynix admin to the Fynix pool, with no organisation scope to apply", async () => {
    const { headers, userId } = await signedInHeaders(world.fynix, "admin@fynix.example", { role: "manager" });
    const context = await resolveSessionContext(rig.resolution, headers);
    expect(context).toMatchObject({ kind: "fynix", role: "leads_fynix", userId, orgId: world.fynix.id, memberRole: "manager" });
  });

  it("resolves a client user to the client pool and its own organisation", async () => {
    const { headers, userId } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    expect(await resolveSessionContext(rig.resolution, headers)).toMatchObject({ kind: "client", role: "leads_client", userId, orgId: world.kestrel.id, memberRole: "member" });
  });

  it("resolves an agency user to the agency pool and its own organisation, with the name on the account", async () => {
    const { headers, userId } = await signedInHeaders(world.northgate, "agent@northgate.example");
    expect(await resolveSessionContext(rig.resolution, headers)).toMatchObject({ kind: "agency", role: "leads_agency", userId, orgId: world.northgate.id, name: "Name of agent@northgate.example" });
  });

  it("returns null for no cookie, a garbage cookie and a cookie whose signature was changed", async () => {
    const { headers } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    const cookie = headers.get("cookie") ?? "";
    expect(await resolveSessionContext(rig.resolution, new Headers())).toBeNull();
    expect(await resolveSessionContext(rig.resolution, new Headers({ cookie: "fynix-leads.session_token=garbage" }))).toBeNull();
    const tampered = cookie.replace(/.$/, cookie.endsWith("A") ? "B" : "A");
    expect(tampered).not.toBe(cookie);
    expect(await resolveSessionContext(rig.resolution, new Headers({ cookie: tampered }))).toBeNull();
  });

  it("returns null once the session is signed out", async () => {
    const { headers } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    expect(await resolveSessionContext(rig.resolution, headers)).not.toBeNull();
    await rig.auth.api.signOut({ headers });
    expect(await resolveSessionContext(rig.resolution, headers)).toBeNull();
  });

  it("returns null once the session row has expired", async () => {
    const { headers, userId } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    await rig.dbs.owner.db.update(session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(session.userId, userId));
    expect(await resolveSessionContext(rig.resolution, headers)).toBeNull();
  });

  it("returns null as soon as the membership is suspended or removed, although the session is still live", async () => {
    const { headers, userId } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.userId, userId));
    expect(await resolveSessionContext(rig.resolution, headers)).toBeNull();
    await rig.dbs.owner.db.update(member).set({ status: "active" }).where(eq(member.userId, userId));
    expect(await resolveSessionContext(rig.resolution, headers)).not.toBeNull();
    await rig.dbs.owner.db.delete(member).where(eq(member.userId, userId));
    expect(await resolveSessionContext(rig.resolution, headers)).toBeNull();
  });

  it("does not extend a session by reading it, even when the read asks for a refresh", async () => {
    const { headers, userId } = await signedInHeaders(world.kestrel, "client@kestrel.example");
    // Two days used: past Better Auth's one-day update age, the point at which it would normally push the expiry out.
    const twelveDaysFromNow = new Date(Date.now() + 12 * 24 * HOUR_MS);
    await rig.dbs.owner.db.update(session).set({ expiresAt: twelveDaysFromNow }).where(eq(session.userId, userId));
    await rig.auth.api.getSession({ headers, query: { disableRefresh: false } });
    await resolveSessionContext(rig.resolution, headers);
    const rows = await rig.dbs.owner.db.select({ expiresAt: session.expiresAt }).from(session).where(eq(session.userId, userId));
    expect(rows[0]?.expiresAt.getTime()).toBe(twelveDaysFromNow.getTime());
  });
});

describe("the lifetime is checked twice", () => {
  it("a Fynix session is over after 12 hours and a client session is not", async () => {
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");
    const client = await signedInHeaders(world.kestrel, "client@kestrel.example");
    const at = (hours: number) => ({ ...rig.resolution, now: () => new Date(Date.now() + hours * HOUR_MS) });
    expect(await resolveSessionContext(at(11), admin.headers)).not.toBeNull();
    expect(await resolveSessionContext(at(13), admin.headers)).toBeNull();
    expect(await resolveSessionContext(at(13), client.headers)).not.toBeNull();
    expect(await resolveSessionContext(at(14 * 24 + 1), client.headers)).toBeNull();
  });

  it("holds even if the stored expiry were extended: a Fynix session older than 12 hours does not resolve", async () => {
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");
    await rig.dbs.owner.db.update(session).set({ expiresAt: new Date(Date.now() + 30 * 24 * HOUR_MS) }).where(eq(session.userId, admin.userId));
    expect(await resolveSessionContext({ ...rig.resolution, now: () => new Date(Date.now() + 13 * HOUR_MS) }, admin.headers)).toBeNull();
  });
});

describe("the second factor extension point", () => {
  it("accepts every session today: Fynix is password only until gate G1", async () => {
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");
    expect(await resolveSessionContext(rig.resolution, admin.headers)).not.toBeNull();
  });

  it("is consulted for every session, and a refusal means not signed in", async () => {
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");
    const seen: string[] = [];
    const refusing = { ...rig.resolution, secondFactor: async (subject: { readonly kind: string }) => (seen.push(subject.kind), false) };
    expect(await resolveSessionContext(refusing, admin.headers)).toBeNull();
    expect(seen).toEqual(["fynix"]);
  });
});

describe("a resolved session picks the role pool that sees only its own rows", () => {
  it("client and agency see their own two campaigns, and Fynix sees all four", async () => {
    const client = await signedInHeaders(world.kestrel, "client@kestrel.example");
    const agency = await signedInHeaders(world.brightpath, "agent@brightpath.example");
    const admin = await signedInHeaders(world.fynix, "admin@fynix.example");

    const asTenant = async (headers: Headers) => {
      const context = await resolveSessionContext(rig.resolution, headers);
      if (context === null || context.kind === "fynix") throw new Error("expected a tenant session");
      const rows = await withScope(rig.dbs.roles[context.role].db, { orgId: context.orgId, userId: context.userId }, (tx) => selectCampaigns(tx, context.role));
      return rows.map((row) => row.publicRef).sort();
    };
    expect(await asTenant(client.headers)).toEqual(world.campaigns.filter((row) => row.client.id === world.kestrel.id).map((row) => row.publicRef).sort());
    expect(await asTenant(agency.headers)).toEqual(world.campaigns.filter((row) => row.agency.id === world.brightpath.id).map((row) => row.publicRef).sort());

    const fynixContext = await resolveSessionContext(rig.resolution, admin.headers);
    if (fynixContext === null) throw new Error("expected a Fynix session");
    const all = await withScope(rig.dbs.roles[fynixContext.role].db, { orgId: null, userId: fynixContext.userId }, (tx) => tx.select({ publicRef: campaign.publicRef }).from(campaign));
    expect(all).toHaveLength(4);
  });
});

describe("the auth database role reads exactly what resolution needs", () => {
  it("leads_auth can read the membership columns and cannot write the table", async () => {
    const { userId } = await createUserIn(rig, world.kestrel, { email: "client@kestrel.example" });
    const authDb = rig.dbs.roles.leads_auth.db;
    const readable = await authDb.select({ orgKind: member.orgKind }).from(member).where(eq(member.userId, userId));
    expect(readable).toEqual([{ orgKind: "client" }]);
    await expect(authDb.update(member).set({ status: "suspended" }).where(eq(member.userId, userId))).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run the tests and see them fail**

```bash
pnpm exec vitest run server/auth
pnpm exec vitest run --config vitest.integration.config.mts server/auth
```

Expected: FAIL, in the unit run `auth-schema.test.ts` and `create-auth.test.ts` fail to load (`Cannot find package '@/server/auth/create-auth'`), the other four `server/auth` unit files pass; in the integration run three of the four files fail to load (`create-account`, `session-context`, `sign-in`) and `rate-limit.integration.test.ts` still passes.

- [ ] **Step 5: Write the modules**

**File:** `server/auth/membership.ts`

```typescript
import { eq } from "drizzle-orm";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import type { Database } from "@/server/db/pool";
import { member } from "@/server/db/schema";

/** What session resolution needs to know about a user: which organisation, of what kind, in what role, active or not. */
export interface Membership {
  readonly userId: string;
  readonly orgId: string;
  readonly orgKind: OrganisationKind;
  readonly role: "member" | "manager";
  readonly status: "active" | "suspended";
}

/**
 * The membership of one user, or `null` when the user belongs to no organisation. Run it with the `leads_auth`
 * database: that role may read exactly these five columns of `member` and nothing else on it, and the column list below
 * is the same five (a `select()` with no columns would be refused).
 */
export async function readMembership(db: Database, userId: string): Promise<Membership | null> {
  const rows = await db
    .select({ userId: member.userId, orgId: member.orgId, orgKind: member.orgKind, role: member.role, status: member.status })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
```

**File:** `server/auth/errors.ts`

```typescript
import { isAPIError } from "better-auth/api";

/** The `code` of a Better Auth error, or `undefined` when the value is not one. Real faults are not API errors, so they never match a code. */
export function authErrorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const code: unknown = error.body?.code;
  return typeof code === "string" ? code : undefined;
}

/** The message Better Auth or our password hook attached, for the codes whose text is meant for the person. */
export function authErrorMessage(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const message: unknown = error.body?.message;
  return typeof message === "string" ? message : undefined;
}

export const INVALID_CREDENTIALS_CODE = "INVALID_EMAIL_OR_PASSWORD";
export const FAILED_TO_CREATE_SESSION_CODE = "FAILED_TO_CREATE_SESSION";
/** A reset token that was never issued, was used, or has expired. */
export const DEAD_TOKEN_CODES: ReadonlySet<string> = new Set(["INVALID_TOKEN", "TOKEN_EXPIRED"]);
/** Codes the password hook throws, and the two lengths Better Auth itself checks. */
export const PASSWORD_PROBLEM_CODES: ReadonlySet<string> = new Set(["WEAK_PASSWORD", "PASSWORD_BREACHED", "PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG"]);
export const PASSWORD_CHECK_UNAVAILABLE_CODE = "PASSWORD_CHECK_UNAVAILABLE";
```

**File:** `server/auth/create-auth.ts`

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLengthProblem } from "@/lib/auth/password-policy";
import { PASSWORD_RESET_LIFETIME_SECONDS, SESSION_LIFETIME_SECONDS, sessionLifetimeSeconds } from "@/lib/auth/session-lifetime";
import { hasAccountCreationGrant } from "@/server/auth/account-creation-grant";
import { BreachCheckUnavailableError, type BreachChecker } from "@/server/auth/breach-check";
import type { ResetMailer } from "@/server/auth/mail";
import { readMembership } from "@/server/auth/membership";
import type { Database } from "@/server/db/pool";
import { account, session, user, verification } from "@/server/db/schema";

export const MIN_SECRET_LENGTH = 32;
/** The secret Better Auth uses when it is given none. It is in the package source, so it is not a secret. */
const BETTER_AUTH_PUBLIC_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";

export interface AuthConfig {
  /** The `leads_auth` database: the only role that may touch the auth tables. */
  readonly db: Database;
  readonly secret: string;
  /** The origin this app is served from, for example `https://leads.fynix.digital`. Also the only trusted origin. */
  readonly baseURL: string;
  readonly breachChecker: BreachChecker;
  readonly mailer: ResetMailer;
  /** Server actions need this to write session cookies. Scripts and tests run outside Next.js and leave it off. */
  readonly nextCookies: boolean;
}

/**
 * Guard 3 of 3 (master plan, section 3). Better Auth warns about a secret under 32 characters and carries on, and with
 * no secret at all it signs sessions with a default that is published in its source, so every session would be forgeable.
 * Refuse instead. Also refuse `BETTER_AUTH_SECRETS`, which Better Auth reads when set and which then replaces the
 * secret passed here.
 */
export function assertUsableSecret(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`The auth secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  if (secret === BETTER_AUTH_PUBLIC_DEFAULT_SECRET) throw new Error("The auth secret is Better Auth's public default. Generate a random one.");
  if (process.env.BETTER_AUTH_SECRETS !== undefined) {
    throw new Error("BETTER_AUTH_SECRETS is set and would replace the configured auth secret. Unset it.");
  }
}

/** The routes that choose a new password, and the body field that carries it. Sign-in is not here: it accepts what the account has. */
const NEW_PASSWORD_FIELDS: Readonly<Record<string, "password" | "newPassword">> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
  "/set-password": "newPassword",
};

/**
 * Better Auth checks only the length it is given. This runs before every route that chooses a password, so no form,
 * script or route added later can skip the full rule: 12 or more characters and not in a known breach. A breach check
 * that cannot be made refuses the password too (see BreachCheckUnavailableError): the person is asked to try again, and
 * nothing is accepted unchecked.
 */
function passwordPolicy(checker: BreachChecker) {
  return createAuthMiddleware(async (ctx) => {
    const field = NEW_PASSWORD_FIELDS[ctx.path];
    if (field === undefined) return;
    const body: unknown = ctx.body;
    const password = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[field] : undefined;
    // A missing or non-string password is left to the route's own body validation.
    if (typeof password !== "string") return;

    const lengthProblem = passwordLengthProblem(password);
    if (lengthProblem !== null) throw new APIError("BAD_REQUEST", { code: "WEAK_PASSWORD", message: lengthProblem });

    let breached: boolean;
    try {
      breached = await checker.isBreached(password);
    } catch (error) {
      if (error instanceof BreachCheckUnavailableError) {
        throw new APIError("SERVICE_UNAVAILABLE", {
          code: "PASSWORD_CHECK_UNAVAILABLE",
          message: "We could not check that password just now. Try again in a minute.",
        });
      }
      throw error;
    }
    if (breached) {
      throw new APIError("BAD_REQUEST", { code: "PASSWORD_BREACHED", message: "That password has appeared in a data breach. Choose a different one." });
    }
  });
}

export function createAuth(config: AuthConfig) {
  assertUsableSecret(config.secret);

  return betterAuth({
    appName: "Fynix Leads",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [config.baseURL],
    database: drizzleAdapter(config.db, { provider: "pg", schema: { user, session, account, verification } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Guard 2 of 3: with auto sign-in off, a sign-up for an address that already has an account is answered with a
      // success and a user id that was never stored. server/auth/create-account.ts checks the stored row.
      autoSignIn: false,
      // A reset is how someone locked out, or who fears their password is known, gets back in: every session of the
      // account ends with it.
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_LIFETIME_SECONDS,
      sendResetPassword: ({ user: recipient, token }) => config.mailer.sendPasswordReset({ email: recipient.email, token }),
    },
    session: {
      // The longest any session lasts. The hook below shortens it for Fynix.
      expiresIn: SESSION_LIFETIME_SECONDS.client,
      // Fixed lifetimes: using a session never extends it, so a Fynix session ends 12 hours after sign-in.
      disableSessionRefresh: true,
      // No cookie cache: a cached session would keep working after it is revoked, by a password reset for one.
      cookieCache: { enabled: false },
    },
    advanced: {
      // UUIDs, so `app.user_id` in the scope helper is always a UUID and the id columns are uuid.
      database: { generateId: "uuid" },
      cookiePrefix: "fynix-leads",
      // Behind nginx only x-real-ip is trusted: nginx overwrites it with the connecting address, while a client can put
      // anything in x-forwarded-for. server/auth/client-address.ts reads the same header for the rate limits.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      // No cross-subdomain cookie setting: cookies are host-only, never shared with another host under fynix.digital.
    },
    databaseHooks: {
      user: {
        create: {
          before: async (candidate) => {
            // Guard 1 of 3. Refuse by returning false. Never throw a 403 here: Better Auth turns a 403 from this hook
            // into a success response for a user that was never created.
            if (!hasAccountCreationGrant(candidate.email)) return false;
            return;
          },
        },
      },
      session: {
        create: {
          before: async (candidate) => {
            const membership = await readMembership(config.db, candidate.userId);
            // A user who belongs to no organisation, or whose membership is suspended, gets no session at all.
            if (membership === null || membership.status !== "active") return false;
            return { data: { expiresAt: new Date(Date.now() + sessionLifetimeSeconds(membership.orgKind) * 1000) } };
          },
        },
      },
    },
    hooks: { before: passwordPolicy(config.breachChecker) },
    plugins: config.nextCookies ? [nextCookies()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

**File:** `server/auth/create-account.ts`

```typescript
import { and, eq } from "drizzle-orm";
import { normaliseEmail } from "@/lib/auth/email";
import { withAccountCreationGrant } from "@/server/auth/account-creation-grant";
import type { Auth } from "@/server/auth/create-auth";
import type { Database } from "@/server/db/pool";
import { user } from "@/server/db/schema";

export class AccountAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`An account for ${email} already exists.`);
    this.name = "AccountAlreadyExistsError";
  }
}

export interface NewAccount {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

export interface CreatedAccount {
  readonly userId: string;
  readonly email: string;
}

/**
 * The only supported way to create an account: inside a grant for that address, then a check that the row exists.
 * Guard 2 of 3 (master plan, section 3): with auto sign-in off, Better Auth answers a sign-up for an address that already
 * has an account with a success and a user id that was never stored. Nobody may rely on that id, so the stored row is
 * read back by id and address before anything is returned. A weak or breached password rejects with Better Auth's
 * error (see server/auth/errors.ts for the codes).
 *
 * `authDb` is the `leads_auth` database, the same one `auth` runs on.
 */
export async function createAccountWithGrant(auth: Auth, authDb: Database, account: NewAccount): Promise<CreatedAccount> {
  const email = normaliseEmail(account.email);
  const result = await withAccountCreationGrant(email, () => auth.api.signUpEmail({ body: { name: account.name, email, password: account.password } }));

  const stored = await authDb
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, result.user.id), eq(user.email, email)))
    .limit(1);
  if (stored.length === 0) throw new AccountAlreadyExistsError(email);
  return { userId: result.user.id, email };
}
```

**File:** `server/auth/second-factor.ts`

```typescript
import type { OrganisationKind } from "@/lib/auth/session-lifetime";

/** What the check needs to know about the session it is asked about. */
export interface SecondFactorSubject {
  readonly kind: OrganisationKind;
  readonly userId: string;
  readonly sessionId: string;
}

export type SecondFactorCheck = (subject: SecondFactorSubject) => Promise<boolean>;

/**
 * EXTENSION POINT FOR GATE G1 (master plan, sections 1 and 7: decision D3). Phase 1 signs the Fynix admin in with a
 * password only, so this accepts every session. Before any real client or agency data is entered, G1 replaces it with a
 * check that the Fynix user's session completed an authenticator-app code or a passkey step (Better Auth's two-factor
 * plugin), and may add the same for other kinds. `resolveSessionContext` already calls it for every session and treats
 * `false` as "not signed in", so nothing else changes when G1 lands. Nothing here implements a second factor.
 */
export const secondFactorSatisfied: SecondFactorCheck = async () => true;
```

**File:** `server/auth/session-context.ts`

```typescript
import { sessionTooOld, type OrganisationKind } from "@/lib/auth/session-lifetime";
import { readMembership } from "@/server/auth/membership";
import { secondFactorSatisfied, type SecondFactorCheck } from "@/server/auth/second-factor";
import type { Database } from "@/server/db/pool";
import type { TenantRoleName } from "@/server/db/roles";

/** The part of Better Auth that session resolution uses. The real `Auth` fits it; a unit test passes a fake. */
export interface SessionReader {
  readonly api: {
    getSession(input: {
      headers: Headers;
      query: { disableRefresh: true };
    }): Promise<{
      readonly session: { readonly id: string; readonly createdAt: Date };
      readonly user: { readonly id: string; readonly name: string };
    } | null>;
  };
}

interface SessionContextBase {
  readonly userId: string;
  /** The name on the account, for greeting the person. Not the display name other users see (phase 1C and 1E). */
  readonly name: string;
  readonly sessionId: string;
  readonly orgId: string;
  readonly memberRole: "member" | "manager";
}

/** A signed-in Fynix admin. Runs on the `leads_fynix` pool, which sees every organisation. */
export interface FynixSessionContext extends SessionContextBase {
  readonly kind: "fynix";
  readonly role: "leads_fynix";
}

/** A signed-in client or agency user. Runs on the pool of its own role, scoped to its own organisation. */
export interface TenantSessionContext extends SessionContextBase {
  readonly kind: "client" | "agency";
  readonly role: TenantRoleName;
}

/** Who the request is, resolved from the session cookie: the user, their organisation and its kind, and so the role pool to use. */
export type SessionContext = FynixSessionContext | TenantSessionContext;

export interface SessionResolution {
  readonly reader: SessionReader;
  /** The `leads_auth` database, which may read `member`. */
  readonly authDb: Database;
  readonly now?: () => Date;
  readonly secondFactor?: SecondFactorCheck;
}

function contextFor(kind: OrganisationKind, base: SessionContextBase): SessionContext {
  switch (kind) {
    case "fynix":
      return { ...base, kind, role: "leads_fynix" };
    case "client":
      return { ...base, kind, role: "leads_client" };
    case "agency":
      return { ...base, kind, role: "leads_agency" };
  }
}

/**
 * Session cookie to role pool: session, then member, then organisation kind. Returns `null` (not signed in) when
 * - there is no valid, unexpired session (Better Auth checks the cookie signature, the row and its expiry);
 * - the user belongs to no organisation or the membership is suspended, so a suspension takes effect on the next request;
 * - the session is older than its kind allows, counted from when it was created. Better Auth's own expiry already says
 *   so; this is a second, independent check, so a Fynix session cannot outlive 12 hours through a configuration slip;
 * - the second factor check says no (see server/auth/second-factor.ts).
 * Refresh is off: reading a session never extends it.
 */
export async function resolveSessionContext(deps: SessionResolution, headers: Headers): Promise<SessionContext | null> {
  const found = await deps.reader.api.getSession({ headers, query: { disableRefresh: true } });
  if (found === null) return null;

  const membership = await readMembership(deps.authDb, found.user.id);
  if (membership === null || membership.status !== "active") return null;

  const now = deps.now?.() ?? new Date();
  if (sessionTooOld(membership.orgKind, found.session.createdAt, now)) return null;

  const secondFactor = deps.secondFactor ?? secondFactorSatisfied;
  if (!(await secondFactor({ kind: membership.orgKind, userId: found.user.id, sessionId: found.session.id }))) return null;

  return contextFor(membership.orgKind, { userId: found.user.id, name: found.user.name, sessionId: found.session.id, orgId: membership.orgId, memberRole: membership.role });
}
```

**File:** `server/auth/sign-in.ts`

```typescript
import { normaliseEmail } from "@/lib/auth/email";
import { signInChecks } from "@/lib/auth/rate-limit-rules";
import type { Auth } from "@/server/auth/create-auth";
import { authErrorCode, FAILED_TO_CREATE_SESSION_CODE, INVALID_CREDENTIALS_CODE } from "@/server/auth/errors";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import type { Database } from "@/server/db/pool";

export interface AuthServices {
  readonly auth: Auth;
  /** The `leads_public` database, for the rate limits. */
  readonly publicDb: Database;
  readonly now?: () => Date;
}

export type SignInResult =
  /** `headers` carries the `Set-Cookie` for the new session. Inside Next.js the nextCookies plugin has also set it. */
  | { readonly status: "signed-in"; readonly userId: string; readonly headers: Headers }
  /** One answer for an unknown address, a wrong password and a malformed request, so nothing says which accounts exist. */
  | { readonly status: "invalid-credentials" }
  /** The password was right but the user has no active membership, so no session was made. */
  | { readonly status: "not-active" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/** Better Auth's reasons for a request that is wrong and not a fault: all of them are shown as invalid credentials. */
const CREDENTIAL_PROBLEM_CODES: ReadonlySet<string> = new Set([INVALID_CREDENTIALS_CODE, "INVALID_EMAIL", "INVALID_PASSWORD"]);

/**
 * Signs a user in with email and password. The three rate limits (network, account and network, account) are consumed
 * first, on every attempt, success or not, through `leads_public` and outside any transaction. If the limiter fails the
 * error propagates and nobody signs in: it fails closed.
 */
export async function signInWithPassword(
  services: AuthServices,
  input: { readonly email: string; readonly password: string; readonly address: string; readonly headers?: Headers },
): Promise<SignInResult> {
  const email = normaliseEmail(input.email);
  const blocked = await firstBlockedLimit(services.publicDb, signInChecks(email, input.address), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };

  try {
    const { headers, response } = await services.auth.api.signInEmail({ body: { email, password: input.password }, headers: input.headers, returnHeaders: true });
    return { status: "signed-in", userId: response.user.id, headers };
  } catch (error) {
    const code = authErrorCode(error);
    if (code !== undefined && CREDENTIAL_PROBLEM_CODES.has(code)) return { status: "invalid-credentials" };
    if (code === FAILED_TO_CREATE_SESSION_CODE) return { status: "not-active" };
    throw error;
  }
}
```

- [ ] **Step 6: Run the tests and see them pass**

```bash
pnpm exec vitest run server/auth lib/auth
pnpm test:integration
pnpm typecheck
pnpm lint
```

Expected: `server/auth` and `lib/auth` unit: 13 files, 68 tests; `pnpm test`: 49 files, 589 tests; `pnpm test:integration`: 8 files, 262 tests; typecheck and lint clean.

- [ ] **Step 7: Commit**

```bash
git add server/auth
git commit -m "Add the Better Auth instance with its three guards, account creation, sign-in and session resolution"
```

---

## Task 8: Password reset, the request context and the app wiring

**Files:** Create `server/auth/password-reset.ts`, `client-address.ts`, `with-session.ts`, `index.ts`, `guard.ts`, `actions.ts`; tests `password-reset.integration.test.ts`, `client-address.test.ts`, `with-session.test.ts`, `guard.test.ts`, `actions.test.ts`, `boundaries.test.ts`.

- `password-reset.ts`: ask for a link (rate limits first, same answer for every address) and choose a new password (token, policy, every session of the account ends).
- `client-address.ts`: the network address for rate limits, from `x-real-ip` only.
- `with-session.ts`: a resolved session to the role pool, through the 1A scope helpers.
- `index.ts` (`server-only`): the app's `getAuth`, `getAuthServices` and `getSessionContext`.
- `guard.ts` (`server-only`): `requireSessionContext` for pages.
- `actions.ts` (`use server`): the server actions the Part B forms call. They are thin: read the form, call a service, return an `AuthFormState` or redirect. They are server code with no markup, so they are built and tested here; Part B only renders what they return.
- `boundaries.test.ts`: source rules (Better Auth only inside `server/auth`, no mounted handler, host-only cookies, `server-only` on the files that need it, the actions file exports only async functions).

- [ ] **Step 1: Write the tests**

**File:** `server/auth/password-reset.integration.test.ts`

```typescript
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { completePasswordReset, requestPasswordReset } from "@/server/auth/password-reset";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD, createUserIn, latestResetToken, openAuthRig, outboxFor, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import { emailOutbox, session, verification } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/** The password reset flow end to end: request, the queued message, the token, the new password, the ended sessions. */

let rig: AuthRig;
let world: SeedWorld;
const ADDRESS = "203.0.113.70";
const EMAIL = "client@kestrel.example";

beforeAll(() => {
  rig = openAuthRig();
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  world = await seedWorld(rig.dbs.owner, { withUsers: false });
  rig.breach.breached.clear();
  rig.breach.unavailable = false;
});

const signIn = (email: string, password: string, address = ADDRESS) => signInWithPassword(rig.services, { email, password, address });
const request = (email: string, address = ADDRESS) => requestPasswordReset(rig.services, { email, address });
const complete = (token: string, newPassword: string, address = ADDRESS) => completePasswordReset(rig.services, { token, newPassword, address });
const verificationRows = () => rig.dbs.owner.db.select().from(verification).where(like(verification.identifier, "reset-password:%"));

describe("asking for a reset link", () => {
  it("queues one message for the address, written as leads_public, with a link to this app's reset page", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    expect(await request("Client@Kestrel.example")).toEqual({ status: "sent" });
    const messages = await outboxFor(rig, EMAIL);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.subject).toBe("Reset your Fynix Leads password");
    expect(messages[0]?.body).toContain("http://localhost:3020/reset-password?token=");
    expect(messages[0]?.body).toContain("within 60 minutes");
    const stored = await rig.dbs.owner.db.select({ status: emailOutbox.status, template: emailOutbox.template }).from(emailOutbox);
    expect(stored).toEqual([{ status: "pending", template: "password_reset" }]);
  });

  it("gives the same answer and queues nothing for an unknown or a malformed address", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    expect(await request("nobody@kestrel.example")).toEqual({ status: "sent" });
    expect(await request("not an email")).toEqual({ status: "sent" });
    expect(await request("a".repeat(300) + "@example.com")).toEqual({ status: "sent" });
    expect(await rig.dbs.owner.db.select().from(emailOutbox)).toEqual([]);
    expect(await verificationRows()).toEqual([]);
  });

  it("limits one account to three reset requests an hour, whoever asks, and says nothing about whether the account exists", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    for (const [index, address] of ["203.0.113.71", "203.0.113.72", "203.0.113.73"].entries()) {
      expect(await request(EMAIL, address), `request ${index + 1}`).toEqual({ status: "sent" });
    }
    expect((await request(EMAIL, "203.0.113.74")).status).toBe("rate-limited");
    expect((await request("nobody@example.com", "203.0.113.75")).status).toBe("sent");
    for (const address of ["203.0.113.76", "203.0.113.77", "203.0.113.78"]) await request("nobody@kestrel.example", address);
    expect((await request("nobody@kestrel.example", "203.0.113.79")).status).toBe("rate-limited");
    expect(await outboxFor(rig, EMAIL)).toHaveLength(3);
  });

  it("limits one network to ten requests an hour", async () => {
    for (let index = 1; index <= 10; index += 1) expect((await request(`person${index}@example.com`)).status).toBe("sent");
    expect((await request("person11@example.com")).status).toBe("rate-limited");
  });

  it("stores the token in the verification table with a one hour expiry", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const rows = await verificationRows();
    expect(rows).toHaveLength(1);
    const lifetime = Math.round(((rows[0]?.expiresAt.getTime() ?? 0) - (rows[0]?.createdAt.getTime() ?? 0)) / 1000);
    expect(Math.abs(lifetime - 3600)).toBeLessThanOrEqual(5);
  });
});

describe("choosing a new password", () => {
  it("replaces the password, so the old one stops working and the new one signs in", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const token = await latestResetToken(rig, EMAIL);
    expect(await complete(token, NEW_PASSWORD)).toEqual({ status: "reset" });
    expect((await signIn(EMAIL, GOOD_PASSWORD)).status).toBe("invalid-credentials");
    expect((await signIn(EMAIL, NEW_PASSWORD)).status).toBe("signed-in");
  });

  it("works once: the second use of the same link is an invalid token", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const token = await latestResetToken(rig, EMAIL);
    expect((await complete(token, NEW_PASSWORD)).status).toBe("reset");
    expect(await complete(token, "a-third-long-passphrase-7")).toEqual({ status: "invalid-token" });
    expect((await signIn(EMAIL, NEW_PASSWORD)).status).toBe("signed-in");
  });

  it("refuses a token that was never issued", async () => {
    expect(await complete("never-issued-token-000000", NEW_PASSWORD)).toEqual({ status: "invalid-token" });
  });

  it("refuses a token after an hour", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const token = await latestResetToken(rig, EMAIL);
    await rig.dbs.owner.db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(like(verification.identifier, "reset-password:%"));
    expect(await complete(token, NEW_PASSWORD)).toEqual({ status: "invalid-token" });
    expect((await signIn(EMAIL, GOOD_PASSWORD)).status).toBe("signed-in");
  });

  it("applies the password policy, and a refused password does not use up the link", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    const token = await latestResetToken(rig, EMAIL);

    expect(await complete(token, "short")).toEqual({ status: "weak-password", message: "Use at least 12 characters." });
    rig.breach.breached.add(NEW_PASSWORD);
    expect(await complete(token, NEW_PASSWORD)).toEqual({ status: "weak-password", message: "That password has appeared in a data breach. Choose a different one." });
    rig.breach.unavailable = true;
    expect(await complete(token, "a-fine-long-passphrase-3")).toEqual({ status: "check-unavailable" });
    expect((await signIn(EMAIL, GOOD_PASSWORD)).status).toBe("signed-in");

    rig.breach.unavailable = false;
    expect(await complete(token, "a-fine-long-passphrase-3")).toEqual({ status: "reset" });
  });

  it("ends every session of the account and leaves other people's sessions alone", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await createUserIn(rig, world.halden, { email: "other@halden.example" });
    const first = await signIn(EMAIL, GOOD_PASSWORD, "203.0.113.81");
    const second = await signIn(EMAIL, GOOD_PASSWORD, "203.0.113.82");
    const other = await signIn("other@halden.example", GOOD_PASSWORD, "203.0.113.83");
    if (first.status !== "signed-in" || second.status !== "signed-in" || other.status !== "signed-in") throw new Error("setup: sign-in failed");
    const headers = [first, second, other].map((result) => requestHeadersFrom(result.headers));
    for (const each of headers) expect(await resolveSessionContext(rig.resolution, each)).not.toBeNull();

    await request(EMAIL);
    expect((await complete(await latestResetToken(rig, EMAIL), NEW_PASSWORD)).status).toBe("reset");

    expect(await resolveSessionContext(rig.resolution, headers[0] ?? new Headers())).toBeNull();
    expect(await resolveSessionContext(rig.resolution, headers[1] ?? new Headers())).toBeNull();
    expect(await resolveSessionContext(rig.resolution, headers[2] ?? new Headers())).not.toBeNull();
    expect(await rig.dbs.owner.db.select({ id: session.id }).from(session).where(eq(session.userId, first.userId))).toEqual([]);
  });

  it("does not sign anyone in: the person signs in with the new password", async () => {
    await createUserIn(rig, world.kestrel, { email: EMAIL });
    await request(EMAIL);
    await complete(await latestResetToken(rig, EMAIL), NEW_PASSWORD);
    expect(await rig.dbs.owner.db.select({ id: session.id }).from(session)).toEqual([]);
  });

  it("limits token attempts to 20 an hour per network", async () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) expect((await complete(`guess-${attempt}-000000000000`, NEW_PASSWORD)).status).toBe("invalid-token");
    expect((await complete("guess-21-000000000000", NEW_PASSWORD)).status).toBe("rate-limited");
    expect((await complete("guess-22-000000000000", NEW_PASSWORD, "198.51.100.5")).status).toBe("invalid-token");
  });
});
```

**File:** `server/auth/client-address.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { clientAddressFrom } from "./client-address";

describe("clientAddressFrom", () => {
  it("reads x-real-ip", () => {
    expect(clientAddressFrom(new Headers({ "x-real-ip": " 203.0.113.9 " }))).toBe("203.0.113.9");
  });

  it("ignores x-forwarded-for, which a client can set to anything", () => {
    expect(clientAddressFrom(new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }))).toBe("unknown");
    expect(clientAddressFrom(new Headers({ "x-forwarded-for": "198.51.100.1", "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to one shared bucket when the header is missing, empty or too long to be an address", () => {
    expect(clientAddressFrom(new Headers())).toBe("unknown");
    expect(clientAddressFrom(new Headers({ "x-real-ip": "   " }))).toBe("unknown");
    expect(clientAddressFrom(new Headers({ "x-real-ip": "9".repeat(65) }))).toBe("unknown");
  });
});
```

**File:** `server/auth/with-session.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/server/auth/session-context";

const calls: { readonly fn: string; readonly args: unknown[] }[] = [];

vi.mock("@/server/db/scope", () => ({
  withFynixScope: async (...args: unknown[]) => {
    calls.push({ fn: "withFynixScope", args: args.slice(0, 1) });
    return "fynix";
  },
  withOrgScope: async (...args: unknown[]) => {
    calls.push({ fn: "withOrgScope", args: args.slice(0, 2) });
    return "tenant";
  },
}));

const { withSessionScope } = await import("./with-session");

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const base = { userId: USER, name: "Pat Example", sessionId: "s", orgId: ORG, memberRole: "member" } as const;
const work = async (): Promise<string> => "unused";

beforeEach(() => {
  calls.length = 0;
});

describe("withSessionScope", () => {
  it("sends a Fynix session to the Fynix scope with the user only, never an organisation", async () => {
    const context: SessionContext = { ...base, kind: "fynix", role: "leads_fynix" };
    expect(await withSessionScope(context, work)).toBe("fynix");
    expect(calls).toEqual([{ fn: "withFynixScope", args: [{ userId: USER }] }]);
  });

  it.each([
    ["client", "leads_client"],
    ["agency", "leads_agency"],
  ] as const)("sends a %s session to its own role pool, scoped to its organisation and user", async (kind, role) => {
    const context: SessionContext = { ...base, kind, role };
    expect(await withSessionScope(context, work)).toBe("tenant");
    expect(calls).toEqual([{ fn: "withOrgScope", args: [role, { orgId: ORG, userId: USER }] }]);
  });
});
```

**File:** `server/auth/guard.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/server/auth/session-context";

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

const state = vi.hoisted(() => ({ context: null as SessionContext | null, cookieNames: [] as string[] }));

vi.mock("next/headers", () => ({ cookies: async () => ({ has: (name: string) => state.cookieNames.includes(name) }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Redirected(to);
  },
}));
vi.mock("@/server/auth", () => ({ getSessionContext: async () => state.context }));

const { requireSessionContext } = await import("./guard");

const CONTEXT: SessionContext = { kind: "client", role: "leads_client", userId: "u", name: "Pat", sessionId: "s", orgId: "o", memberRole: "member" };

beforeEach(() => {
  state.context = null;
  state.cookieNames = [];
});

describe("requireSessionContext", () => {
  it("returns the context of a signed-in user", async () => {
    state.context = CONTEXT;
    expect(await requireSessionContext()).toBe(CONTEXT);
  });

  it("sends a visitor with no cookie to the sign-in page, with no notice", async () => {
    await expect(requireSessionContext()).rejects.toMatchObject({ to: "/sign-in" });
  });

  it("sends a visitor whose cookie no longer resolves to the sign-in page with the ended-session notice", async () => {
    state.cookieNames = ["fynix-leads.session_token"];
    await expect(requireSessionContext()).rejects.toMatchObject({ to: "/sign-in?reason=ended" });
  });
});
```

**File:** `server/auth/actions.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE } from "@/lib/auth/form-state";

/**
 * The server actions with everything outside them replaced: the Next.js request APIs, and the three services. They prove
 * the wiring: which address is read, what is passed on, and how each result becomes a form state or a redirect.
 */

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

const state = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  signIn: vi.fn(),
  requestReset: vi.fn(),
  completeReset: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => state.requestHeaders }));
vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Redirected(to);
  },
}));
vi.mock("@/server/auth", () => ({ getAuthServices: () => ({ services: true }), getAuth: () => ({ api: { signOut: state.signOut } }) }));
vi.mock("@/server/auth/sign-in", () => ({ signInWithPassword: state.signIn }));
vi.mock("@/server/auth/password-reset", () => ({ requestPasswordReset: state.requestReset, completePasswordReset: state.completeReset }));

const { completePasswordResetAction, requestPasswordResetAction, signInAction, signOutAction } = await import("./actions");

const form = (values: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};
const redirectTarget = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    throw error;
  }
  throw new Error("Expected a redirect.");
};

beforeEach(() => {
  vi.clearAllMocks();
  state.requestHeaders = new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("signInAction", () => {
  it("passes the email, the password, the proxy address (not x-forwarded-for) and the request headers to the service", async () => {
    state.signIn.mockResolvedValue({ status: "invalid-credentials" });
    await signInAction(IDLE, form({ email: "a@example.com", password: "pw" }));
    expect(state.signIn).toHaveBeenCalledWith({ services: true }, { email: "a@example.com", password: "pw", address: "203.0.113.9", headers: state.requestHeaders });
  });

  it("redirects to the landing page after a sign-in, or to a safe next path", async () => {
    state.signIn.mockResolvedValue({ status: "signed-in", userId: "u", headers: new Headers() });
    expect(await redirectTarget(signInAction(IDLE, form({ email: "a@example.com", password: "pw" })))).toBe("/welcome");
    expect(await redirectTarget(signInAction(IDLE, form({ email: "a@example.com", password: "pw", next: "/client/review" })))).toBe("/client/review");
  });

  it("ignores a next path that points off the site", async () => {
    state.signIn.mockResolvedValue({ status: "signed-in", userId: "u", headers: new Headers() });
    expect(await redirectTarget(signInAction(IDLE, form({ email: "a@example.com", password: "pw", next: "//evil.example" })))).toBe("/welcome");
  });

  it("returns the message and the typed email, never the password, for a failed sign-in", async () => {
    state.signIn.mockResolvedValue({ status: "invalid-credentials" });
    const result = await signInAction(IDLE, form({ email: "a@example.com", password: "secret-value" }));
    expect(result).toEqual({ status: "error", message: "That email and password do not match an account.", email: "a@example.com" });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("says how long to wait when rate limited, and explains an inactive account", async () => {
    state.signIn.mockResolvedValue({ status: "rate-limited", retryAfterSeconds: 90 });
    expect(await signInAction(IDLE, form({ email: "a@example.com", password: "pw" }))).toEqual({ status: "rate-limited", message: "Too many attempts. Try again in 2 minutes.", email: "a@example.com" });
    state.signIn.mockResolvedValue({ status: "not-active" });
    expect((await signInAction(IDLE, form({ email: "a@example.com", password: "pw" }))).status).toBe("error");
  });

  it("turns a fault into a neutral message and logs only the error name", async () => {
    state.signIn.mockRejectedValue(new TypeError("connect ECONNREFUSED with a@example.com in the text"));
    expect(await signInAction(IDLE, form({ email: "a@example.com", password: "pw" }))).toEqual({ status: "error", message: "Something went wrong. Try again in a moment.", email: "a@example.com" });
    expect(console.error).toHaveBeenCalledWith("An auth action failed", "TypeError");
  });
});

describe("requestPasswordResetAction", () => {
  it("answers sent whatever the service says about the address, and echoes only the email", async () => {
    state.requestReset.mockResolvedValue({ status: "sent" });
    expect(await requestPasswordResetAction(IDLE, form({ email: "a@example.com" }))).toEqual({ status: "sent", email: "a@example.com" });
    expect(state.requestReset).toHaveBeenCalledWith({ services: true }, { email: "a@example.com", address: "203.0.113.9" });
  });

  it("reports a rate limit", async () => {
    state.requestReset.mockResolvedValue({ status: "rate-limited", retryAfterSeconds: 3000 });
    expect((await requestPasswordResetAction(IDLE, form({ email: "a@example.com" }))).status).toBe("rate-limited");
  });
});

describe("completePasswordResetAction", () => {
  const submit = () => completePasswordResetAction(IDLE, form({ token: "tok", password: "a-long-new-passphrase" }));

  it("passes the token and the new password on, and redirects to sign-in on success", async () => {
    state.completeReset.mockResolvedValue({ status: "reset" });
    expect(await redirectTarget(submit())).toBe("/sign-in?reset=1");
    expect(state.completeReset).toHaveBeenCalledWith({ services: true }, { token: "tok", newPassword: "a-long-new-passphrase", address: "203.0.113.9" });
  });

  it.each([
    [{ status: "invalid-token" }, { status: "invalid-link" }],
    [{ status: "check-unavailable" }, { status: "error", message: "We could not check that password just now. Try again in a minute.", email: "" }],
    [{ status: "weak-password", message: "Use at least 12 characters." }, { status: "error", message: "Use at least 12 characters.", email: "" }],
    [{ status: "rate-limited", retryAfterSeconds: 60 }, { status: "rate-limited", message: "Too many attempts. Try again in 1 minute.", email: "" }],
  ])("maps %j to a form state", async (serviceResult, expected) => {
    state.completeReset.mockResolvedValue(serviceResult);
    expect(await submit()).toEqual(expected);
  });
});

describe("signOutAction", () => {
  it("ends the session with the request's own cookie and redirects to sign-in", async () => {
    state.signOut.mockResolvedValue({ success: true });
    expect(await redirectTarget(signOutAction())).toBe("/sign-in?signed-out=1");
    expect(state.signOut).toHaveBeenCalledWith({ headers: state.requestHeaders });
  });
});
```

**File:** `server/auth/boundaries.test.ts`

```typescript
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Source-level rules that keep the auth design from being undone by accident. They read files, not the database. */

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

const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path);
const everything = (): string[] => ["server", "scripts", "app", "components", "lib"].flatMap(sourceFiles);

describe("Better Auth stays inside server/auth", () => {
  it("is imported only from server/auth", () => {
    const offenders = everything().filter((path) => !path.startsWith(join("server", "auth")) && /from\s+["']better-auth/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("is pinned to an exact version", () => {
    const pinned: unknown = (JSON.parse(read("package.json")) as { dependencies?: Record<string, unknown> }).dependencies?.["better-auth"];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has no HTTP route: nothing serves its handler, so sign-in can only go through the guarded server code", () => {
    const offenders = everything().filter((path) => !isTest(path) && /toNextJsHandler|auth\.handler|\.handler\(/.test(read(path)));
    expect(offenders).toEqual([]);
    expect(everything().filter((path) => path.startsWith(join("app", "api", "auth")))).toEqual([]);
  });

  it("is never configured to share cookies across hosts or to skip its origin checks", () => {
    const config = read("server/auth/create-auth.ts");
    for (const forbidden of ["crossSubDomainCookies", "disableCSRFCheck", "disableOriginCheck", "disableIpTracking"]) {
      expect(config, forbidden).not.toContain(forbidden);
    }
  });
});

describe("files that reach a database pool", () => {
  it("server/auth/index.ts, guard.ts and with-session.ts import server-only, so a client component cannot pull them in", () => {
    for (const path of ["server/auth/index.ts", "server/auth/guard.ts", "server/auth/with-session.ts"]) expect(read(path), path).toMatch(/^import "server-only";/m);
  });

  it("the actions file is a use server module that exports only async functions, because every export is a public endpoint", () => {
    const source = read("server/auth/actions.ts");
    expect(source.startsWith('"use server";')).toBe(true);
    const exports = source.split("\n").filter((line) => line.startsWith("export "));
    expect(exports.length).toBeGreaterThan(0);
    expect(exports.filter((line) => !line.startsWith("export async function "))).toEqual([]);
  });

  it("only server/auth/index.ts and scripts open the leads_auth, leads_public or owner pools", () => {
    const offenders = everything()
      .filter((path) => !isTest(path) && path !== join("server", "auth", "index.ts") && !path.startsWith("scripts") && !path.startsWith(join("server", "db")))
      .filter((path) => /getDatabase\(\s*["']leads_(auth|public|owner)["']/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm exec vitest run server/auth
pnpm exec vitest run --config vitest.integration.config.mts server/auth/password-reset
```

Expected: FAIL, five unit files fail (`actions`, `client-address`, `guard` and `with-session` cannot be loaded, and two tests in `boundaries.test.ts` fail because the files they check do not exist), and `password-reset.integration.test.ts` cannot load `@/server/auth/password-reset`.

- [ ] **Step 3: Write the modules**

**File:** `server/auth/password-reset.ts`

```typescript
import { z } from "zod";
import { normaliseEmail } from "@/lib/auth/email";
import { resetCompleteChecks, resetRequestChecks } from "@/lib/auth/rate-limit-rules";
import { authErrorCode, authErrorMessage, DEAD_TOKEN_CODES, PASSWORD_CHECK_UNAVAILABLE_CODE, PASSWORD_PROBLEM_CODES } from "@/server/auth/errors";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import type { AuthServices } from "@/server/auth/sign-in";

const MAX_EMAIL_LENGTH = 254;
const emailSchema = z.email();

export type ResetRequestResult =
  /** The same answer whether or not the address has an account, and whether or not a message was queued. */
  | { readonly status: "sent" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/**
 * Asks for a reset link. The limits are consumed first, for any address, so they reveal nothing about which exist.
 * Better Auth then looks the address up, writes a one-hour token and calls the mailer, or does the same amount of work
 * and sends nothing when there is no account. A malformed address is answered like any other: "sent".
 */
export async function requestPasswordReset(services: AuthServices, input: { readonly email: string; readonly address: string }): Promise<ResetRequestResult> {
  const email = normaliseEmail(input.email);
  const blocked = await firstBlockedLimit(services.publicDb, resetRequestChecks(email, input.address), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  if (email.length > MAX_EMAIL_LENGTH || !emailSchema.safeParse(email).success) return { status: "sent" };
  await services.auth.api.requestPasswordReset({ body: { email } });
  return { status: "sent" };
}

export type ResetCompleteResult =
  | { readonly status: "reset" }
  /** The link was never issued, was used already or is older than an hour. */
  | { readonly status: "invalid-token" }
  /** `message` is worded for the person to read: too short, too long, or found in a breach. */
  | { readonly status: "weak-password"; readonly message: string }
  /** The breached-password service could not be reached, so nothing was changed. */
  | { readonly status: "check-unavailable" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number };

/** Chooses a new password with a reset token. Every session of the account ends with it (revokeSessionsOnPasswordReset). It does not sign anyone in. */
export async function completePasswordReset(
  services: AuthServices,
  input: { readonly token: string; readonly newPassword: string; readonly address: string },
): Promise<ResetCompleteResult> {
  const blocked = await firstBlockedLimit(services.publicDb, resetCompleteChecks(input.address), services.now?.());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  try {
    await services.auth.api.resetPassword({ body: { token: input.token, newPassword: input.newPassword } });
    return { status: "reset" };
  } catch (error) {
    const code = authErrorCode(error);
    if (code !== undefined && DEAD_TOKEN_CODES.has(code)) return { status: "invalid-token" };
    if (code === PASSWORD_CHECK_UNAVAILABLE_CODE) return { status: "check-unavailable" };
    if (code !== undefined && PASSWORD_PROBLEM_CODES.has(code)) return { status: "weak-password", message: authErrorMessage(error) ?? "Choose a different password." };
    throw error;
  }
}
```

**File:** `server/auth/client-address.ts`

```typescript
const UNKNOWN_ADDRESS = "unknown";
/** The longest text of an IPv6 address with a zone is 45 characters; anything longer is not an address. */
const MAX_ADDRESS_LENGTH = 64;

/**
 * The network address a request came from, for the rate limits. It reads `x-real-ip` only. nginx sets that header from
 * the connecting address and replaces any value the client sent (`proxy_set_header X-Real-IP $remote_addr;`, a phase 6
 * deployment requirement). `x-forwarded-for` is never read: nginx appends to it, so its first entry is whatever the client
 * chose, and keying a limit on it lets anyone escape the limit by changing a header.
 *
 * With no header (local development, no proxy) every caller shares the address "unknown", which makes the per-network
 * limits stricter, not looser.
 */
export function clientAddressFrom(headers: Pick<Headers, "get">): string {
  const value = headers.get("x-real-ip")?.trim();
  return value === undefined || value === "" || value.length > MAX_ADDRESS_LENGTH ? UNKNOWN_ADDRESS : value;
}
```

**File:** `server/auth/with-session.ts`

```typescript
import "server-only";
import type { SessionContext } from "@/server/auth/session-context";
import { withFynixScope, withOrgScope, type ScopedTransaction } from "@/server/db/scope";

/**
 * Runs `work` as the signed-in user: on the Fynix pool for a Fynix admin, on the client or agency pool, scoped to the
 * user's own organisation, for everyone else. This is the one place a resolved session picks a database role, and it
 * goes through the same scope helpers as everything else, so every tenant request sets `app.org_id` and `app.user_id`
 * for exactly one transaction.
 */
export function withSessionScope<T>(context: SessionContext, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  if (context.kind === "fynix") return withFynixScope({ userId: context.userId }, work);
  return withOrgScope(context.role, { orgId: context.orgId, userId: context.userId }, work);
}
```

**File:** `server/auth/index.ts`

```typescript
import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { PASSWORD_RESET_LIFETIME_SECONDS } from "@/lib/auth/session-lifetime";
import { breachCheckerFor } from "@/server/auth/breach-check";
import { createAuth, type Auth } from "@/server/auth/create-auth";
import { devOutboxTransport, passwordResetMailer, type MailTransport } from "@/server/auth/mail";
import { resolveSessionContext, type SessionContext } from "@/server/auth/session-context";
import type { AuthServices } from "@/server/auth/sign-in";
import { getDatabase } from "@/server/db/client";
import { getEnv } from "@/server/env";

/**
 * Module scope, not globalThis like the pools: a hot reload re-evaluates this module and picks up a changed
 * configuration, and the instance holds only a reference to a pool that globalThis keeps.
 */
let auth: Auth | undefined;

/** Phase 1B has only the development transport. Phase 1C adds Brevo and replaces this guard with its configuration check. */
function mailTransport(): MailTransport {
  if (new URL(getEnv().APP_ORIGIN).protocol === "https:") {
    throw new Error("No email transport is configured for an https deployment yet: phase 1C adds the Brevo transport.");
  }
  return devOutboxTransport(getDatabase("leads_public").db);
}

/** The Better Auth instance for the running app, on the `leads_auth` pool. Better Auth's own HTTP routes are not served: the app calls `auth.api` from server code. */
export function getAuth(): Auth {
  if (auth !== undefined) return auth;
  const env = getEnv();
  auth = createAuth({
    db: getDatabase("leads_auth").db,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    breachChecker: breachCheckerFor(env.PASSWORD_BREACH_CHECK),
    mailer: passwordResetMailer(mailTransport(), env.APP_ORIGIN, PASSWORD_RESET_LIFETIME_SECONDS / 60),
    nextCookies: true,
  });
  return auth;
}

/** What the sign-in and reset services need. */
export function getAuthServices(): AuthServices {
  return { auth: getAuth(), publicDb: getDatabase("leads_public").db };
}

/**
 * Who this request is, or `null` when nobody is signed in. Resolved once per request (`cache`), from the session cookie,
 * through `member` to the organisation kind. Call it from server components, server actions and route handlers; never
 * pass its result to a client component, which needs only what it renders.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> =>
  resolveSessionContext({ reader: getAuth(), authDb: getDatabase("leads_auth").db }, await headers()),
);
```

**File:** `server/auth/guard.ts`

```typescript
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasSessionCookie } from "@/lib/auth/session-cookie";
import { getSessionContext } from "@/server/auth";
import type { SessionContext } from "@/server/auth/session-context";

/**
 * For a page or layout that needs a signed-in user: returns who they are, or sends them to the sign-in page. A request
 * that carried a session cookie which no longer resolves (expired, signed out elsewhere, membership suspended) is told so
 * (`?reason=ended`); a request with no cookie is just asked to sign in. Call it inside a `<Suspense>` boundary, because
 * with Cache Components a session read is request-time data.
 */
export async function requireSessionContext(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (context !== null) return context;
  redirect(hasSessionCookie(await cookies()) ? "/sign-in?reason=ended" : "/sign-in");
}
```

**File:** `server/auth/actions.ts`

```typescript
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthFormState } from "@/lib/auth/form-state";
import { BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE, retryMessage, signInMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";
import { getAuth, getAuthServices } from "@/server/auth";
import { clientAddressFrom } from "@/server/auth/client-address";
import { completePasswordReset, requestPasswordReset } from "@/server/auth/password-reset";
import { signInWithPassword } from "@/server/auth/sign-in";

/**
 * The server actions behind the three forms and the sign-out button. They are the only entry points to sign-in, reset
 * and sign-out, and each is a thin shell: read the form, read the network address from the proxy header, call one
 * service from server/auth, and turn its result into an `AuthFormState` or a redirect. All the rules live in the
 * services. Every export of a "use server" file is a public endpoint, so this file exports nothing but actions.
 */

/** Where a person lands after signing in when no safe `next` was given. */
const DEFAULT_LANDING = "/welcome";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly state: AuthFormState };

/**
 * Runs a service call. A fault (the database is down, a bug) becomes a form state with a neutral message, and only the
 * error's name is logged, because its message can carry an address. `redirect()` works by throwing, so it is always
 * called outside this wrapper, after the result is known.
 */
async function attempt<T>(email: string, work: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    console.error("An auth action failed", error instanceof Error ? error.name : "unknown error");
    return { ok: false, state: { status: "error", message: GENERIC_FAILURE, email } };
  }
}

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const requestHeaders = await headers();
  const outcome = await attempt(email, () =>
    signInWithPassword(getAuthServices(), { email, password: field(formData, "password"), address: clientAddressFrom(requestHeaders), headers: requestHeaders }),
  );
  if (!outcome.ok) return outcome.state;
  const result = outcome.value;
  if (result.status === "signed-in") redirect(safeNextPath(field(formData, "next")) ?? DEFAULT_LANDING);
  if (result.status === "rate-limited") return { status: "rate-limited", message: retryMessage(result.retryAfterSeconds), email };
  return { status: "error", message: signInMessage(result.status), email };
}

export async function requestPasswordResetAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const address = clientAddressFrom(await headers());
  const outcome = await attempt(email, () => requestPasswordReset(getAuthServices(), { email, address }));
  if (!outcome.ok) return outcome.state;
  const result = outcome.value;
  if (result.status === "rate-limited") return { status: "rate-limited", message: retryMessage(result.retryAfterSeconds), email };
  return { status: "sent", email };
}

export async function completePasswordResetAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const address = clientAddressFrom(await headers());
  const outcome = await attempt("", () => completePasswordReset(getAuthServices(), { token: field(formData, "token"), newPassword: field(formData, "password"), address }));
  if (!outcome.ok) return outcome.state;
  const result = outcome.value;
  if (result.status === "reset") redirect("/sign-in?reset=1");
  if (result.status === "invalid-token") return { status: "invalid-link" };
  if (result.status === "check-unavailable") return { status: "error", message: BREACH_CHECK_UNAVAILABLE, email: "" };
  if (result.status === "weak-password") return { status: "error", message: result.message, email: "" };
  return { status: "rate-limited", message: retryMessage(result.retryAfterSeconds), email: "" };
}

export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/sign-in?signed-out=1");
}
```

- [ ] **Step 4: Run everything and see it pass**

```bash
pnpm test
pnpm test:integration
pnpm typecheck
pnpm lint
```

Expected: `pnpm test`: 54 files, 619 tests; `pnpm test:integration`: 9 files, 275 tests; typecheck and lint clean.

- [ ] **Step 5: Commit**

```bash
git add server/auth
git commit -m "Add password reset, the session to role pool wiring, the page guard and the server actions"
```

---

## Task 9: `pnpm admin:create` and `pnpm mail:last`

**Files:** Create `server/prompt.ts`, `server/prompt.test.ts`, `server/auth/admin-create.ts`, `server/auth/admin-create.integration.test.ts`, `scripts/admin-create.ts`, `scripts/mail-last.ts`

`createFynixAdmin` is the logic (testable with a database); the script is a thin shell that reads the password without echo. The place for a second factor stays `server/auth/second-factor.ts` (decision B11); nothing here builds one.

- [ ] **Step 1: Write the tests**

**File:** `server/prompt.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { editLine } from "./prompt";

describe("editLine", () => {
  it("collects keystrokes and finishes on Enter, keeping what was typed before it", () => {
    expect(editLine("", "abc")).toEqual({ value: "abc", done: false, cancelled: false });
    expect(editLine("abc", "d\r")).toEqual({ value: "abcd", done: true, cancelled: false });
    expect(editLine("", "pasted-text\n")).toEqual({ value: "pasted-text", done: true, cancelled: false });
  });

  it("deletes the last character on backspace, and does nothing on an empty line", () => {
    expect(editLine("abc", String.fromCharCode(127)).value).toBe("ab");
    expect(editLine("", String.fromCharCode(127)).value).toBe("");
    expect(editLine("ab", "\b\bx").value).toBe("x");
  });

  it("cancels on Ctrl+C and drops what was typed, and ends the line on Ctrl+D", () => {
    expect(editLine("secret", String.fromCharCode(3))).toEqual({ value: "", done: false, cancelled: true });
    expect(editLine("secret", String.fromCharCode(4))).toEqual({ value: "secret", done: true, cancelled: false });
  });
});
```

**File:** `server/auth/admin-create.integration.test.ts`

```typescript
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFynixAdmin, FYNIX_ORGANISATION_REF, type AdminCreateServices } from "@/server/auth/admin-create";
import { AccountAlreadyExistsError } from "@/server/auth/create-account";
import { authErrorCode } from "@/server/auth/errors";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD, openAuthRig, requestHeadersFrom, type AuthRig } from "@/server/auth/testing";
import type { Database } from "@/server/db/pool";
import { account, member, organisation, user } from "@/server/db/schema";
import { resetDatabase } from "@/server/db/testing";

/** `pnpm admin:create`'s logic: the first Fynix admin, from nothing, on the real test database. */

let rig: AuthRig;
let services: AdminCreateServices;

beforeAll(() => {
  rig = openAuthRig();
  services = { auth: rig.auth, authDb: rig.dbs.roles.leads_auth.db, ownerDb: rig.dbs.owner.db };
});
afterAll(async () => {
  await rig?.close();
});
beforeEach(async () => {
  await resetDatabase(rig.dbs.owner);
  rig.breach.breached.clear();
  rig.breach.unavailable = false;
});

const tableCount = async (table: typeof user | typeof member | typeof account | typeof organisation): Promise<number> =>
  (await rig.dbs.owner.db.select({ value: count() }).from(table))[0]?.value ?? 0;

describe("createFynixAdmin on an empty database", () => {
  it("creates the Fynix organisation, the account and a manager membership, and the admin can sign in as Fynix", async () => {
    const created = await createFynixAdmin(services, { email: "Asha@Fynix.example", name: "Asha Rao", password: GOOD_PASSWORD });
    expect(created).toMatchObject({ email: "asha@fynix.example", organisationRef: FYNIX_ORGANISATION_REF });

    const orgs = await rig.dbs.owner.db.select({ ref: organisation.publicRef, kind: organisation.kind }).from(organisation);
    expect(orgs).toEqual([{ ref: "ORG-FYNX", kind: "fynix" }]);
    const members = await rig.dbs.owner.db.select({ role: member.role, status: member.status, kind: member.orgKind, name: member.displayName }).from(member);
    expect(members).toEqual([{ role: "manager", status: "active", kind: "fynix", name: "Asha Rao" }]);

    const signedIn = await signInWithPassword(rig.services, { email: "asha@fynix.example", password: GOOD_PASSWORD, address: "203.0.113.90" });
    if (signedIn.status !== "signed-in") throw new Error("the new admin could not sign in");
    const context = await resolveSessionContext(rig.resolution, requestHeadersFrom(signedIn.headers));
    expect(context).toMatchObject({ kind: "fynix", role: "leads_fynix", userId: created.userId, memberRole: "manager" });
  });

  it("a second admin joins the same organisation", async () => {
    await createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD });
    await createFynixAdmin(services, { email: "ravi@fynix.example", name: "Ravi Shah", password: NEW_PASSWORD });
    expect(await tableCount(organisation)).toBe(1);
    expect(await tableCount(member)).toBe(2);
  });

  it("applies the password rules: a short, a breached or an unchecked password creates no account", async () => {
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: "short" })).rejects.toSatisfy((error) => authErrorCode(error) === "WEAK_PASSWORD");
    rig.breach.breached.add(GOOD_PASSWORD);
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD })).rejects.toSatisfy((error) => authErrorCode(error) === "PASSWORD_BREACHED");
    rig.breach.breached.clear();
    rig.breach.unavailable = true;
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD })).rejects.toSatisfy((error) => authErrorCode(error) === "PASSWORD_CHECK_UNAVAILABLE");
    expect([await tableCount(user), await tableCount(account), await tableCount(member)]).toEqual([0, 0, 0]);
  });

  it("refuses an address that already has an account and changes nothing", async () => {
    await createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD });
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Someone Else", password: NEW_PASSWORD })).rejects.toBeInstanceOf(AccountAlreadyExistsError);
    expect([await tableCount(user), await tableCount(member)]).toEqual([1, 1]);
    expect((await signInWithPassword(rig.services, { email: "asha@fynix.example", password: GOOD_PASSWORD, address: "203.0.113.91" })).status).toBe("signed-in");
  });

  it("refuses a malformed address and a blank name before anything is written", async () => {
    await expect(createFynixAdmin(services, { email: "not-an-email", name: "Asha", password: GOOD_PASSWORD })).rejects.toThrow();
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "   ", password: GOOD_PASSWORD })).rejects.toThrow("A name is required");
    expect([await tableCount(organisation), await tableCount(user)]).toEqual([0, 0]);
  });

  it("removes the account again if the membership cannot be written, so the address is free to try again", async () => {
    const failingOwner = new Proxy(rig.dbs.owner.db, {
      get(target, property, receiver) {
        if (property === "insert") {
          return (table: unknown) => {
            if (table === member) throw new Error("the membership insert failed");
            return target.insert(table as typeof organisation);
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    }) as Database;
    await expect(createFynixAdmin({ ...services, ownerDb: failingOwner }, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD })).rejects.toThrow("membership insert failed");
    expect(await rig.dbs.owner.db.select({ id: user.id }).from(user).where(eq(user.email, "asha@fynix.example"))).toEqual([]);
    await expect(createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD })).resolves.toMatchObject({ email: "asha@fynix.example" });
  });

  it("the database allows only one Fynix organisation", async () => {
    await createFynixAdmin(services, { email: "asha@fynix.example", name: "Asha Rao", password: GOOD_PASSWORD });
    await expect(rig.dbs.owner.db.insert(organisation).values({ publicRef: "ORG-FYN2", kind: "fynix", name: "Another Fynix" })).rejects.toThrow();
  });
});
```

(The `Proxy` and its two casts are the one place a test fakes the owner database: it makes only the `member` insert throw, which is how the compensation path is reached.)

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm exec vitest run server/prompt.test.ts
pnpm exec vitest run --config vitest.integration.config.mts server/auth/admin-create
```

Expected: FAIL, `Cannot find module './prompt'` for the unit test and `Cannot find package '@/server/auth/admin-create'` for the integration test.

- [ ] **Step 3: Write the modules and scripts**

**File:** `server/prompt.ts`

```typescript
const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const BACKSPACE = String.fromCharCode(127);

export interface LineEdit {
  readonly value: string;
  /** Enter, or end of input: the line is complete. */
  readonly done: boolean;
  /** Ctrl+C: the person gave up. */
  readonly cancelled: boolean;
}

/** Applies what the terminal sent (one or several keystrokes) to the line typed so far. Pure, so the key handling is unit tested. */
export function editLine(typed: string, input: string): LineEdit {
  let value = typed;
  for (const char of input) {
    if (char === CTRL_C) return { value: "", done: false, cancelled: true };
    if (char === "\r" || char === "\n" || char === CTRL_D) return { value, done: true, cancelled: false };
    if (char === BACKSPACE || char === "\b") value = value.slice(0, -1);
    else value += char;
  }
  return { value, done: false, cancelled: false };
}

/** The first line of a piped stdin, for scripts that run without a terminal. */
async function readFirstLine(stream: NodeJS.ReadableStream): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += String(chunk);
  return text.split(/\r?\n/)[0] ?? "";
}

/**
 * One line from the terminal, not echoed, so a password never appears on screen or in a shell history. When standard
 * input is not a terminal (a pipe or a file) it returns the first line instead, without a prompt, which is how a script
 * or a test supplies one. In a terminal, type each line and press Enter; pasting two lines at once is not supported.
 */
export async function readHiddenLine(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) return readFirstLine(stdin);

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let typed = "";
    const finish = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: string): void => {
      const edit = editLine(typed, chunk);
      typed = edit.value;
      if (edit.cancelled) {
        finish();
        reject(new Error("Cancelled."));
      } else if (edit.done) {
        finish();
        resolve(typed);
      }
    };
    stdin.on("data", onData);
  });
}
```

**File:** `server/auth/admin-create.ts`

```typescript
import { eq } from "drizzle-orm";
import { z } from "zod";
import { normaliseEmail } from "@/lib/auth/email";
import { createAccountWithGrant } from "@/server/auth/create-account";
import type { Auth } from "@/server/auth/create-auth";
import type { Database } from "@/server/db/pool";
import { member, organisation, user } from "@/server/db/schema";

/** The one Fynix organisation has this reference, so `pnpm admin:create` finds it by kind and creates it with the same value everywhere. */
export const FYNIX_ORGANISATION_REF = "ORG-FYNX";
const FYNIX_ORGANISATION_NAME = "Fynix Digital";
const MAX_NAME_LENGTH = 120;

export interface AdminCreateServices {
  readonly auth: Auth;
  /** The `leads_auth` database, the one `auth` runs on. */
  readonly authDb: Database;
  /** The owner database. Bootstrap only, like `pnpm db:seed`: the first admin has to exist before anything can act as one. */
  readonly ownerDb: Database;
}

export interface CreatedAdmin {
  readonly userId: string;
  readonly email: string;
  readonly organisationRef: string;
}

const inputSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1, "A name is required").max(MAX_NAME_LENGTH),
  password: z.string().min(1, "A password is required"),
});

/** Finds the Fynix organisation, or creates it. The partial unique index `organisation_one_fynix` makes a second one impossible. */
async function ensureFynixOrganisation(ownerDb: Database): Promise<{ readonly id: string }> {
  await ownerDb.insert(organisation).values({ publicRef: FYNIX_ORGANISATION_REF, kind: "fynix", name: FYNIX_ORGANISATION_NAME }).onConflictDoNothing();
  const rows = await ownerDb.select({ id: organisation.id }).from(organisation).where(eq(organisation.kind, "fynix")).limit(1);
  const row = rows[0];
  if (row === undefined) throw new Error("The Fynix organisation could not be created.");
  return row;
}

/**
 * Creates the first Fynix admin, or another one: an account, a membership in the Fynix organisation with the `manager`
 * role, and nothing else. Called by `pnpm admin:create` and by no route, so there is no public way to become an admin.
 *
 * Password only (decision D3). Gate G1 adds a second factor before any real client or agency data is entered; the place
 * for it is server/auth/second-factor.ts, and nothing here changes.
 *
 * The account is made first, through the same grant and the same password rules as any other, so a weak or breached
 * password creates nothing. If the membership cannot be written the account is removed again, because an account with
 * no membership could never sign in and would block the address.
 */
export async function createFynixAdmin(services: AdminCreateServices, input: { readonly email: string; readonly name: string; readonly password: string }): Promise<CreatedAdmin> {
  const parsed = inputSchema.parse({ ...input, email: normaliseEmail(input.email) });
  const fynix = await ensureFynixOrganisation(services.ownerDb);
  const account = await createAccountWithGrant(services.auth, services.authDb, { email: parsed.email, name: parsed.name, password: parsed.password });
  try {
    await services.ownerDb.insert(member).values({ userId: account.userId, orgId: fynix.id, orgKind: "fynix", role: "manager", displayName: parsed.name });
  } catch (error) {
    await services.ownerDb.delete(user).where(eq(user.id, account.userId));
    throw error;
  }
  return { userId: account.userId, email: account.email, organisationRef: FYNIX_ORGANISATION_REF };
}
```

**File:** `scripts/admin-create.ts`

```typescript
import { parseArgs } from "node:util";
import { createFynixAdmin } from "@/server/auth/admin-create";
import { breachCheckerFor } from "@/server/auth/breach-check";
import { AccountAlreadyExistsError } from "@/server/auth/create-account";
import { createAuth } from "@/server/auth/create-auth";
import { authErrorCode, authErrorMessage } from "@/server/auth/errors";
import { createDatabase } from "@/server/db/pool";
import { getEnv, getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { readHiddenLine } from "@/server/prompt";
import { runScript } from "@/server/run-script";

// Creates a Fynix admin: the account, and a membership in the Fynix organisation (made if it does not exist yet).
// Never a public route. Password only for now (decision D3); gate G1 adds a second factor, see server/auth/second-factor.ts.
// The password is read from the terminal without echo, or from the first line of standard input, never from an argument.
runScript(async () => {
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
  if (values.email === undefined || values.name === undefined) {
    throw new Error('Usage: pnpm admin:create --email=<address> --name="<full name>"\nThe password is asked for, or read from the first line of standard input.');
  }

  loadEnvLocal();
  const env = getEnv();
  const tooling = getToolingEnv();

  const password = await readHiddenLine("Password: ");
  if (process.stdin.isTTY && (await readHiddenLine("Repeat the password: ")) !== password) throw new Error("The two passwords are not the same. Nothing was created.");

  const authDb = createDatabase(env.DATABASE_URL_AUTH, { max: 2 });
  const ownerDb = createDatabase(tooling.DATABASE_URL_OWNER, { max: 1 });
  try {
    const auth = createAuth({
      db: authDb.db,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_ORIGIN,
      breachChecker: breachCheckerFor(env.PASSWORD_BREACH_CHECK),
      // This script never asks for a reset, so it never sends anything.
      mailer: { sendPasswordReset: () => Promise.reject(new Error("admin:create sends no email")) },
      nextCookies: false,
    });
    const created = await createFynixAdmin({ auth, authDb: authDb.db, ownerDb: ownerDb.db }, { email: values.email, name: values.name, password });
    console.log(`Created the Fynix admin ${created.email}. Sign in at ${env.APP_ORIGIN}/sign-in.`);
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) throw new Error(`${error.message} Nothing was changed.`);
    if (authErrorCode(error) !== undefined) throw new Error(`${authErrorMessage(error) ?? "The account was refused."} Nothing was created.`);
    throw error;
  } finally {
    await Promise.all([authDb.close(), ownerDb.close()]);
  }
});
```

**File:** `scripts/mail-last.ts`

```typescript
import { desc } from "drizzle-orm";
import { createDatabase } from "@/server/db/pool";
import { emailOutbox } from "@/server/db/schema";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Development only: prints the newest message in the email outbox of the dev database, which in phase 1B is the only
// place a password reset link goes. It reads as the owner role because no runtime role may read the outbox.
runScript(async () => {
  loadEnvLocal();
  const owner = createDatabase(getToolingEnv().DATABASE_URL_OWNER, { max: 1 });
  try {
    const rows = await owner.db
      .select({ recipient: emailOutbox.recipient, subject: emailOutbox.subject, body: emailOutbox.body, status: emailOutbox.status, createdAt: emailOutbox.createdAt })
      .from(emailOutbox)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(1);
    const newest = rows[0];
    if (newest === undefined) {
      console.log("The outbox is empty.");
      return;
    }
    console.log(`To: ${newest.recipient}\nSubject: ${newest.subject}\nQueued: ${newest.createdAt.toISOString()} (${newest.status})\n\n${newest.body}`);
  } finally {
    await owner.close();
  }
});
```

- [ ] **Step 4: Run the tests**

```bash
pnpm exec vitest run server/prompt.test.ts
pnpm test:integration
pnpm typecheck
pnpm lint
```

Expected: `pnpm test`: 55 files, 622 tests; `pnpm test:integration`: 10 files, 282 tests; typecheck and lint clean.

- [ ] **Step 5: Run the scripts for real**

```bash
pnpm db:migrate
echo 'short' | pnpm admin:create --email=you@fynix.digital --name="Your Name"
echo 'Password123456' | pnpm admin:create --email=you@fynix.digital --name="Your Name"
pnpm admin:create --email=you@fynix.digital --name="Your Name"
echo 'a-long-unbreached-phrase-7391' | pnpm admin:create --email=you@fynix.digital --name="Your Name"
pnpm mail:last
```

Expected, in order: the first prints `Use at least 12 characters. Nothing was created.`; the second (a password in the breach lists) prints `That password has appeared in a data breach. Choose a different one. Nothing was created.` (this needs a network; with `PASSWORD_BREACH_CHECK=off` it would be accepted); the third (no password on standard input, a terminal) asks twice with nothing echoed, and with two different entries prints `The two passwords are not the same. Nothing was created.`; the fourth prints `Created the Fynix admin you@fynix.digital. Sign in at http://localhost:3020/sign-in.`; the last prints `The outbox is empty.` Running the fourth command again prints `An account for you@fynix.digital already exists. Nothing was changed.` Use a real address of your own in place of `you@fynix.digital` and keep the password you choose; the admin you create here is the one you will sign in with in Part B.

- [ ] **Step 6: Commit**

```bash
git add server/prompt.ts server/prompt.test.ts server/auth/admin-create.ts server/auth/admin-create.integration.test.ts scripts/admin-create.ts scripts/mail-last.ts
git commit -m "Add admin:create for the first Fynix admin and mail:last for the development outbox"
```

---

## Task 10: Documentation

**Files:** Modify `CLAUDE.md`, `README.md`

- [ ] **Step 1: Record the auth rules in `CLAUDE.md`**

**Edit:** `CLAUDE.md`

Replace:

```
- **Dev server:** `pnpm dev` serves http://localhost:3020.
```

With:

```
- **Auth (`server/auth/`, rules in `docs/superpowers/plans/2026-11-12-phase-1b-auth.md`):** Better Auth 1.7.20, pinned exactly, email and password, no public sign-up.
  - **Better Auth stays inside `server/auth/`** and its HTTP handler is never mounted: sign-in, reset and account creation are server code calling `auth.api`, behind our rate limits (`server/auth/rate-limit.ts`, Postgres, `leads_public`, never inside a transaction) and our password policy (12 or more characters, not in a breach, `server/auth/breach-check.ts`). `server/auth/boundaries.test.ts` enforces it.
  - **Only `leads_auth` touches `user`, `session`, `account`, `verification` and `member`.** The access matrix in `server/db/structure.integration.test.ts` lists, for every table, the roles that may touch it: adding a table or widening a grant means editing that list on purpose.
  - **Accounts are created only inside `withAccountCreationGrant`** (`server/auth/create-account.ts`), by `pnpm admin:create` today and by invite redemption in phase 1C. A user with no active `member` row gets no session.
  - **A request resolves like this:** `getSessionContext()` (cookie, session, `member`, organisation kind), then `withSessionScope(context, work)` (`server/auth/with-session.ts`), which picks the role pool and sets the scope. Sessions are fixed length: 14 days for client and agency, 12 hours for Fynix, never extended.
  - **Three Better Auth quirks, each guarded and tested:** a 403 in the user-create hook becomes a fake success (the hook returns `false`); a duplicate address answers with an id that was never stored (`createAccountWithGrant` reads the row back); a short secret falls back to a public default (`assertUsableSecret` refuses). Canary tests fail when a Better Auth upgrade changes any of them.
  - **Fynix is password only until gate G1.** The place for a second factor is `server/auth/second-factor.ts`. Do not build one elsewhere.
  - **The reset link** goes to `email_outbox` through `leads_public`; nothing is sent in development. `pnpm mail:last` prints it. Phase 1C adds the Brevo transport.
  - **`x-real-ip`, not `x-forwarded-for`,** is the network address for rate limits. The production nginx must overwrite `x-real-ip` (phase 6).
- **Dev server:** `pnpm dev` serves http://localhost:3020.
```

**Edit:** `CLAUDE.md`

Replace:

```
pnpm db:generate        # SQL from server/db/schema/; add --custom --name=<name> for hand-written SQL
```

With:

```
pnpm db:generate        # SQL from server/db/schema/; add --custom --name=<name> for hand-written SQL
pnpm admin:create --email=<address> --name="<full name>"   # the first Fynix admin; asks for the password
pnpm mail:last          # prints the newest message in the dev email outbox (the password reset link)
```

- [ ] **Step 2: Explain sign-in in `README.md`**

**Edit:** `README.md`

Replace:

```
## Check it
```

With:

```
## Sign in (phase 1B)

- A machine that ran `pnpm env:init` before phase 1B lacks three variables. `pnpm env:check` names them. Append them with `printf 'BETTER_AUTH_SECRET=%s\nAPP_ORIGIN=http://localhost:3020\nPASSWORD_BREACH_CHECK=hibp\n' "$(openssl rand -hex 32)" >> .env.local`. New machines get them from `pnpm env:init`.
- `pnpm db:migrate`, then `pnpm admin:create --email=you@fynix.digital --name="Your Name"` creates the first Fynix admin. It asks for the password twice, or reads the first line of standard input. New passwords need 12 or more characters and must not appear in a known breach (checked through the k-anonymity range API of Have I Been Pwned, which sees five characters of a hash). With no network, set `PASSWORD_BREACH_CHECK=off` in `.env.local`; it is refused on an https `APP_ORIGIN`.
- In development nothing is emailed. A reset link is written to the `email_outbox` table, and `pnpm mail:last` prints the newest one.

## Check it
```

- [ ] **Step 3: Check the copy rule and commit**

```bash
node -e '
  const fs = require("fs");
  for (const f of ["CLAUDE.md", "README.md"]) if (new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]").test(fs.readFileSync(f, "utf8"))) { console.error("Dash in " + f); process.exit(1); }
  console.log("No em or en dashes.");
'
git add CLAUDE.md README.md
git commit -m "Document the auth layer, its rules and how to create the first admin"
```

Expected: `No em or en dashes.` CI needs no change: the `database` job already runs `pnpm env:init` (which now writes the new variables) and the integration suite, and nothing in it reaches the network (the breach service is a fake).

---

# PART B: The pages (sign-in, forgot password, reset password, signed-in holding page)

Part A built everything these screens call: `signInAction`, `requestPasswordResetAction`, `completePasswordResetAction` and `signOutAction` (`server/auth/actions.ts`), `requireSessionContext` (`server/auth/guard.ts`), `getSessionContext` (`server/auth/index.ts`), every message a person reads (`lib/auth/messages.ts`) and the form state type (`lib/auth/form-state.ts`). Part B is **markup and routing only**.

These are new screens, so the owner's standing rule applies: **visual comps are shown and approved before any UI is built**, in the approved hybrid design (`docs/superpowers/specs/design-directions-v2/d-hybrid/`, `DESIGN.md`: structured softness, never boxy-outlined and never borderless clutter). Task 11 produces the comps and stops. Tasks 12 to 15 are written without component markup on purpose: they say what each page must do, which state each form renders, what accessibility requires and exactly how to check it. Wherever this part says **component markup finalised after comp approval**, the structure, spacing, type and colour come from the approved comps and `DESIGN.md`, and nothing is invented before then.

**Findings from a throwaway page (Next.js 16.4.6, Cache Components on).** Part A's actions and guard were exercised through a throwaway unstyled page in the scratch copy (deleted afterwards). Four facts shape Part B:

1. A form that uses an action resets its uncontrolled fields after the action runs (React 19). After a failed sign-in the email field came back empty. This is why `AuthFormState` carries the typed email back and why the pages render it as `defaultValue`. The password is never carried back.
2. With Cache Components a session read is request-time data and must sit inside a `<Suspense>` boundary. Pages that read the session or `searchParams` render a static shell and stream the rest.
3. A `redirect()` that runs inside a streamed `<Suspense>` boundary reaches the browser as a client-side redirect after the shell, with HTTP status 200 (a signed-out request for `/probe/home` returned 200 and landed on the sign-in page). So the shell of a protected page must contain nothing that should not be public. Part B's holding page has none.
4. Signing in through the action set the session cookie (the `nextCookies` plugin), the next request resolved to the right role, and signing out deleted the session row and the cookie. The reset flow worked from `pnpm mail:last` to a new password.

## Task 11: Step 0, visual comps for owner approval

**Files:** Create `docs/superpowers/specs/phase-1b-auth-comps/` (HTML, PNG and `index.html`). No file under `app/`, `components/` or `lib/` changes in this task.

- [ ] **Step 1: Read the design authority**

Read `DESIGN.md`, `docs/superpowers/specs/design-directions-v2/d-hybrid/NOTES.md` and `tokens.css`, and look at `review.png`, `record.png` and `leads.png` next to them. The rules that matter for these screens: four depths only (canvas, tonal pane, white panel with `shadow-raised`, navy hero), inputs are filled (`--navy-05`) not outlined, buttons and chips are pills, panels are radius 22, Geist Sans, sentence case, light mode only, no outlines to make zones, one hero tile per screen at most.

- [ ] **Step 2: Render the comps**

Render static HTML from `d-hybrid/tokens.css` (copy the file next to the comps; do not touch the app) and capture each state as a PNG with the browser pane. One HTML file and one PNG per screen, every state on the same sheet so the owner can compare, each at desktop (1280 wide) and mobile (390 wide). Light mode only.

| Screen | States to render |
|---|---|
| Sign-in | default and empty; email filled and password focused; submitting (button pending); error "That email and password do not match an account."; error for an inactive account; rate limited "Too many attempts. Try again in 2 minutes."; notice "Your password has been changed. Sign in with the new one."; notice "You have signed out."; notice "Your session has ended. Sign in again." (the session expired state) |
| Forgot password | default; sent ("If that address has an account, a reset link is on its way. It works for 60 minutes.", shown whether or not the address has an account); rate limited |
| Reset password | default with the rule hint ("Use at least 12 characters. Passwords that appear in known data breaches are refused."); password shown (the show control on); error "Use at least 12 characters."; error "That password has appeared in a data breach. Choose a different one."; error "We could not check that password just now. Try again in a minute."; dead link "This link is no longer valid. Ask for a new one." with the way to ask again (this one state also covers a missing or expired token); rate limited |
| Signed-in holding page | a Fynix admin, a client user and an agency user (the page shows the person's name, the kind of organisation they belong to in a word, and a sign-out control; no campaign, no organisation name, no other party's identity) |

Use the exact strings above: they are the strings in `lib/auth/messages.ts` and `lib/auth/password-policy.ts`, so the comps cannot drift from the build. The comps must also show keyboard focus on the email field, the password field, the primary button and the show control, and the position of the error and notice text.

Also render, once, the rail-less layout the three public pages share (a centred white panel on the canvas, the brand mark above it) so the owner approves the frame and not only the forms.

- [ ] **Step 3: Check the comps against the design rules**

For each sheet, tick: no outlined input or panel; at most two surface levels inside a module; radii from the scale; status text on its soft fill passes the contrast figures in `DESIGN.md`; the error is not conveyed by colour alone (an icon or the words carry it); text sizes from the type scale; the layout holds at 390 wide with no horizontal scroll. Fix the comps until every box is ticked.

- [ ] **Step 4: Stop and ask the owner**

Add `docs/superpowers/specs/phase-1b-auth-comps/index.html` linking every sheet, commit the comps, and ask the owner to approve them or say what to change. **Do not start Task 12 until the owner has approved in chat.** Record the approval in `docs/superpowers/specs/phase-1b-auth-comps/APPROVED.md` (date, what was approved, any change requested). If changes are requested, revise the comps and ask again.

```bash
git add docs/superpowers/specs/phase-1b-auth-comps
git commit -m "Add the visual comps for the sign-in, forgot password, reset password and holding screens"
```

**Acceptance for Task 11:** the owner's approval is in chat and in `APPROVED.md`, and every state in the table above has a rendered comp.

## Task 12: Route structure, the public layout and security headers

**Files (component markup finalised after comp approval):** Create `app/(auth)/layout.tsx`; modify `next.config.ts`.

- **Routes.** `/sign-in`, `/forgot-password` and `/reset-password` live in the route group `app/(auth)/`, which has its own layout and no rail. The signed-in page is `/welcome`, in `app/(app)/`. The route names are fixed by Part A: `safeNextPath` refuses these three paths as a post sign-in destination, the reset mailer links to `/reset-password?token=...`, and the actions redirect to `/welcome`, `/sign-in?reset=1` and `/sign-in?signed-out=1`.
- **`app/(auth)/layout.tsx`** (server component): the frame from the approved comp (brand mark, centred panel, `<main id="main">`, a skip link). It reads nothing from the request. It sets `robots: { index: false }` in its metadata, and each page sets a title in sentence case ("Sign in", "Forgot your password", "Choose a new password").
- **Headers.** The reset page carries a one-time token in its URL, so it must not leak through a `Referer` header or sit in a cache. Add to `next.config.ts` (a config change, not markup):

**Edit:** `next.config.ts`

Replace:

```typescript
  turbopack: {
```

With:

```typescript
  async headers() {
    return [
      // The reset token is in the URL of this page: send no referrer from it and cache nothing.
      { source: "/reset-password", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/sign-in", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  turbopack: {
```

- **Check.** `pnpm build && pnpm start`, then `curl -sI http://localhost:3020/reset-password | grep -i "referrer-policy\|cache-control"` prints both headers. (Use a free port and reuse a running dev server if there is one; never stop another project's process.)
- **No third-party resources** (fonts, scripts, images from another origin) on `/reset-password`; the page only loads its own assets and the `geist` fonts already served from this origin.

**Acceptance:** the two headers are present on `/reset-password`; every page in the group has the shared frame, a title and `noindex`.

## Task 13: The sign-in page

**Files (component markup finalised after comp approval):** Create `app/(auth)/sign-in/page.tsx` (server) and `app/(auth)/sign-in/sign-in-form.tsx` (client).

- **Data flow.** The page is a server component. Its static shell is the frame and the form; the parts that depend on the request sit in a `<Suspense>` boundary (finding 2): it awaits `searchParams` for `next`, `reset`, `signed-out` and `reason`, and calls `getSessionContext()`. A visitor who is already signed in is redirected to `safeNextPath(next) ?? "/welcome"` and never sees the form. The form is a client component using `useActionState(signInAction, IDLE)` and `<form action={formAction}>`.
- **Fields.** `email` (type `email`, `autocomplete="username"`, `inputMode="email"`, `defaultValue` from the form state's `email`), `password` (type `password`, `autocomplete="current-password"`, never given a value), and a hidden `next` carrying `safeNextPath(next)` when it passed, nothing otherwise. Never validate the password's length or strength at sign-in (accounts keep working under any older rule).
- **Notices (read from the query, shown above the form).** `reset=1` shows `PASSWORD_CHANGED_NOTICE`, `signed-out=1` shows `SIGNED_OUT_NOTICE`, `reason=ended` shows `SESSION_ENDED_NOTICE`. They are display only: the query carries no data and grants nothing. At most one is shown.
- **Form states** (from `AuthFormState`, every string from `lib/auth/messages.ts`):

| State | What the page does |
|---|---|
| `idle` | Empty form, primary button "Sign in". |
| pending (`useActionState`'s pending flag) | Button disabled, label "Signing in", the fields stay as typed. |
| `error` | The message in a live region directly above the fields, the email field refilled and focused, the password empty, `aria-invalid` on the email field. The message is the same for a wrong password and an unknown address. |
| `rate-limited` | The message ("Too many attempts. Try again in N minutes.") in the same place; the form stays usable (a later attempt is checked again server-side). |
| success | The action redirects; the page renders nothing for it. |

- **Links.** "Forgot your password?" to `/forgot-password`. No sign-up link: there is no public sign-up.
- **Accessibility.** Labels are real `<label>` elements tied by `htmlFor` (no placeholder as label); the status message is in an element with `role="alert"` or an `aria-live="polite"` region and focus moves to the email field after a failed attempt; the error text is associated with the field by `aria-describedby`; the primary button is the only submit; the tab order is email, password, show control (if the comps have one), button, link; focus rings are the `--navy` ring from `DESIGN.md`; the touch target of every control is at least 44 by 44 CSS pixels; paste is never blocked; the layout holds at 390 wide with no horizontal scroll; motion respects `prefers-reduced-motion`.
- **Tests.** The rules live in Part A and are already tested, so the page tests are source rules plus the browser checks below. Add this describe block to `server/auth/boundaries.test.ts` now (it passes with no pages and starts guarding as soon as the first page exists):

**Edit:** `server/auth/boundaries.test.ts`

Replace:

```typescript
describe("files that reach a database pool", () => {
```

With:

```typescript
describe("pages stay thin", () => {
  /** The only server modules a page or a client form may import: the actions, the session read and the page guard. */
  const ALLOWED_SERVER_IMPORTS: ReadonlySet<string> = new Set(["@/server/auth", "@/server/auth/actions", "@/server/auth/guard"]);
  const pageFiles = (): string[] => ["app/(auth)", "app/(app)"].filter((directory) => existsSync(join(ROOT, directory))).flatMap(sourceFiles);
  const serverImports = (path: string): string[] => [...read(path).matchAll(/from\s+["'](@\/server[^"']*)["']/g)].map((match) => match[1] ?? "");

  it("import from server/ only the actions, the session read and the guard: never the database, Better Auth, the limiter or the breach check", () => {
    const offenders = pageFiles().flatMap((path) => serverImports(path).filter((name) => !ALLOWED_SERVER_IMPORTS.has(name)).map((name) => `${path} imports ${name}`));
    expect(offenders).toEqual([]);
  });

  it("never import better-auth or drizzle directly, and never log", () => {
    const offenders = pageFiles().filter((path) => /from\s+["'](better-auth|drizzle-orm|pg)["/]/.test(read(path)) || /console\.(log|info|debug)\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("files that reach a database pool", () => {
```

**Edit:** `server/auth/boundaries.test.ts`

Replace:

```typescript
import { readFileSync, readdirSync, statSync } from "node:fs";
```

With:

```typescript
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
```

**Acceptance checks** (dev server on a free port or the running one; the admin from Task 9 exists):

1. `/sign-in` renders the approved comp at 1280 and at 390 wide, in light mode.
2. A wrong password shows "That email and password do not match an account." and the email comes back filled; the password does not.
3. The right password lands on `/welcome` and the cookie `fynix-leads.session_token` is `HttpOnly` with no `Domain` (browser devtools, Application, Cookies).
4. Visiting `/sign-in` while signed in redirects to `/welcome`.
5. Nine wrong attempts for one account from one browser (the dev address is the shared `unknown`) show the rate-limited message on the ninth; `select count(*) from rate_limit` as the owner shows rows, and `select key_hash from rate_limit limit 1` shows a 43 character hash and no address.
6. `/sign-in?next=//evil.example` and `/sign-in?next=/welcome` both sign in and land on `/welcome`; `/sign-in?next=https://evil.example` does too.
7. `/sign-in?reset=1`, `?signed-out=1` and `?reason=ended` each show their notice and nothing else changes.
8. Keyboard only: tab order as above, Enter submits, focus is visible everywhere.

## Task 14: Forgot-password and reset-password pages

**Files (component markup finalised after comp approval):** Create `app/(auth)/forgot-password/page.tsx` and `forgot-password-form.tsx`; `app/(auth)/reset-password/page.tsx` and `reset-password-form.tsx`.

**Forgot password**

- **Data flow.** A client form with `useActionState(requestPasswordResetAction, IDLE)`. One field: `email` (`autocomplete="email"`, `defaultValue` from state).
- **States.** `idle`: the form. pending: button "Sending", disabled. `sent`: the form is replaced by `RESET_REQUESTED_NOTICE` and a link back to `/sign-in`; it is the same whether or not the address has an account, and it must not name the address as having one (it may echo what the person typed). `rate-limited`: the message above the form. `error` (a fault): `GENERIC_FAILURE`.
- **Accessibility.** As Task 13; the `sent` notice is announced (`role="status"`).

**Reset password**

- **Data flow.** The page is a server component; inside `<Suspense>` it awaits `searchParams` and reads `token` (one string). No token, or an empty one, renders the dead link state directly (the same state as `invalid-link`). Otherwise it renders the client form with the token as a hidden field named `token`. The page never reads the token from anywhere but the query and never prints it into text.
- **Fields.** `password` (type `password`, `autocomplete="new-password"`, no value), with the hint `PASSWORD_RULE` under it and the show control the comps approved (a button with `aria-pressed`, keyboard operable, that only toggles the input's `type`). One field only (a confirm field is not in the comps; adding one is a comp change).
- **States.** `idle`: form and hint. pending: "Saving", disabled. `error`: the message from the state (too short, too long, breached, or "We could not check that password just now. Try again in a minute."), field emptied and focused, `aria-invalid`; the same link still works afterwards because a refused password does not use the token (tested in Task 8). `rate-limited`: the message above the form. `invalid-link`: `RESET_LINK_INVALID` and a link to `/forgot-password`. success: the action redirects to `/sign-in?reset=1`, which shows the "password changed" notice.
- **Privacy.** The token is in a hidden field and in the URL only; the Task 12 headers stop it leaving through a referrer or a cache.
- **Tests.** The rules are Part A's, and the `pages stay thin` block from Task 13 already forbids imports of the database and any logging on these pages. Then the checks below.

**Acceptance checks:**

1. On `/forgot-password`, request a reset for the admin address: the sent notice appears. `pnpm mail:last` prints the message with a link to `/reset-password?token=...`.
2. Request a reset for an address that has no account: the same notice appears, and `pnpm mail:last` still prints the previous message (nothing was queued).
3. Request four resets for the admin address within an hour: the fourth shows the rate-limited message.
4. Open the link. Enter `short`: the "Use at least 12 characters." error appears, the field is empty and focused. Enter `Password123456`: the breach message appears (needs a network). Enter a good password: the page lands on `/sign-in?reset=1` with the notice, and the new password signs in while the old one does not.
5. Open the same link again: the dead link state appears with a link to ask for a new one. Open `/reset-password` with no token and with `?token=nonsense`: the same dead link state.
6. With a session open in another browser profile, finish a reset for that account: reloading `/welcome` in the other profile lands on `/sign-in?reason=ended` with the "session has ended" notice.
7. `curl -sI` on `/reset-password` shows `Referrer-Policy: no-referrer`.
8. With `PASSWORD_BREACH_CHECK=hibp` and the network off (or the service blocked), submitting a good password shows the "We could not check that password just now" message and the token still works once the network is back.

## Task 15: The signed-in holding page and sign-out

**Files (component markup finalised after comp approval):** Create `app/(app)/layout.tsx`, `app/(app)/welcome/page.tsx`, `app/(app)/welcome/sign-out-form.tsx`.

Until phase 1E builds the role-shaped shells, a signed-in person needs somewhere to land and a way to sign out. This page is that and nothing more.

- **Data flow.** `app/(app)/layout.tsx` is a server component with a static frame and a `<Suspense>` boundary around the children. The page inside the boundary calls `requireSessionContext()` (Part A): no session sends the visitor to `/sign-in`, a cookie that no longer resolves sends them to `/sign-in?reason=ended`. It renders `context.name`, one word for the kind of organisation the person belongs to ("Fynix", "Client" or "Agency"), and the sign-out control. It shows no organisation name, no id, no campaign and nothing about any other party (finding 3: the shell streams before the check finishes, so it must hold nothing private). The sign-out control is a form whose action is `signOutAction`; it needs no client JavaScript.
- **Accessibility.** The page has one `<h1>` ("Signed in"), the sign-out button is a real button inside a form, focus is visible.
- **Tests.** The guard and the actions are tested in Part A, and the `pages stay thin` block from Task 13 already covers `app/(app)`: nothing under it imports the database or Better Auth.

**Acceptance checks:**

1. Signed in as the Fynix admin: `/welcome` shows the name and "Fynix". Create a client and an agency user the way the tests do (an owner script or psql, as in `server/auth/testing.ts`; phase 1C replaces this with invites) and check each shows its own word and nothing else.
2. "Sign out" returns to `/sign-in?signed-out=1` with the notice, `select count(*) from session where user_id = ...` is 0, and the back button then reloading `/welcome` lands on `/sign-in`.
3. As the owner, `delete from session;` while signed in, then reload `/welcome`: it lands on `/sign-in?reason=ended` with the "session has ended" notice.
4. Set a member's `status` to `suspended` as the owner and reload `/welcome`: it lands on `/sign-in?reason=ended`; sign-in with the right password now says "This account cannot sign in right now. Ask your Fynix contact for help."
5. Page-source check (the `CLAUDE.md` isolation rule): `pnpm build`, then `grep -rl "BETTER_AUTH_SECRET\|DATABASE_URL\|leads_auth\|better-auth" .next/static` prints nothing, and the HTML of `/sign-in` and `/welcome` contains no organisation id.
6. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and `pnpm build` are green, and the browser console has no errors on any of the four pages.

**Commit for Tasks 12 to 15** (one commit per task as each is finished):

```bash
git add next.config.ts app/\(auth\)
git commit -m "Add the sign-in, forgot password and reset password pages from the approved comps"
git add app/\(app\) server/auth/boundaries.test.ts
git commit -m "Add the signed-in holding page and sign-out"
```

---

## Self-review

**1. Coverage against the master plan 1B row, the exit criteria and the brief**

| Requirement | Where it is proved |
|---|---|
| Exit: sign in and out work for the three kinds | `signs in each kind of user` and `resolves a Fynix admin / a client user / an agency user` (Task 7); sign-out in `returns null once the session is signed out` (Task 7) and `signOutAction` (Task 8); in a real Next.js 16 request on a throwaway page (appendix); Part B acceptance checks 3 and 5 (Task 13, Task 15) |
| Exit: sessions expire as specified (14 days client and agency, 12 hours Fynix) | `last 14 days ... and 12 hours for a Fynix admin` (stored expiry), `a Fynix session is over after 12 hours and a client session is not` and `holds even if the stored expiry were extended` (resolution checks twice), `does not extend a session by reading it` (no refresh), `returns null once the session row has expired` (Task 7) |
| Exit: tenant roles cannot read the auth tables | access matrix and `only leads_auth touches the auth table` for each of the four tables, `every role other than leads_auth is refused each auth table`, `leads_public may add to the outbox and nothing else`, and 17 new leak matrix probes run as both tenant roles for both organisations of each kind, with every seeded email, hash, token and name forbidden in results and in error text (Task 3); mutation proofs in the appendix |
| Better Auth, email and password, no public sign-up | `createAuth`; guard 1 and its canary (Task 7); no mounted handler (`boundaries.test.ts`, Task 8) |
| Guard: a 403 in the create-user hook becomes a fake success, so return `false` | `refuses a sign-up with no grant`, `... when the grant names another address`, and the canary (Task 7); the 403 variant fails 2 tests (appendix) |
| Guard: a duplicate address returns an id that was never stored, so check the row | `throws AccountAlreadyExistsError ...` and its canary (Task 7), `refuses an address that already has an account` (Task 9); removing the check fails 2 tests (appendix) |
| Guard: a secret under 32 characters falls back to a public default, so refuse | `assertUsableSecret` tests (7 cases, Task 7), the canary that shows the published default, the environment schema (Task 1); removing the guard fails 6 tests (appendix) |
| `leads_auth` grants and policies; only `leads_auth` touches the auth tables | Task 2 migrations 0007 and 0008; Task 3 |
| `member`, session to member to organisation kind to role pool, plugged into the scope helper | Task 2 (`member`), Task 7 (`resolveSessionContext`, `a resolved session picks the role pool that sees only its own rows`), Task 8 (`withSessionScope`) |
| Password policy: 12 or more characters plus a breached-password check; offline in tests; what happens when the service is down | Task 5 (k-anonymity client behind `BreachChecker`, fake in tests, live check once), Task 7 (`password policy` tests, including the outage case), decision B7 |
| Sessions 14 days or 12 hours, `revokeSessionsOnPasswordReset`, reset token 1 hour, host-only cookies | Task 7 (lifetimes, cookie attributes on http and https), Task 8 (`ends every session of the account`, `stores the token ... with a one hour expiry`, `refuses a token after an hour`) |
| Rate limits in Postgres: fixed-window upserts keyed by SHA-256, no email or address stored, three sign-in keys, outside any transaction, `leads_public` | Task 6 (all of it, including the compile-time proof that a transaction is refused), Task 7 (`sign-in is rate limited`), Task 8 (reset limits) |
| `pnpm admin:create`, password only, a named extension point, no second factor | Task 9 and `second-factor.ts` (Task 7); `is consulted for every session, and a refusal means not signed in` proves the extension point works |
| Reset email through an `email_outbox` stub, only because the flow needs it | Task 2 (the minimal table), Task 5 (the development transport), Task 8 (`queues one message ... written as leads_public`), decision B9 |
| Invites are 1C, not 1B | Not built; users in tests come through the account creation grant and `admin:create` |
| UI: comps before any build; Part A has no placeholders | Part B opens with Task 11 and stops for approval; Tasks 12 to 15 mark markup as finalised after approval |

**2. Placeholder scan.** Part A has no unfinished marker, no step that points at another task instead of showing its code, and no step that describes code without showing it. The two non-literal instructions are the comparison of the generated `0006_auth_and_member.sql` in Task 2 Step 4 (drizzle-kit writes it, so the file is shown for comparison) and the `psql` mutation commands in Task 3 Step 6. Part B has no code for component markup by design; its source test (`pages stay thin`) and its `next.config.ts` change are shown in full.

**3. Names and types.** Names used across tasks, checked against the code: `AuthServices`, `SignInResult`, `signInWithPassword` (Task 7) are used by `password-reset.ts`, `testing.ts` and `actions.ts`; `SessionContext`, `SessionResolution`, `resolveSessionContext` (Task 7) by `with-session.ts`, `guard.ts`, `index.ts` and the tests; `AuthFormState`, `IDLE` (Task 4) by `actions.ts` and `actions.test.ts`; `readMembership` (Task 7) by `create-auth.ts` and `session-context.ts`; `openAuthRig`, `createUserIn`, `requestHeadersFrom`, `latestResetToken`, `outboxFor` (Task 7 harness) by Tasks 8 and 9. `EXPECTED_ACCESS` lists exactly the nine tables the migrations create. The whole file set was compiled together (`tsc --noEmit`, strict, through `pnpm typecheck`) and linted with the repository's ESLint configuration after every task.

**4. Judgement calls and gaps, stated plainly.**
- The cookie's `Max-Age` for a Fynix user is 14 days while the session row lives 12 hours (decision B6). Harmless, but visible in browser devtools.
- `leads_fynix` has no grant on `member` or the auth tables in 1B, so the master plan's "Fynix: all" is deferred to 1C (decision B5).
- A session is looked up by Better Auth (cookie signature, row, expiry) and then our `member` read adds one more query per resolved request. Within one request it is cached by React's `cache`.
- Fail-closed on a breach service outage (decision B7) means a person cannot set a password while that service is down. The alternative is one line (`createAuth` catching the error and accepting); it is not taken because nobody would notice the weaker rule.
- The `x-real-ip` rule needs an nginx setting that does not exist yet (phase 6). Until then every caller shares the address `unknown`, which makes the network limits stricter, not looser.
- Concurrent sign-ups for one address are decided by the unique constraint on `user.email`, as in the sibling repository; a lost race surfaces as Better Auth's failure to create the user, not as `AccountAlreadyExistsError`. Invites (1C) make this a one-per-invite event.
- Better Auth logs a warning for an unknown address on reset and an error if the outbox insert fails (it runs the mail callback in the background and swallows its error). A failed insert therefore looks like a successful request to the person, by design, and shows only in the server log. Phase 1C's outbox gets an alert.
- The TTY password prompt cannot take two pasted lines at once (type each line). Piped input takes the first line.

**5. Questions for the owner.** (a) Better Auth 1.7.20 or 1.7.21: 1.7.20 is pinned because 1.7.21 was a day old (decision B1); say so if you would rather take the newest. (b) Whether a Fynix reset email should be refused for the single admin during G1 (it lets anyone with the admin's mailbox reset the password, which is the case for any password-only account). (c) Whether the confirm-password field the sibling repository uses should be in the comps; this plan assumes one field plus a show control.

---

## Verification appendix

All of this was run against PostgreSQL 16.14 (Homebrew, the shared local cluster), Node 24.14.0, pnpm 11.3.0 (the pinned `packageManager`, through `npx pnpm@11.3.0`), in a scratch copy of the repository at commit `6df399a` plus this plan's files. The scratch copy used scratch role names (`s1b<random>_owner` and so on, a substitution of the six `leads_` role names) and scratch databases `scratch_leads_1b_<random>` and `scratch_leads_1b_<random>_test`, because the real `leads_*` roles and the real databases exist on this machine and were not touched. The substitution is mechanical (every `leads_` role name and the two database names), so the plan shows the real names. Every code block in Part A is the content of the file that was run: the scratch tree was rebuilt from this document by a script that reads the **File** and **Edit** blocks, and each task was replayed in order (tests first, see them fail, then the code).

**Replay, task by task** (counts are from the replay; unit means `pnpm test`, integration means `pnpm test:integration`):

| After | Unit | Integration | Notes |
|---|---|---|---|
| 1A baseline | 35 files, 504 tests | 4 files, 162 tests | start of the plan |
| Task 1 | 36 files, 513 | n/a | the new test failed first: 8 of 9 failed; `pnpm add -E better-auth@1.7.20` left `pnpm-workspace.yaml` untouched; `env:check` failed before and passed after the appended variables; lint clean |
| Task 2 | 36 files, 513 | 5 failed, 157 passed of 162 | `pnpm db:generate` printed `No schema changes`; both migrations applied; the 5 failures are the hard-coded count test, as stated |
| Task 3 | 36 files, 513 | 4 files, 214 tests | typecheck and lint clean |
| Task 4 | 43 files, 558 | 214 | the 7 new files failed to load first; `lib/auth` 7 files, 37 tests |
| Task 5 | 46 files, 572 | 214 | 3 new files, 14 tests; live check: `password -> true`, random `-> false` |
| Task 6 | 46 files, 572 | 10 tests in the new file | the new file failed to load first; typecheck passed, which proves the `@ts-expect-error` is needed |
| Task 7 | 49 files, 589 | 8 files, 262 | 4 new test files failed to load first (the unit run: 2 of the 6 `server/auth` files failed; the integration run: 3 of 4 files) |
| Task 8 | 54 files, 619 | 9 files, 275 | 5 unit files failed first (4 could not load, `boundaries` failed 2 tests), the reset test could not load |
| Task 9 | 55 files, 622 | 10 files, 282 | the two new files could not load first; scripts run for real (below) |
| Task 10 | 55 files, 622 | 282 | dash check printed `No em or en dashes.`; `pnpm build` passed |
| Tasks 12 and 13 edits | 55 files, 624 | 10 files, 282 | the `pages stay thin` block passed with no pages, failed with a page that imported `@/server/db/client`, and passed with a page that imported only the actions; typecheck, lint and `pnpm build` passed with the `next.config.ts` change |

The integration counts from Task 3 on include one test, `leads_public may add to the outbox and nothing else`, that was added after the first replay of Task 3 (the first replay counted 213, 261, 274 and 281 and the final run 282); the test closed the gap named in the mutation table below.

The final run: **unit 55 files, 624 tests, all pass; integration 10 files, 282 tests, all pass; `pnpm lint` and `pnpm typecheck` clean; `pnpm build` passes; `pnpm db:generate` reports no schema changes.** New files in the final tree: unit `lib/auth` email 1, messages 4, next-path 19, password-policy 3, rate-limit-rules 6, session-cookie 1, session-lifetime 3; `server/auth` account-creation-grant 4, actions 14, auth-schema 9, boundaries 9, breach-check 6, client-address 3, create-auth 7, guard 3, mail 4, session-lifetime 1, with-session 3; `server/env-auth.test.ts` 9; `server/prompt.test.ts` 3. Integration: admin-create 7, create-auth 20, password-reset 13, rate-limit 10, session-context 14, sign-in 4 (new); structure 109 (was 91), leak matrix 81 (was 47), rls 18, migrator 6.

**Better Auth versions.** The whole suite also passed on **1.7.21** (unit 624, integration 282, typecheck clean) after `pnpm add -E better-auth@1.7.21`, which wrote eight `minimumReleaseAgeExclude` entries into `pnpm-workspace.yaml` (the reason for decision B1); the scratch copy was put back on 1.7.20 afterwards. APIs used and confirmed to exist in 1.7.20 by running them: `betterAuth`, `drizzleAdapter`, `createAuthMiddleware`, `APIError`, `isAPIError`, `nextCookies`, `getAuthTables`; `auth.api.signUpEmail`, `signInEmail` (with `returnHeaders`), `getSession` (with `disableRefresh`), `signOut`, `requestPasswordReset`, `resetPassword`, `changePassword`; options `emailAndPassword.{autoSignIn, revokeSessionsOnPasswordReset, resetPasswordTokenExpiresIn, sendResetPassword, minPasswordLength, maxPasswordLength}`, `session.{expiresIn, disableSessionRefresh, cookieCache}`, `advanced.{database.generateId, cookiePrefix, ipAddress.ipAddressHeaders}`, `databaseHooks.user.create.before`, `databaseHooks.session.create.before`, `hooks.before`. Source reading of the 1.7.20 package (`sign-up.mjs`, `password.mjs`, `with-hooks.mjs`, `create-context.mjs`) is what the three canary tests encode: the 403 handling, the synthetic duplicate response, and the secret fallback to `better-auth-secret-12345678901234567890`.

**The checks can fail** (mutations applied to the scratch copy, the named tests failing, then reverted):

| Mutation | Result |
|---|---|
| remove the rate-limit check from `signInWithPassword` | 4 fail: the ninth attempt, 20 attempts from one network, the three keys, fail closed |
| the create-user hook throws a 403 instead of returning `false` | 2 fail: the two "refuses a sign-up" tests |
| `createAccountWithGrant` trusts the id Better Auth returns | 2 fail: `throws AccountAlreadyExistsError ...`, `refuses an address that already has an account` |
| `assertUsableSecret` returns at once | 6 fail (unit): short, empty, the published default, `BETTER_AUTH_SECRETS`, `createAuth` |
| the session hook stops shortening a Fynix session | 1 fails: the 14 days and 12 hours test |
| `disableSessionRefresh: false` | 1 fails: `does not extend a session by reading it` |
| the breach check skipped | 6 fail across create, reset and admin tests |
| `revokeSessionsOnPasswordReset: false` | 1 fails: `ends every session of the account` |
| the second lifetime check removed from `resolveSessionContext` | 2 fail |
| a suspended membership still resolves | 1 fails |
| `grant select on "user" to leads_client` | 12 fail: the table-level grant check, the policy check, the access matrix entries for `user`, `select *`, the leak probes for the auth tables, the self-tests |
| `grant select (token) on session to leads_agency` | 6 fail: including `only leads_auth touches the auth table session` and the probe for session tokens |
| `grant select on account to leads_fynix` | 6 fail: the access matrix entries for `account` |
| `grant update (status) on member to leads_auth` | 1 fails: `only leads_auth reads member, and it cannot write it` |
| row-level security off on `"user"` | 2 fail: the row-level security check and its self-test |
| `grant select on email_outbox to leads_public` | **first run: nothing failed.** The access matrix only records that `leads_public` touches the table. Closed by the test `leads_public may add to the outbox and nothing else` (Task 3), which then fails 1 |

**The scripts, run for real** against the scratch dev database, with the breach check live (`PASSWORD_BREACH_CHECK=hibp`): `echo short | pnpm admin:create ...` printed `Use at least 12 characters. Nothing was created.`; `echo Password123456 | ...` printed the breach message (a live Have I Been Pwned answer); a good password created the admin and printed the sign-in line; the same address again printed `An account for ... already exists. Nothing was changed.`; `pnpm mail:last` printed `The outbox is empty.` before any reset and the message with the link after one. In a pseudo-terminal the prompt asked twice with nothing echoed, accepted two equal entries and refused two different ones (`The two passwords are not the same. Nothing was created.`).

**Next.js 16.4.6 with Cache Components, on throwaway pages** (deleted afterwards, never part of the plan): an earlier equivalent of the actions drove sign-in (wrong password gave `invalid-credentials`; the right one set the cookie, redirected, and the next request resolved to `kind=fynix role=leads_fynix`), sign-out (the session row was deleted and `/probe/home` redirected back), a reset request (`pnpm mail:last` printed the link), a too-short password (`Use at least 12 characters.`) and the final reset (`reset`). The final `actions.ts` and `guard.ts` were then driven the same way: a signed-out `/welcome` landed on `/sign-in`; a wrong password showed `That email and password do not match an account.` with the email refilled and the password empty (the React 19 form reset, finding 1); the right password landed on `/welcome` showing the name and `fynix`; after `delete from session` a reload of `/welcome` landed on `/sign-in?reason=ended`. `curl -sI /reset-password` on `next start` printed `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.

**Not verified.** The sign-out button and the forgot and reset forms through the final `actions.ts` in a browser (their logic is covered by `actions.test.ts` with mocked Next.js APIs and by the integration tests, and an earlier equivalent was driven in a browser); the three screens and the holding page themselves (they do not exist until the owner approves comps); the GitHub Actions `database` job (it runs the same commands as the replay, and `pnpm env:init` now writes the new variables); a second machine; the real database names `fynix_leads` and `fynix_leads_test` (the substitution is the only difference); behaviour behind the production nginx (`x-real-ip` is a phase 6 requirement); a Better Auth release newer than 1.7.21.

**Clean-up.** The scratch databases and all six scratch roles were dropped and the scratch copy deleted; the end of this run printed counts of 0 for `pg_database` names starting `scratch_leads_1b` and `pg_roles` names starting `s1b`. Nothing else on the cluster was touched, and no process was stopped.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-12-phase-1b-auth.md`. Two execution options:

**1. Subagent-Driven (recommended)** - a fresh subagent per task, review between tasks, fast iteration. Required sub-skill: superpowers:subagent-driven-development. Part A (Tasks 1 to 10) can run now. Stop at Task 11 until the owner approves the comps.

**2. Inline Execution** - execute tasks in this session using superpowers:executing-plans, with batch execution and checkpoints for review.

Which approach?
