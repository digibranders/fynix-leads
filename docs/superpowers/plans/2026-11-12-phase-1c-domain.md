# Phase 1C: Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** everything Fynix needs to onboard people, behind a database that records it: organisations, campaigns with their requirements, invites that turn into accepted accounts in one transaction, versioned terms and their acceptance, members that can be suspended and given an alias, an append-only audit log that no Fynix change can skip, and an email outbox with a Brevo transport, a retry state machine and links that never outlive their use. Part A is server code and one server action, with no UI. Part B builds the only new screen, the accept-invite page, and only after the owner has approved visual comps.

**Architecture:** domain services are plain functions in `server/domain/` that take one `DomainDeps` object (the three pools they use, a clock, randomness, the app origin, a Better Auth factory), so the tests run them on the test database with a fixed clock and a fake breach service, and the running app builds the same object once (`getDomain()`). Every Fynix write goes through `fynixWrite`, which opens the Fynix scope transaction and hands the callback an `audit` function writing into the same transaction; the database then refuses to commit a Fynix change that has no audit row. Invite redemption is one transaction on the identity role with Better Auth running on it. Email is written to `email_outbox` first and sent by a runner; the link lives in its own column only while the row is pending. No new mechanism replaces a 1A or 1B one: every new table gets row-level security, a policy per role that holds a grant, an entry in the access matrix and probes in the leak matrix.

**Tech Stack:** the 1A and 1B stack, unchanged: PostgreSQL 16, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, zod 4.6.7, Better Auth 1.7.20, Vitest 5.1.0, Next.js 16.4.6, Node 24, pnpm 11.3.0. **No new dependency:** Brevo is called with the global `fetch`, the templates are plain functions, the token hash uses `node:crypto`.

**Master plan:** `docs/superpowers/plans/2026-11-11-phase-1-accounts-and-campaigns.md` (decisions D1 to D9, section 3 "Invites", "Email" and "Tests", section 4 data model, section 6 row 1C, section 7 gates, section 8 risks). **Spec:** `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md` sections 4, 5, 6, 12, 14 and 17, and the open questions in 16. **1A and 1B plans:** `2026-11-11-phase-1a-foundation.md` and `2026-11-12-phase-1b-auth.md` (both built on `development`, latest commit `a219aca`).

**Exit criteria for 1C (master plan section 6):** an invite to accepted-account flow works end to end in tests; every admin action is in `audit_log`; outbox states are tested. The table in the self-review at the end shows which task proves each.

---

## How to work through this plan

- Work on the `development` branch in `/Users/a12345/Desktop/AI/Fynix Digital/fynix-leads`. Commit after each task. Never push, never commit to `main`.
- Commit messages are plain: no attribution lines, no em or en dashes (the copy rule covers commit messages, code, comments and docs).
- Run every command from the repository root. A block headed **File** is the complete content of that file. A block headed **Edit** shows the exact text to find (it occurs once) and the text to put in its place. Several Edit blocks for one file apply in the order shown.
- The plan has two parts. **Part A** (Tasks 1 to 13) is server code with no UI, and every code block in it was run. **Part B** (Tasks 14 to 16) builds one new screen, so it opens with a task that produces visual comps for the owner to approve, and the component markup is written only after that approval (the owner's standing rule).
- TDD order inside a task: write the tests, run them and see them fail for the stated reason, write the code, run them and see them pass. Where a step says "Expected: FAIL", a pass means the test is wrong.
- Read `AGENTS.md` before touching Next.js code. Part A touches no route and no component; its one `"use server"` file (`server/domain/actions.ts`) and one `server-only` file (`server/domain/page-data.ts`) follow the 1B pattern. Part B reads `node_modules/next/dist/docs/01-app/02-guides/forms.md` and `authentication-with-cache-components.md` first.
- **This machine runs one Postgres 16 shared with other projects.** This plan creates no new role and no new database: the dev and test databases and the six roles are the 1A ones. The migrations only add objects to them.
- Machines that ran `pnpm env:init` earlier need no change: `BREVO_API_KEY` is optional on http (Task 1).
- Typing in the plan: no `any`, no casts except where a test needs a fake and says so. Use the `@/` import alias. Test names state the behaviour.
- Never call Brevo from a test or from a check in this plan. Tests use `FakeTransport` and a fake `fetch`; `pnpm outbox:run` without `BREVO_API_KEY` sends nothing.

## Decisions in this plan that sharpen or correct the master plan

| # | Decision | Why |
|---|---|---|
| C1 | Redeeming an invite is **one database transaction on `leads_auth`, with Better Auth running on that transaction**: the claim of the invite, the account, the membership, the alias and the acceptance of the terms commit together or not at all. | Better Auth on its own pool would create the account in a transaction of its own, so a failure after it (an alias taken in the meantime) would leave an account with no membership and block the address for good. Running `createAuth` on the transaction handle (a throwaway test for this plan created an account on a transaction, threw, and found no user; it committed, and found one) makes every refusal, including a weak or breached password, leave nothing behind and the invite usable. |
| C2 | `leads_auth` gets narrow **write** grants for redemption: INSERT on `member`, `agency_alias` and `terms_acceptance`, UPDATE of `redeemed_at` on `invite`. Each write is bound by a policy to a redeemed invite (the member's address, organisation, role and name must match it; the alias must be the invite's; the acceptance must be of the current terms of the user's own party). This replaces 1B decision B5's "no grant on `member`". | The master plan says redemption needs only narrow access. The policies mean a bug or an injected statement on the identity pool still cannot add a member to an organisation it chooses: the database asks for the redeemed invite. Tested directly, bypassing the services (Task 10). |
| C3 | **Invites are read through a capability policy**: `leads_auth` sees an invite row only when its transaction names that row's token hash in `app.invite_hash` (`withInviteHash`). `leads_public` holds no grant on `invite` at all; the accept-invite page and the redemption both run as `leads_auth`. | The master plan lists `leads_public` for redemption, but the page needs the invite, the terms and, at redemption, the identity tables, so splitting it across two roles would give both of them a copy of the same access. One role with a policy that shows it exactly one row (whose hash only the link holder knows) lists no invitee's name or address even to a compromised connection. `leads_public` keeps the rate limits. |
| C4 | `audit_log` is **append only for every role including the owner** (a trigger raises on UPDATE and DELETE) and a **deferred constraint trigger makes a transaction as `leads_fynix` that changes a domain table fail at commit unless it also appended an audit row**. TRUNCATE is deliberately not blocked. | The exit criterion is that every admin action is in the log. A helper that appends the row is a convention; the trigger turns it into a rule the database enforces even for a raw statement. The owner can TRUNCATE because the test harness empties every table with it; no runtime role can, and phase 6 ships the log off the machine. The check only looks at `leads_fynix`, so seeds, `pnpm admin:create` and redemption are not Fynix actions. |
| C5 | Audit rows hold **snapshots built field by field** (`server/domain/snapshots.ts`), never a raw row. No snapshot contains a token, a hash, a link or a password. The redemption of an invite is not an audit row: `invite.redeemed_at`, the `member` row and the acceptance row are the record. | The log is kept forever. A new column is not in the log until someone adds it to a snapshot. Redemption is the invitee's act, and `audit_log` is Fynix's. |
| C6 | The outbox row keeps `template` and `params` (the content), `subject` and `body` (a stored copy **without the link**) and, in its own column, `link`, which exists only while the row is `pending` (check constraint `email_outbox_link_only_while_pending`) and is cleared on send, on permanent failure, on cancel and by the purge after one day. | Master plan section 3: link emails store a copy without the link and are purged after one day. A database constraint is stronger than a promise: no code path can leave a live link on a sent, failed or cancelled row. |
| C7 | The **sender runs as `leads_auth`**, which gets SELECT and a column-limited UPDATE on `email_outbox`. | CLAUDE.md fixes six roles. The two kinds of link (reset token, invite token) are authentication artefacts, and `leads_auth` already holds the tables those tokens live in, so reading the link widens nothing it did not have. Fynix can read the state of the queue but never `link`. When phase 4 sends notification emails that carry lead data, the sender gets a role of its own. |
| C8 | Sending is **at least once**: a claim (`FOR UPDATE SKIP LOCKED`, one statement) pushes `next_attempt_at` out by a ten minute lease and counts the attempt. Five attempts, backing off 1 minute, 5 minutes, 30 minutes, 2 hours. | A sender that dies mid-send delays a message and never loses it. A message sent whose result could not be recorded is sent again after the lease; for a reset or an invite link that is harmless. |
| C9 | **Brevo through `fetch`, no SDK.** 400 and 422 are permanent; 401, 403, 429, 5xx, a timeout and a network error are transient. A reason holds the status and Brevo's short error code only. | A rejected key (401, 403) is an operator mistake that can be fixed inside the retry window, so the message should still go out; an invalid address (400, 422) never will. Brevo's `message` field can quote the recipient, so it is not stored. |
| C10 | **Plain escaped HTML templates, not React Email.** | The master plan and spec section 14 name React Email. Two messages do not justify a rendering dependency, and `lib/email/templates.ts` escapes every value and is tested for it. Phase 4 has about ten templates and is the place to revisit. |
| C11 | An invite carries the person's **name** and, for an agency, the **alias**; an agency invite without an alias and a client invite with one are refused by the database. **One live invite per address** (partial unique index), so issuing a new one revokes the old one in the same transaction and cancels its unsent email. | Redeeming then needs only a password and the terms, and a member never exists without the alias the client must see. The index makes "one live invite" a property of the table, not of the service. |
| C12 | **Terms:** `terms_document.placeholder` marks text that is not lawyer-approved. A published document is never edited (Fynix may change `status` only). **Gate G2 is enforced in code:** on an https deployment `issueInvite` refuses while the party's current terms are placeholder. `pnpm terms:placeholder` seeds PLACEHOLDER text for development. | Decision D2 says approved text replaces the placeholder before any real user is invited. A promise in a document is forgotten; a refusal in the service is not. |
| C13 | **Campaigns:** the requirement columns are added additively with defaults; **no tenant role gets a grant on them until phase 1E**, and the leak matrix probes that they stay denied. The client and the agency of a campaign are fixed at creation. `campaign_status` gains `archived`. | A new column is hidden from tenants until someone grants it, which is the 1A design working as intended. Changing the agency of a campaign later would orphan its leads and the aliases the client has seen (phase 2). Adding an enum value relies on the per-migration commit migrator (a value cannot be used in the transaction that added it). |
| C14 | **Public references** (`ORG-XXXX`, `CMP-XXXX`) come from a random base-32 source and are retried on a unique violation **inside a savepoint**. | A unique violation aborts the Postgres transaction; without the savepoint the retry and the audit row after it would fail. |
| C15 | Archiving an organisation **does not end its members' sessions.** It stops new invites and campaigns for it. Fynix suspends people one by one. | Nothing in the master plan says an archived organisation's users are locked out, and ending sessions of many people at once is a decision with consequences, so it is left as an open question for the owner (see the questions at the end). |
| C16 | `leads_fynix` reads exactly four columns of `user` (id, name, email, created time) and may change only `member.status` and `member.display_name`. It cannot insert members, move a member or change a role. | The admin screens must list people and their addresses, and never a password hash, a token or a session. A suspension is a status change; everything else about a member is set at redemption. |
| C17 | After a successful redemption **the action signs the person in** with the password they just chose, through the normal sign-in (its own rate limits and cookie), and lands on `/welcome`. If that cannot be completed the person goes to `/sign-in?invite=accepted`. | The spec says the invite page ends with sign-in or the landing page. Reusing the sign-in service means one place decides what a session is. |
| C18 | Invite rate limits: **30 lookups per 15 minutes per network** (the page), and **10 redemptions per hour per network and per invite**, consumed before the lookup. | The token is 32 random bytes, so guessing is hopeless; the limits are for load, scanners and repeated password attempts against one link. |

## File structure

New files:

| File | Responsibility |
|---|---|
| `lib/domain/public-ref.ts`, `invite-state.ts`, `campaign-status.ts`, `invite-form-state.ts`, `invite-messages.ts` | Pure rules: reference generation, invite lifetime and state, campaign status transitions, the accept-invite form state and every sentence on that page. |
| `lib/email/escape.ts`, `templates.ts`, `backoff.ts` | HTML escaping, the two message templates and their stored copy, the retry schedule. |
| `lib/terms/placeholder.ts` | The PLACEHOLDER terms and the notice that says so. |
| `server/db/schema/audit-log.ts`, `terms.ts`, `invite.ts`, `agency-alias.ts` | The new tables. `member.ts`, `campaign.ts`, `email-outbox.ts`, `enums.ts` gain columns and values. |
| `server/db/migrations/0011_domain_tables.sql` | Generated DDL for all of the above (one hand edit: the order of one constraint). |
| `server/db/migrations/0012_audit_log_grants.sql` to `0017_email_outbox_domain_grants.sql` | Hand-written row-level security, grants, policies and triggers, one file per group of tables. |
| `server/auth/auth-database.ts` | `AuthDatabase`: a pool or a transaction, for Better Auth on a transaction. |
| `server/domain/audit.ts`, `fynix-write.ts`, `snapshots.ts` | The audit actions, the one Fynix write helper, the public-safe snapshots. |
| `server/domain/deps.ts`, `errors.ts`, `parse.ts`, `inputs.ts`, `refs.ts` | The dependency object, `DomainError`, input parsing and schemas, reference retry. |
| `server/domain/organisations.ts`, `campaigns.ts`, `terms.ts`, `placeholder-terms.ts`, `invites.ts`, `invite-token.ts`, `aliases.ts`, `redeem-invite.ts`, `members.ts` | The services. |
| `server/domain/index.ts`, `actions.ts`, `page-data.ts` | The running app's wiring, the accept-invite server action, the page's read. |
| `server/mail/transport.ts`, `outbox.ts`, `brevo.ts` | The transport interface, the outbox (enqueue, drain, purge, cancel), the Brevo transport. |
| `server/domain/testing.ts`, `test-helpers.ts`, `server/mail/testing.ts` | Test harness: the domain rig, helpers, `FakeTransport`. |
| `scripts/outbox-run.ts`, `scripts/terms-placeholder.ts` | `pnpm outbox:run`, `pnpm terms:placeholder`. |
| `**/*.test.ts`, `**/*.integration.test.ts` | Unit and integration tests beside the code. |

Edited files: `server/env.ts`, `server/env-init.ts`, `.env.example`, `package.json`, `server/auth/create-auth.ts`, `membership.ts`, `create-account.ts`, `mail.ts`, `index.ts`, `testing.ts`, `scripts/mail-last.ts`, `scripts/db-seed.ts`, `server/db/scope.ts`, `lib/auth/rate-limit-rules.ts`, the 1A and 1B test files named in the tasks, `CLAUDE.md`, `README.md`, and in Part B `next.config.ts` and `server/auth/boundaries.test.ts`.

---

# PART A: Server (no UI)

## Task 1: The Brevo key and the https guard

**Files:** modify `server/env.ts`, `server/env-init.ts`, `.env.example`, `server/env-auth.test.ts`, `server/env.test.ts`.

One optional variable joins the runtime environment: `BREVO_API_KEY`, the key that sends the email queued in `email_outbox`. It is optional on http, so development without a key only writes the table, and an https origin without one is a validation error, which is the production start-up guard (`getEnv()` throws and the app does not start). The key is never in `pnpm env:init`'s output as a value: a commented line tells a person where it goes.

- [ ] **Step 1: Confirm a clean start**

```bash
cd "/Users/a12345/Desktop/AI/Fynix Digital/fynix-leads"
git checkout development
git status --short
pnpm test
pnpm test:integration
```

Expected: no output from `git status` (commit this plan first if it is listed). `pnpm test`: 57 files, 666 tests pass. `pnpm test:integration`: 10 files, 282 tests pass. These are the 1B numbers this plan builds on.

- [ ] **Step 2: Write the failing tests**

Two existing tests used an https origin without a key and now need one; the new cases cover the key itself.

**Edit:** `server/env-auth.test.ts`

Replace:

```typescript
}

const problems = (source: Record<string, string>): string[] => describeEnvProblems(source, runtimeEnvSchema);

describe("the sign-in variables", () => {
  it("env:init writes a 64 character secret, a local origin and the breach check on", () => {
```

With:

```typescript
}

const problems = (source: Record<string, string>): string[] => describeEnvProblems(source, runtimeEnvSchema);
/** A well-formed Brevo key for the tests that need an https origin to be valid. Not a real key. */
const BREVO_KEY = "xkeysib-test-0123456789abcdef";

describe("the sign-in variables", () => {
  it("env:init writes a 64 character secret, a local origin and the breach check on", () => {
```

**Edit:** `server/env-auth.test.ts`

Replace:

```typescript
  });

  it.each(["https://leads.fynix.digital/", "https://leads.fynix.digital/app", "leads.fynix.digital", "ftp://leads.fynix.digital"])("refuses the origin %s", (value) => {
    expect(problems({ ...environment(), APP_ORIGIN: value })).toEqual(["APP_ORIGIN: invalid, must be an http:// or https:// origin, with no path and no trailing slash"]);
  });

  it("accepts https and http origins", () => {
    expect(problems({ ...environment(), APP_ORIGIN: "https://leads.fynix.digital" })).toEqual([]);
    expect(problems({ ...environment(), APP_ORIGIN: "http://app.localhost:3020" })).toEqual([]);
  });
```

With:

```typescript
  });

  it.each(["https://leads.fynix.digital/", "https://leads.fynix.digital/app", "leads.fynix.digital", "ftp://leads.fynix.digital"])("refuses the origin %s", (value) => {
    expect(problems({ ...environment(), APP_ORIGIN: value, BREVO_API_KEY: BREVO_KEY })).toEqual(["APP_ORIGIN: invalid, must be an http:// or https:// origin, with no path and no trailing slash"]);
  });

  it("accepts https and http origins", () => {
    expect(problems({ ...environment(), APP_ORIGIN: "https://leads.fynix.digital", BREVO_API_KEY: BREVO_KEY })).toEqual([]);
    expect(problems({ ...environment(), APP_ORIGIN: "http://app.localhost:3020" })).toEqual([]);
  });
```

**Edit:** `server/env-auth.test.ts`

Replace:

```typescript
  it("allows the breach check to be off on http and refuses it on https", () => {
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off" })).toEqual([]);
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off", APP_ORIGIN: "https://leads.fynix.digital" })).toEqual([
      "PASSWORD_BREACH_CHECK: invalid, off is not allowed on an https deployment",
    ]);
  });
});
```

With:

```typescript
  it("allows the breach check to be off on http and refuses it on https", () => {
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off" })).toEqual([]);
    expect(problems({ ...environment(), PASSWORD_BREACH_CHECK: "off", APP_ORIGIN: "https://leads.fynix.digital", BREVO_API_KEY: BREVO_KEY })).toEqual([
      "PASSWORD_BREACH_CHECK: invalid, off is not allowed on an https deployment",
    ]);
  });
});

describe("the email key", () => {
  it("is optional on http: development without a key only writes the outbox", () => {
    expect(problems(environment())).toEqual([]);
    expect(problems({ ...environment(), BREVO_API_KEY: "" })).toEqual([]);
  });

  it("is required on an https deployment, so a production start-up without one is refused", () => {
    expect(problems({ ...environment(), APP_ORIGIN: "https://leads.fynix.digital" })).toEqual([
      "BREVO_API_KEY: missing",
    ]);
    expect(problems({ ...environment(), APP_ORIGIN: "https://leads.fynix.digital", BREVO_API_KEY: "" })).toEqual(["BREVO_API_KEY: missing"]);
  });

  it("names a key that is too short and never prints it", () => {
    const result = problems({ ...environment(), BREVO_API_KEY: "short-key" });
    expect(result).toEqual(["BREVO_API_KEY: invalid, must be at least 20 characters"]);
    expect(result.join("")).not.toContain("short-key");
  });

  it("env:init leaves the key out, as a comment for the person to fill in", () => {
    expect(buildEnvFile(generateSecrets("tester"))).toContain("# BREVO_API_KEY=");
    expect(environment().BREVO_API_KEY).toBeUndefined();
  });
});
```


**Edit:** `server/env.test.ts`

Replace:

```typescript
  it("accepts an https origin in production and http localhost in development and test", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(describeEnvProblems({ ...completeEnvironment(), APP_ORIGIN: "https://leads.example.com" }, runtimeEnvSchema)).toEqual([]);
    for (const mode of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", mode);
      expect(describeEnvProblems({ ...completeEnvironment(), APP_ORIGIN: "http://localhost:3020" }, runtimeEnvSchema), mode).toEqual([]);
```

With:

```typescript
  it("accepts an https origin in production and http localhost in development and test", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(describeEnvProblems({ ...completeEnvironment(), APP_ORIGIN: "https://leads.example.com", BREVO_API_KEY: "xkeysib-test-0123456789abcdef" }, runtimeEnvSchema)).toEqual([]);
    for (const mode of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", mode);
      expect(describeEnvProblems({ ...completeEnvironment(), APP_ORIGIN: "http://localhost:3020" }, runtimeEnvSchema), mode).toEqual([]);
```


Run `pnpm exec vitest run server/env`. Expected: FAIL, 3 of the 26 tests: the https origin with no key reports no problem, the short key is accepted, and `env:init` writes no `BREVO_API_KEY` comment.

- [ ] **Step 3: Add the variable**

**Edit:** `server/env.ts`

Replace:

```typescript
    APP_ORIGIN: origin,
    /** `off` skips the breached-password check, for development without a network. Unset means `hibp`. */
    PASSWORD_BREACH_CHECK: z.preprocess(emptyAsMissing, z.enum(["hibp", "off"]).optional()),
  })
  .refine((env) => !(env.PASSWORD_BREACH_CHECK === "off" && env.APP_ORIGIN.startsWith("https://")), {
    path: ["PASSWORD_BREACH_CHECK"],
    message: "off is not allowed on an https deployment",
  })
  // Better Auth only marks cookies Secure when the origin is https. Read from process.env: Next.js always sets NODE_ENV.
  .refine((env) => !(process.env.NODE_ENV === "production" && env.APP_ORIGIN.startsWith("http://")), {
```

With:

```typescript
    APP_ORIGIN: origin,
    /** `off` skips the breached-password check, for development without a network. Unset means `hibp`. */
    PASSWORD_BREACH_CHECK: z.preprocess(emptyAsMissing, z.enum(["hibp", "off"]).optional()),
    /**
     * The Brevo API key that sends the email queued in `email_outbox`. Optional on http: without it development only
     * writes the outbox. An https deployment refuses to start without one (the refinement below).
     */
    BREVO_API_KEY: z.preprocess(emptyAsMissing, z.string().min(20, "must be at least 20 characters").optional()),
  })
  .refine((env) => !(env.PASSWORD_BREACH_CHECK === "off" && env.APP_ORIGIN.startsWith("https://")), {
    path: ["PASSWORD_BREACH_CHECK"],
    message: "off is not allowed on an https deployment",
  })
  .refine((env) => !(env.APP_ORIGIN.startsWith("https://") && env.BREVO_API_KEY === undefined), {
    path: ["BREVO_API_KEY"],
    message: "is required on an https deployment, so invites and reset links are really sent",
  })
  // Better Auth only marks cookies Secure when the origin is https. Read from process.env: Next.js always sets NODE_ENV.
  .refine((env) => !(process.env.NODE_ENV === "production" && env.APP_ORIGIN.startsWith("http://")), {
```

**Edit:** `server/env.ts`

Replace:

```typescript
/** The variable names roles.ts derives, for the same check. */
export function derivedVariables(): { readonly runtime: string[]; readonly tooling: string[] } {
  const runtime = [...RUNTIME_ROLES.map((role) => urlVariable(role, "dev")), "BETTER_AUTH_SECRET", "APP_ORIGIN", "PASSWORD_BREACH_CHECK"];
  const tooling = [
    "DATABASE_URL_ADMIN",
    urlVariable("leads_owner", "dev"),
```

With:

```typescript
/** The variable names roles.ts derives, for the same check. */
export function derivedVariables(): { readonly runtime: string[]; readonly tooling: string[] } {
  const runtime = [...RUNTIME_ROLES.map((role) => urlVariable(role, "dev")), "BETTER_AUTH_SECRET", "APP_ORIGIN", "PASSWORD_BREACH_CHECK", "BREVO_API_KEY"];
  const tooling = [
    "DATABASE_URL_ADMIN",
    urlVariable("leads_owner", "dev"),
```


**Edit:** `server/env-init.ts`

Replace:

```typescript
    "APP_ORIGIN=http://localhost:3020",
    "# `hibp` checks new passwords against known breaches. `off` skips the check (development without a network only).",
    "PASSWORD_BREACH_CHECK=hibp",
    "",
    "# Integration tests: the same roles on the test database.",
    ...ROLE_NAMES.map((role) => `${urlVariable(role, "test")}=${roleUrl(role, secrets.passwords[role], "test")}`),
```

With:

```typescript
    "APP_ORIGIN=http://localhost:3020",
    "# `hibp` checks new passwords against known breaches. `off` skips the check (development without a network only).",
    "PASSWORD_BREACH_CHECK=hibp",
    "# Optional in development: without a Brevo key email is only written to the outbox table (`pnpm mail:last` prints it).",
    "# BREVO_API_KEY=",
    "",
    "# Integration tests: the same roles on the test database.",
    ...ROLE_NAMES.map((role) => `${urlVariable(role, "test")}=${roleUrl(role, secrets.passwords[role], "test")}`),
```


**Edit:** `.env.example`

Replace:

```
APP_ORIGIN=
PASSWORD_BREACH_CHECK=

# Integration tests: the same roles on the test database, whose name must end in _test.
DATABASE_URL_OWNER_TEST=
DATABASE_URL_AUTH_TEST=
```

With:

```
APP_ORIGIN=
PASSWORD_BREACH_CHECK=

# The Brevo API key that sends invite and reset email (`pnpm outbox:run`, and the app after a message is queued). Optional
# on http: without it development only writes the email_outbox table. Required on an https origin. Sender: hello@fynix.digital.
BREVO_API_KEY=

# Integration tests: the same roles on the test database, whose name must end in _test.
DATABASE_URL_OWNER_TEST=
DATABASE_URL_AUTH_TEST=
```


- [ ] **Step 4: Run the tests and the checks**

```bash
pnpm exec vitest run server/env
pnpm env:check
pnpm lint && pnpm typecheck
```

Expected: `server/env` tests pass (3 files, 26 tests); `Environment OK.` (the key is optional); lint and typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add server/env.ts server/env-init.ts .env.example server/env-auth.test.ts server/env.test.ts
git commit -m "Add the optional Brevo key and refuse an https start without it"
```

## Task 2: Pure rules and copy in `lib`

**Files:** create `lib/domain/public-ref.ts`, `invite-state.ts`, `campaign-status.ts`, `lib/email/escape.ts`, `templates.ts`, `backoff.ts`, `lib/terms/placeholder.ts` and a test beside each.

Plain functions with no imports from `server/`, so a form can use them and a unit test needs no database. `lib/` may not import `server/` or a database driver (`server/db/boundaries.test.ts` enforces it).

- References are Crockford base-32 (digits and capitals without I, L, O and U), four characters, picked with `byte & 31` so no character is more likely than another; the test proves the alphabet equals the one the database check constraints accept.
- `inviteState` orders its answers (`redeemed`, then `revoked`, then `expired`) so what a person is told never depends on which happened first.
- The campaign status map is where "archive instead of delete" and "restore only to draft" are written down.
- Templates take the content and the link separately. `renderEmail(content, null)` is the copy the outbox keeps: it still says how long the link worked and says the link is not kept. Every interpolated value goes through `escapeHtml`; the link goes through `safeHref`, which refuses anything but http and https.
- The retry schedule is data, in one place.
- The placeholder terms say PLACEHOLDER in the title and the first line, and the notice says who replaces them and when (decision D2, gate G2).

- [ ] **Step 1: Write the tests**

**File:** `lib/domain/public-ref.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { REF_ALPHABET, generatePublicRef, isPublicRef } from "./public-ref";

describe("generatePublicRef", () => {
  it("is the prefix, a dash and four characters of the alphabet", () => {
    const ref = generatePublicRef("CMP", () => Uint8Array.from([0, 1, 2, 255]));
    expect(ref).toBe("CMP-012Z");
    expect(isPublicRef(ref, "CMP")).toBe(true);
  });

  it("uses all 32 characters and none of I, L, O or U", () => {
    expect(REF_ALPHABET).toHaveLength(32);
    expect(new Set(REF_ALPHABET).size).toBe(32);
    for (const letter of "ILOU") expect(REF_ALPHABET).not.toContain(letter);
    const seen = new Set<string>();
    for (let byte = 0; byte < 256; byte += 4) {
      generatePublicRef("ORG", () => Uint8Array.from([byte, byte + 1, byte + 2, byte + 3])).slice(4).split("").forEach((character) => seen.add(character));
    }
    expect([...seen].sort().join("")).toBe([...REF_ALPHABET].sort().join(""));
  });

  it("rejects a random source that returns too few bytes", () => {
    expect(() => generatePublicRef("ORG", () => Uint8Array.from([1, 2]))).toThrow(RangeError);
  });

  it("is accepted by the same pattern the database check constraints use", () => {
    const campaignPattern = /^CMP-[0-9A-HJKMNP-TV-Z]{4}$/;
    const organisationPattern = /^ORG-[0-9A-HJKMNP-TV-Z]{4}$/;
    for (let byte = 0; byte < 256; byte += 1) {
      const bytes = () => Uint8Array.from([byte, byte >> 1, 255 - byte, byte ^ 0x5a]);
      expect(generatePublicRef("CMP", bytes)).toMatch(campaignPattern);
      expect(generatePublicRef("ORG", bytes)).toMatch(organisationPattern);
    }
  });
});

describe("isPublicRef", () => {
  it.each(["CMP-7Q2X", "CMP-0000", "CMP-ZZZZ"])("accepts %s", (value) => expect(isPublicRef(value, "CMP")).toBe(true));
  it.each(["CMP-7Q2", "CMP-7Q2XY", "cmp-7q2x", "CMP-7QIX", "CMP-7QLX", "CMP-7QOX", "CMP-7QUX", "ORG-7Q2X", "CMP7Q2X"])("refuses %s", (value) => expect(isPublicRef(value, "CMP")).toBe(false));
});
```


**File:** `lib/domain/invite-state.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { INVITE_LIFETIME_DAYS, inviteExpiry, inviteState } from "./invite-state";

const NOW = new Date("2026-12-01T10:00:00.000Z");
const FUTURE = new Date("2026-12-02T10:00:00.000Z");
const PAST = new Date("2026-11-30T10:00:00.000Z");

describe("inviteExpiry", () => {
  it("is seven days after the invite was issued", () => {
    expect(INVITE_LIFETIME_DAYS).toBe(7);
    expect(inviteExpiry(NOW).toISOString()).toBe("2026-12-08T10:00:00.000Z");
  });
});

describe("inviteState", () => {
  it("is pending before the expiry", () => {
    expect(inviteState({ expiresAt: FUTURE, redeemedAt: null, revokedAt: null }, NOW)).toBe("pending");
  });

  it("is expired at the expiry instant and after it", () => {
    expect(inviteState({ expiresAt: NOW, redeemedAt: null, revokedAt: null }, NOW)).toBe("expired");
    expect(inviteState({ expiresAt: PAST, redeemedAt: null, revokedAt: null }, NOW)).toBe("expired");
  });

  it("is revoked, even when it has also run out", () => {
    expect(inviteState({ expiresAt: PAST, redeemedAt: null, revokedAt: PAST }, NOW)).toBe("revoked");
  });

  it("is redeemed once used, whatever happened after", () => {
    expect(inviteState({ expiresAt: PAST, redeemedAt: PAST, revokedAt: null }, NOW)).toBe("redeemed");
    expect(inviteState({ expiresAt: FUTURE, redeemedAt: PAST, revokedAt: PAST }, NOW)).toBe("redeemed");
  });
});
```


**File:** `lib/domain/campaign-status.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { CAMPAIGN_STATUSES, campaignAuditAction, canMoveCampaign } from "./campaign-status";

describe("canMoveCampaign", () => {
  it.each([
    ["draft", "active"],
    ["active", "paused"],
    ["paused", "active"],
    ["active", "completed"],
    ["completed", "archived"],
    ["archived", "draft"],
  ] as const)("allows %s to %s", (from, to) => expect(canMoveCampaign(from, to)).toBe(true));

  it.each([
    ["draft", "completed"],
    ["draft", "paused"],
    ["completed", "active"],
    ["archived", "active"],
    ["archived", "completed"],
    ["active", "draft"],
    ["active", "active"],
  ] as const)("refuses %s to %s", (from, to) => expect(canMoveCampaign(from, to)).toBe(false));

  it("lets every status but archived be archived", () => {
    for (const from of CAMPAIGN_STATUSES.filter((status) => status !== "archived")) expect(canMoveCampaign(from, "archived"), from).toBe(true);
  });
});

describe("campaignAuditAction", () => {
  it("names the archive and the restore, and calls every other change an update", () => {
    expect(campaignAuditAction("active", "archived")).toBe("campaign.archive");
    expect(campaignAuditAction("archived", "draft")).toBe("campaign.restore");
    expect(campaignAuditAction("draft", "active")).toBe("campaign.update");
  });
});
```


**File:** `lib/email/escape.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { escapeHtml, safeHref } from "./escape";

describe("escapeHtml", () => {
  it("escapes the five characters that can open a tag or close an attribute", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Priya Nair, Kestrel")).toBe("Priya Nair, Kestrel");
  });
});

describe("safeHref", () => {
  it("returns an escaped web address", () => {
    expect(safeHref("https://leads.fynix.digital/accept-invite?token=a&b=c")).toBe("https://leads.fynix.digital/accept-invite?token=a&amp;b=c");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "not a url", "//evil.example"])("refuses %s", (value) => {
    expect(() => safeHref(value)).toThrow();
  });
});
```


**File:** `lib/email/backoff.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { CLAIM_LEASE_SECONDS, LINK_RETENTION_SECONDS, MAX_SEND_ATTEMPTS, retryDelaySeconds } from "./backoff";

describe("retryDelaySeconds", () => {
  it("waits longer after each failure", () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([60, 300, 1800, 7200]);
  });

  it("gives up after the last attempt", () => {
    expect(MAX_SEND_ATTEMPTS).toBe(5);
    expect(retryDelaySeconds(5)).toBeNull();
    expect(retryDelaySeconds(6)).toBeNull();
  });

  it("refuses a count that is not a whole number from 1", () => {
    expect(() => retryDelaySeconds(0)).toThrow(RangeError);
    expect(() => retryDelaySeconds(1.5)).toThrow(RangeError);
  });

  it("keeps a lease longer than the longest provider timeout and a link for exactly a day", () => {
    expect(CLAIM_LEASE_SECONDS).toBeGreaterThanOrEqual(600);
    expect(LINK_RETENTION_SECONDS).toBe(86_400);
  });
});
```


**File:** `lib/email/templates.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATES, LINK_REMOVED_TEXT, formatEmailDate, parseEmailContent, renderEmail, type EmailContent } from "./templates";

const LINK = "https://leads.fynix.digital/accept-invite?token=abc_DEF-123";
const INVITE: EmailContent = { template: "invite", params: { name: "Priya Nair", organisationName: "Kestrel Logistics Ltd", expiresOn: "8 December 2026" } };
const RESET: EmailContent = { template: "password_reset", params: { expiresInMinutes: 60 } };
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("renderEmail", () => {
  it("renders the invite with the person's name, their organisation, the last day and the link", () => {
    const mail = renderEmail(INVITE, LINK);
    expect(mail.subject).toBe("You are invited to Fynix Leads");
    expect(mail.text).toContain("Hello Priya Nair,");
    expect(mail.text).toContain("join Kestrel Logistics Ltd on Fynix Leads");
    expect(mail.text).toContain("by 8 December 2026");
    expect(mail.text).toContain(LINK);
    expect(mail.html).toContain(`href="${LINK}"`);
  });

  it("renders the reset message the way phase 1B worded it", () => {
    const mail = renderEmail(RESET, "https://x.example/reset-password?token=t");
    expect(mail.subject).toBe("Reset your Fynix Leads password");
    expect(mail.text).toContain("within 60 minutes");
    expect(mail.text).toContain("https://x.example/reset-password?token=t");
    expect(mail.text).toContain("If you did not ask for this, ignore this email.");
  });

  it("keeps the link out of the stored copy: with no link neither the text nor the HTML has one, and the copy still says how long it worked", () => {
    expect(renderEmail(RESET, null).text).toContain("within 60 minutes");
    expect(renderEmail(INVITE, null).text).toContain("by 8 December 2026");
    for (const content of [INVITE, RESET]) {
      const mail = renderEmail(content, null);
      expect(mail.text).toContain(LINK_REMOVED_TEXT);
      expect(mail.html).toContain(LINK_REMOVED_TEXT);
      expect(mail.text).not.toMatch(/https?:\/\//);
      expect(mail.html).not.toMatch(/https?:\/\//);
      expect(mail.html).not.toContain("href=");
    }
  });

  it("escapes every value it interpolates, in the HTML", () => {
    const hostile: EmailContent = { template: "invite", params: { name: `<img src=x onerror=alert(1)>`, organisationName: `A & B "Ltd"`, expiresOn: "<b>soon</b>" } };
    const { html, text } = renderEmail(hostile, LINK);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>soon");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("A &amp; B &quot;Ltd&quot;");
    // Plain text is not HTML, so it carries the characters as typed.
    expect(text).toContain("<img src=x onerror=alert(1)>");
  });

  it("refuses a link that is not a web address, rather than putting it in an href", () => {
    expect(() => renderEmail(INVITE, "javascript:alert(1)")).toThrow();
  });

  it("uses sentence case, no exclamation marks and no em or en dashes in any template", () => {
    for (const content of [INVITE, RESET]) {
      for (const link of [LINK, null]) {
        const mail = renderEmail(content, link);
        const all = `${mail.subject}\n${mail.text}\n${mail.html}`;
        expect(DASHES.test(all)).toBe(false);
        expect(all.replace("<!doctype html>", "")).not.toContain("!");
      }
    }
  });
});

describe("parseEmailContent", () => {
  it("reads stored params back into typed content", () => {
    expect(parseEmailContent("invite", { name: "A", organisationName: "B", expiresOn: "C" })).toEqual({ template: "invite", params: { name: "A", organisationName: "B", expiresOn: "C" } });
    expect(parseEmailContent("password_reset", { expiresInMinutes: 60 })).toEqual(RESET);
  });

  it.each([
    ["invite", { name: "A" }],
    ["invite", null],
    ["invite", []],
    ["password_reset", { expiresInMinutes: "60" }],
    ["password_reset", { expiresInMinutes: 0 }],
    ["unknown", {}],
  ])("refuses %s with %j", (template, params) => {
    expect(() => parseEmailContent(template, params)).toThrow();
  });

  it("covers every template in EMAIL_TEMPLATES", () => {
    expect([...EMAIL_TEMPLATES].sort()).toEqual(["invite", "password_reset"]);
  });
});

describe("formatEmailDate", () => {
  it("writes the day in UTC, in words", () => {
    expect(formatEmailDate(new Date("2026-12-08T23:30:00.000Z"))).toBe("8 December 2026");
  });
});
```


**File:** `lib/terms/placeholder.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_NOTICE, PLACEHOLDER_TERMS } from "./placeholder";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("the placeholder terms", () => {
  it.each(["client", "agency", "fynix"] as const)("%s: say in the title and the first line that they are placeholder text", (party) => {
    const { title, body } = PLACEHOLDER_TERMS[party];
    expect(title).toContain("PLACEHOLDER");
    expect(body.split("\n")[0]).toContain("PLACEHOLDER");
  });

  it("carry the non-circumvention and non-solicitation clauses the spec asks for, for the two outside parties", () => {
    for (const party of ["client", "agency"] as const) {
      expect(PLACEHOLDER_TERMS[party].body).toContain("Non-circumvention");
      expect(PLACEHOLDER_TERMS[party].body).toContain("Non-solicitation");
    }
  });

  it("tell the agency to join meetings under its alias", () => {
    expect(PLACEHOLDER_TERMS.agency.body).toContain("Fynix alias");
  });

  it("use no em or en dashes and no exclamation marks, and the notice says who replaces them and when", () => {
    for (const { title, body } of Object.values(PLACEHOLDER_TERMS)) {
      expect(DASHES.test(title + body)).toBe(false);
      expect(title + body).not.toContain("!");
    }
    expect(PLACEHOLDER_NOTICE).toContain("lawyer-approved");
    expect(PLACEHOLDER_NOTICE).toContain("before real users are invited");
  });
});
```


Run `pnpm exec vitest run lib/domain lib/email lib/terms`. Expected: FAIL, 7 files cannot load (`Cannot find module './backoff' imported from .../lib/email/backoff.test.ts` and the same for the other six).

- [ ] **Step 2: Write the code**

**File:** `lib/domain/public-ref.ts`

```typescript
/**
 * Public references: a prefix and four characters from Crockford's base-32 alphabet (digits and capitals without I, L, O
 * and U), for example `CMP-7Q2X`. They are the only names of organisations and campaigns that reach a screen, so they
 * must not be guessable in order and must not spell words by accident. The database check constraints
 * (`organisation_public_ref_format`, `campaign_public_ref_format`) accept exactly this alphabet.
 */
export const REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REF_LENGTH = 4;

export type RefPrefix = "ORG" | "CMP";

/** Fills `count` bytes from a source of randomness. `crypto.getRandomValues` fits, and so does a fixed list in a test. */
export type RandomBytes = (count: number) => Uint8Array;

/**
 * One new reference. The alphabet has 32 characters and a byte has 256 values, so `byte & 31` picks each character with
 * the same probability: no modulo bias and no rejection loop.
 */
export function generatePublicRef(prefix: RefPrefix, randomBytes: RandomBytes): string {
  const bytes = randomBytes(REF_LENGTH);
  if (bytes.length < REF_LENGTH) throw new RangeError(`The random source returned ${bytes.length} bytes, ${REF_LENGTH} are needed`);
  let suffix = "";
  for (let index = 0; index < REF_LENGTH; index += 1) suffix += REF_ALPHABET.charAt((bytes[index] ?? 0) & 31);
  return `${prefix}-${suffix}`;
}

/** True for a reference in the shape the database accepts. */
export function isPublicRef(value: string, prefix: RefPrefix): boolean {
  return new RegExp(`^${prefix}-[${REF_ALPHABET}]{${REF_LENGTH}}$`).test(value);
}
```


**File:** `lib/domain/invite-state.ts`

```typescript
/** An invite lasts seven days from the moment it is issued (spec section 12). */
export const INVITE_LIFETIME_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function inviteExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + INVITE_LIFETIME_DAYS * DAY_MS);
}

/** The columns of an invite that decide whether it can still be used. */
export interface InviteTimes {
  readonly expiresAt: Date;
  readonly redeemedAt: Date | null;
  readonly revokedAt: Date | null;
}

/**
 * What a person holding the link is told. Checked in this order, so an invite that was used and later revoked reads as
 * used, and one that was revoked and has also run out reads as revoked.
 */
export type InviteState = "redeemed" | "revoked" | "expired" | "pending";

export function inviteState(invite: InviteTimes, now: Date): InviteState {
  if (invite.redeemedAt !== null) return "redeemed";
  if (invite.revokedAt !== null) return "revoked";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}
```


**File:** `lib/domain/campaign-status.ts`

```typescript
/** The statuses of a campaign, in the order the database enum lists them. `archived` is how a campaign is removed (nothing is deleted). */
export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * Which status a campaign may move to from each status. A campaign starts as a draft, runs, may pause and resume, and
 * ends as completed. Any of them can be archived, and an archived campaign can only be restored to draft, so it never
 * jumps straight back to running.
 */
const TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ["active", "archived"],
  active: ["paused", "completed", "archived"],
  paused: ["active", "completed", "archived"],
  completed: ["archived"],
  archived: ["draft"],
};

export function canMoveCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** What the audit log calls a status change: moving into `archived` and out of it have their own names. */
export function campaignAuditAction(from: CampaignStatus, to: CampaignStatus): "campaign.update" | "campaign.archive" | "campaign.restore" {
  if (to === "archived") return "campaign.archive";
  if (from === "archived") return "campaign.restore";
  return "campaign.update";
}
```


**File:** `lib/email/escape.ts`

```typescript
const HTML_ENTITIES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for an HTML body or an attribute value. Every value a template interpolates goes through this. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

/** A link for an `href`: escaped, and only ever http or https, so a value that is not a web address cannot become a script link. */
export function safeHref(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("An email link must be a full web address.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("An email link must start with http or https.");
  return escapeHtml(parsed.toString());
}
```


**File:** `lib/email/backoff.ts`

```typescript
/**
 * How the outbox retries (server/mail/outbox.ts). A message is tried at most five times. After a failed attempt it waits
 * before the next one, so an outage at the provider is not hammered. A message that is still failing after the last
 * attempt is marked `failed` and left for a person to look at.
 */
export const MAX_SEND_ATTEMPTS = 5;

/** Seconds to wait after the 1st, 2nd, 3rd and 4th failed attempt. */
const RETRY_DELAYS_SECONDS = [60, 5 * 60, 30 * 60, 2 * 60 * 60] as const;

/**
 * A claimed message is not offered to another runner for this long. If the runner dies mid-send the message comes back
 * after the lease, so a crash delays a message and never loses it.
 */
export const CLAIM_LEASE_SECONDS = 10 * 60;

/** A message that carries a link keeps it for a day at most, sent or not (master plan section 3, Email). */
export const LINK_RETENTION_SECONDS = 24 * 60 * 60;

/** Seconds until the next attempt after `attemptsMade` attempts have failed, or `null` when there are no attempts left. */
export function retryDelaySeconds(attemptsMade: number): number | null {
  if (!Number.isInteger(attemptsMade) || attemptsMade < 1) throw new RangeError(`attemptsMade must be a whole number from 1, received ${attemptsMade}`);
  if (attemptsMade >= MAX_SEND_ATTEMPTS) return null;
  return RETRY_DELAYS_SECONDS[attemptsMade - 1] ?? null;
}
```


**File:** `lib/email/templates.ts`

```typescript
import { escapeHtml, safeHref } from "./escape";

/**
 * The messages the app sends. A template is a pure function from content to text and HTML: it escapes every value it
 * interpolates and never reads the network or the database. Plain templates, not React Email: two messages do not
 * justify a rendering dependency; phase 4 revisits that when the notification emails arrive.
 *
 * The link is passed separately from the content. The outbox stores the content (without the link) and the link in its
 * own column that is cleared once the message is sent, so `renderEmail(content, null)` is the copy that stays in the
 * table: it says the link is not kept.
 */
export const EMAIL_TEMPLATES = ["password_reset", "invite"] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export interface PasswordResetParams {
  readonly expiresInMinutes: number;
}
export interface InviteParams {
  /** The invited person's name, as Fynix typed it. */
  readonly name: string;
  /** The organisation they are joining: their own, never the other party's. */
  readonly organisationName: string;
  /** The last day the link works, already formatted: "8 December 2026". */
  readonly expiresOn: string;
}

export type EmailContent =
  | { readonly template: "password_reset"; readonly params: PasswordResetParams }
  | { readonly template: "invite"; readonly params: InviteParams };

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** What the stored copy says in place of the link. */
export const LINK_REMOVED_TEXT = "The link is removed from this copy once the message has been sent.";

interface Layout {
  readonly subject: string;
  readonly paragraphs: readonly string[];
  /** The text that introduces the link, and the label of the button. */
  readonly linkIntro: string;
  readonly linkLabel: string;
  readonly closing: string;
}

function layoutFor(content: EmailContent): Layout {
  if (content.template === "password_reset") {
    return {
      subject: "Reset your Fynix Leads password",
      paragraphs: ["Someone asked to reset the password for this email address on Fynix Leads."],
      linkIntro: `To choose a new password, open this link within ${content.params.expiresInMinutes} minutes:`,
      linkLabel: "Choose a new password",
      closing: "If you did not ask for this, ignore this email. Your password stays the same.",
    };
  }
  return {
    subject: "You are invited to Fynix Leads",
    paragraphs: [`Hello ${content.params.name},`, `Fynix has invited you to join ${content.params.organisationName} on Fynix Leads.`],
    linkIntro: `To set your password and get started, open this link by ${content.params.expiresOn}:`,
    linkLabel: "Set your password",
    closing: "If you were not expecting this invitation, ignore this email. Nothing happens until the link is used.",
  };
}

const HTML_FONT = "font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0c1e2e;";

function renderHtml(layout: Layout, link: string | null): string {
  const paragraph = (text: string): string => `<p style="margin:0 0 16px 0;">${escapeHtml(text)}</p>`;
  const action =
    link === null
      ? `${paragraph(layout.linkIntro)}${paragraph(LINK_REMOVED_TEXT)}`
      : `${paragraph(layout.linkIntro)}<p style="margin:0 0 16px 0;"><a href="${safeHref(link)}" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#0c1e2e;color:#ffffff;text-decoration:none;">${escapeHtml(layout.linkLabel)}</a></p><p style="margin:0 0 16px 0;word-break:break-all;">${escapeHtml(link)}</p>`;
  return `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f4f1ee;${HTML_FONT}"><div style="max-width:520px;margin:0 auto;padding:28px;border-radius:22px;background:#ffffff;">${layout.paragraphs.map(paragraph).join("")}${action}${paragraph(layout.closing)}<p style="margin:0;color:#5b6b78;">Fynix Digital</p></div></body></html>`;
}

/** The subject, plain text and HTML of a message. With `link` null the text and HTML say the link is not kept. */
export function renderEmail(content: EmailContent, link: string | null): RenderedEmail {
  const layout = layoutFor(content);
  const text = [...layout.paragraphs, "", layout.linkIntro, link ?? LINK_REMOVED_TEXT, "", layout.closing].join("\n");
  return { subject: layout.subject, text, html: renderHtml(layout, link) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the `template` and `params` columns back into typed content, or throws. Anything else in the table is not trusted to be well formed. */
export function parseEmailContent(template: string, params: unknown): EmailContent {
  if (!isRecord(params)) throw new Error("An email's params must be an object.");
  if (template === "password_reset") {
    const minutes = params.expiresInMinutes;
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1) throw new Error("password_reset needs a whole number of minutes.");
    return { template, params: { expiresInMinutes: minutes } };
  }
  if (template === "invite") {
    const { name, organisationName, expiresOn } = params;
    if (typeof name !== "string" || typeof organisationName !== "string" || typeof expiresOn !== "string") {
      throw new Error("invite needs a name, an organisation name and an expiry date.");
    }
    return { template, params: { name, organisationName, expiresOn } };
  }
  throw new Error(`There is no email template named ${template}.`);
}

/** "8 December 2026", in UTC, for the invite's last day. */
export function formatEmailDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
```


**File:** `lib/terms/placeholder.ts`

```typescript
import type { OrganisationKind } from "@/lib/auth/session-lifetime";

/**
 * PLACEHOLDER terms of use, one per party (decision D2). They exist so the invite and sign-in flow can be built and
 * tested end to end. They are not legal text and nobody has agreed to anything by reading them. Gate G2: lawyer-approved
 * text replaces these, through the terms screen, before any real user is invited. The database marks each row
 * `placeholder = true`, the invite service refuses to invite anyone on an https deployment while a party's current terms
 * are still marked, and the screens show PLACEHOLDER_NOTICE above the text.
 */
export const PLACEHOLDER_NOTICE = "Placeholder text. These terms are a stand-in and are replaced with lawyer-approved terms before real users are invited.";

export interface TermsText {
  readonly title: string;
  readonly body: string;
}

const COMMON = [
  "PLACEHOLDER. This is not the agreed contract.",
  "",
  "1. You use Fynix Leads only for the work Fynix has asked you to do on it.",
  "2. You keep your sign-in private and tell Fynix at once if you think someone else has used it.",
  "3. Fynix records that you accepted these terms, the version, the time and the network address you accepted from.",
];

export const PLACEHOLDER_TERMS: Readonly<Record<OrganisationKind, TermsText>> = {
  client: {
    title: "Terms of use for clients (PLACEHOLDER)",
    body: [
      ...COMMON,
      "4. Non-circumvention: you do not contact or work with the people who deliver your leads outside Fynix.",
      "5. Non-solicitation: you do not hire the people who deliver your leads while this agreement lasts and for a period set in the agreed text.",
      "6. Decisions you record on a lead are final unless Fynix corrects them with a note.",
    ].join("\n"),
  },
  agency: {
    title: "Terms of use for agencies (PLACEHOLDER)",
    body: [
      ...COMMON,
      "4. Non-circumvention: you do not contact or work with the client outside Fynix.",
      "5. Non-solicitation: you do not hire the client's people while this agreement lasts and for a period set in the agreed text.",
      "6. You join meetings as a guest under your Fynix alias and you do not sign in to a personal Google account to do so.",
    ].join("\n"),
  },
  fynix: {
    title: "Terms of use for Fynix staff (PLACEHOLDER)",
    body: [
      ...COMMON,
      "4. You see both parties' identities. You do not share one party's identity with the other.",
      "5. Every change you make is recorded in the audit log under your name.",
    ].join("\n"),
  },
};
```


- [ ] **Step 3: Run the tests and the checks**

```bash
pnpm exec vitest run lib/domain lib/email lib/terms
pnpm lint && pnpm typecheck
```

Expected: 64 files, 745 tests; lint and typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add lib/domain lib/email lib/terms
git commit -m "Add the pure rules for references, invites, campaign status, email templates and placeholder terms"
```

## Task 3: Schema, generated DDL, grants, policies and the access matrix

**Files:** create `server/db/schema/audit-log.ts`, `terms.ts`, `invite.ts`, `agency-alias.ts`, `server/db/migrations/0011_domain_tables.sql` to `0017_email_outbox_domain_grants.sql`; modify `server/db/schema/enums.ts`, `index.ts`, `member.ts`, `campaign.ts`, `email-outbox.ts`, `server/db/structure.integration.test.ts`, `server/db/rls.integration.test.ts`.

This is the task where the database changes, so it is written as the 1A and 1B ones were: the access matrix first, red, then the schema, then the DDL drizzle-kit writes (with one hand edit), then the grants. Nothing is dropped or renamed: every column added to an existing table has a default or allows null, because a deploy migrates before it builds.

What the migrations give each role (read with the decisions C2 to C7 and C16):

| Table | `leads_fynix` | `leads_auth` | `leads_public` | tenants |
|---|---|---|---|---|
| `audit_log` | SELECT, INSERT | none | none | none |
| `terms_document` | SELECT, INSERT, UPDATE `status` | SELECT | none | none (1E) |
| `terms_acceptance` | SELECT | INSERT, for the current terms of the user's own party | none | none (1E) |
| `invite` | INSERT; SELECT all but `token_hash`; UPDATE `revoked_at` | SELECT and UPDATE `redeemed_at`, only the row whose hash the transaction names | none | none |
| `agency_alias` | SELECT, INSERT, UPDATE `alias` | INSERT, for the redeemed invite's person and alias | none | none (1E and phase 2) |
| `member` | SELECT; UPDATE `status`, `display_name` | INSERT, for a redeemed invite (adds `id` to the five columns it reads) | none | none (1E) |
| `user` | SELECT `id`, `name`, `email`, `created_at` | unchanged | none | none |
| `email_outbox` | INSERT; SELECT all but `link`; UPDATE `status`, `last_error`, `link` | SELECT; UPDATE the state columns and `link` | INSERT (unchanged) | none |
| `campaign` (new requirement columns) | unchanged (table-level) | none | none | **none until 1E** |

- [ ] **Step 1: Write the failing access matrix**

Edit the matrix in `server/db/structure.integration.test.ts` to say what the migrations will do. `user` stops being an auth-only table (Fynix reads four columns), the member test says what each role may write, and five tables join the list.

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
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
```

With:

```typescript
const EXPECTED_ACCESS: Readonly<Record<string, readonly RuntimeRoleName[]>> = {
  organisation: ["leads_fynix", "leads_client", "leads_agency"],
  campaign: ["leads_fynix", "leads_client", "leads_agency"],
  // Phase 1C: Fynix reads four columns of `user`, so people can be listed and invited. Never the rest.
  user: ["leads_auth", "leads_fynix"],
  session: ["leads_auth"],
  account: ["leads_auth"],
  verification: ["leads_auth"],
  member: ["leads_auth", "leads_fynix"],
  rate_limit: ["leads_public"],
  email_outbox: ["leads_auth", "leads_fynix", "leads_public"],
  audit_log: ["leads_fynix"],
  terms_document: ["leads_auth", "leads_fynix"],
  terms_acceptance: ["leads_auth", "leads_fynix"],
  invite: ["leads_auth", "leads_fynix"],
  agency_alias: ["leads_auth", "leads_fynix"],
};
/** The tables nobody but leads_auth touches. `user` is not one of them any more: Fynix reads four columns of it. */
const AUTH_TABLES = ["session", "account", "verification"] as const;

describe("access matrix", () => {
  it("lists every table, and no table that does not exist", async () => {
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
    expect(await rolesWithAnyPrivilege(dbs.owner.db, table)).toEqual(["leads_auth"]);
  });

  it("only leads_auth reads member, and it cannot write it", async () => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, "member")).toEqual(["leads_auth"]);
    for (const privilege of ["INSERT", "UPDATE"]) {
      const allowed = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_any_column_privilege('leads_auth', 'public.member', '${privilege}') as allowed`));
      expect(allowed.rows, privilege).toEqual([{ allowed: false }]);
    }
  });
```

With:

```typescript
    expect(await rolesWithAnyPrivilege(dbs.owner.db, table)).toEqual(["leads_auth"]);
  });

  it("member: leads_auth may add a row (an invite was redeemed) and never change one, and Fynix may change only status and display_name", async () => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, "member")).toEqual(["leads_auth", "leads_fynix"]);
    const column = async (role: string, privilege: string, name: string): Promise<boolean> =>
      (await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_column_privilege('${role}', 'public.member', '${name}', '${privilege}') as allowed`))).rows[0]?.allowed ?? false;
    expect(await column("leads_auth", "UPDATE", "org_id")).toBe(false);
    expect(await column("leads_auth", "UPDATE", "status")).toBe(false);
    expect(await column("leads_auth", "INSERT", "org_id")).toBe(true);
    expect(await grantedColumns(dbs.owner.db, "leads_fynix", "member")).toEqual(["id", "user_id", "org_id", "org_kind", "role", "display_name", "status", "created_at"]);
    for (const name of ["status", "display_name"]) expect(await column("leads_fynix", "UPDATE", name), name).toBe(true);
    for (const name of ["user_id", "org_id", "org_kind", "role"]) expect(await column("leads_fynix", "UPDATE", name), name).toBe(false);
    expect(await column("leads_fynix", "INSERT", "org_id")).toBe(false);
  });

  it("user: leads_fynix reads id, name, email and created_at, and writes nothing", async () => {
    expect(await grantedColumns(dbs.owner.db, "leads_fynix", "user")).toEqual(["id", "name", "email", "created_at"]);
    const writes = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_any_column_privilege('leads_fynix', 'public."user"', 'INSERT') or has_any_column_privilege('leads_fynix', 'public."user"', 'UPDATE') or has_table_privilege('leads_fynix', 'public."user"', 'DELETE') as allowed`));
    expect(writes.rows).toEqual([{ allowed: false }]);
    for (const statement of ['select * from "user"', 'select email_verified from "user"', 'select image from "user"']) {
      expect(await captureErrorText(queryAs(dbs.roles.leads_fynix.db, { orgId: null, userId: USER }, statement)), statement).toContain('permission denied for table user');
    }
  });
```


Run `pnpm test:integration`. Expected: FAIL, 15 of the 114 tests in that file: `lists every table, and no table that does not exist`, the per-table entries for `user`, `member`, `email_outbox` and the five new tables, the new `user` and `member` tests, and the "every role ... table it holds no grant on is unreadable" tests (the matrix names tables that do not exist yet).

- [ ] **Step 2: Write the schema**

**Edit:** `server/db/schema/enums.ts`

Replace:

```typescript
export const organisationKind = pgEnum("organisation_kind", ["fynix", "client", "agency"]);
export const organisationStatus = pgEnum("organisation_status", ["active", "archived"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "active", "paused", "completed"]);
export const memberRole = pgEnum("member_role", ["member", "manager"]);
export const memberStatus = pgEnum("member_status", ["active", "suspended"]);
export const emailTemplate = pgEnum("email_template", ["password_reset"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed"]);
```

With:

```typescript
export const organisationKind = pgEnum("organisation_kind", ["fynix", "client", "agency"]);
export const organisationStatus = pgEnum("organisation_status", ["active", "archived"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "active", "paused", "completed", "archived"]);
export const memberRole = pgEnum("member_role", ["member", "manager"]);
export const memberStatus = pgEnum("member_status", ["active", "suspended"]);
export const emailTemplate = pgEnum("email_template", ["password_reset", "invite"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed", "cancelled"]);
export const termsStatus = pgEnum("terms_status", ["current", "superseded"]);
```


**File:** `server/db/schema/audit-log.ts`

```typescript
import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Everything Fynix changes, one row per change: who (`actor_user_id` and the database role), what (`action`), to what
 * (`subject_*`) and the public-safe state before and after. Append only: migration 0012 makes UPDATE and DELETE raise for
 * every role including the owner, and no role holds either privilege. A Fynix transaction that writes a domain table
 * without appending a row here fails when it commits (`audit_required`, migration 0012), so the log cannot be forgotten.
 *
 * `actor_user_id` and `actor_role` default from the request scope and the connection, and the policy refuses an insert
 * that names another actor, so a caller cannot write a row in someone else's name.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** The transaction that wrote the row; `audit_required` looks for a row with the current transaction's id. */
    txId: bigint("tx_id", { mode: "number" }).notNull().default(sql`txid_current()`),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .default(sql`public.app_current_user_id()`)
      .references(() => user.id, { onDelete: "restrict" }),
    /** The database role that connected, `leads_fynix` for every row in phase 1C. */
    actorRole: text("actor_role").notNull().default(sql`current_user`),
    /** `<table>.<verb>`, for example `invite.issue`. The list of actions lives in server/domain/audit.ts. */
    action: text("action").notNull(),
    subjectTable: text("subject_table").notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** The reference that is safe to show (`CMP-7Q2X`) when the subject has one. */
    subjectRef: text("subject_ref"),
    before: jsonb("before"),
    after: jsonb("after"),
  },
  (table) => [
    check("audit_log_action_format", sql`${table.action} ~ '^[a-z_]+\\.[a-z_]+$'`),
    index("audit_log_tx_idx").on(table.txId),
    index("audit_log_subject_idx").on(table.subjectTable, table.subjectId, table.at),
    index("audit_log_at_idx").on(table.at),
  ],
);
```


**File:** `server/db/schema/terms.ts`

```typescript
import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organisationKind, termsStatus } from "./enums";

/**
 * A published version of the terms for one party (`client`, `agency` or `fynix`). A published document is never edited:
 * what a person accepted must stay exactly as they read it, so Fynix has UPDATE on `status` only. Publishing a new
 * version marks the old one `superseded` and the users of that party must accept the new one.
 *
 * `placeholder` marks text that is not yet lawyer-approved (gate G2); see lib/terms/placeholder.ts.
 */
export const termsDocument = pgTable(
  "terms_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    party: organisationKind("party").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: termsStatus("status").notNull().default("current"),
    placeholder: boolean("placeholder").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("terms_document_party_version_unique").on(table.party, table.version),
    // The target of the composite foreign key from `terms_acceptance`, which keeps an acceptance's party equal to its document's.
    unique("terms_document_id_party_unique").on(table.id, table.party),
    // One current version per party.
    uniqueIndex("terms_document_one_current").on(table.party).where(sql`${table.status} = 'current'`),
    check("terms_document_version_positive", sql`${table.version} >= 1`),
  ],
);

/**
 * One row per user per version they accepted: when, and from which network address (the address the rate limits use,
 * `unknown` when no proxy header was present). `party` is a copy of the document's, pinned by the composite key.
 */
export const termsAcceptance = pgTable(
  "terms_acceptance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    documentId: uuid("document_id").notNull(),
    party: organisationKind("party").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    networkAddress: text("network_address").notNull(),
  },
  (table) => [
    unique("terms_acceptance_user_document_unique").on(table.userId, table.documentId),
    foreignKey({ name: "terms_acceptance_document_fk", columns: [table.documentId, table.party], foreignColumns: [termsDocument.id, termsDocument.party] }),
    index("terms_acceptance_user_idx").on(table.userId),
  ],
);
```


**File:** `server/db/schema/invite.ts`

```typescript
import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { memberRole, organisationKind } from "./enums";
import { organisation } from "./organisation";

/**
 * An invitation to join an organisation. The token itself is never stored: `token_hash` is its SHA-256 (base64url), so a
 * copy of this table cannot be used to redeem anything. Single use (`redeemed_at`), revocable (`revoked_at`), valid for
 * seven days (`expires_at`). The invite carries the name and, for an agency, the Fynix alias, so redeeming it needs only a
 * password and the acceptance of the terms.
 *
 * At most one live invite exists per address (`invite_one_live`), so issuing a new one has to revoke the old one in the
 * same transaction. Only `leads_auth` can see a row, and only the one whose hash the transaction names
 * (`app.invite_hash`, migration 0014).
 */
export const invite = pgTable(
  "invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    orgKind: organisationKind("org_kind").notNull(),
    /** Lower case, like `user.email`. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: memberRole("role").notNull().default("member"),
    /** The alias the client sees for this person. Required for an agency invite, absent for a client invite. */
    alias: text("alias"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "invite_org_fk", columns: [table.orgId, table.orgKind], foreignColumns: [organisation.id, organisation.kind] }),
    index("invite_org_idx").on(table.orgId),
    uniqueIndex("invite_one_live").on(table.email).where(sql`${table.redeemedAt} IS NULL AND ${table.revokedAt} IS NULL`),
    check("invite_email_lowercase", sql`${table.email} = lower(${table.email})`),
    check("invite_token_hash_format", sql`${table.tokenHash} ~ '^[A-Za-z0-9_-]{43}$'`),
    // There is one Fynix organisation and one Fynix admin in v1: nobody is invited into it.
    check("invite_not_fynix", sql`${table.orgKind} <> 'fynix'`),
    check("invite_alias_matches_kind", sql`(${table.orgKind} = 'agency' AND ${table.alias} IS NOT NULL) OR (${table.orgKind} <> 'agency' AND ${table.alias} IS NULL)`),
    check("invite_not_used_and_revoked", sql`NOT (${table.redeemedAt} IS NOT NULL AND ${table.revokedAt} IS NOT NULL)`),
  ],
);
```


**File:** `server/db/schema/agency-alias.ts`

```typescript
import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organisationKind } from "./enums";
import { member } from "./member";

/**
 * The Fynix name a client sees for an agency user ("Rahul, Fynix", spec section 4). One per agency member, unique across
 * all aliases (case-insensitively, so two people never share a face), and pinned to a member of an agency by the composite
 * key. The client never joins to this table: phase 2 copies the alias onto each row the client reads, so renaming an alias
 * later does not rewrite history. In phase 1C only Fynix reads it.
 */
export const agencyAlias = pgTable(
  "agency_alias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id").notNull(),
    memberOrgKind: organisationKind("member_org_kind").notNull().generatedAlwaysAs(sql`'agency'::organisation_kind`),
    alias: text("alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "agency_alias_member_fk", columns: [table.memberId, table.memberOrgKind], foreignColumns: [member.id, member.orgKind] }),
    uniqueIndex("agency_alias_member_unique").on(table.memberId),
    uniqueIndex("agency_alias_alias_unique").on(sql`lower(${table.alias})`),
    check("agency_alias_length", sql`char_length(btrim(${table.alias})) BETWEEN 2 AND 60 AND ${table.alias} = btrim(${table.alias})`),
  ],
);
```


**Edit:** `server/db/schema/member.ts`

Replace:

```typescript
import { foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { memberRole, memberStatus, organisationKind } from "./enums";
import { organisation } from "./organisation";
```

With:

```typescript
import { foreignKey, index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { memberRole, memberStatus, organisationKind } from "./enums";
import { organisation } from "./organisation";
```

**Edit:** `server/db/schema/member.ts`

Replace:

```typescript
 * - `org_kind` is a copy of the organisation's kind, pinned by the composite foreign key, so session resolution
 *   needs no grant on `organisation`.
 * - A suspended member keeps their rows but cannot sign in and their sessions stop resolving.
 * Phase 1C adds the admin features (invite, suspend, alias).
 */
export const member = pgTable(
  "member",
```

With:

```typescript
 * - `org_kind` is a copy of the organisation's kind, pinned by the composite foreign key, so session resolution
 *   needs no grant on `organisation`.
 * - A suspended member keeps their rows but cannot sign in and their sessions stop resolving.
 * - Rows are created by invite redemption (server/domain/redeem-invite.ts) and by `pnpm admin:create`. Fynix suspends,
 *   reactivates and renames members (server/domain/members.ts); nobody deletes one.
 */
export const member = pgTable(
  "member",
```

**Edit:** `server/db/schema/member.ts`

Replace:

```typescript
  },
  (table) => [
    uniqueIndex("member_user_unique").on(table.userId),
    foreignKey({ name: "member_org_fk", columns: [table.orgId, table.orgKind], foreignColumns: [organisation.id, organisation.kind] }),
    index("member_org_idx").on(table.orgId),
  ],
```

With:

```typescript
  },
  (table) => [
    uniqueIndex("member_user_unique").on(table.userId),
    // The target of `agency_alias`'s composite foreign key, which pins an alias to a member of an agency.
    unique("member_id_org_kind_unique").on(table.id, table.orgKind),
    foreignKey({ name: "member_org_fk", columns: [table.orgId, table.orgKind], foreignColumns: [organisation.id, organisation.kind] }),
    index("member_org_idx").on(table.orgId),
  ],
```


**Edit:** `server/db/schema/campaign.ts`

Replace:

```typescript
    endDate: date("end_date", { mode: "string" }).notNull(),
    monthlyTarget: integer("monthly_target").notNull(),
    totalTarget: integer("total_target").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
```

With:

```typescript
    endDate: date("end_date", { mode: "string" }).notNull(),
    monthlyTarget: integer("monthly_target").notNull(),
    totalTarget: integer("total_target").notNull(),
    /**
     * What the campaign looks for and how to pitch it (spec section 6). Added in phase 1C, all with defaults so existing rows
     * stay valid. No tenant role has a grant on any of them until phase 1E decides who sees which; until then a tenant
     * query that names one fails with "permission denied" (the leak matrix probes it).
     */
    geography: text("geography").notNull().default(""),
    industries: text("industries").array().notNull().default(sql`'{}'::text[]`),
    companySize: text("company_size").notNull().default(""),
    icp: text("icp").notNull().default(""),
    jobTitles: text("job_titles").array().notNull().default(sql`'{}'::text[]`),
    seniority: text("seniority").notNull().default(""),
    technologies: text("technologies").array().notNull().default(sql`'{}'::text[]`),
    /** The four BANT criteria a lead is qualified against: budget, authority, need and timeline. */
    bantBudget: text("bant_budget").notNull().default(""),
    bantAuthority: text("bant_authority").notNull().default(""),
    bantNeed: text("bant_need").notNull().default(""),
    bantTimeline: text("bant_timeline").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
```


**Edit:** `server/db/schema/email-outbox.ts`

Replace:

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

With:

```typescript
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { emailTemplate, outboxStatus } from "./enums";
import { invite } from "./invite";

/**
 * Every email the app sends, written first and sent after (server/mail/outbox.ts).
 *
 * - `template` and `params` are the content; `subject` and `body` are the stored copy of what was queued, with the link
 *   replaced by a line saying it is not kept. That copy stays as the record.
 * - `link` is the one secret: the reset or invite link. It exists only while the row is `pending` (the check constraint
 *   `email_outbox_link_only_while_pending`) and is cleared the moment the message is sent, fails for good or is cancelled.
 *   A link that has not been sent within a day is cleared by the purge (`purgeExpiredLinks`) and the row fails.
 * - State machine: `pending` (waiting for its turn or for a retry, see `next_attempt_at`), then `sent`, or `failed` after
 *   the last attempt or a permanent refusal, or `cancelled` when the invite it carried was revoked first.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipient: text("recipient").notNull(),
    template: emailTemplate("template").notNull(),
    subject: text("subject").notNull(),
    /** Plain text with the link removed. */
    body: text("body").notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** The values the template needs, never the link. */
    params: jsonb("params").notNull().default(sql`'{}'::jsonb`),
    link: text("link"),
    attempts: integer("attempts").notNull().default(0),
    /** Not offered to a sender before this time: the retry backoff, and the lease while a sender holds the message. */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    /** A short reason, never the provider's response body, which can echo the recipient. */
    lastError: text("last_error"),
    providerId: text("provider_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** The invite whose link this message carries, so revoking the invite can cancel a message that has not gone out. */
    inviteId: uuid("invite_id").references(() => invite.id, { onDelete: "restrict" }),
  },
  (table) => [
    check("email_outbox_link_only_while_pending", sql`${table.link} IS NULL OR ${table.status} = 'pending'`),
    check("email_outbox_attempts_not_negative", sql`${table.attempts} >= 0`),
    index("email_outbox_due_idx").on(table.status, table.nextAttemptAt),
    index("email_outbox_invite_idx").on(table.inviteId),
  ],
);
```


**Edit:** `server/db/schema/index.ts`

Replace:

```typescript
export * from "./member";
export * from "./rate-limit";
export * from "./email-outbox";
```

With:

```typescript
export * from "./member";
export * from "./rate-limit";
export * from "./email-outbox";
export * from "./audit-log";
export * from "./terms";
export * from "./invite";
export * from "./agency-alias";
```


- [ ] **Step 3: Generate the DDL**

```bash
pnpm db:generate --name=domain_tables
```

Expected: drizzle-kit prints the tables it read (including `audit_log 11 columns`, `invite 13 columns`, `email_outbox 15 columns`) and writes `server/db/migrations/0011_domain_tables.sql`, its snapshot and a journal entry. Its `when` comes from the machine clock; the journal test fails if it is not above the one before (`0010`), in which case raise it by hand.

- [ ] **Step 4: Fix the one thing drizzle-kit gets wrong**

drizzle-kit writes the foreign key `agency_alias_member_fk` before the unique constraint on `member(id, org_kind)` that it points at, so the migration fails on an empty database with `there is no unique constraint matching given keys for referenced table "member"`. Move the one `ALTER TABLE "member" ADD CONSTRAINT "member_id_org_kind_unique"` line above the first `ADD CONSTRAINT ... FOREIGN KEY` line. The generated file below is the result:

**File:** `server/db/migrations/0011_domain_tables.sql`

```sql
CREATE TYPE "public"."terms_status" AS ENUM('current', 'superseded');--> statement-breakpoint
ALTER TYPE "public"."campaign_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TYPE "public"."email_template" ADD VALUE 'invite';--> statement-breakpoint
ALTER TYPE "public"."outbox_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"tx_id" bigint DEFAULT txid_current() NOT NULL,
	"actor_user_id" uuid DEFAULT public.app_current_user_id() NOT NULL,
	"actor_role" text DEFAULT current_user NOT NULL,
	"action" text NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_ref" text,
	"before" jsonb,
	"after" jsonb,
	CONSTRAINT "audit_log_action_format" CHECK ("audit_log"."action" ~ '^[a-z_]+\.[a-z_]+$')
);
--> statement-breakpoint
CREATE TABLE "terms_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"party" "organisation_kind" NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"network_address" text NOT NULL,
	CONSTRAINT "terms_acceptance_user_document_unique" UNIQUE("user_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "terms_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party" "organisation_kind" NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "terms_status" DEFAULT 'current' NOT NULL,
	"placeholder" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_document_party_version_unique" UNIQUE("party","version"),
	CONSTRAINT "terms_document_id_party_unique" UNIQUE("id","party"),
	CONSTRAINT "terms_document_version_positive" CHECK ("terms_document"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"org_kind" "organisation_kind" NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"alias" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invite_email_lowercase" CHECK ("invite"."email" = lower("invite"."email")),
	CONSTRAINT "invite_token_hash_format" CHECK ("invite"."token_hash" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "invite_not_fynix" CHECK ("invite"."org_kind" <> 'fynix'),
	CONSTRAINT "invite_alias_matches_kind" CHECK (("invite"."org_kind" = 'agency' AND "invite"."alias" IS NOT NULL) OR ("invite"."org_kind" <> 'agency' AND "invite"."alias" IS NULL)),
	CONSTRAINT "invite_not_used_and_revoked" CHECK (NOT ("invite"."redeemed_at" IS NOT NULL AND "invite"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "agency_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"member_org_kind" "organisation_kind" GENERATED ALWAYS AS ('agency'::organisation_kind) STORED NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_alias_length" CHECK (char_length(btrim("agency_alias"."alias")) BETWEEN 2 AND 60 AND "agency_alias"."alias" = btrim("agency_alias"."alias"))
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "geography" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "industries" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "company_size" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "icp" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "job_titles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "seniority" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "technologies" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "bant_budget" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "bant_authority" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "bant_need" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "bant_timeline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "instructions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "params" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "invite_id" uuid;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_id_org_kind_unique" UNIQUE("id","org_kind");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptance" ADD CONSTRAINT "terms_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptance" ADD CONSTRAINT "terms_acceptance_document_fk" FOREIGN KEY ("document_id","party") REFERENCES "public"."terms_document"("id","party") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_org_fk" FOREIGN KEY ("org_id","org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_alias" ADD CONSTRAINT "agency_alias_member_fk" FOREIGN KEY ("member_id","member_org_kind") REFERENCES "public"."member"("id","org_kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_tx_idx" ON "audit_log" USING btree ("tx_id");--> statement-breakpoint
CREATE INDEX "audit_log_subject_idx" ON "audit_log" USING btree ("subject_table","subject_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "terms_acceptance_user_idx" ON "terms_acceptance" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_document_one_current" ON "terms_document" USING btree ("party") WHERE "terms_document"."status" = 'current';--> statement-breakpoint
CREATE INDEX "invite_org_idx" ON "invite" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_one_live" ON "invite" USING btree ("email") WHERE "invite"."redeemed_at" IS NULL AND "invite"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agency_alias_member_unique" ON "agency_alias" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_alias_alias_unique" ON "agency_alias" USING btree (lower("alias"));--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_invite_id_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invite"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_outbox_invite_idx" ON "email_outbox" USING btree ("invite_id");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_link_only_while_pending" CHECK ("email_outbox"."link" IS NULL OR "email_outbox"."status" = 'pending');--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_attempts_not_negative" CHECK ("email_outbox"."attempts" >= 0);
```


Check that nothing else is pending: `pnpm db:generate` prints `No schema changes, nothing to migrate`.

- [ ] **Step 5: Write the hand-written migrations**

Create each empty file with drizzle-kit (it writes the snapshot and the journal entry), then put the SQL in:

```bash
pnpm db:generate --custom --name=audit_log_grants
pnpm db:generate --custom --name=terms_grants
pnpm db:generate --custom --name=invite_grants
pnpm db:generate --custom --name=agency_alias_grants
pnpm db:generate --custom --name=member_user_grants
pnpm db:generate --custom --name=email_outbox_domain_grants
```

Two things in these files are worth reading before running them. **Migration 0012** holds the audit rules. The function `audit_required` uses two nested `IF`s on purpose: the first version of this plan used one `IF current_user = 'leads_fynix' AND NOT EXISTS (SELECT ... FROM audit_log ...)`, and Postgres evaluated the subquery for every role, so the identity role's redemption (which touches `invite`, `member` and `agency_alias`, all of which carry the trigger) failed at commit with `permission denied for table audit_log`. The redemption test in Task 10 found it. **Migration 0014** defines `app_current_invite_hash()`, the function the invite policies compare against.

**File:** `server/db/migrations/0012_audit_log_grants.sql`

```sql
-- audit_log: row-level security, grants, the append-only rule and the "no Fynix change without an audit row" rule.
-- See 0002 for the rules every table follows.
--
-- Fynix reads and appends. Nobody else holds any privilege. The row's actor must be the user the request was scoped to
-- (app.user_id) and its role the connection's own role, so an insert cannot be written in another person's name.
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_log" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "audit_log_fynix_read" ON "audit_log" AS PERMISSIVE FOR SELECT TO leads_fynix USING (true);
--> statement-breakpoint
CREATE POLICY "audit_log_fynix_append" ON "audit_log" AS PERMISSIVE FOR INSERT TO leads_fynix
  WITH CHECK ("actor_user_id" = public.app_current_user_id() AND "actor_role" = current_user::text);
--> statement-breakpoint
-- Append only, for every role including the owner: no privilege is granted and this trigger raises on any UPDATE or
-- DELETE that reaches a row. TRUNCATE is not blocked, because the test harness empties every table with it
-- (server/db/testing/index.ts, resetDatabase); no runtime role holds TRUNCATE. A superuser can still disable the trigger,
-- which is why the log is also shipped off the machine in phase 6.
CREATE FUNCTION public.audit_log_refuse_change() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append only: % is not allowed', TG_OP;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.audit_log_refuse_change() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_refuse_change();
--> statement-breakpoint
-- A transaction that changes a domain table as leads_fynix must also have appended an audit_log row, or it cannot commit.
-- The check is deferred to commit, so the audit row may be written before or after the change. It only looks at
-- leads_fynix: seeds, `pnpm admin:create` and the other roles' own writes are not Fynix actions. It counts rows of the
-- same transaction, not of the same subject: that every action writes the right row is the service tests' job, and that
-- none can write nothing is this trigger's. Each table adds its own trigger in its grants migration, and the structural
-- test fails for a table that Fynix can write and that has none.
CREATE FUNCTION public.audit_required() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  -- Two IFs, not one condition with AND: Postgres does not promise to skip the subquery when the first test is false,
  -- and every role but leads_fynix is refused SELECT on audit_log, so reading it for them would fail their commit.
  IF current_user = 'leads_fynix' THEN
    IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE tx_id = txid_current()) THEN
      RAISE EXCEPTION 'A change to % by Fynix has no audit_log row in its transaction', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.audit_required() FROM PUBLIC;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER organisation_audit_required AFTER INSERT OR UPDATE OR DELETE ON "organisation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER campaign_audit_required AFTER INSERT OR UPDATE OR DELETE ON "campaign"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
```


**File:** `server/db/migrations/0013_terms_grants.sql`

```sql
-- Row-level security and grants for terms_document and terms_acceptance. See 0002 for the rules.
--
-- A published document is never edited: Fynix may insert one and change its `status` (a new version supersedes the old),
-- and no role may update the text. leads_auth reads the documents and records an acceptance during invite redemption,
-- and only for the current document of the party the user belongs to. The client and agency roles get a read of the
-- current document and their own acceptances in phase 1E, with the terms gate.
ALTER TABLE "terms_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "terms_acceptance" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "terms_document" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status") ON "terms_document" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "terms_document_fynix_all" ON "terms_document" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ON "terms_document" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "terms_document_auth_read" ON "terms_document" AS PERMISSIVE FOR SELECT TO leads_auth USING (true);
--> statement-breakpoint
GRANT SELECT ON "terms_acceptance" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "terms_acceptance_fynix_read" ON "terms_acceptance" AS PERMISSIVE FOR SELECT TO leads_fynix USING (true);
--> statement-breakpoint
GRANT INSERT ON "terms_acceptance" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "terms_acceptance_auth_insert" ON "terms_acceptance" AS PERMISSIVE FOR INSERT TO leads_auth
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.member m WHERE m.user_id = "terms_acceptance"."user_id" AND m.org_kind = "terms_acceptance"."party")
    AND EXISTS (SELECT 1 FROM public.terms_document d WHERE d.id = "terms_acceptance"."document_id" AND d.status = 'current')
  );
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER terms_document_audit_required AFTER INSERT OR UPDATE OR DELETE ON "terms_document"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
```


**File:** `server/db/migrations/0014_invite_grants.sql`

```sql
-- Row-level security and grants for invite. See 0002 for the rules.
--
-- Fynix issues invites and revokes them, and reads everything but the token hash. leads_auth redeems them, and it can see
-- a row only when the transaction names that row's token hash in `app.invite_hash` (set by withInviteHash in
-- server/db/scope.ts). A connection that has not been given a hash sees no invite at all, so a bug or an injected
-- statement on the identity pool cannot list the people who have been invited, and the hash is only ever known to the
-- holder of the link. The redeem policy lets the database itself refuse an invite that is used, revoked or expired.
ALTER TABLE "invite" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Plain LANGUAGE sql, STABLE, no SET clause, names qualified: the same shape as the two scope functions in 0000.
CREATE FUNCTION public.app_current_invite_hash() RETURNS pg_catalog.text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(pg_catalog.current_setting('app.invite_hash', true), '') $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_current_invite_hash() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_current_invite_hash() TO leads_auth;
--> statement-breakpoint
GRANT INSERT ON "invite" TO leads_fynix;
--> statement-breakpoint
GRANT SELECT ("id", "org_id", "org_kind", "email", "name", "role", "alias", "expires_at", "redeemed_at", "revoked_at", "created_by", "created_at") ON "invite" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("revoked_at") ON "invite" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "invite_fynix_all" ON "invite" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ("id", "org_id", "org_kind", "email", "name", "role", "alias", "token_hash", "expires_at", "redeemed_at", "revoked_at") ON "invite" TO leads_auth;
--> statement-breakpoint
GRANT UPDATE ("redeemed_at") ON "invite" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "invite_auth_read" ON "invite" AS PERMISSIVE FOR SELECT TO leads_auth USING ("token_hash" = public.app_current_invite_hash());
--> statement-breakpoint
CREATE POLICY "invite_auth_redeem" ON "invite" AS PERMISSIVE FOR UPDATE TO leads_auth
  USING ("token_hash" = public.app_current_invite_hash() AND "redeemed_at" IS NULL AND "revoked_at" IS NULL AND "expires_at" > now())
  WITH CHECK ("redeemed_at" IS NOT NULL);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invite_audit_required AFTER INSERT OR UPDATE OR DELETE ON "invite"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
```


**File:** `server/db/migrations/0015_agency_alias_grants.sql`

```sql
-- Row-level security and grants for agency_alias. See 0002 for the rules.
--
-- Fynix reads, creates and renames aliases (never removes one). leads_auth inserts the alias of a person who has just
-- redeemed an invite that carried it, and nothing else. No tenant role holds a grant: the client sees an alias only as a
-- copy stored on the rows it reads (phase 2), and an agency user reads its own alias in phase 1E.
ALTER TABLE "agency_alias" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "agency_alias" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("alias", "updated_at") ON "agency_alias" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "agency_alias_fynix_all" ON "agency_alias" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT INSERT ON "agency_alias" TO leads_auth;
--> statement-breakpoint
-- The subquery sees one invite at most: leads_auth reads invites only by the hash its transaction names.
CREATE POLICY "agency_alias_auth_insert" ON "agency_alias" AS PERMISSIVE FOR INSERT TO leads_auth
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.member m
        JOIN public."user" u ON u.id = m.user_id
        JOIN public.invite i ON i.email = u.email
      WHERE m.id = "agency_alias"."member_id" AND i.alias = "agency_alias"."alias" AND i.redeemed_at IS NOT NULL
    )
  );
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agency_alias_audit_required AFTER INSERT OR UPDATE OR DELETE ON "agency_alias"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
```


**File:** `server/db/migrations/0016_member_user_grants.sql`

```sql
-- What phase 1C adds on member and user. Replaces the "Fynix holds nothing on these tables" rule of phase 1B (decision B5).
--
-- member: Fynix reads every column and may change `status` (suspend, reactivate) and `display_name`; it cannot move a
-- member to another organisation or change a role. leads_auth may INSERT a row, and only the row an invite just redeemed
-- entitles: the user's address, the organisation, its kind, the role and the name must all match a redeemed invite, and
-- the invite is visible only because this transaction named its hash. It gets `id` to read back what it wrote.
-- user: Fynix reads the four columns it needs to list and invite people. It never reads a password hash, a token or a session.
GRANT SELECT ON "member" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status", "display_name") ON "member" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "member_fynix_all" ON "member" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ("id") ON "member" TO leads_auth;
--> statement-breakpoint
GRANT INSERT ON "member" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "member_auth_insert" ON "member" AS PERMISSIVE FOR INSERT TO leads_auth
  WITH CHECK (
    "status" = 'active'
    AND EXISTS (
      SELECT 1 FROM public."user" u
        JOIN public.invite i ON i.email = u.email
      WHERE u.id = "member"."user_id" AND i.org_id = "member"."org_id" AND i.org_kind = "member"."org_kind"
        AND i.role = "member"."role" AND i.name = "member"."display_name" AND i.redeemed_at IS NOT NULL
    )
  );
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER member_audit_required AFTER INSERT OR UPDATE OR DELETE ON "member"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
GRANT SELECT ("id", "name", "email", "created_at") ON "user" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "user_fynix_read" ON "user" AS PERMISSIVE FOR SELECT TO leads_fynix USING (true);
```


**File:** `server/db/migrations/0017_email_outbox_domain_grants.sql`

```sql
-- What phase 1C adds on email_outbox. See 0010 for the phase 1B grant (leads_public may insert and nothing else).
--
-- Fynix queues the invite email in the same transaction as the invite, reads the state of the queue (never `link`), and
-- cancels a message whose invite it revoked. leads_auth is the sender: it reads the queue, claims a message, and records the
-- outcome, including clearing the link. The link is an authentication artefact (a reset token or an invite token), and
-- leads_auth already holds the tables those tokens live in. When phase 4 sends notification emails that carry lead data
-- the sender gets a role of its own. Neither role can insert as leads_auth or delete a row.
GRANT INSERT ON "email_outbox" TO leads_fynix;
--> statement-breakpoint
GRANT SELECT ("id", "recipient", "template", "subject", "body", "params", "status", "attempts", "next_attempt_at", "last_error", "provider_id", "sent_at", "invite_id", "created_at") ON "email_outbox" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status", "last_error", "link") ON "email_outbox" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "email_outbox_fynix_all" ON "email_outbox" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT ON "email_outbox" TO leads_auth;
--> statement-breakpoint
GRANT UPDATE ("status", "attempts", "next_attempt_at", "last_error", "provider_id", "sent_at", "link") ON "email_outbox" TO leads_auth;
--> statement-breakpoint
CREATE POLICY "email_outbox_auth_read" ON "email_outbox" AS PERMISSIVE FOR SELECT TO leads_auth USING (true);
--> statement-breakpoint
CREATE POLICY "email_outbox_auth_update" ON "email_outbox" AS PERMISSIVE FOR UPDATE TO leads_auth USING (true) WITH CHECK (true);
```


- [ ] **Step 6: The tests that wrote to the tables as Fynix now need an audit row**

Phase 1A's `rls.integration.test.ts` creates organisations and campaigns as Fynix, which is now refused at commit without an audit row. Its `asFynix` helper appends a minimal one (for the seeded Fynix user, since the audit actor must be a real user), so those tests keep testing the tables.

**Edit:** `server/db/rls.integration.test.ts`

Replace:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_COLUMNS, columnNames } from "@/server/db/columns";
import { TENANT_ROLES } from "@/server/db/roles";
import { campaign, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { selectCampaigns } from "@/server/db/tenant-reads";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
```

With:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_COLUMNS, columnNames } from "@/server/db/columns";
import { TENANT_ROLES } from "@/server/db/roles";
import { auditLog, campaign, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { selectCampaigns } from "@/server/db/tenant-reads";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
```

**Edit:** `server/db/rls.integration.test.ts`

Replace:

```typescript
  world = await seedWorld(dbs.owner);
});

const asFynix = <T>(work: Parameters<typeof withScope<T>>[2]) => withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: USER }, work);

describe("Fynix", () => {
  it("reads every organisation and every campaign, hidden columns included", async () => {
```

With:

```typescript
  world = await seedWorld(dbs.owner);
});

/**
 * A Fynix transaction that changes a domain table must append an `audit_log` row (migration 0012), or it cannot commit.
 * These tests are about the tables, not the audit log, so every `asFynix` call ends with one minimal row, written for the
 * seeded Fynix user (the audit actor must be a real user). server/domain/fynix-write.ts is the real way to do this.
 */
const asFynix = <T>(work: Parameters<typeof withScope<T>>[2]) => {
  const actor = world.users[0]?.id;
  if (actor === undefined) throw new Error("The seed world has no Fynix user");
  return withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: actor }, async (tx) => {
    const result = await work(tx);
    await tx.insert(auditLog).values({ action: "test.write", subjectTable: "campaign", subjectId: USER });
    return result;
  });
};

describe("Fynix", () => {
  it("reads every organisation and every campaign, hidden columns included", async () => {
```


- [ ] **Step 7: Apply and run**

```bash
pnpm test:integration
pnpm exec vitest run server/db/migration-journal
pnpm db:generate
```

Expected: the migrator applies `0011` to `0017` (`Migrations applied to the test database.`); 10 files, 287 tests; the journal test passes (strictly increasing `when`, an unbroken snapshot chain); `pnpm db:generate` prints `No schema changes, nothing to migrate`.

- [ ] **Step 8: Check and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add server/db
git commit -m "Add audit log, terms, invite and agency alias tables, the campaign requirement columns, and their grants and policies"
```

## Task 4: Structural checks, the seed and the leak matrix probes

**Files:** modify `server/db/testing/structure.ts`, `server/db/testing/seed.ts`, `server/db/testing/leak-matrix.ts`, `server/db/structure.integration.test.ts`, `server/db/leak-matrix.integration.test.ts`, `scripts/db-seed.ts`.

Three things make the new tables part of the design instead of exceptions to it.

1. **A catalog check for the audit rule.** `fynixWritableTablesWithoutAuditTrigger` lists every table `leads_fynix` can write that has no enabled, deferred `audit_required` trigger on insert and update, apart from two exempt ones (`audit_log` itself, and `email_outbox`, which is plumbing queued in the same transaction as an audited change). A table added in a later phase fails the test until its grants migration adds the trigger. A self-test builds a broken table, a trigger that is not deferred and a fine one, and expects the first two.
2. **A seed of the new rows.** Each seeded user accepts their party's terms from a distinct address, each agency user has an alias, two pending invites exist, two audit rows and a queued email that still holds its link. Every value is distinctive plain text, so the leak matrix can search for it.
3. **Probes.** 26 new probes run as both tenant roles for both organisations of each kind: every invite, the invited address, the token hash, redeeming one, the terms, acceptances and the addresses they came from, aliases, the audit log, the outbox link, and every campaign requirement column. The requirement columns are denied now and phase 1E grants them deliberately.

- [ ] **Step 1: Write the tests**

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "@/server/db/pool";
import { ROLE_NAMES, RUNTIME_ROLES, TENANT_ROLES, urlVariable, type RoleName, type RuntimeRoleName, type TenantRoleName } from "@/server/db/roles";
import { campaign } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { getToolingEnv } from "@/server/env";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
```

With:

```typescript
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database, type DatabaseHandle } from "@/server/db/pool";
import { ROLE_NAMES, RUNTIME_ROLES, TENANT_ROLES, urlVariable, type RoleName, type RuntimeRoleName, type TenantRoleName } from "@/server/db/roles";
import { auditLog, campaign, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { getToolingEnv } from "@/server/env";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
import {
  creationPrivileges,
  definerFunctionsWithoutSearchPath,
  grantsToPublic,
  grantedColumns,
  grantsWithoutPolicy,
```

With:

```typescript
import {
  creationPrivileges,
  definerFunctionsWithoutSearchPath,
  fynixWritableTablesWithoutAuditTrigger,
  grantsToPublic,
  grantedColumns,
  grantsWithoutPolicy,
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
    expect(found).toEqual(["leads_client.broken_no_policy"]);
  });

  it("a role with CREATEDB, a stray leads_ role, and a membership (as superuser, rolled back)", async () => {
    const attributes = await findInBrokenState(admin, ["alter role leads_public createdb", "create role leads_stray"], roleProblems);
    expect(attributes).toEqual(["leads_public has a forbidden attribute", "leads_stray is not one of the six roles"]);
```

With:

```typescript
    expect(found).toEqual(["leads_client.broken_no_policy"]);
  });

  it("a table Fynix can write with no audit trigger, a trigger that is not deferred, and the two exempt tables", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_unaudited (id int)",
        "grant insert on public.broken_unaudited to leads_fynix",
        "create table public.broken_not_deferred (id int)",
        "grant update (id) on public.broken_not_deferred to leads_fynix",
        "create trigger broken_not_deferred_audit after insert or update on public.broken_not_deferred for each row execute function public.audit_required()",
        "create table public.fine_audited (id int)",
        "grant insert, update on public.fine_audited to leads_fynix",
        "create constraint trigger fine_audited_audit after insert or update on public.fine_audited deferrable initially deferred for each row execute function public.audit_required()",
        "create table public.fine_read_only (id int)",
        "grant select on public.fine_read_only to leads_fynix",
      ],
      (executor) => fynixWritableTablesWithoutAuditTrigger(executor, ["audit_log"]),
    );
    expect(found).toEqual(["broken_not_deferred", "broken_unaudited", "email_outbox"]);
  });

  it("a role with CREATEDB, a stray leads_ role, and a membership (as superuser, rolled back)", async () => {
    const attributes = await findInBrokenState(admin, ["alter role leads_public createdb", "create role leads_stray"], roleProblems);
    expect(attributes).toEqual(["leads_public has a forbidden attribute", "leads_stray is not one of the six roles"]);
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
      scopeFunctionProblems,
    );
    expect(found).toEqual(["app_current_org_id"]);
  });
});
```

With:

```typescript
      scopeFunctionProblems,
    );
    expect(found).toEqual(["app_current_org_id"]);
  });
});

describe("the audit log", () => {
  const fynix = (): { readonly db: Database; readonly scope: { readonly orgId: null; readonly userId: string } } => {
    const actor = world.users[0]?.id;
    if (actor === undefined) throw new Error("The seed world has no Fynix user");
    return { db: dbs.roles.leads_fynix.db, scope: { orgId: null, userId: actor } };
  };
  const auditCount = async (): Promise<number> => (await dbs.owner.db.execute<{ n: number }>(sql`select count(*)::int as n from audit_log`)).rows[0]?.n ?? 0;
  const organisationCount = async (): Promise<number> => (await dbs.owner.db.execute<{ n: number }>(sql`select count(*)::int as n from organisation`)).rows[0]?.n ?? 0;
  const newOrganisation = { publicRef: "ORG-3C4D", kind: "agency", name: "Ridgeway Ltd" } as const;

  it("every table Fynix can write has the audit_required trigger, apart from the audit log and the outbox", async () => {
    expect(await fynixWritableTablesWithoutAuditTrigger(dbs.owner.db)).toEqual([]);
  });

  it("holds no UPDATE, DELETE or TRUNCATE for any runtime role, and only Fynix may read or append", async () => {
    expect(await rolesWithAnyPrivilege(dbs.owner.db, "audit_log")).toEqual(["leads_fynix"]);
    for (const role of RUNTIME_ROLES) {
      for (const privilege of ["UPDATE", "DELETE", "TRUNCATE"]) {
        const held = await dbs.owner.db.execute<{ held: boolean }>(sql.raw(`select has_table_privilege('${role}', 'public.audit_log', '${privilege}') or has_any_column_privilege('${role}', 'public.audit_log', 'UPDATE') as held`));
        expect(held.rows, `${role} ${privilege}`).toEqual([{ held: false }]);
      }
    }
  });

  it("refuses UPDATE and DELETE even for the owner, and leaves the rows as they were", async () => {
    const before = await auditCount();
    expect(before).toBeGreaterThan(0);
    expect(await captureErrorText(dbs.owner.db.execute(sql`update audit_log set action = 'x.y'`))).toContain("audit_log is append only: UPDATE is not allowed");
    expect(await captureErrorText(dbs.owner.db.execute(sql`delete from audit_log`))).toContain("audit_log is append only: DELETE is not allowed");
    expect(await auditCount()).toBe(before);
  });

  it("a Fynix change with no audit row cannot commit, and nothing of it is left behind", async () => {
    const { db, scope } = fynix();
    const message = await captureErrorText(withScope(db, scope, (tx) => tx.insert(organisation).values(newOrganisation)));
    expect(message).toContain("A change to organisation by Fynix has no audit_log row in its transaction");
    expect(await organisationCount()).toBe(5);
  });

  it("a Fynix change with an audit row commits, whichever of the two is written first", async () => {
    const { db, scope } = fynix();
    const entry = { action: "organisation.create", subjectTable: "organisation", subjectId: scope.userId } as const;
    await withScope(db, scope, async (tx) => {
      await tx.insert(auditLog).values(entry);
      await tx.insert(organisation).values(newOrganisation);
    });
    await withScope(db, scope, async (tx) => {
      await tx.insert(organisation).values({ ...newOrganisation, publicRef: "ORG-3C4E" });
      await tx.insert(auditLog).values(entry);
    });
    expect(await organisationCount()).toBe(7);
  });

  it("a Fynix transaction that only reads needs no audit row", async () => {
    const { db, scope } = fynix();
    expect(await withScope(db, scope, (tx) => tx.select({ id: organisation.id }).from(organisation))).toHaveLength(5);
  });

  it("the owner's writes need none: seeds and `pnpm admin:create` are not Fynix actions", async () => {
    await dbs.owner.db.insert(organisation).values(newOrganisation);
    expect(await organisationCount()).toBe(6);
  });

  it("an audit row cannot be written in another person's name or from another role", async () => {
    const { db, scope } = fynix();
    const other = world.users[1]?.id ?? "";
    const named = await captureErrorText(withScope(db, scope, (tx) => tx.insert(auditLog).values({ action: "organisation.create", subjectTable: "organisation", subjectId: scope.userId, actorUserId: other })));
    expect(named).toContain('new row violates row-level security policy for table "audit_log"');
    const role = await captureErrorText(withScope(db, scope, (tx) => tx.insert(auditLog).values({ action: "organisation.create", subjectTable: "organisation", subjectId: scope.userId, actorRole: "leads_owner" })));
    expect(role).toContain('new row violates row-level security policy for table "audit_log"');
  });

  it("an audit row takes its actor and role from the request and the connection when none is named", async () => {
    const { db, scope } = fynix();
    await withScope(db, scope, (tx) => tx.insert(auditLog).values({ action: "organisation.create", subjectTable: "organisation", subjectId: scope.userId }));
    const rows = await dbs.owner.db.execute<{ actor_user_id: string; actor_role: string }>(sql`select actor_user_id, actor_role from audit_log order by at desc limit 1`);
    expect(rows.rows).toEqual([{ actor_user_id: scope.userId, actor_role: "leads_fynix" }]);
  });

  it("refuses an action that is not in the table.verb form", async () => {
    const { db, scope } = fynix();
    const message = await captureErrorText(withScope(db, scope, (tx) => tx.insert(auditLog).values({ action: "Delete Everything", subjectTable: "organisation", subjectId: scope.userId })));
    expect(message).toContain("audit_log_action_format");
  });
});
```


**Edit:** `server/db/leak-matrix.integration.test.ts`

Replace:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";
import { campaign } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { PROBES, READ_PATHS, findLeaks, forbiddenTokens, type Viewer } from "@/server/db/testing/leak-matrix";
```

With:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";
import { agencyAlias, auditLog, campaign, emailOutbox, invite, termsAcceptance } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, queryAs, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { PROBES, READ_PATHS, findLeaks, forbiddenTokens, type Viewer } from "@/server/db/testing/leak-matrix";
```

**Edit:** `server/db/leak-matrix.integration.test.ts`

Replace:

```typescript
    expect(agencyLeaks).toContain(world.kestrel.id);
    expect(agencyLeaks).toContain(world.campaigns[2]?.name);
  });
});
```

With:

```typescript
    expect(agencyLeaks).toContain(world.kestrel.id);
    expect(agencyLeaks).toContain(world.campaigns[2]?.name);
  });

  it("detects a leak of the phase 1C tables: what Fynix may read of invites, aliases, acceptances, the audit log and the outbox trips both forbidden lists", async () => {
    const asFynix = <T>(work: Parameters<typeof withScope<T>>[2]) => withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: world.users[0]?.id ?? USER }, work);
    const everything = JSON.stringify([
      await asFynix((tx) => tx.select({ email: invite.email, name: invite.name }).from(invite)),
      await asFynix((tx) => tx.select({ alias: agencyAlias.alias }).from(agencyAlias)),
      await asFynix((tx) => tx.select({ address: termsAcceptance.networkAddress }).from(termsAcceptance)),
      await asFynix((tx) => tx.select({ before: auditLog.before, after: auditLog.after }).from(auditLog)),
      await asFynix((tx) => tx.select({ recipient: emailOutbox.recipient }).from(emailOutbox)),
    ]);
    const domain = world.domain;
    if (domain === null) throw new Error("The seed world has no phase 1C rows");
    for (const viewer of [{ role: "leads_client", organisation: world.kestrel }, { role: "leads_agency", organisation: world.brightpath }] as const) {
      const leaks = findLeaks(everything, forbiddenTokens(viewer, world));
      for (const expected of [domain.invites[0]?.email, domain.aliases[0], domain.acceptanceAddresses[0], domain.auditMarkers[0], domain.outboxRecipient]) expect(leaks).toContain(expected);
    }
  });
});
```


Run `pnpm exec vitest run --config vitest.integration.config.mts server/db`. Expected: FAIL, 3 of the 125 structure tests (the two catalog checks call a function that does not exist yet, and the append-only test finds no audit row to try to change) and 1 of the 82 leak matrix tests (the seed has no phase 1C rows, so `world.domain` is `null`).

- [ ] **Step 2: Write the code**

**Edit:** `server/db/testing/structure.ts`

Replace:

```typescript
  );
}

/** Quotes a catalog identifier for use in test SQL. */
export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
```

With:

```typescript
  );
}

/**
 * Tables Fynix writes that are not covered by the audit rule. `audit_log` is where the rows go, and `email_outbox` is
 * plumbing: the invite email is queued in the same transaction as the invite, which is audited.
 */
export const AUDIT_EXEMPT_TABLES: readonly string[] = ["audit_log", "email_outbox"];

/**
 * Tables `leads_fynix` can insert into, update or delete from that have no enabled, deferred `audit_required` constraint
 * trigger on both INSERT and UPDATE. Without it a Fynix change could commit with no audit_log row, so every table Fynix
 * gets a write grant on (now or in a later phase) must add the trigger in its grants migration.
 */
export function fynixWritableTablesWithoutAuditTrigger(executor: Executor, exempt: readonly string[] = AUDIT_EXEMPT_TABLES): Promise<string[]> {
  return offenders(
    executor,
    sql`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not in (${sql.raw(quoted(exempt.length === 0 ? [""] : exempt))})
          and (has_any_column_privilege('leads_fynix', c.oid, 'INSERT') or has_any_column_privilege('leads_fynix', c.oid, 'UPDATE')
            or has_table_privilege('leads_fynix', c.oid, 'DELETE'))
          and not exists (
            select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
            where t.tgrelid = c.oid and p.proname = 'audit_required' and t.tgconstraint <> 0 and t.tgdeferrable and t.tginitdeferred
              and t.tgenabled = 'O' and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0)
        order by 1`,
  );
}

/** Quotes a catalog identifier for use in test SQL. */
export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
```


**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
import type { DatabaseHandle } from "@/server/db/pool";
import { account, campaign, member, organisation, session, user, verification } from "@/server/db/schema";

export interface SeededOrganisation {
  readonly id: string;
```

With:

```typescript
import { createHash } from "node:crypto";
import { PLACEHOLDER_TERMS } from "@/lib/terms/placeholder";
import type { DatabaseHandle } from "@/server/db/pool";
import { account, agencyAlias, auditLog, campaign, emailOutbox, invite, member, organisation, session, termsAcceptance, termsDocument, user, verification } from "@/server/db/schema";

export interface SeededOrganisation {
  readonly id: string;
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  readonly resetToken: string;
}

/**
 * Two client organisations, two agencies and a campaign for every pairing, so each tenant has rows that are its own
 * and rows that belong to someone else. Every value is distinct and findable as plain text, which is what the leak
```

With:

```typescript
  readonly resetToken: string;
}

/** A pending invite, with the token that was never stored and the hash that was. */
export interface SeededInvite {
  readonly id: string;
  readonly organisation: SeededOrganisation;
  readonly email: string;
  readonly name: string;
  readonly token: string;
  readonly tokenHash: string;
}

/**
 * The phase 1C rows, seeded with users: the terms, one acceptance per user, an alias for each agency user, a pending invite
 * for a client and for an agency, two audit rows and a queued email that still holds its link. Every string below is
 * distinctive plain text, so the leak matrix can search for it, and no tenant may find any of them.
 */
export interface SeededDomain {
  readonly termsDocumentIds: Readonly<Record<"client" | "agency" | "fynix", string>>;
  readonly invites: readonly SeededInvite[];
  readonly aliases: readonly string[];
  readonly acceptanceAddresses: readonly string[];
  readonly auditMarkers: readonly string[];
  readonly outboxRecipient: string;
  readonly outboxLink: string;
}

/**
 * Two client organisations, two agencies and a campaign for every pairing, so each tenant has rows that are its own
 * and rows that belong to someone else. Every value is distinct and findable as plain text, which is what the leak
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  readonly agencies: readonly SeededOrganisation[];
  /** One user per organisation, each with a password hash, a live session token and a reset token. */
  readonly users: readonly SeededUser[];
}

function firstRow<T>(rows: readonly T[], what: string): T {
```

With:

```typescript
  readonly agencies: readonly SeededOrganisation[];
  /** One user per organisation, each with a password hash, a live session token and a reset token. */
  readonly users: readonly SeededUser[];
  /** The phase 1C rows. Empty (`null`) when the world was seeded without users. */
  readonly domain: SeededDomain | null;
}

function firstRow<T>(rows: readonly T[], what: string): T {
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
 * and a reset request would leave: a credential account, a live session and a reset token. The values are not valid
 * credentials; they exist so the leak matrix can search for them.
 */
async function seedUsers(owner: DatabaseHandle, organisations: readonly SeededOrganisation[]): Promise<SeededUser[]> {
  const { db } = owner;
  const users: SeededUser[] = [];
  for (const [index, organisation] of organisations.entries()) {
    const n = index + 1;
    const email = `person${n}@${organisation.publicRef.toLowerCase()}.example`;
```

With:

```typescript
 * and a reset request would leave: a credential account, a live session and a reset token. The values are not valid
 * credentials; they exist so the leak matrix can search for them.
 */
async function seedUsers(owner: DatabaseHandle, organisations: readonly SeededOrganisation[]): Promise<{ readonly users: SeededUser[]; readonly memberIds: Map<string, string> }> {
  const { db } = owner;
  const users: SeededUser[] = [];
  const memberIds = new Map<string, string>();
  for (const [index, organisation] of organisations.entries()) {
    const n = index + 1;
    const email = `person${n}@${organisation.publicRef.toLowerCase()}.example`;
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
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
  const { db } = owner;
  const insertOrganisation = async (publicRef: string, kind: "fynix" | "client" | "agency", name: string, brandName: string | null): Promise<SeededOrganisation> => {
    const row = firstRow(
```

With:

```typescript
    await db.insert(account).values({ accountId: row.id, providerId: "credential", userId: row.id, password: passwordHash });
    await db.insert(session).values({ token: sessionToken, userId: row.id, expiresAt: new Date(Date.now() + 3_600_000) });
    await db.insert(verification).values({ identifier: `reset-password:${resetToken}`, value: row.id, expiresAt: new Date(Date.now() + 3_600_000) });
    const memberRow = firstRow(await db.insert(member).values({ userId: row.id, orgId: organisation.id, orgKind: organisation.kind, displayName: name }).returning({ id: member.id }), `member ${email}`);
    memberIds.set(row.id, memberRow.id);
    users.push({ id: row.id, email, name, organisation, passwordHash, sessionToken, resetToken });
  }
  return { users, memberIds };
}

/** The base-32 SHA-256 the app stores for an invite token (server/domain/invite-token.ts), written out so the seed needs no app code. */
function hashSeedToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

async function seedDomain(owner: DatabaseHandle, world: Pick<SeedWorld, "fynix" | "kestrel" | "northgate">, seeded: { readonly users: readonly SeededUser[]; readonly memberIds: ReadonlyMap<string, string> }): Promise<SeededDomain> {
  const { db } = owner;
  const fynixUser = firstRow(seeded.users.filter((person) => person.organisation.kind === "fynix"), "the Fynix user");

  const documents = {} as Record<"client" | "agency" | "fynix", string>;
  for (const party of ["client", "agency", "fynix"] as const) {
    const text = PLACEHOLDER_TERMS[party];
    documents[party] = firstRow(await db.insert(termsDocument).values({ party, version: 1, title: text.title, body: text.body, placeholder: true }).returning({ id: termsDocument.id }), `terms ${party}`).id;
  }

  const acceptanceAddresses: string[] = [];
  const aliases: string[] = [];
  for (const [index, person] of seeded.users.entries()) {
    const address = `203.0.113.${index + 1}`;
    acceptanceAddresses.push(address);
    await db.insert(termsAcceptance).values({ userId: person.id, documentId: documents[person.organisation.kind], party: person.organisation.kind, networkAddress: address });
    if (person.organisation.kind === "agency") {
      const alias = `Seedalias ${index + 1}, Fynix`;
      aliases.push(alias);
      const memberId = seeded.memberIds.get(person.id);
      if (memberId === undefined) throw new Error(`No member was seeded for ${person.email}`);
      await db.insert(agencyAlias).values({ memberId, alias });
    }
  }

  const invites: SeededInvite[] = [];
  const pending = [
    { organisation: world.kestrel, email: "invitee.client@seed-invite.example", name: "Invitee Client Seed", alias: null },
    { organisation: world.northgate, email: "invitee.agency@seed-invite.example", name: "Invitee Agency Seed", alias: "Seedinvite alias, Fynix" },
  ] as const;
  for (const [index, row] of pending.entries()) {
    const token = `INVITE-TOKEN-${index + 1}-not-a-real-token-0123456789abcdef`;
    const tokenHash = hashSeedToken(token);
    const created = firstRow(
      await db
        .insert(invite)
        .values({ orgId: row.organisation.id, orgKind: row.organisation.kind, email: row.email, name: row.name, alias: row.alias, tokenHash, expiresAt: new Date(Date.now() + 7 * 86_400_000), createdBy: fynixUser.id })
        .returning({ id: invite.id }),
      `invite ${row.email}`,
    );
    invites.push({ id: created.id, organisation: row.organisation, email: row.email, name: row.name, token, tokenHash });
    if (row.alias !== null) aliases.push(row.alias);
  }

  const auditMarkers = ["AUDIT-BEFORE-MARKER-1 renamed from Kestrel Freight", "AUDIT-AFTER-MARKER-2 the secret internal note"];
  await db.insert(auditLog).values({ actorUserId: fynixUser.id, action: "campaign.update", subjectTable: "campaign", subjectId: fynixUser.id, subjectRef: "CMP-7Q2X", before: { note: auditMarkers[0] }, after: { note: auditMarkers[1] } });

  const outboxRecipient = "outbox.recipient@seed-outbox.example";
  const outboxLink = "https://seed.example/accept-invite?token=OUTBOX-LINK-not-a-real-token";
  await db.insert(emailOutbox).values({ recipient: outboxRecipient, template: "invite", subject: "Seeded invite", body: "Seeded body", params: {}, link: outboxLink });

  return { termsDocumentIds: documents, invites, aliases, acceptanceAddresses, auditMarkers, outboxRecipient, outboxLink };
}

/**
 * Writes through the owner connection, which bypasses row-level security. Test and dev databases only. Users are seeded
 * unless `withUsers` is false, which the auth tests use because they create real users through the account grant. The
 * phase 1C rows (`domain`) are seeded with the users unless `withDomain` is false, which `pnpm db:seed` uses: a development
 * database has no use for a fake audit row or a queued email.
 */
export async function seedWorld(owner: DatabaseHandle, options: { readonly withUsers?: boolean; readonly withDomain?: boolean } = {}): Promise<SeedWorld> {
  const { db } = owner;
  const insertOrganisation = async (publicRef: string, kind: "fynix" | "client" | "agency", name: string, brandName: string | null): Promise<SeededOrganisation> => {
    const row = firstRow(
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
    await insertCampaign("CMP-2V5Z", "Frozen food distributors", "INTERNAL-NOTE renewal in March", halden, northgate),
  ] as const;

  const users = options.withUsers === false ? [] : await seedUsers(owner, [fynix, kestrel, halden, brightpath, northgate]);
  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate], users };
}
```

With:

```typescript
    await insertCampaign("CMP-2V5Z", "Frozen food distributors", "INTERNAL-NOTE renewal in March", halden, northgate),
  ] as const;

  const seeded = options.withUsers === false ? null : await seedUsers(owner, [fynix, kestrel, halden, brightpath, northgate]);
  const domain = seeded === null || options.withDomain === false ? null : await seedDomain(owner, { fynix, kestrel, northgate }, seeded);
  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate], users: seeded?.users ?? [], domain };
}
```


**Edit:** `server/db/testing/leak-matrix.ts`

Replace:

```typescript
  { name: "write: move a member to another organisation", statement: "update member set org_id = org_id", expectedError: DENIED_TABLE },
  { name: "write: queue an email", statement: "insert into email_outbox (recipient, template, subject, body) values ('a@example.com', 'password_reset', 's', 'b')", expectedError: DENIED_TABLE },
  { name: "write: reset a rate limit", statement: "delete from rate_limit", expectedError: DENIED_TABLE },
];

/**
```

With:

```typescript
  { name: "write: move a member to another organisation", statement: "update member set org_id = org_id", expectedError: DENIED_TABLE },
  { name: "write: queue an email", statement: "insert into email_outbox (recipient, template, subject, body) values ('a@example.com', 'password_reset', 's', 'b')", expectedError: DENIED_TABLE },
  { name: "write: reset a rate limit", statement: "delete from rate_limit", expectedError: DENIED_TABLE },
  // Phase 1C: the domain tables, and the campaign requirement columns that stay hidden until phase 1E grants them.
  { name: "invites: every invite", statement: "select * from invite", expectedError: DENIED_TABLE },
  { name: "invites: the invited address and name", statement: "select email, name from invite", expectedError: DENIED_TABLE },
  { name: "invites: the token hash", statement: "select token_hash from invite", expectedError: DENIED_TABLE },
  { name: "invites: probe by the hash in WHERE", statement: "select id from invite where token_hash like 'a%'", expectedError: DENIED_TABLE },
  { name: "write: redeem an invite", statement: "update invite set redeemed_at = now()", expectedError: DENIED_TABLE },
  { name: "write: issue an invite", statement: "insert into invite (org_id, org_kind, email, name, token_hash, expires_at, created_by) values (gen_random_uuid(), 'client', 'x@example.com', 'x', 'x', now(), gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "terms: documents", statement: "select * from terms_document", expectedError: DENIED_TABLE },
  { name: "terms: acceptances and the addresses they came from", statement: "select user_id, network_address from terms_acceptance", expectedError: DENIED_TABLE },
  { name: "write: accept terms as someone else", statement: "insert into terms_acceptance (user_id, document_id, party, network_address) values (gen_random_uuid(), gen_random_uuid(), 'client', 'x')", expectedError: DENIED_TABLE },
  { name: "write: publish terms", statement: "insert into terms_document (party, version, title, body) values ('client', 9, 'x', 'x')", expectedError: DENIED_TABLE },
  { name: "aliases: every alias", statement: "select * from agency_alias", expectedError: DENIED_TABLE },
  { name: "aliases: which member has which alias", statement: "select member_id, alias from agency_alias", expectedError: DENIED_TABLE },
  { name: "write: give a member an alias", statement: "insert into agency_alias (member_id, alias) values (gen_random_uuid(), 'Someone, Fynix')", expectedError: DENIED_TABLE },
  { name: "audit: every row", statement: "select * from audit_log", expectedError: DENIED_TABLE },
  { name: "audit: before and after", statement: "select before, after from audit_log", expectedError: DENIED_TABLE },
  { name: "write: add an audit row", statement: "insert into audit_log (action, subject_table, subject_id) values ('x.y', 'campaign', gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "write: change the audit log", statement: "update audit_log set action = 'x.y'", expectedError: DENIED_TABLE },
  { name: "write: erase the audit log", statement: "delete from audit_log", expectedError: DENIED_TABLE },
  { name: "outbox: the link a message carries", statement: "select link from email_outbox", expectedError: DENIED_TABLE },
  { name: "outbox: who was written to", statement: "select recipient, subject from email_outbox", expectedError: DENIED_TABLE },
  { name: "write: cancel a message", statement: "update email_outbox set status = 'cancelled'", expectedError: DENIED_TABLE },
  { name: "campaign: the ideal customer profile", statement: "select icp from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: the instructions", statement: "select instructions from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: the BANT criteria", statement: "select bant_budget, bant_authority, bant_need, bant_timeline from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: geography, industries, titles, seniority, technologies and size", statement: "select geography, industries, job_titles, seniority, technologies, company_size from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: probe by a requirement in WHERE", statement: "select id from campaign where icp <> ''", expectedError: DENIED_TABLE },
];

/**
```

**Edit:** `server/db/testing/leak-matrix.ts`

Replace:

```typescript
  // Phase 1B: no tenant role reads anything about any user, its own colleagues included. Phase 1E gives tenants a
  // column-limited read of their organisation-mates through `member`, and narrows this loop to the other side's users.
  for (const person of world.users) tokens.push(person.id, person.email, person.name, person.passwordHash, person.sessionToken, person.resetToken);
  return [...new Set(tokens)];
}
```

With:

```typescript
  // Phase 1B: no tenant role reads anything about any user, its own colleagues included. Phase 1E gives tenants a
  // column-limited read of their organisation-mates through `member`, and narrows this loop to the other side's users.
  for (const person of world.users) tokens.push(person.id, person.email, person.name, person.passwordHash, person.sessionToken, person.resetToken);
  // Phase 1C: no tenant role reads an invite, an alias, an acceptance, the audit log or the outbox. Phase 1E gives each
  // tenant its own acceptances and its own alias, and narrows this to the other side's.
  const { domain } = world;
  if (domain !== null) {
    for (const row of domain.invites) tokens.push(row.id, row.email, row.name, row.token, row.tokenHash);
    tokens.push(...domain.aliases, ...domain.acceptanceAddresses, ...domain.auditMarkers, domain.outboxRecipient, domain.outboxLink, ...Object.values(domain.termsDocumentIds));
  }
  return [...new Set(tokens)];
}
```


`pnpm db:seed` fills a development database, which has no use for a fake audit row or a queued email, so it opts out of the new rows:

**Edit:** `scripts/db-seed.ts`

Replace:

```typescript
  try {
    const existing = await owner.db.select({ n: count() }).from(organisation);
    if ((existing[0]?.n ?? 0) > 0) throw new Error("The dev database already holds organisations, so nothing was seeded.");
    const world = await seedWorld(owner);
    console.log(`Seeded ${world.clients.length} clients, ${world.agencies.length} agencies and ${world.campaigns.length} campaigns.`);
  } finally {
    await owner.close();
```

With:

```typescript
  try {
    const existing = await owner.db.select({ n: count() }).from(organisation);
    if ((existing[0]?.n ?? 0) > 0) throw new Error("The dev database already holds organisations, so nothing was seeded.");
    const world = await seedWorld(owner, { withDomain: false });
    console.log(`Seeded ${world.clients.length} clients, ${world.agencies.length} agencies and ${world.campaigns.length} campaigns.`);
  } finally {
    await owner.close();
```


- [ ] **Step 3: Run the tests and the checks**

```bash
pnpm test:integration
pnpm lint && pnpm typecheck && pnpm test
```

Expected: `pnpm test:integration`: 10 files, 351 tests pass; `pnpm test`: 64 files, 745 tests pass; lint and typecheck clean. The 26 new probes run for both tenant roles and both organisations of each kind, so the leak matrix grows by 26 tests per role.

- [ ] **Step 4: Commit**

```bash
git add server/db scripts/db-seed.ts
git commit -m "Check that every Fynix-writable table audits, seed the domain rows and probe them in the leak matrix"
```

## Task 5: The domain foundation: errors, audit, the Fynix write helper and the test rig

**Files:** create `server/auth/auth-database.ts`, `server/domain/errors.ts`, `audit.ts`, `deps.ts`, `fynix-write.ts`, `testing.ts`, `fynix-write.integration.test.ts`; modify `server/auth/create-auth.ts`, `membership.ts`, `create-account.ts`.

- **`AuthDatabase`** is the four statement builders a pool and a transaction share. `createAuth`, `readMembership` and `createAccountWithGrant` take it instead of `Database`, so Better Auth can run on a transaction (decision C1). A throwaway test run for this plan created an account inside a transaction through `createAccountWithGrant`, threw, and found no user afterwards; it committed and found one. The whole throwaway file, connections included, ran in 714 ms.
- **`fynixWrite(db, actor, work)`** is the one way a Fynix admin changes anything: the Fynix scope transaction (`app.user_id` is the actor) and an `audit` function that writes into it. **`fynixRead`** is the same scope for a read.
- **`DomainDeps`** is what every service takes (the Architecture paragraph says what is in it).
- **`DomainError`** is an expected refusal with a code; its message never holds an address, a name or a token.

- [ ] **Step 1: Write the test and its support**

`server/domain/testing.ts` is the rig every domain integration test opens: the test databases, the seeded world (organisations, campaigns and one user each, without the phase 1C rows), a clock a test can move, and a fake breach service.

**File:** `server/domain/testing.ts`

```typescript
import { randomFillSync } from "node:crypto";
import { createAuth } from "@/server/auth/create-auth";
import { FakeBreachChecker, TEST_ORIGIN, TEST_SECRET } from "@/server/auth/testing";
import { openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";
import type { RandomBytes } from "@/lib/domain/public-ref";
import type { DomainDeps } from "@/server/domain/deps";
import type { FynixActor } from "@/server/domain/fynix-write";

/** Test harness for the domain integration tests: the test database, the seeded world, a clock a test can move and a fake breach service. */

const cryptoBytes: RandomBytes = (count) => randomFillSync(new Uint8Array(count));

export interface DomainRig {
  readonly dbs: TestDatabases;
  readonly breach: FakeBreachChecker;
  readonly clock: { now: Date };
  /** The seeded Fynix admin. */
  readonly actor: FynixActor;
  /** Empties the database and seeds the world again (organisations, campaigns and one user each, no phase 1C rows). Call it in `beforeEach`. */
  reset(): Promise<SeedWorld>;
  /** The seeded world as of the last `reset`. */
  world(): SeedWorld;
  deps(overrides?: Partial<DomainDeps>): DomainDeps;
  close(): Promise<void>;
}

export function openDomainRig(): DomainRig {
  const dbs = openTestDatabases();
  const breach = new FakeBreachChecker();
  const clock = { now: new Date() };
  let current: SeedWorld | undefined;
  const world = (): SeedWorld => {
    if (current === undefined) throw new Error("Call rig.reset() before using the world");
    return current;
  };
  return {
    dbs,
    breach,
    clock,
    get actor(): FynixActor {
      const user = world().users[0];
      if (user === undefined) throw new Error("The seed world has no Fynix user");
      return { userId: user.id };
    },
    async reset() {
      await resetDatabase(dbs.owner);
      clock.now = new Date();
      breach.breached.clear();
      breach.unavailable = false;
      current = await seedWorld(dbs.owner, { withDomain: false });
      return current;
    },
    world,
    deps: (overrides = {}) => ({
      fynixDb: dbs.roles.leads_fynix.db,
      authDb: dbs.roles.leads_auth.db,
      publicDb: dbs.roles.leads_public.db,
      now: () => clock.now,
      randomBytes: cryptoBytes,
      origin: TEST_ORIGIN,
      allowPlaceholderTerms: true,
      authFactory: (db) =>
        createAuth({
          db,
          secret: TEST_SECRET,
          baseURL: TEST_ORIGIN,
          breachChecker: breach,
          mailer: { sendPasswordReset: async () => { throw new Error("A reset email is never sent while an invite is redeemed."); } },
          nextCookies: false,
        }),
      ...overrides,
    }),
    close: () => dbs.closeAll(),
  };
}
```


**File:** `server/domain/fynix-write.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, organisation } from "@/server/db/schema";
import { captureErrorText } from "@/server/db/testing";
import { fynixRead, fynixWrite } from "@/server/domain/fynix-write";
import { openDomainRig } from "@/server/domain/testing";

/** The Fynix write helper: the scope, the audit row in the same transaction, and the rule that a change cannot commit without one. */

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const auditRows = () => rig.dbs.owner.db.select().from(auditLog);
const refs = async (): Promise<string[]> => (await rig.dbs.owner.db.select({ ref: organisation.publicRef }).from(organisation)).map((row) => row.ref);
const NEW = { publicRef: "ORG-3C4D", kind: "agency", name: "Ridgeway Ltd" } as const;

describe("fynixWrite", () => {
  it("writes the change and its audit row together, in the admin's name and as the Fynix role", async () => {
    const created = await fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
      const [row] = await tx.insert(organisation).values(NEW).returning({ id: organisation.id });
      if (row === undefined) throw new Error("no row");
      await audit({ action: "organisation.create", subject: { table: "organisation", id: row.id, ref: NEW.publicRef }, before: null, after: { ref: NEW.publicRef, name: NEW.name } });
      return row.id;
    });
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: rig.actor.userId,
      actorRole: "leads_fynix",
      action: "organisation.create",
      subjectTable: "organisation",
      subjectId: created,
      subjectRef: "ORG-3C4D",
      before: null,
      after: { ref: "ORG-3C4D", name: "Ridgeway Ltd" },
    });
    expect(rows[0]?.at).toBeInstanceOf(Date);
    expect(await refs()).toContain("ORG-3C4D");
  });

  it("rolls back the audit row with the change when the work fails", async () => {
    const message = await captureErrorText(
      fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
        await tx.insert(organisation).values(NEW);
        await audit({ action: "organisation.create", subject: { table: "organisation", id: rig.actor.userId } });
        throw new Error("the work failed after the audit row");
      }),
    );
    expect(message).toContain("the work failed after the audit row");
    expect(await auditRows()).toEqual([]);
    expect(await refs()).not.toContain("ORG-3C4D");
  });

  it("cannot commit a change that has no audit row, and leaves nothing behind", async () => {
    const message = await captureErrorText(fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx }) => void (await tx.insert(organisation).values(NEW))));
    expect(message).toContain("A change to organisation by Fynix has no audit_log row in its transaction");
    expect(await auditRows()).toEqual([]);
    expect(await refs()).not.toContain("ORG-3C4D");
  });

  it("accepts several audit rows for one transaction, each with its own subject", async () => {
    await fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
      await tx.update(organisation).set({ name: "Renamed Ltd" }).where(eq(organisation.publicRef, "ORG-4K9P"));
      await audit({ action: "organisation.update", subject: { table: "organisation", id: rig.actor.userId, ref: "ORG-4K9P" } });
      await audit({ action: "organisation.update", subject: { table: "organisation", id: rig.actor.userId, ref: "ORG-8H3D" } });
    });
    expect((await auditRows()).map((row) => row.subjectRef).sort()).toEqual(["ORG-4K9P", "ORG-8H3D"]);
  });

  it("refuses an actor who is not a UUID before it opens a transaction", async () => {
    await expect(fynixWrite(rig.dbs.roles.leads_fynix.db, { userId: "not-a-uuid" }, async () => 1)).rejects.toThrow("userId must be a UUID");
  });
});

describe("fynixRead", () => {
  it("reads with the Fynix scope and appends nothing", async () => {
    const rows = await fynixRead(rig.dbs.roles.leads_fynix.db, rig.actor, (tx) => tx.select({ ref: organisation.publicRef }).from(organisation));
    expect(rows).toHaveLength(5);
    expect(await auditRows()).toEqual([]);
  });
});
```


Run `pnpm exec vitest run --config vitest.integration.config.mts server/domain`. Expected: FAIL: `Cannot find package '@/server/domain/fynix-write' imported from .../fynix-write.integration.test.ts`.

- [ ] **Step 2: Write the code**

**File:** `server/auth/auth-database.ts`

```typescript
import type { Database } from "@/server/db/pool";

/**
 * What Better Auth and the membership read need from a database: the four statement builders. A pooled `leads_auth`
 * database fits, and so does a transaction on it (`Database["transaction"]`'s callback argument). Invite redemption runs
 * Better Auth on a transaction so the new account, the membership and the acceptance of the terms commit together or not
 * at all (server/domain/redeem-invite.ts).
 */
export type AuthDatabase = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;
```


**Edit:** `server/auth/create-auth.ts`

Replace:

```typescript
import { PASSWORD_RESET_LIFETIME_SECONDS, SESSION_LIFETIME_SECONDS, sessionLifetimeSeconds } from "@/lib/auth/session-lifetime";
import { hasAccountCreationGrant } from "@/server/auth/account-creation-grant";
import { BreachCheckUnavailableError, type BreachChecker } from "@/server/auth/breach-check";
import type { ResetMailer } from "@/server/auth/mail";
import { readMembership } from "@/server/auth/membership";
import type { Database } from "@/server/db/pool";
import { account, session, user, verification } from "@/server/db/schema";

export const MIN_SECRET_LENGTH = 32;
```

With:

```typescript
import { PASSWORD_RESET_LIFETIME_SECONDS, SESSION_LIFETIME_SECONDS, sessionLifetimeSeconds } from "@/lib/auth/session-lifetime";
import { hasAccountCreationGrant } from "@/server/auth/account-creation-grant";
import { BreachCheckUnavailableError, type BreachChecker } from "@/server/auth/breach-check";
import type { AuthDatabase } from "@/server/auth/auth-database";
import type { ResetMailer } from "@/server/auth/mail";
import { readMembership } from "@/server/auth/membership";
import { account, session, user, verification } from "@/server/db/schema";

export const MIN_SECRET_LENGTH = 32;
```

**Edit:** `server/auth/create-auth.ts`

Replace:

```typescript
const BETTER_AUTH_PUBLIC_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";

export interface AuthConfig {
  /** The `leads_auth` database: the only role that may touch the auth tables. */
  readonly db: Database;
  readonly secret: string;
  /** The origin this app is served from, for example `https://leads.fynix.digital`. Also the only trusted origin. */
  readonly baseURL: string;
```

With:

```typescript
const BETTER_AUTH_PUBLIC_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";

export interface AuthConfig {
  /** The `leads_auth` database, or a transaction on it: the only role that may touch the auth tables. */
  readonly db: AuthDatabase;
  readonly secret: string;
  /** The origin this app is served from, for example `https://leads.fynix.digital`. Also the only trusted origin. */
  readonly baseURL: string;
```


**Edit:** `server/auth/membership.ts`

Replace:

```typescript
import { eq } from "drizzle-orm";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import type { Database } from "@/server/db/pool";
import { member } from "@/server/db/schema";

/** What session resolution needs to know about a user: which organisation, of what kind, in what role, active or not. */
```

With:

```typescript
import { eq } from "drizzle-orm";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import type { AuthDatabase } from "@/server/auth/auth-database";
import { member } from "@/server/db/schema";

/** What session resolution needs to know about a user: which organisation, of what kind, in what role, active or not. */
```

**Edit:** `server/auth/membership.ts`

Replace:

```typescript
 * database: that role may read exactly these five columns of `member` and nothing else on it, and the column list below
 * is the same five (a `select()` with no columns would be refused).
 */
export async function readMembership(db: Database, userId: string): Promise<Membership | null> {
  const rows = await db
    .select({ userId: member.userId, orgId: member.orgId, orgKind: member.orgKind, role: member.role, status: member.status })
    .from(member)
```

With:

```typescript
 * database: that role may read exactly these five columns of `member` and nothing else on it, and the column list below
 * is the same five (a `select()` with no columns would be refused).
 */
export async function readMembership(db: AuthDatabase, userId: string): Promise<Membership | null> {
  const rows = await db
    .select({ userId: member.userId, orgId: member.orgId, orgKind: member.orgKind, role: member.role, status: member.status })
    .from(member)
```


**Edit:** `server/auth/create-account.ts`

Replace:

```typescript
import { and, eq } from "drizzle-orm";
import { normaliseEmail } from "@/lib/auth/email";
import { withAccountCreationGrant } from "@/server/auth/account-creation-grant";
import type { Auth } from "@/server/auth/create-auth";
import type { Database } from "@/server/db/pool";
import { user } from "@/server/db/schema";

export class AccountAlreadyExistsError extends Error {
```

With:

```typescript
import { and, eq } from "drizzle-orm";
import { normaliseEmail } from "@/lib/auth/email";
import { withAccountCreationGrant } from "@/server/auth/account-creation-grant";
import type { AuthDatabase } from "@/server/auth/auth-database";
import type { Auth } from "@/server/auth/create-auth";
import { user } from "@/server/db/schema";

export class AccountAlreadyExistsError extends Error {
```

**Edit:** `server/auth/create-account.ts`

Replace:

```typescript
 * read back by id and address before anything is returned. A weak or breached password rejects with Better Auth's
 * error (see server/auth/errors.ts for the codes).
 *
 * `authDb` is the `leads_auth` database, the same one `auth` runs on.
 */
export async function createAccountWithGrant(auth: Auth, authDb: Database, account: NewAccount): Promise<CreatedAccount> {
  const email = normaliseEmail(account.email);
  const result = await withAccountCreationGrant(email, () => auth.api.signUpEmail({ body: { name: account.name, email, password: account.password } }));
```

With:

```typescript
 * read back by id and address before anything is returned. A weak or breached password rejects with Better Auth's
 * error (see server/auth/errors.ts for the codes).
 *
 * `authDb` is the `leads_auth` database or transaction, the same one `auth` runs on.
 */
export async function createAccountWithGrant(auth: Auth, authDb: AuthDatabase, account: NewAccount): Promise<CreatedAccount> {
  const email = normaliseEmail(account.email);
  const result = await withAccountCreationGrant(email, () => auth.api.signUpEmail({ body: { name: account.name, email, password: account.password } }));
```


**File:** `server/domain/errors.ts`

```typescript
/**
 * Why a domain action was refused. A `DomainError` is an expected outcome the screen words for the person (a duplicate, a
 * wrong state, an archived organisation), as opposed to a fault, which is any other error. The message is for a log or a
 * developer and never carries an email address, a name or a token.
 */
export type DomainErrorCode =
  | "invalid-input"
  | "not-found"
  | "organisation-archived"
  | "email-in-use"
  | "no-current-terms"
  | "placeholder-terms"
  | "alias-taken"
  | "invalid-transition"
  | "cannot-suspend-self"
  | "invite-not-live"
  | "ref-exhausted";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** True for a unique-violation (23505) anywhere in the cause chain, optionally for one named constraint. Drizzle wraps the driver error. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 10; current = current.cause, depth += 1) {
    const { code, constraint: name } = current as { code?: unknown; constraint?: unknown };
    if (code === "23505" && (constraint === undefined || name === constraint)) return true;
  }
  return false;
}
```


**File:** `server/domain/audit.ts`

```typescript
import type { ScopedTransaction } from "@/server/db/scope";
import { auditLog } from "@/server/db/schema";

/**
 * Every action a Fynix admin can take, as `<table>.<verb>`. The database checks the shape (`audit_log_action_format`);
 * this list is what the services may write.
 */
export const AUDIT_ACTIONS = [
  "organisation.create",
  "organisation.update",
  "organisation.archive",
  "organisation.restore",
  "campaign.create",
  "campaign.update",
  "campaign.archive",
  "campaign.restore",
  "invite.issue",
  "invite.revoke",
  "member.suspend",
  "member.reactivate",
  "member.rename",
  "agency_alias.set",
  "terms.publish",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditSubjectTable = "organisation" | "campaign" | "invite" | "member" | "agency_alias" | "terms_document";

export type Json = string | number | boolean | null | readonly Json[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: Json;
}

export interface AuditEntry {
  readonly action: AuditAction;
  readonly subject: { readonly table: AuditSubjectTable; readonly id: string; readonly ref?: string | null };
  /** The public-safe state before the change: a snapshot from server/domain/snapshots.ts, never a raw row. */
  readonly before?: Json | null;
  readonly after?: Json | null;
}

/**
 * Appends one row to the audit log inside the caller's transaction. The actor, the role and the time come from the request
 * scope and the connection (column defaults), not from the caller, and the policy refuses any other value.
 */
export async function appendAudit(tx: ScopedTransaction, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    action: entry.action,
    subjectTable: entry.subject.table,
    subjectId: entry.subject.id,
    subjectRef: entry.subject.ref ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
```


**File:** `server/domain/deps.ts`

```typescript
import type { RandomBytes } from "@/lib/domain/public-ref";
import type { AuthDatabase } from "@/server/auth/auth-database";
import type { Auth } from "@/server/auth/create-auth";
import type { Database } from "@/server/db/pool";

/**
 * What the domain services run on, passed in so a test can use the test database, a fixed clock and a fake breach service,
 * and so no service reads the environment itself. The running app builds it once (server/domain/index.ts).
 */
export interface DomainDeps {
  /** The `leads_fynix` database: every admin action. */
  readonly fynixDb: Database;
  /** The `leads_auth` database: invite redemption, the terms read and the outbox sender. */
  readonly authDb: Database;
  /** The `leads_public` database: rate limits, which run outside any transaction. */
  readonly publicDb: Database;
  readonly now: () => Date;
  /** Randomness for invite tokens and public references. */
  readonly randomBytes: RandomBytes;
  /** The origin links in email point at, for example `https://leads.fynix.digital`. */
  readonly origin: string;
  /** False on an https deployment: gate G2, no invite while a party's current terms are still placeholder text. */
  readonly allowPlaceholderTerms: boolean;
  /** A Better Auth instance on the given database or transaction. Redemption runs it on a transaction. */
  readonly authFactory: (db: AuthDatabase) => Auth;
}
```


**File:** `server/domain/fynix-write.ts`

```typescript
import type { Database } from "@/server/db/pool";
import { withScope, type ScopedTransaction } from "@/server/db/scope";
import { appendAudit, type AuditEntry } from "@/server/domain/audit";

/** The admin the request belongs to: the `user.id` of the signed-in Fynix member. */
export interface FynixActor {
  readonly userId: string;
}

/** What a Fynix write callback gets: the transaction, and the way to append to the audit log inside it. */
export interface FynixWrite {
  readonly tx: ScopedTransaction;
  audit(entry: AuditEntry): Promise<void>;
}

/**
 * The one way a Fynix admin changes anything. It opens the Fynix scope transaction (`app.user_id` is the actor, so the
 * audit rows are in the admin's name) and hands the callback an `audit` function that writes into the same transaction,
 * so a change and its audit row commit together or not at all. If the callback changes a domain table and never calls
 * `audit`, the database refuses the commit (`audit_required`, migration 0012): the rule does not depend on anyone
 * remembering. `db` is the `leads_fynix` database.
 *
 * Services never call `withScope` or `withFynixScope` for a write themselves; a source test (server/domain/boundaries.test.ts)
 * fails if one does.
 */
export async function fynixWrite<T>(db: Database, actor: FynixActor, work: (write: FynixWrite) => Promise<T>): Promise<T> {
  return withScope(db, { orgId: null, userId: actor.userId }, (tx) => work({ tx, audit: (entry) => appendAudit(tx, entry) }));
}

/** A Fynix read: the same scope, no audit. A change made inside it is refused at commit, like any unaudited Fynix change. */
export async function fynixRead<T>(db: Database, actor: FynixActor, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withScope(db, { orgId: null, userId: actor.userId }, work);
}
```


- [ ] **Step 3: Run the tests and the checks**

```bash
pnpm exec vitest run --config vitest.integration.config.mts server/domain
pnpm test && pnpm test:integration
pnpm lint && pnpm typecheck
```

Expected: the targeted run passes (6 tests): the audit row carries the admin, the Fynix role, the action, the subject, the reference and the before and after; a failing callback rolls the audit row back with the change; a change with no audit row is refused at commit and leaves nothing behind. Then `pnpm test`: 64 files, 745 tests pass, `pnpm test:integration`: 11 files, 357 tests pass. Lint and typecheck clean (the widening of the three auth signatures compiled everywhere they are used).

- [ ] **Step 4: Commit**

```bash
git add server
git commit -m "Add the Fynix write helper with its audit row, the domain dependencies and the test rig"
```

## Task 6: The outbox, the Brevo transport and the reset mailer on templates

**Files:** create `server/mail/transport.ts`, `outbox.ts`, `brevo.ts`, `testing.ts`, `brevo.test.ts`, `outbox.test.ts`, `outbox.integration.test.ts`, `scripts/outbox-run.ts`; modify `server/auth/mail.ts`, `mail.test.ts`, `index.ts`, `testing.ts`, `password-reset.integration.test.ts`, `scripts/mail-last.ts`, `package.json`.

This task moves the 1B reset email onto the template system without changing what a person receives, and builds the part of the outbox that sends.

- **The reset flow keeps its behaviour.** The mailer now queues a template (`password_reset`, `expiresInMinutes: 60`) and the link; the message text is the 1B text, and the stored copy keeps "within 60 minutes" and drops the link. 1B's `devOutboxTransport` and `MailTransport` are gone: there is one outbox, and the transport (`server/mail/transport.ts`) is the thing that sends. `pnpm mail:last` prints the message as it will be sent while the link is still in the row, and the stored copy afterwards.
- **A transport never throws.** It returns `{ ok: true, providerId }` or `{ ok: false, permanent, reason }`. `drainOutbox` also catches a transport that does throw, records "the transport threw" and keeps the error text (which may hold an address or a link) out of the row. A failure to send is therefore recorded and retried, and never reaches the request that queued the message.
- **States:** `pending` (waiting its turn, or waiting for a retry), `sent`, `failed` (a permanent refusal, or the fifth failed attempt), `cancelled` (the invite it carried was revoked first). A run starts by failing every pending message whose link has gone unsent for a day. A pending row with no link is failed rather than sent, so the stored copy that says "the link is removed" can never go out.
- **Without a transport** (no Brevo key, development) a run purges and sends nothing.
- **Tests use `FakeTransport` and a fixed clock.** The clock is five seconds ahead of the database's: a row is queued with `next_attempt_at = now()` from the database and a run in the same millisecond with an application clock could see it as a hair in the future. Production does not care, since the next run takes it; the first version of these tests failed five of 21 on it.

- [ ] **Step 1: Write the tests**

**Edit:** `server/auth/mail.test.ts`

Replace:

```typescript
import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { devOutboxTransport, passwordResetMailer, passwordResetMessage, type MailMessage, type MailTransport } from "./mail";

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

describe("devOutboxTransport", () => {
  it("rethrows a failed insert without the SQL parameters, the recipient or the reset link", async () => {
    const token = "live-token-9f8e7d";
    const email = "victim@example.com";
    // drizzle-orm's DrizzleQueryError carries the query and its params in the message and in `params`, and chains the driver error as `cause`.
    const driverError = Object.assign(new Error(`connection terminated for ${email}`), { code: "57P01" });
    const failure = Object.assign(new Error(`Failed query: insert into "email_outbox" values ($1, $2)\nparams: ${email},https://x.example/reset-password?token=${token}`), {
      name: "DrizzleQueryError",
      params: [email, token],
      cause: driverError,
    });
    const db = { insert: () => ({ values: () => Promise.reject(failure) }) } as unknown as Database;

    const thrown = await devOutboxTransport(db)
      .send({ to: email, template: "password_reset", subject: "s", text: `https://x.example/reset-password?token=${token}` })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as Error;
    expect(error.message).toContain("Could not write the outbox message");
    const everything = [error.message, error.stack ?? "", JSON.stringify(Object.getOwnPropertyNames(error).map((key) => [key, String((error as unknown as Record<string, unknown>)[key])]))].join("\n");
    for (const secret of [token, email, "email_outbox", "params"]) expect(everything).not.toContain(secret);
    expect(error.cause).toBeUndefined();
    expect(Object.getOwnPropertyNames(error).sort()).toEqual(["message", "stack"].sort());
  });
});
```

With:

```typescript
import { describe, expect, it } from "vitest";
import type { QueuedEmail } from "@/server/mail/outbox";
import { passwordResetMailer } from "./mail";

function recordingOutbox(): { readonly outbox: { enqueue(email: QueuedEmail): Promise<void> }; readonly queued: QueuedEmail[] } {
  const queued: QueuedEmail[] = [];
  return { outbox: { enqueue: async (email) => void queued.push(email) }, queued };
}

describe("passwordResetMailer", () => {
  it("queues one message to the address, with a link to this app's reset page carrying the token", async () => {
    const { outbox, queued } = recordingOutbox();
    await passwordResetMailer(outbox, "https://leads.fynix.digital", 60).sendPasswordReset({ email: "a@example.com", token: "tok-123" });
    expect(queued).toEqual([{ to: "a@example.com", content: { template: "password_reset", params: { expiresInMinutes: 60 } }, link: "https://leads.fynix.digital/reset-password?token=tok-123" }]);
  });

  it("encodes a token that would otherwise change the link", async () => {
    const { outbox, queued } = recordingOutbox();
    await passwordResetMailer(outbox, "http://localhost:3020", 60).sendPasswordReset({ email: "a@example.com", token: "a&b=c d" });
    expect(queued[0]?.link).toBe("http://localhost:3020/reset-password?token=a%26b%3Dc+d");
  });

  it("says in the message how long the link works, from the lifetime it was given", async () => {
    const { outbox, queued } = recordingOutbox();
    await passwordResetMailer(outbox, "http://localhost:3020", 45).sendPasswordReset({ email: "a@example.com", token: "t" });
    expect(queued[0]?.content).toEqual({ template: "password_reset", params: { expiresInMinutes: 45 } });
  });
});
```


**File:** `server/mail/testing.ts`

```typescript
import type { MailTransport, OutgoingMail, SendResult } from "@/server/mail/transport";

/** A transport for tests: it never touches the network. It answers from a script (the last answer repeats) and records every message it is given. */
export class FakeTransport implements MailTransport {
  readonly sent: OutgoingMail[] = [];
  private position = 0;

  constructor(
    private readonly script: readonly (SendResult | "throw")[] = [{ ok: true, providerId: "fake-id" }],
    /** Runs while a message is being sent, for a test that looks at the row mid-send. */
    private readonly during?: (mail: OutgoingMail) => Promise<void>,
  ) {}

  async send(mail: OutgoingMail): Promise<SendResult> {
    this.sent.push(mail);
    await this.during?.(mail);
    const answer = this.script[Math.min(this.position, this.script.length - 1)];
    this.position += 1;
    if (answer === undefined || answer === "throw") throw new Error(`fake transport failure for ${mail.to} with a secret https://x.example/?token=SECRET`);
    return answer;
  }
}
```


**File:** `server/mail/brevo.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { BREVO_SEND_URL, MAIL_SENDER, brevoTransport } from "./brevo";

const MAIL = { to: "person@example.com", subject: "Hello", text: "plain", html: "<p>html</p>" };
const KEY = "xkeysib-unit-test-key-0123456789";

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
function fakeFetch(answer: () => Response | Promise<Response>): { readonly fetch: typeof fetch; readonly calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return answer();
    },
  };
}
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("brevoTransport", () => {
  it("posts the message to Brevo's transactional endpoint from hello@fynix.digital, with the key in a header only", async () => {
    const { fetch: send, calls } = fakeFetch(() => json(201, { messageId: "<202611121200.1@smtp-relay.brevo.com>" }));
    const result = await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL);
    expect(result).toEqual({ ok: true, providerId: "<202611121200.1@smtp-relay.brevo.com>" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(BREVO_SEND_URL);
    expect(calls[0]?.init.method).toBe("POST");
    expect((calls[0]?.init.headers as Record<string, string>)["api-key"]).toBe(KEY);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ sender: MAIL_SENDER, to: [{ email: "person@example.com" }], subject: "Hello", textContent: "plain", htmlContent: "<p>html</p>" });
    expect(MAIL_SENDER.email).toBe("hello@fynix.digital");
    expect(`${calls[0]?.url}${String(calls[0]?.init.body)}`).not.toContain(KEY);
  });

  it("accepts a success with no message id", async () => {
    const { fetch: send } = fakeFetch(() => new Response(null, { status: 201 }));
    expect(await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL)).toEqual({ ok: true, providerId: "accepted" });
  });

  it.each([
    [400, true],
    [422, true],
    [401, false],
    [403, false],
    [429, false],
    [500, false],
    [503, false],
  ])("treats a %s answer as permanent: %s", async (status, permanent) => {
    const { fetch: send } = fakeFetch(() => json(status, { code: "invalid_parameter", message: "Invalid email person@example.com" }));
    const result = await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL);
    expect(result).toEqual({ ok: false, permanent, reason: `brevo answered ${status} invalid_parameter` });
  });

  it("never puts the provider's message, the recipient or the key in a reason", async () => {
    const { fetch: send } = fakeFetch(() => json(400, { code: "invalid_parameter", message: `person@example.com rejected, key ${KEY}` }));
    const result = await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL);
    expect(JSON.stringify(result)).not.toContain("person@example.com");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("drops an error code that is not short lower-case words, rather than trusting it", async () => {
    const { fetch: send } = fakeFetch(() => json(400, { code: "person@example.com" }));
    expect(await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL)).toEqual({ ok: false, permanent: true, reason: "brevo answered 400" });
  });

  it("returns a transient failure for a network error and for a timeout, and never throws", async () => {
    const down = brevoTransport({ apiKey: KEY, fetch: async () => { throw new TypeError(`fetch failed for ${KEY}`); } });
    expect(await down.send(MAIL)).toEqual({ ok: false, permanent: false, reason: "brevo could not be reached" });
    const slow = brevoTransport({ apiKey: KEY, timeoutMs: 20, fetch: (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))) });
    expect(await slow.send(MAIL)).toEqual({ ok: false, permanent: false, reason: "brevo timed out" });
  });
});
```


**File:** `server/mail/outbox.test.ts`

```typescript
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
```


**File:** `server/mail/outbox.integration.test.ts`

```typescript
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLAIM_LEASE_SECONDS, MAX_SEND_ATTEMPTS } from "@/lib/email/backoff";
import type { EmailContent } from "@/lib/email/templates";
import { emailOutbox, invite } from "@/server/db/schema";
import { captureErrorText, queryAs } from "@/server/db/testing";
import { fynixWrite } from "@/server/domain/fynix-write";
import { openDomainRig } from "@/server/domain/testing";
import { cancelInviteMail, drainOutbox, enqueueEmail, outboxOn, purgeExpiredLinks, type QueuedEmail } from "@/server/mail/outbox";
import { FakeTransport } from "@/server/mail/testing";

/** The outbox state machine: pending, sent, failed and cancelled, the retry backoff, the link that never outlives its use, and two senders at once. */

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const authDb = () => rig.dbs.roles.leads_auth.db;
const RESET: EmailContent = { template: "password_reset", params: { expiresInMinutes: 60 } };
const queue = (to: string, link: string | null = `https://leads.example/reset-password?token=link-for-${to}`, extra: Partial<QueuedEmail> = {}) =>
  enqueueEmail(rig.dbs.roles.leads_public.db, { to, content: RESET, link, ...extra });
const rows = () =>
  rig.dbs.owner.db
    .select({ recipient: emailOutbox.recipient, status: emailOutbox.status, attempts: emailOutbox.attempts, link: emailOutbox.link, lastError: emailOutbox.lastError, providerId: emailOutbox.providerId, sentAt: emailOutbox.sentAt, nextAttemptAt: emailOutbox.nextAttemptAt })
    .from(emailOutbox)
    .orderBy(emailOutbox.recipient);
const only = async () => {
  const all = await rows();
  expect(all).toHaveLength(1);
  const [row] = all;
  if (row === undefined) throw new Error("no row");
  return row;
};
/**
 * The sender's clock, fixed per test and five seconds ahead of the database's: a row is queued with `next_attempt_at = now()`
 * from the database, and a run that starts in the same millisecond with a clock read from the application could see it as
 * a hair in the future. Production does not care (the next run takes it); a test would flake.
 */
let start = new Date();
beforeEach(() => {
  start = new Date(Date.now() + 5_000);
});
const at = (offsetSeconds: number): (() => Date) => () => new Date(start.getTime() + offsetSeconds * 1000);
const drain = (transport: FakeTransport | null, offsetSeconds = 0, batchSize?: number) => drainOutbox(authDb(), transport, { now: at(offsetSeconds), batchSize });

describe("queueing", () => {
  it("writes a pending row: the content, a stored copy without the link, and the link in its own column", async () => {
    await queue("a@example.com");
    const [row] = await rig.dbs.owner.db.select().from(emailOutbox);
    expect(row).toMatchObject({ recipient: "a@example.com", template: "password_reset", status: "pending", attempts: 0, params: { expiresInMinutes: 60 }, subject: "Reset your Fynix Leads password", link: "https://leads.example/reset-password?token=link-for-a@example.com" });
    expect(row?.body).toContain("within 60 minutes");
    expect(row?.body).not.toContain("http");
  });

  it("is written by leads_public, which can add a message and not read, change or remove one", async () => {
    const db = rig.dbs.roles.leads_public.db;
    await queue("a@example.com");
    for (const statement of ["select link from email_outbox", "select * from email_outbox", "update email_outbox set link = null", "delete from email_outbox"]) {
      expect(await captureErrorText(queryAs(db, null, statement)), statement).toContain("permission denied for table email_outbox");
    }
  });

  it("is written by Fynix inside a transaction, which can read the state of the queue and never the link", async () => {
    await fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
      await enqueueEmail(tx, { to: "b@example.com", content: RESET, link: "https://leads.example/reset-password?token=t" });
      await audit({ action: "organisation.update", subject: { table: "organisation", id: rig.actor.userId } });
    });
    const scope = { orgId: null, userId: rig.actor.userId };
    expect(await queryAs(rig.dbs.roles.leads_fynix.db, scope, "select recipient, status, attempts from email_outbox")).toEqual([{ recipient: "b@example.com", status: "pending", attempts: 0 }]);
    expect(await captureErrorText(queryAs(rig.dbs.roles.leads_fynix.db, scope, "select link from email_outbox"))).toContain("permission denied for table email_outbox");
  });

  it("keeps a link on a pending row only: a row that is sent, failed or cancelled with a link is refused", async () => {
    await queue("a@example.com");
    for (const status of ["sent", "failed", "cancelled"] as const) {
      const message = await captureErrorText(rig.dbs.owner.db.update(emailOutbox).set({ status }));
      expect(message, status).toContain("email_outbox_link_only_while_pending");
    }
  });
});

describe("sending", () => {
  it("sends a due message with its link, and records the provider id, the time and no link", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport([{ ok: true, providerId: "brevo-1" }]);
    const result = await drain(transport);
    expect(result).toEqual({ purged: 0, claimed: 1, sent: 1, retrying: 0, failed: 0 });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ to: "a@example.com", subject: "Reset your Fynix Leads password" });
    expect(transport.sent[0]?.text).toContain("https://leads.example/reset-password?token=link-for-a@example.com");
    expect(transport.sent[0]?.html).toContain('href="https://leads.example/reset-password?token=link-for-a@example.com"');
    const row = await only();
    expect(row).toMatchObject({ status: "sent", attempts: 1, link: null, lastError: null, providerId: "brevo-1" });
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  it("sends nothing twice: a second run finds nothing due", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport();
    await drain(transport);
    expect(await drain(transport)).toEqual({ purged: 0, claimed: 0, sent: 0, retrying: 0, failed: 0 });
    expect(transport.sent).toHaveLength(1);
  });

  it("holds a claimed message for the lease while it is being sent, and counts the attempt", async () => {
    await queue("a@example.com");
    let midSend: Awaited<ReturnType<typeof rows>>[number] | undefined;
    const transport = new FakeTransport([{ ok: true, providerId: "x" }], async () => void (midSend = await only()));
    await drain(transport);
    expect(midSend).toMatchObject({ status: "pending", attempts: 1 });
    expect(midSend?.nextAttemptAt.getTime()).toBe(start.getTime() + CLAIM_LEASE_SECONDS * 1000);
  });

  it("is not offered to a second sender until the lease has run out: a crashed sender delays a message and does not lose it", async () => {
    await queue("a@example.com");
    // A sender that claims and then dies: simulate with a transport that never answers a run we abandon, by claiming through a first run that fails transiently with a long delay.
    const claimed = await rig.dbs.owner.db.update(emailOutbox).set({ attempts: 1, nextAttemptAt: at(CLAIM_LEASE_SECONDS)() }).returning({ id: emailOutbox.id });
    expect(claimed).toHaveLength(1);
    const early = new FakeTransport();
    expect((await drain(early, CLAIM_LEASE_SECONDS - 1)).claimed).toBe(0);
    const late = new FakeTransport();
    expect((await drain(late, CLAIM_LEASE_SECONDS + 1)).sent).toBe(1);
  });
});

describe("failing and retrying", () => {
  it("puts a transient failure back with the backoff, keeps the link, and sends it on the next due run", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport([{ ok: false, permanent: false, reason: "brevo answered 503" }, { ok: true, providerId: "later" }]);
    const first = await drain(transport);
    expect(first).toMatchObject({ claimed: 1, sent: 0, retrying: 1, failed: 0 });
    const afterFirst = await only();
    expect(afterFirst).toMatchObject({ status: "pending", attempts: 1, lastError: "brevo answered 503" });
    expect(afterFirst.link).not.toBeNull();
    expect(afterFirst.nextAttemptAt.getTime()).toBe(start.getTime() + 60_000);

    expect((await drain(transport, 59)).claimed).toBe(0);
    expect(await drain(transport, 61)).toMatchObject({ claimed: 1, sent: 1 });
    expect(await only()).toMatchObject({ status: "sent", attempts: 2, link: null, lastError: null, providerId: "later" });
  });

  it("waits longer after each failure and gives up after the last attempt, clearing the link", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport([{ ok: false, permanent: false, reason: "brevo answered 500" }]);
    let clock = 0;
    const waits: number[] = [];
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      clock += 3 * 60 * 60;
      const result = await drain(transport, clock);
      expect(result.claimed, `attempt ${attempt}`).toBe(1);
      const row = await only();
      if (attempt < MAX_SEND_ATTEMPTS) waits.push((row.nextAttemptAt.getTime() - (start.getTime() + clock * 1000)) / 1000);
    }
    expect(waits).toEqual([60, 300, 1800, 7200]);
    expect(await only()).toMatchObject({ status: "failed", attempts: MAX_SEND_ATTEMPTS, link: null, lastError: "brevo answered 500" });
    expect((await drain(transport, clock + 86_400)).claimed).toBe(0);
    expect(transport.sent).toHaveLength(MAX_SEND_ATTEMPTS);
  });

  it("fails a permanent refusal at once, clears the link and never retries", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport([{ ok: false, permanent: true, reason: "brevo answered 400 invalid_parameter" }]);
    expect(await drain(transport)).toMatchObject({ claimed: 1, failed: 1, retrying: 0 });
    expect(await only()).toMatchObject({ status: "failed", attempts: 1, link: null, lastError: "brevo answered 400 invalid_parameter" });
    expect((await drain(transport, 86_400)).claimed).toBe(0);
  });

  it("records a transport that throws as a transient failure, keeps its error text out of the row, and does not throw", async () => {
    await queue("a@example.com");
    const transport = new FakeTransport(["throw"]);
    const result = await drain(transport);
    expect(result).toMatchObject({ claimed: 1, retrying: 1 });
    const row = await only();
    expect(row).toMatchObject({ status: "pending", lastError: "the transport threw" });
    expect(JSON.stringify(row)).not.toContain("SECRET");
  });

  it("never sends the stored copy that says the link is removed: a pending row with no link fails", async () => {
    await queue("a@example.com", null);
    const transport = new FakeTransport();
    expect(await drain(transport)).toMatchObject({ claimed: 1, failed: 1, sent: 0 });
    expect(transport.sent).toEqual([]);
    expect(await only()).toMatchObject({ status: "failed", lastError: "no link to send" });
  });

  it("fails a row whose stored content cannot be rendered, without sending", async () => {
    await queue("a@example.com");
    await rig.dbs.owner.db.update(emailOutbox).set({ params: { wrong: true } });
    const transport = new FakeTransport();
    expect(await drain(transport)).toMatchObject({ failed: 1, sent: 0 });
    expect(transport.sent).toEqual([]);
    expect(await only()).toMatchObject({ status: "failed", lastError: "the stored content could not be rendered", link: null });
  });

  it("sends nothing and leaves every message pending when there is no transport, which is development without a Brevo key", async () => {
    await queue("a@example.com");
    expect(await drain(null)).toEqual({ purged: 0, claimed: 0, sent: 0, retrying: 0, failed: 0 });
    expect(await only()).toMatchObject({ status: "pending", attempts: 0 });
  });
});

describe("links never outlive their use", () => {
  const age = (recipient: string, hours: number) =>
    rig.dbs.owner.db.update(emailOutbox).set({ createdAt: sql`now() - make_interval(hours => ${hours})` }).where(eq(emailOutbox.recipient, recipient));

  it("purges a link that has gone unsent for a day: the message fails and the link is cleared", async () => {
    await queue("old@example.com");
    await queue("new@example.com");
    await age("old@example.com", 25);
    expect(await purgeExpiredLinks(authDb(), start)).toBe(1);
    const [old, fresh] = await rows();
    expect(old).toMatchObject({ recipient: "new@example.com", status: "pending" });
    expect(fresh).toMatchObject({ recipient: "old@example.com", status: "failed", link: null, lastError: "the link was not sent within a day" });
  });

  it("purges at the start of every run, before anything is claimed, so an old message is never sent", async () => {
    await queue("old@example.com");
    await age("old@example.com", 30);
    const transport = new FakeTransport();
    expect(await drain(transport)).toEqual({ purged: 1, claimed: 0, sent: 0, retrying: 0, failed: 0 });
    expect(transport.sent).toEqual([]);
  });

  it("leaves a sent message alone", async () => {
    await queue("a@example.com");
    await drain(new FakeTransport());
    await age("a@example.com", 48);
    expect(await purgeExpiredLinks(authDb(), start)).toBe(0);
    expect((await only()).status).toBe("sent");
  });

  it("cancels the unsent messages of a revoked invite and clears their links, and leaves other messages alone", async () => {
    const fynixOrg = rig.world().fynix;
    const [row] = await rig.dbs.owner.db
      .insert(invite)
      .values({ orgId: rig.world().kestrel.id, orgKind: "client", email: "i@example.com", name: "I", tokenHash: "a".repeat(43), expiresAt: new Date(Date.now() + 86_400_000), createdBy: rig.actor.userId })
      .returning({ id: invite.id });
    expect(fynixOrg.kind).toBe("fynix");
    if (row === undefined) throw new Error("no invite");
    await queue("i@example.com", undefined, { inviteId: row.id });
    await queue("other@example.com");
    await queue("sent@example.com", undefined, { inviteId: row.id });
    await rig.dbs.owner.db.update(emailOutbox).set({ status: "sent", link: null }).where(eq(emailOutbox.recipient, "sent@example.com"));
    const cancelled = await fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ tx, audit }) => {
      await audit({ action: "invite.revoke", subject: { table: "invite", id: row.id } });
      return cancelInviteMail(tx, row.id);
    });
    expect(cancelled).toBe(1);
    expect(await rows()).toMatchObject([
      { recipient: "i@example.com", status: "cancelled", link: null, lastError: "the invite was revoked" },
      { recipient: "other@example.com", status: "pending" },
      { recipient: "sent@example.com", status: "sent" },
    ]);
  });
});

describe("two senders at once", () => {
  it("send every message exactly once", async () => {
    for (let index = 0; index < 12; index += 1) await queue(`person${String(index).padStart(2, "0")}@example.com`);
    const transport = new FakeTransport([{ ok: true, providerId: "p" }], () => new Promise((resolve) => setTimeout(resolve, 20)));
    const results = await Promise.all([drain(transport, 0, 12), drain(transport, 0, 12)]);
    expect(results.reduce((total, result) => total + result.sent, 0)).toBe(12);
    expect(new Set(transport.sent.map((mail) => mail.to)).size).toBe(12);
    expect(transport.sent).toHaveLength(12);
    expect((await rows()).every((row) => row.status === "sent" && row.attempts === 1)).toBe(true);
  });
});

describe("outboxOn", () => {
  it("is what the reset mailer queues through", async () => {
    await outboxOn(rig.dbs.roles.leads_public.db).enqueue({ to: "a@example.com", content: RESET, link: "https://leads.example/x" });
    expect(await rows()).toHaveLength(1);
  });
});
```


**Edit:** `server/auth/password-reset.integration.test.ts`

Replace:

```typescript
    const messages = await outboxFor(rig, EMAIL);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.subject).toBe("Reset your Fynix Leads password");
    expect(messages[0]?.body).toContain("http://localhost:3020/reset-password?token=");
    expect(messages[0]?.body).toContain("within 60 minutes");
    const stored = await rig.dbs.owner.db.select({ status: emailOutbox.status, template: emailOutbox.template }).from(emailOutbox);
    expect(stored).toEqual([{ status: "pending", template: "password_reset" }]);
  });
```

With:

```typescript
    const messages = await outboxFor(rig, EMAIL);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.subject).toBe("Reset your Fynix Leads password");
    expect(messages[0]?.link).toContain("http://localhost:3020/reset-password?token=");
    // The stored copy keeps what the message said and not the link.
    expect(messages[0]?.body).toContain("within 60 minutes");
    expect(messages[0]?.body).not.toContain("http");
    const stored = await rig.dbs.owner.db.select({ status: emailOutbox.status, template: emailOutbox.template }).from(emailOutbox);
    expect(stored).toEqual([{ status: "pending", template: "password_reset" }]);
  });
```


Run `pnpm exec vitest run server/mail server/auth/mail`. Expected: FAIL: the 3 `passwordResetMailer` tests fail (the old signature takes a transport), and `Cannot find module './brevo'` and `'./outbox'` for the other two unit files (the integration file is run in Step 4).

- [ ] **Step 2: Write the code**

**File:** `server/mail/transport.ts`

```typescript
/** What leaves the app: one message to one address. */
export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * What a transport says about one attempt. It never throws: a refusal is a value, so a failure to send is recorded and
 * retried by the outbox and never reaches the request that queued the message.
 * - `permanent: true`: trying again cannot help (the provider rejected this message). The outbox marks it failed.
 * - `permanent: false`: try again later (a timeout, a rate limit, the provider is down, our key was refused and can be fixed).
 * `reason` is short, never the provider's response body (which can echo the recipient) and never a secret.
 */
export type SendResult =
  | { readonly ok: true; readonly providerId: string }
  | { readonly ok: false; readonly permanent: boolean; readonly reason: string };

export interface MailTransport {
  send(mail: OutgoingMail): Promise<SendResult>;
}
```


**File:** `server/mail/brevo.ts`

```typescript
import type { MailTransport, OutgoingMail, SendResult } from "@/server/mail/transport";

/** The sender every message goes out from: the address verified in Brevo (decision D4). */
export const MAIL_SENDER = { email: "hello@fynix.digital", name: "Fynix" } as const;
export const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface BrevoOptions {
  /** The API key. It is only ever put in the `api-key` header: never in a log line, an error, a reason or a URL. */
  readonly apiKey: string;
  /** Injectable so tests never reach the network. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Brevo's short error code from a failure body (`invalid_parameter`), or nothing. The body's `message` is not used: it can quote the recipient. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const code = isRecord(body) ? body.code : undefined;
    return typeof code === "string" && /^[a-z_]{1,40}$/.test(code) ? ` ${code}` : "";
  } catch {
    return "";
  }
}

/**
 * Sends through Brevo's transactional email API (`POST /v3/smtp/email`) with the global `fetch`: no SDK, so no dependency.
 * Mapping, written down because the outbox acts on it:
 * - 2xx: sent, and the `messageId` is the provider id.
 * - 400 and 422: the message itself was refused (an invalid address, say): permanent.
 * - 401 and 403: our key was refused. Not permanent: someone can fix the key within the retry window (about two and a half
 *   hours) and the same message then goes out.
 * - 429, 5xx, a timeout or a network error: transient.
 */
export function brevoTransport(options: BrevoOptions): MailTransport {
  const send = options.fetch ?? fetch;
  return {
    async send(mail: OutgoingMail): Promise<SendResult> {
      let response: Response;
      try {
        response = await send(BREVO_SEND_URL, {
          method: "POST",
          headers: { "api-key": options.apiKey, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ sender: MAIL_SENDER, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, htmlContent: mail.html }),
          signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (error) {
        return { ok: false, permanent: false, reason: error instanceof Error && error.name === "TimeoutError" ? "brevo timed out" : "brevo could not be reached" };
      }
      if (response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const id = isRecord(body) ? body.messageId : undefined;
        return { ok: true, providerId: typeof id === "string" && id !== "" ? id : "accepted" };
      }
      const permanent = response.status === 400 || response.status === 422;
      return { ok: false, permanent, reason: `brevo answered ${response.status}${await errorCode(response)}` };
    },
  };
}
```


**File:** `server/mail/outbox.ts`

```typescript
import { and, asc, eq, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { CLAIM_LEASE_SECONDS, LINK_RETENTION_SECONDS, retryDelaySeconds } from "@/lib/email/backoff";
import { parseEmailContent, renderEmail, type EmailContent } from "@/lib/email/templates";
import type { Database } from "@/server/db/pool";
import { emailOutbox } from "@/server/db/schema";
import type { MailTransport } from "@/server/mail/transport";

/**
 * The outbox: every email is written here first and sent after, so a message survives a crash, a provider outage and a
 * bug in the request that queued it. Three parts:
 * - `enqueueEmail` writes a row (any role with INSERT: `leads_public` for a reset, `leads_fynix` inside the invite's transaction).
 * - `drainOutbox` is the sender (`leads_auth`): claim, send, record. `pnpm outbox:run` runs it once; phase 6 runs it on a timer.
 * - `purgeExpiredLinks` and `cancelInviteMail` keep a link from outliving its use.
 * The columns and the state machine are described in server/db/schema/email-outbox.ts.
 */

/** A message to queue. The link is separate from the content: the row keeps a copy without it, and the link only until the message is sent. */
export interface QueuedEmail {
  readonly to: string;
  readonly content: EmailContent;
  readonly link: string | null;
  /** The invite this message carries the link of, so revoking the invite can cancel it. */
  readonly inviteId?: string;
}

/** Anything that can insert a row: a pooled database or a transaction. */
export type OutboxWriter = Pick<Database, "insert">;

/** The one thing a producer needs. The reset mailer takes this, so it does not know whether it is writing a table. */
export interface Outbox {
  enqueue(email: QueuedEmail): Promise<void>;
}

export function outboxOn(db: OutboxWriter): Outbox {
  return { enqueue: (email) => enqueueEmail(db, email) };
}

/**
 * Writes one pending row: the content, a copy of the text with the link removed, and the link. A failed insert is rethrown
 * with only the error's name and code: drizzle-orm puts the SQL and its parameters (the recipient and the live link) in the
 * message, and a caller or Better Auth may log it.
 */
export async function enqueueEmail(db: OutboxWriter, email: QueuedEmail): Promise<void> {
  const stored = renderEmail(email.content, null);
  try {
    await db.insert(emailOutbox).values({
      recipient: email.to,
      template: email.content.template,
      params: email.content.params,
      subject: stored.subject,
      body: stored.text,
      link: email.link,
      inviteId: email.inviteId ?? null,
    });
  } catch (error) {
    const code = typeof (error as { code?: unknown } | null)?.code === "string" ? ` ${(error as { code: string }).code}` : "";
    const name = error instanceof Error ? error.name : "non-error";
    throw new Error(`Could not write the outbox message (${name}${code})`);
  }
}

export interface DrainOptions {
  readonly now?: () => Date;
  /** How many messages one run sends at most. */
  readonly batchSize?: number;
}

export interface DrainResult {
  /** Messages whose link had gone unsent for a day and were failed before the run began. */
  readonly purged: number;
  readonly claimed: number;
  readonly sent: number;
  /** Failed this time and put back to try again later. */
  readonly retrying: number;
  /** Failed for good: refused for good, or out of attempts. */
  readonly failed: number;
}

const DEFAULT_BATCH_SIZE = 20;
const seconds = (from: Date, count: number): Date => new Date(from.getTime() + count * 1000);

/**
 * Fails every pending message whose link has been waiting longer than a day, and clears the link: master plan section 3,
 * "link emails ... are purged after one day". Returns how many.
 */
export async function purgeExpiredLinks(db: Database, now: Date): Promise<number> {
  const purged = await db
    .update(emailOutbox)
    .set({ status: "failed", link: null, lastError: "the link was not sent within a day" })
    .where(and(eq(emailOutbox.status, "pending"), isNotNull(emailOutbox.link), lt(emailOutbox.createdAt, seconds(now, -LINK_RETENTION_SECONDS))))
    .returning({ id: emailOutbox.id });
  return purged.length;
}

/** Cancels the messages of a revoked invite that have not gone out, clearing their links. Runs in the revoking transaction. */
export async function cancelInviteMail(db: Pick<Database, "update">, inviteId: string): Promise<number> {
  const cancelled = await db
    .update(emailOutbox)
    .set({ status: "cancelled", link: null, lastError: "the invite was revoked" })
    .where(and(eq(emailOutbox.inviteId, inviteId), eq(emailOutbox.status, "pending")))
    .returning({ id: emailOutbox.id });
  return cancelled.length;
}

/**
 * Claims due messages, one short statement: `FOR UPDATE SKIP LOCKED` so two runners never take the same row, and the claim
 * pushes `next_attempt_at` out by the lease and counts the attempt. A runner that dies mid-send therefore delays a message
 * by the lease and never loses it. Delivery is at least once: a message that was sent but whose result could not be
 * recorded is sent again after the lease.
 */
async function claimDue(db: Database, now: Date, limit: number) {
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, now)))
    .orderBy(asc(emailOutbox.nextAttemptAt))
    .limit(limit)
    .for("update", { skipLocked: true });
  return db
    .update(emailOutbox)
    .set({ attempts: sql`${emailOutbox.attempts} + 1`, nextAttemptAt: seconds(now, CLAIM_LEASE_SECONDS) })
    .where(inArray(emailOutbox.id, due))
    .returning({ id: emailOutbox.id, recipient: emailOutbox.recipient, template: emailOutbox.template, params: emailOutbox.params, link: emailOutbox.link, attempts: emailOutbox.attempts });
}

type Claimed = Awaited<ReturnType<typeof claimDue>>[number];
type Outcome = "sent" | "retrying" | "failed";

async function settle(db: Database, row: Claimed, transport: MailTransport, now: Date): Promise<Outcome> {
  const fail = async (reason: string, permanent: boolean): Promise<Outcome> => {
    const delay = permanent ? null : retryDelaySeconds(row.attempts);
    if (delay === null) {
      await db.update(emailOutbox).set({ status: "failed", link: null, lastError: reason }).where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "pending")));
      return "failed";
    }
    await db.update(emailOutbox).set({ nextAttemptAt: seconds(now, delay), lastError: reason }).where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "pending")));
    return "retrying";
  };

  // Every template carries a link, so a pending row without one has nothing to send (it was cleared by a purge or a cancel
  // that raced this claim). Never send the copy that says "the link is removed".
  if (row.link === null) return fail("no link to send", true);
  let rendered;
  try {
    rendered = renderEmail(parseEmailContent(row.template, row.params), row.link);
  } catch {
    return fail("the stored content could not be rendered", true);
  }

  let result;
  try {
    result = await transport.send({ to: row.recipient, subject: rendered.subject, text: rendered.text, html: rendered.html });
  } catch {
    // A transport is meant to return a value. One that throws is a bug; treat it as a transient failure and keep the error out of the row.
    return fail("the transport threw", false);
  }
  if (!result.ok) return fail(result.reason, result.permanent);
  await db
    .update(emailOutbox)
    .set({ status: "sent", sentAt: now, providerId: result.providerId, link: null, lastError: null })
    .where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "pending")));
  return "sent";
}

/**
 * One run of the sender, as `leads_auth`: purge old links, claim a batch, send each message and record the outcome.
 * Nothing in it throws for a delivery problem; a database fault does propagate, to the script or the cron call.
 * With no transport (no Brevo key in development) it purges and sends nothing, so rows stay pending.
 */
export async function drainOutbox(db: Database, transport: MailTransport | null, options: DrainOptions = {}): Promise<DrainResult> {
  const now = options.now?.() ?? new Date();
  const purged = await purgeExpiredLinks(db, now);
  if (transport === null) return { purged, claimed: 0, sent: 0, retrying: 0, failed: 0 };
  const batch = await claimDue(db, now, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const tally = { sent: 0, retrying: 0, failed: 0 };
  for (const row of batch) tally[await settle(db, row, transport, now)] += 1;
  return { purged, claimed: batch.length, ...tally };
}
```


**Edit:** `server/auth/mail.ts`

Replace:

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
      try {
        await publicDb.insert(emailOutbox).values({ recipient: message.to, template: message.template, subject: message.subject, body: message.text });
      } catch (error) {
        // drizzle-orm puts the SQL and its params (the recipient and the live reset link) in the message, and Better Auth logs a
        // rejected reset callback. Rethrow only the error name and code, with no `cause`.
        const code = typeof (error as { code?: unknown } | null)?.code === "string" ? ` ${(error as { code: string }).code}` : "";
        const name = error instanceof Error ? error.name : "non-error";
        throw new Error(`Could not write the outbox message (${name}${code})`);
      }
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

With:

```typescript
import { PASSWORD_RESET_LIFETIME_SECONDS } from "@/lib/auth/session-lifetime";
import type { Outbox } from "@/server/mail/outbox";

/** What Better Auth's reset callback needs: the address and the one-time token. */
export interface ResetMailer {
  sendPasswordReset(input: { readonly email: string; readonly token: string }): Promise<void>;
}

/**
 * Builds the link to this app's own reset page (Better Auth's HTTP routes are not served) and queues the message in the
 * outbox. The `leads_public` pool writes it, because a reset is requested by someone who is not signed in. Nothing is sent
 * here: the sender (server/mail/outbox.ts, `pnpm outbox:run`) does that, and in development without a Brevo key `pnpm
 * mail:last` prints the link. The message is a template (lib/email/templates.ts), the same for 1B's reset and 1C's invite.
 */
export function passwordResetMailer(outbox: Outbox, origin: string, expiresInMinutes: number = PASSWORD_RESET_LIFETIME_SECONDS / 60): ResetMailer {
  return {
    async sendPasswordReset({ email, token }) {
      const resetUrl = new URL("/reset-password", origin);
      resetUrl.searchParams.set("token", token);
      await outbox.enqueue({ to: email, content: { template: "password_reset", params: { expiresInMinutes } }, link: resetUrl.toString() });
    },
  };
}
```


**Edit:** `server/auth/index.ts`

Replace:

```typescript
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
```

With:

```typescript
import { PASSWORD_RESET_LIFETIME_SECONDS } from "@/lib/auth/session-lifetime";
import { breachCheckerFor } from "@/server/auth/breach-check";
import { createAuth, type Auth } from "@/server/auth/create-auth";
import { passwordResetMailer } from "@/server/auth/mail";
import { resolveSessionContext, type SessionContext } from "@/server/auth/session-context";
import type { AuthServices } from "@/server/auth/sign-in";
import { getDatabase } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { outboxOn } from "@/server/mail/outbox";

/**
 * Module scope, not globalThis like the pools: a hot reload re-evaluates this module and picks up a changed
 * configuration, and the instance holds only a reference to a pool that globalThis keeps.
 */
let auth: Auth | undefined;

/** The Better Auth instance for the running app, on the `leads_auth` pool. Better Auth's own HTTP routes are not served: the app calls `auth.api` from server code. */
export function getAuth(): Auth {
```

**Edit:** `server/auth/index.ts`

Replace:

```typescript
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    breachChecker: breachCheckerFor(env.PASSWORD_BREACH_CHECK),
    mailer: passwordResetMailer(mailTransport(), env.APP_ORIGIN, PASSWORD_RESET_LIFETIME_SECONDS / 60),
    nextCookies: true,
  });
  return auth;
```

With:

```typescript
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    breachChecker: breachCheckerFor(env.PASSWORD_BREACH_CHECK),
    mailer: passwordResetMailer(outboxOn(getDatabase("leads_public").db), env.APP_ORIGIN, PASSWORD_RESET_LIFETIME_SECONDS / 60),
    nextCookies: true,
  });
  return auth;
```


`server/auth/testing.ts` is the 1B harness. Its reset helpers now read the link from the `link` column, because the stored copy of the text has none.

**Edit:** `server/auth/testing.ts`

Replace:

```typescript
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
```

With:

```typescript
import { BreachCheckUnavailableError, type BreachChecker } from "@/server/auth/breach-check";
import { createAccountWithGrant } from "@/server/auth/create-account";
import { createAuth, type Auth } from "@/server/auth/create-auth";
import { passwordResetMailer } from "@/server/auth/mail";
import type { SessionResolution } from "@/server/auth/session-context";
import type { AuthServices } from "@/server/auth/sign-in";
import { emailOutbox, member, user } from "@/server/db/schema";
import { openTestDatabases, type TestDatabases } from "@/server/db/testing";
import { outboxOn } from "@/server/mail/outbox";
import type { SeededOrganisation } from "@/server/db/testing/seed";

/** Test harness for the auth integration tests: real Better Auth on the real test database, with a fake breach service. */
```

**Edit:** `server/auth/testing.ts`

Replace:

```typescript
    secret: TEST_SECRET,
    baseURL,
    breachChecker: breach,
    mailer: passwordResetMailer(devOutboxTransport(dbs.roles.leads_public.db), baseURL, 60),
    nextCookies: false,
  });
  return {
```

With:

```typescript
    secret: TEST_SECRET,
    baseURL,
    breachChecker: breach,
    mailer: passwordResetMailer(outboxOn(dbs.roles.leads_public.db), baseURL, 60),
    nextCookies: false,
  });
  return {
```

**Edit:** `server/auth/testing.ts`

Replace:

```typescript
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

With:

```typescript
  return rows[0]?.value ?? 0;
}

export async function outboxFor(
  rig: AuthRig,
  email: string,
): Promise<{ readonly recipient: string; readonly subject: string; readonly body: string; readonly link: string | null }[]> {
  return rig.dbs.owner.db
    .select({ recipient: emailOutbox.recipient, subject: emailOutbox.subject, body: emailOutbox.body, link: emailOutbox.link })
    .from(emailOutbox)
    .where(eq(emailOutbox.recipient, email))
    .orderBy(desc(emailOutbox.createdAt));
}

/** The reset token in the link of the newest queued message for `email`. The stored copy of the text has no link; the `link` column does. */
export async function latestResetToken(rig: AuthRig, email: string): Promise<string> {
  const newest = (await outboxFor(rig, email))[0];
  const token = newest?.link == null ? null : new URL(newest.link).searchParams.get("token");
  if (token === null) throw new Error(`No reset link was queued for ${email}`);
  return token;
}
```


The email templates gained one change in this task's tests: the stored copy keeps the line that says how long the link worked. It is part of the `lib/email` files in Task 2.

- [ ] **Step 3: The scripts**

`pnpm mail:last` prints the newest message. `pnpm outbox:run` sends once. Neither needs a new dependency.

**Edit:** `scripts/mail-last.ts`

Replace:

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
```

With:

```typescript
import { desc } from "drizzle-orm";
import { parseEmailContent, renderEmail } from "@/lib/email/templates";
import { createDatabase } from "@/server/db/pool";
import { emailOutbox } from "@/server/db/schema";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Development only: prints the newest message in the email outbox of the dev database, which is where a password reset
// link or an invite link goes when no Brevo key is set. It reads as the owner role because no runtime role other than the
// sender may read the link. A message that has been sent, cancelled or purged no longer has one.
runScript(async () => {
  loadEnvLocal();
  const owner = createDatabase(getToolingEnv().DATABASE_URL_OWNER, { max: 1 });
  try {
    const rows = await owner.db
      .select({ recipient: emailOutbox.recipient, template: emailOutbox.template, params: emailOutbox.params, subject: emailOutbox.subject, body: emailOutbox.body, link: emailOutbox.link, status: emailOutbox.status, createdAt: emailOutbox.createdAt })
      .from(emailOutbox)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(1);
```

**Edit:** `scripts/mail-last.ts`

Replace:

```typescript
      console.log("The outbox is empty.");
      return;
    }
    console.log(`To: ${newest.recipient}\nSubject: ${newest.subject}\nQueued: ${newest.createdAt.toISOString()} (${newest.status})\n\n${newest.body}`);
  } finally {
    await owner.close();
  }
```

With:

```typescript
      console.log("The outbox is empty.");
      return;
    }
    // With the link still in the row, print the message as it will be sent. Without it, print the stored copy.
    const text = newest.link === null ? newest.body : renderEmail(parseEmailContent(newest.template, newest.params), newest.link).text;
    console.log(`To: ${newest.recipient}\nSubject: ${newest.subject}\nQueued: ${newest.createdAt.toISOString()} (${newest.status})\n\n${text}`);
  } finally {
    await owner.close();
  }
```


**File:** `scripts/outbox-run.ts`

```typescript
import { createDatabase } from "@/server/db/pool";
import { getEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";
import { brevoTransport } from "@/server/mail/brevo";
import { drainOutbox } from "@/server/mail/outbox";

// Sends the email waiting in the outbox once, as the leads_auth role: purge links older than a day, claim due messages, send
// them through Brevo and record the outcome. Without BREVO_API_KEY (development) it sends nothing and leaves every message
// pending, so `pnpm mail:last` can still print the newest. A cron entry or a timer runs this in production (phase 6).
runScript(async () => {
  loadEnvLocal();
  const env = getEnv();
  const auth = createDatabase(env.DATABASE_URL_AUTH, { max: 1 });
  try {
    const transport = env.BREVO_API_KEY === undefined ? null : brevoTransport({ apiKey: env.BREVO_API_KEY });
    const result = await drainOutbox(auth.db, transport);
    console.log(`Outbox run: ${result.purged} purged, ${result.claimed} claimed, ${result.sent} sent, ${result.retrying} to retry, ${result.failed} failed.`);
    if (transport === null) console.log("BREVO_API_KEY is not set, so nothing was sent. Messages stay pending; `pnpm mail:last` prints the newest.");
  } finally {
    await auth.close();
  }
});
```


**Edit:** `package.json`

Replace:

```json
    "db:migrate:test": "tsx scripts/db-migrate.ts --target=test",
    "db:seed": "tsx scripts/db-seed.ts",
    "admin:create": "tsx scripts/admin-create.ts",
    "mail:last": "tsx scripts/mail-last.ts"
  },
  "dependencies": {
    "@base-ui/react": "^1.9.0",
```

With:

```json
    "db:migrate:test": "tsx scripts/db-migrate.ts --target=test",
    "db:seed": "tsx scripts/db-seed.ts",
    "admin:create": "tsx scripts/admin-create.ts",
    "mail:last": "tsx scripts/mail-last.ts",
    "outbox:run": "tsx scripts/outbox-run.ts"
  },
  "dependencies": {
    "@base-ui/react": "^1.9.0",
```


- [ ] **Step 4: Run the tests and the checks**

```bash
pnpm exec vitest run server/mail server/auth
pnpm test:integration
pnpm test && pnpm test:integration
pnpm lint && pnpm typecheck
```

Expected: the targeted tests pass. Then `pnpm test`: 66 files, 757 tests pass and `pnpm test:integration`: 12 files, 378 tests pass, including the 1B `password-reset` tests, which now read the link from its column. Lint and typecheck clean.

- [ ] **Step 5: Run the file three times**

```bash
for i in 1 2 3; do pnpm exec vitest run --config vitest.integration.config.mts server/mail; done
```

Expected: 21 tests pass each time (the clock fix above).

- [ ] **Step 6: Commit**

```bash
git add server scripts package.json lib
git commit -m "Add the outbox sender with retries and link purging, the Brevo transport, and move the reset email onto templates"
```

## Task 7: Organisations and campaigns

**Files:** create `server/domain/inputs.ts`, `parse.ts`, `refs.ts`, `snapshots.ts`, `organisations.ts`, `campaigns.ts`, `test-helpers.ts` and their tests.

- **`parseInput`** parses at the boundary: every service takes `unknown`, so a form, a script and a test meet the same zod schema, and the error names the path and the rule, never the value.
- **References** are generated here and retried on a unique violation in a **savepoint** (decision C14). The tests force collisions with a scripted random source: two attempts that hit a seeded reference, then a free one; and a source where every attempt collides, which ends in `ref-exhausted` with nothing written.
- **Organisations:** create a client (brand name required) or an agency (none); rename and change a brand (the client's campaigns follow, by the 1A trigger); archive and restore by status. The Fynix organisation is refused for every change.
- **Campaigns:** a new campaign is always a draft; the client and the agency must exist, be of the right kind and be active; the status moves only as `canMoveCampaign` allows; the row is locked while it is read, so two admins take turns. The client and the agency cannot be changed (the update schema is strict).
- **Every write audits** with a before and an after snapshot. The campaign snapshot includes the internal notes: the log is Fynix's.

- [ ] **Step 1: Write the tests**

**File:** `server/domain/test-helpers.ts`

```typescript
import { asc, eq, getTableColumns } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { auditLog } from "@/server/db/schema";
import type { AuditAction } from "@/server/domain/audit";
import type { DomainRig } from "@/server/domain/testing";

/** A random source that answers from a list, one entry per call, and repeats the last entry when the list runs out. For forcing a reference collision. */
export function scriptedBytes(script: readonly (readonly number[])[]): RandomBytes {
  let position = 0;
  return () => {
    const entry = script[Math.min(position, script.length - 1)];
    position += 1;
    if (entry === undefined) throw new Error("scriptedBytes needs at least one entry");
    return Uint8Array.from(entry);
  };
}

/** The audit rows written so far, oldest first, optionally for one action. Read as the owner, which can read everything. */
export function auditRowsFor(rig: DomainRig, action?: AuditAction) {
  const query = rig.dbs.owner.db.select(getTableColumns(auditLog)).from(auditLog);
  return (action === undefined ? query : query.where(eq(auditLog.action, action))).orderBy(asc(auditLog.at));
}
```


**File:** `server/domain/inputs.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { DomainError } from "@/server/domain/errors";
import { createCampaignSchema, createOrganisationSchema, issueInviteSchema, updateCampaignSchema, updateOrganisationSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

const UUID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN = { clientOrgId: UUID, agencyOrgId: UUID, name: "UK freight", startDate: "2026-12-01", endDate: "2027-05-31", monthlyTarget: 20, totalTarget: 120 };

describe("parseInput", () => {
  it("returns the parsed value", () => {
    expect(parseInput(createOrganisationSchema, { kind: "client", name: "  Kestrel Logistics Ltd ", brandName: "Kestrel" })).toEqual({ kind: "client", name: "Kestrel Logistics Ltd", brandName: "Kestrel" });
  });

  it("throws an invalid-input DomainError naming the path and the rule, and never the value", () => {
    const thrown = (() => {
      try {
        parseInput(createOrganisationSchema, { kind: "client", name: "", brandName: "Kestrel" });
      } catch (error) {
        return error;
      }
    })();
    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe("invalid-input");
    expect((thrown as DomainError).message).toBe("name is required");
  });
});

describe("organisation input", () => {
  it("needs a brand name for a client and refuses one for an agency", () => {
    expect(createOrganisationSchema.safeParse({ kind: "client", name: "A" }).success).toBe(false);
    expect(createOrganisationSchema.safeParse({ kind: "agency", name: "A", brandName: "B" }).success).toBe(false);
    expect(createOrganisationSchema.safeParse({ kind: "agency", name: "A" }).success).toBe(true);
  });

  it("refuses a Fynix organisation and any field it does not know", () => {
    expect(createOrganisationSchema.safeParse({ kind: "fynix", name: "A" }).success).toBe(false);
    expect(createOrganisationSchema.safeParse({ kind: "agency", name: "A", status: "archived" }).success).toBe(false);
  });

  it("an update must change something", () => {
    expect(updateOrganisationSchema.safeParse({}).success).toBe(false);
    expect(updateOrganisationSchema.safeParse({ name: "B" }).success).toBe(true);
  });
});

describe("campaign input", () => {
  it("accepts the minimum and the full set of requirement fields", () => {
    expect(createCampaignSchema.safeParse(CAMPAIGN).success).toBe(true);
    const full = createCampaignSchema.safeParse({ ...CAMPAIGN, geography: "UK", industries: ["Freight"], companySize: "50 to 500", icp: "icp", jobTitles: ["Head of Operations"], seniority: "Director", technologies: ["SAP"], bantBudget: "b", bantAuthority: "a", bantNeed: "n", bantTimeline: "t", instructions: "i", internalNotes: "n" });
    expect(full.success).toBe(true);
  });

  it.each([
    ["an end date before the start date", { endDate: "2026-11-30" }],
    ["a date that is not a date", { startDate: "2026-13-45" }],
    ["a negative target", { monthlyTarget: -1 }],
    ["a fractional target", { totalTarget: 1.5 }],
    ["a status (a new campaign is always a draft)", { status: "active" }],
    ["a list entry that is empty", { industries: [""] }],
    ["more than 30 list entries", { technologies: Array.from({ length: 31 }, (_, index) => `t${index}`) }],
  ])("refuses %s", (_label, change) => {
    expect(createCampaignSchema.safeParse({ ...CAMPAIGN, ...change }).success).toBe(false);
  });

  it("an update refuses to move a campaign to another client or agency, and refuses an empty change", () => {
    expect(updateCampaignSchema.safeParse({ clientOrgId: UUID }).success).toBe(false);
    expect(updateCampaignSchema.safeParse({ agencyOrgId: UUID }).success).toBe(false);
    expect(updateCampaignSchema.safeParse({}).success).toBe(false);
    expect(updateCampaignSchema.safeParse({ status: "active", monthlyTarget: 5 }).success).toBe(true);
  });
});

describe("invite input", () => {
  it("lower-cases nothing itself, defaults the role and needs a real address", () => {
    expect(issueInviteSchema.parse({ organisationId: UUID, email: "a@example.com", name: "A" }).role).toBe("member");
    expect(issueInviteSchema.safeParse({ organisationId: UUID, email: "not an address", name: "A" }).success).toBe(false);
    expect(issueInviteSchema.safeParse({ organisationId: UUID, email: "a@example.com", name: "A", role: "owner" }).success).toBe(false);
  });
});
```


**File:** `server/domain/organisations.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { campaign, organisation } from "@/server/db/schema";
import { auditRowsFor, scriptedBytes } from "@/server/domain/test-helpers";
import { DomainError } from "@/server/domain/errors";
import { createOrganisation, setOrganisationStatus, updateOrganisation } from "@/server/domain/organisations";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const AGENCY = { kind: "agency", name: "Ridgeway Media Pvt Ltd" } as const;
const CLIENT = { kind: "client", name: "Orchard Foods Ltd", brandName: "Orchard" } as const;
const refusal = async (work: Promise<unknown>): Promise<DomainError> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
};

describe("createOrganisation", () => {
  it("creates an agency with a generated reference, and audits it", async () => {
    const created = await createOrganisation(rig.deps(), rig.actor, AGENCY);
    expect(created).toMatchObject({ kind: "agency", name: "Ridgeway Media Pvt Ltd", brandName: null, status: "active" });
    expect(created.publicRef).toMatch(/^ORG-[0-9A-HJKMNP-TV-Z]{4}$/);
    const [audit] = await auditRowsFor(rig, "organisation.create");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "organisation", subjectId: created.id, subjectRef: created.publicRef, before: null, after: { ref: created.publicRef, kind: "agency", name: "Ridgeway Media Pvt Ltd", brandName: null, status: "active" } });
  });

  it("creates a client with its brand name", async () => {
    const created = await createOrganisation(rig.deps(), rig.actor, CLIENT);
    expect(created).toMatchObject({ kind: "client", brandName: "Orchard" });
  });

  it.each([
    ["a client with no brand", { kind: "client", name: "No Brand Ltd" }],
    ["a second Fynix organisation", { kind: "fynix", name: "Another Fynix" }],
    ["an empty name", { kind: "agency", name: "   " }],
  ])("refuses %s as invalid input, and writes nothing", async (_label, input) => {
    expect((await refusal(createOrganisation(rig.deps(), rig.actor, input))).code).toBe("invalid-input");
    expect(await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).toHaveLength(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("tries another reference when the first is taken, inside the same transaction, and still audits the change", async () => {
    // ORG-4K9P is Kestrel's: [4, 19, 9, 22] in the reference alphabet. The first two attempts collide with it.
    const randomBytes: RandomBytes = scriptedBytes([[4, 19, 9, 22], [4, 19, 9, 22], [1, 2, 3, 5]]);
    const created = await createOrganisation(rig.deps({ randomBytes }), rig.actor, AGENCY);
    expect(created.publicRef).toBe("ORG-1235");
    expect(await auditRowsFor(rig, "organisation.create")).toHaveLength(1);
  });

  it("gives up with a ref-exhausted error when every reference is taken, and writes nothing", async () => {
    const randomBytes: RandomBytes = scriptedBytes([[4, 19, 9, 22]]);
    expect((await refusal(createOrganisation(rig.deps({ randomBytes }), rig.actor, AGENCY))).code).toBe("ref-exhausted");
    expect(await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).toHaveLength(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("updateOrganisation", () => {
  it("renames an organisation, audits the before and after, and follows a brand change onto the client's campaigns", async () => {
    const { kestrel } = rig.world();
    const after = await updateOrganisation(rig.deps(), rig.actor, kestrel.id, { name: "Kestrel Freight Ltd", brandName: "Kestrel Freight" });
    expect(after).toMatchObject({ name: "Kestrel Freight Ltd", brandName: "Kestrel Freight" });
    const [audit] = await auditRowsFor(rig, "organisation.update");
    expect(audit).toMatchObject({ before: { ref: kestrel.publicRef, name: "Kestrel Logistics Ltd", brandName: "Kestrel" }, after: { ref: kestrel.publicRef, name: "Kestrel Freight Ltd", brandName: "Kestrel Freight" } });
    const brands = await rig.dbs.owner.db.select({ brand: campaign.clientBrandName }).from(campaign).where(eq(campaign.clientOrgId, kestrel.id));
    expect(brands.map((row) => row.brand)).toEqual(["Kestrel Freight", "Kestrel Freight"]);
  });

  it("refuses a brand name for an agency, the Fynix organisation, an unknown id and an empty change", async () => {
    const { brightpath, fynix } = rig.world();
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, brightpath.id, { brandName: "Brightpath" }))).code).toBe("invalid-input");
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, fynix.id, { name: "New" }))).code).toBe("invalid-transition");
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999", { name: "New" }))).code).toBe("not-found");
    expect((await refusal(updateOrganisation(rig.deps(), rig.actor, brightpath.id, {}))).code).toBe("invalid-input");
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("setOrganisationStatus", () => {
  it("archives and restores, with its own audit action each time, and deletes nothing", async () => {
    const { halden } = rig.world();
    expect(await setOrganisationStatus(rig.deps(), rig.actor, halden.id, "archived")).toMatchObject({ status: "archived" });
    expect(await setOrganisationStatus(rig.deps(), rig.actor, halden.id, "active")).toMatchObject({ status: "active" });
    expect((await auditRowsFor(rig)).map((row) => row.action)).toEqual(["organisation.archive", "organisation.restore"]);
    expect(await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).toHaveLength(5);
  });

  it("refuses to archive what is archived already, and the Fynix organisation", async () => {
    const { halden, fynix } = rig.world();
    await setOrganisationStatus(rig.deps(), rig.actor, halden.id, "archived");
    expect((await refusal(setOrganisationStatus(rig.deps(), rig.actor, halden.id, "archived"))).code).toBe("invalid-transition");
    expect((await refusal(setOrganisationStatus(rig.deps(), rig.actor, fynix.id, "archived"))).code).toBe("invalid-transition");
  });
});
```


**File:** `server/domain/campaigns.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaign } from "@/server/db/schema";
import { createCampaign, updateCampaign } from "@/server/domain/campaigns";
import { DomainError } from "@/server/domain/errors";
import { createOrganisation, setOrganisationStatus } from "@/server/domain/organisations";
import { auditRowsFor, scriptedBytes } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const refusal = async (work: Promise<unknown>): Promise<DomainError> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
};
const input = () => ({ clientOrgId: rig.world().kestrel.id, agencyOrgId: rig.world().northgate.id, name: "Benelux cold chain", startDate: "2027-01-04", endDate: "2027-06-30", monthlyTarget: 12, totalTarget: 72 });
const row = async (id: string) => (await rig.dbs.owner.db.select().from(campaign).where(eq(campaign.id, id)))[0];

describe("createCampaign", () => {
  it("creates a draft with a generated reference, the client's brand copied, every requirement field stored, and audits it", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, {
      ...input(),
      geography: "Benelux",
      industries: ["Logistics", "Food"],
      companySize: "100 to 1000",
      icp: "Cold chain operators",
      jobTitles: ["Head of Operations"],
      seniority: "Director and above",
      technologies: ["SAP", "Manhattan"],
      bantBudget: "Over 50k",
      bantAuthority: "Signs contracts",
      bantNeed: "Replacing a TMS",
      bantTimeline: "This year",
      instructions: "Lead with the cold chain case study.",
      internalNotes: "INTERNAL margin is thin",
    });
    expect(created).toMatchObject({ name: "Benelux cold chain", status: "draft" });
    expect(created.publicRef).toMatch(/^CMP-[0-9A-HJKMNP-TV-Z]{4}$/);
    const stored = await row(created.id);
    expect(stored).toMatchObject({ clientBrandName: "Kestrel", industries: ["Logistics", "Food"], technologies: ["SAP", "Manhattan"], jobTitles: ["Head of Operations"], bantNeed: "Replacing a TMS", internalNotes: "INTERNAL margin is thin" });
    const [audit] = await auditRowsFor(rig, "campaign.create");
    expect(audit).toMatchObject({ subjectTable: "campaign", subjectId: created.id, subjectRef: created.publicRef, before: null, after: { ref: created.publicRef, status: "draft", geography: "Benelux", internalNotes: "INTERNAL margin is thin" } });
  });

  it("leaves the optional requirement fields empty when they are not given", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, input());
    expect(await row(created.id)).toMatchObject({ geography: "", industries: [], icp: "", technologies: [], bantBudget: "", instructions: "", internalNotes: null });
  });

  it("tries another reference when the first is taken, and still audits the change", async () => {
    // CMP-7Q2X is the seeded campaign: [7, 23, 2, 29] in the reference alphabet.
    const created = await createCampaign(rig.deps({ randomBytes: scriptedBytes([[7, 23, 2, 29], [1, 2, 3, 5]]) }), rig.actor, input());
    expect(created.publicRef).toBe("CMP-1235");
    expect(await auditRowsFor(rig, "campaign.create")).toHaveLength(1);
  });

  it.each([
    ["an agency as the client", (): Record<string, unknown> => ({ ...input(), clientOrgId: rig.world().brightpath.id }), "not-found"],
    ["a client as the agency", (): Record<string, unknown> => ({ ...input(), agencyOrgId: rig.world().kestrel.id }), "not-found"],
    ["an organisation that does not exist", (): Record<string, unknown> => ({ ...input(), clientOrgId: "99999999-9999-4999-8999-999999999999" }), "not-found"],
    ["an end date before the start date", (): Record<string, unknown> => ({ ...input(), endDate: "2026-12-31" }), "invalid-input"],
    ["a status", (): Record<string, unknown> => ({ ...input(), status: "active" }), "invalid-input"],
  ])("refuses %s, and writes nothing", async (_label, make, code) => {
    expect((await refusal(createCampaign(rig.deps(), rig.actor, make()))).code).toBe(code);
    expect(await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign)).toHaveLength(4);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("refuses an archived client or agency", async () => {
    await setOrganisationStatus(rig.deps(), rig.actor, rig.world().kestrel.id, "archived");
    expect((await refusal(createCampaign(rig.deps(), rig.actor, input()))).code).toBe("organisation-archived");
    await setOrganisationStatus(rig.deps(), rig.actor, rig.world().kestrel.id, "active");
    await setOrganisationStatus(rig.deps(), rig.actor, rig.world().northgate.id, "archived");
    expect((await refusal(createCampaign(rig.deps(), rig.actor, input()))).code).toBe("organisation-archived");
  });

  it("works for an organisation created through the service", async () => {
    const client = await createOrganisation(rig.deps(), rig.actor, { kind: "client", name: "Orchard Foods Ltd", brandName: "Orchard" });
    const created = await createCampaign(rig.deps(), rig.actor, { ...input(), clientOrgId: client.id });
    expect(await row(created.id)).toMatchObject({ clientBrandName: "Orchard" });
  });
});

describe("updateCampaign", () => {
  it("changes details and audits the before and after, with the internal notes in both", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, { ...input(), internalNotes: "first" });
    const after = await updateCampaign(rig.deps(), rig.actor, created.id, { name: "Benelux cold chain, phase two", monthlyTarget: 15, internalNotes: "second", industries: ["Food"] });
    expect(after.name).toBe("Benelux cold chain, phase two");
    const [audit] = await auditRowsFor(rig, "campaign.update");
    expect(audit).toMatchObject({ subjectRef: created.publicRef, before: { name: "Benelux cold chain", monthlyTarget: 12, internalNotes: "first", industries: [] }, after: { name: "Benelux cold chain, phase two", monthlyTarget: 15, internalNotes: "second", industries: ["Food"] } });
  });

  it("moves through the lifecycle, and archives and restores with their own audit actions", async () => {
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    for (const status of ["active", "paused", "active", "completed", "archived", "draft"] as const) {
      expect(await updateCampaign(rig.deps(), rig.actor, id, { status })).toMatchObject({ status });
    }
    expect((await auditRowsFor(rig)).map((row) => row.action)).toEqual(["campaign.create", "campaign.update", "campaign.update", "campaign.update", "campaign.update", "campaign.archive", "campaign.restore"]);
    expect(await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign)).toHaveLength(5);
  });

  it("refuses a move the lifecycle does not allow, an end date before the start date, a change of client and an unknown id, and changes nothing", async () => {
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { status: "completed" }))).code).toBe("invalid-transition");
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { endDate: "2026-12-31" }))).code).toBe("invalid-input");
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, { clientOrgId: rig.world().halden.id }))).code).toBe("invalid-input");
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999", { name: "x" }))).code).toBe("not-found");
    expect(await row(id)).toMatchObject({ status: "draft", clientOrgId: rig.world().kestrel.id });
    expect((await auditRowsFor(rig)).map((entry) => entry.action)).toEqual(["campaign.create"]);
  });
});
```


Run `pnpm exec vitest run server/domain/inputs` and the two integration files. Expected: FAIL: `Cannot find package '@/server/domain/inputs' imported from .../inputs.test.ts`, and the same for `organisations` and `campaigns` in the integration files.

- [ ] **Step 2: Write the code**

**File:** `server/domain/parse.ts`

```typescript
import type { z } from "zod";
import { DomainError } from "@/server/domain/errors";

/**
 * Parses `input` with `schema` or throws `DomainError("invalid-input")` naming the first problem's path and rule, never its
 * value: what was typed may be a name or an address.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.join(".") ?? "";
  throw new DomainError("invalid-input", `${path === "" ? "The input" : path} ${issue?.message ?? "is not valid"}`);
}
```


**File:** `server/domain/inputs.ts`

```typescript
import { z } from "zod";
import { CAMPAIGN_STATUSES } from "@/lib/domain/campaign-status";

/**
 * What a Fynix admin may send to the domain services, parsed at the boundary: every service takes `unknown` and parses it
 * here, so a form, a script and a test all meet the same rules. Text is trimmed, bounded, and never empty where a name is
 * required. A `DomainError("invalid-input")` is thrown with the first problem's path, never its value.
 */
const name = (max: number) => z.string().trim().min(1, "is required").max(max, `must be at most ${max} characters`);
const optionalText = (max: number) => z.string().trim().max(max, `must be at most ${max} characters`);
const list = z.array(name(80)).max(30, "must have at most 30 entries");
const count = z.number().int().min(0).max(1_000_000);

export const createOrganisationSchema = z
  .object({
    kind: z.enum(["client", "agency"]),
    name: name(120),
    /** What an agency sees of a client. Required for a client; an agency has none. */
    brandName: name(80).optional(),
  })
  .strict()
  .refine((input) => (input.kind === "client") === (input.brandName !== undefined), { path: ["brandName"], message: "is required for a client and not allowed for an agency" });
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

export const updateOrganisationSchema = z
  .object({ name: name(120).optional(), brandName: name(80).optional() })
  .strict()
  .refine((input) => input.name !== undefined || input.brandName !== undefined, { message: "must change something" });
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;

const campaignRequired = {
  name: name(120),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  monthlyTarget: count,
  totalTarget: count,
};
const campaignOptional = {
  geography: optionalText(200),
  industries: list,
  companySize: optionalText(100),
  icp: optionalText(4000),
  jobTitles: list,
  seniority: optionalText(100),
  technologies: list,
  bantBudget: optionalText(1000),
  bantAuthority: optionalText(1000),
  bantNeed: optionalText(1000),
  bantTimeline: optionalText(1000),
  instructions: optionalText(4000),
  /** Fynix only: no tenant role can read it. */
  internalNotes: optionalText(4000).nullable(),
};

export const createCampaignSchema = z
  .object({ clientOrgId: z.uuid(), agencyOrgId: z.uuid(), ...campaignRequired, ...z.object(campaignOptional).partial().shape })
  .strict()
  .refine((input) => input.endDate >= input.startDate, { path: ["endDate"], message: "must not be before the start date" });
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** The client and the agency are fixed when a campaign is created: changing one later would orphan its leads (phase 2) and the aliases the client has seen. */
export const updateCampaignSchema = z
  .object({ ...z.object(campaignRequired).partial().shape, ...z.object(campaignOptional).partial().shape, status: z.enum(CAMPAIGN_STATUSES).optional() })
  .strict()
  .refine((input) => Object.keys(input).length > 0, { message: "must change something" });
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const publishTermsSchema = z.object({ party: z.enum(["client", "agency", "fynix"]), title: name(160), body: name(60_000) }).strict();
export type PublishTermsInput = z.infer<typeof publishTermsSchema>;

export const issueInviteSchema = z
  .object({
    organisationId: z.uuid(),
    email: z.email().max(254),
    name: name(120),
    role: z.enum(["member", "manager"]).default("member"),
    /** The Fynix name the client sees for an agency user. Required for an agency, not allowed for a client. */
    alias: name(60).optional(),
  })
  .strict();
export type IssueInviteInput = z.input<typeof issueInviteSchema>;

export const aliasSchema = z.string().trim().min(2, "must be at least 2 characters").max(60, "must be at most 60 characters");
export const displayNameSchema = name(120);
export const uuidSchema = z.uuid();
```


**File:** `server/domain/refs.ts`

```typescript
import { generatePublicRef, type RandomBytes, type RefPrefix } from "@/lib/domain/public-ref";
import type { ScopedTransaction } from "@/server/db/scope";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";

const MAX_ATTEMPTS = 6;

/**
 * Runs `insert` with a fresh public reference and tries again with another one when the unique constraint says it is
 * taken. Four base-32 characters are about a million references, so a collision is rare and a retry is cheap. Each attempt
 * is a savepoint: a unique violation aborts a Postgres transaction, and without the savepoint the retry (and the audit
 * row that follows) would fail with "current transaction is aborted".
 */
export async function insertWithPublicRef<T>(
  tx: ScopedTransaction,
  spec: { readonly prefix: RefPrefix; readonly constraint: string; readonly randomBytes: RandomBytes },
  insert: (attempt: ScopedTransaction, ref: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const ref = generatePublicRef(spec.prefix, spec.randomBytes);
    try {
      return await tx.transaction((inner) => insert(inner, ref));
    } catch (error) {
      if (!isUniqueViolation(error, spec.constraint)) throw error;
    }
  }
  throw new DomainError("ref-exhausted", `No free ${spec.prefix} reference was found in ${MAX_ATTEMPTS} attempts.`);
}
```


**File:** `server/domain/snapshots.ts`

```typescript
import type { JsonObject } from "@/server/domain/audit";

/**
 * The state of a record as the audit log keeps it, built field by field. The audit log is read by Fynix only, but it is kept
 * forever, so it holds what a person needs to see what changed and nothing that could be used: never a token hash, a link, a
 * password or a session. Each function names its fields on purpose; a new column is not in the log until someone adds it here.
 */
export interface OrganisationRow {
  readonly publicRef: string;
  readonly kind: string;
  readonly name: string;
  readonly brandName: string | null;
  readonly status: string;
}

export function snapshotOrganisation(row: OrganisationRow): JsonObject {
  return { ref: row.publicRef, kind: row.kind, name: row.name, brandName: row.brandName, status: row.status };
}

export interface CampaignRow {
  readonly publicRef: string;
  readonly name: string;
  readonly clientOrgId: string;
  readonly agencyOrgId: string;
  readonly status: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly geography: string;
  readonly industries: readonly string[];
  readonly companySize: string;
  readonly icp: string;
  readonly jobTitles: readonly string[];
  readonly seniority: string;
  readonly technologies: readonly string[];
  readonly bantBudget: string;
  readonly bantAuthority: string;
  readonly bantNeed: string;
  readonly bantTimeline: string;
  readonly instructions: string;
  readonly internalNotes: string | null;
}

export function snapshotCampaign(row: CampaignRow): JsonObject {
  return {
    ref: row.publicRef,
    name: row.name,
    clientOrgId: row.clientOrgId,
    agencyOrgId: row.agencyOrgId,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    monthlyTarget: row.monthlyTarget,
    totalTarget: row.totalTarget,
    geography: row.geography,
    industries: [...row.industries],
    companySize: row.companySize,
    icp: row.icp,
    jobTitles: [...row.jobTitles],
    seniority: row.seniority,
    technologies: [...row.technologies],
    bantBudget: row.bantBudget,
    bantAuthority: row.bantAuthority,
    bantNeed: row.bantNeed,
    bantTimeline: row.bantTimeline,
    instructions: row.instructions,
    internalNotes: row.internalNotes,
  };
}

export interface InviteRow {
  readonly orgId: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly alias: string | null;
  readonly expiresAt: Date;
}

/** An invite, without its token or hash. */
export function snapshotInvite(row: InviteRow): JsonObject {
  return { orgId: row.orgId, email: row.email, name: row.name, role: row.role, alias: row.alias, expiresAt: row.expiresAt.toISOString() };
}

export interface MemberRow {
  readonly orgId: string;
  readonly role: string;
  readonly displayName: string;
  readonly status: string;
}

export function snapshotMember(row: MemberRow): JsonObject {
  return { orgId: row.orgId, role: row.role, displayName: row.displayName, status: row.status };
}
```


**File:** `server/domain/organisations.ts`

```typescript
import { eq } from "drizzle-orm";
import { organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { createOrganisationSchema, updateOrganisationSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";
import { snapshotOrganisation } from "@/server/domain/snapshots";

/** What a service returns about an organisation: the reference that is safe to show, and the id the admin screens address it by. */
export interface OrganisationRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly kind: "fynix" | "client" | "agency";
  readonly name: string;
  readonly brandName: string | null;
  readonly status: "active" | "archived";
}

const columns = {
  id: organisation.id,
  publicRef: organisation.publicRef,
  kind: organisation.kind,
  name: organisation.name,
  brandName: organisation.brandName,
  status: organisation.status,
};

async function loadEditable(tx: ScopedTransaction, id: string): Promise<OrganisationRecord> {
  const [row] = await tx.select(columns).from(organisation).where(eq(organisation.id, id)).limit(1).for("update");
  if (row === undefined) throw new DomainError("not-found", "There is no such organisation.");
  // The Fynix organisation is the admin's own. It is created by `pnpm admin:create` and nothing here changes or archives it.
  if (row.kind === "fynix") throw new DomainError("invalid-transition", "The Fynix organisation cannot be changed here.");
  return row;
}

/** Creates a client or an agency. The reference is generated here (`ORG-` and four characters) and retried when it is taken. */
export async function createOrganisation(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createOrganisationSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const created = await insertWithPublicRef(tx, { prefix: "ORG", constraint: "organisation_public_ref_unique", randomBytes: deps.randomBytes }, async (attempt, publicRef) => {
      const [row] = await attempt.insert(organisation).values({ publicRef, kind: parsed.kind, name: parsed.name, brandName: parsed.brandName ?? null }).returning(columns);
      if (row === undefined) throw new Error("The organisation insert returned no row");
      return row;
    });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created) });
    return created;
  });
}

/** Renames an organisation or changes a client's brand name. The brand copy on the client's campaigns follows (migration 0004). */
export async function updateOrganisation(deps: DomainDeps, actor: FynixActor, organisationId: string, input: unknown): Promise<OrganisationRecord> {
  const id = parseInput(uuidSchema, organisationId);
  const parsed = parseInput(updateOrganisationSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadEditable(tx, id);
    if (parsed.brandName !== undefined && before.kind !== "client") throw new DomainError("invalid-input", "Only a client has a brand name.");
    const [after] = await tx
      .update(organisation)
      .set({ ...(parsed.name === undefined ? {} : { name: parsed.name }), ...(parsed.brandName === undefined ? {} : { brandName: parsed.brandName }) })
      .where(eq(organisation.id, id))
      .returning(columns);
    if (after === undefined) throw new Error("The organisation update returned no row");
    await audit({ action: "organisation.update", subject: { table: "organisation", id, ref: after.publicRef }, before: snapshotOrganisation(before), after: snapshotOrganisation(after) });
    return after;
  });
}

/**
 * Archives or restores an organisation: nothing is deleted (decision D8). An archived organisation takes no new invite and
 * no new campaign. It does not end its members' sessions: Fynix suspends people one by one (server/domain/members.ts).
 */
export async function setOrganisationStatus(deps: DomainDeps, actor: FynixActor, organisationId: string, status: "active" | "archived"): Promise<OrganisationRecord> {
  const id = parseInput(uuidSchema, organisationId);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadEditable(tx, id);
    if (before.status === status) throw new DomainError("invalid-transition", `The organisation is already ${status}.`);
    const [after] = await tx.update(organisation).set({ status }).where(eq(organisation.id, id)).returning(columns);
    if (after === undefined) throw new Error("The organisation update returned no row");
    await audit({
      action: status === "archived" ? "organisation.archive" : "organisation.restore",
      subject: { table: "organisation", id, ref: after.publicRef },
      before: snapshotOrganisation(before),
      after: snapshotOrganisation(after),
    });
    return after;
  });
}
```


**File:** `server/domain/campaigns.ts`

```typescript
import { eq } from "drizzle-orm";
import { campaignAuditAction, canMoveCampaign, type CampaignStatus } from "@/lib/domain/campaign-status";
import { campaign, organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { createCampaignSchema, updateCampaignSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";
import { snapshotCampaign, type CampaignRow } from "@/server/domain/snapshots";

export interface CampaignRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
}

const campaignColumns = {
  id: campaign.id,
  publicRef: campaign.publicRef,
  name: campaign.name,
  clientOrgId: campaign.clientOrgId,
  agencyOrgId: campaign.agencyOrgId,
  status: campaign.status,
  startDate: campaign.startDate,
  endDate: campaign.endDate,
  monthlyTarget: campaign.monthlyTarget,
  totalTarget: campaign.totalTarget,
  geography: campaign.geography,
  industries: campaign.industries,
  companySize: campaign.companySize,
  icp: campaign.icp,
  jobTitles: campaign.jobTitles,
  seniority: campaign.seniority,
  technologies: campaign.technologies,
  bantBudget: campaign.bantBudget,
  bantAuthority: campaign.bantAuthority,
  bantNeed: campaign.bantNeed,
  bantTimeline: campaign.bantTimeline,
  instructions: campaign.instructions,
  internalNotes: campaign.internalNotes,
};

const record = (row: CampaignRow & { readonly id: string; readonly status: CampaignStatus }): CampaignRecord => ({ id: row.id, publicRef: row.publicRef, name: row.name, status: row.status });

/** The organisation must exist, be of the right kind and be active. A client id that is really an agency is refused here and again by the database (`campaign_client_org_fk`). */
async function requireActiveOrganisation(tx: ScopedTransaction, id: string, kind: "client" | "agency"): Promise<void> {
  const [row] = await tx.select({ kind: organisation.kind, status: organisation.status }).from(organisation).where(eq(organisation.id, id)).limit(1);
  if (row === undefined || row.kind !== kind) throw new DomainError("not-found", `There is no such ${kind}.`);
  if (row.status !== "active") throw new DomainError("organisation-archived", `The ${kind} is archived.`);
}

/**
 * Creates a campaign for one client and one agency, both of which must exist and be active. `status` is not an input: a new
 * campaign is always a draft, and `updateCampaign` activates it. The reference (`CMP-` and four characters) is generated and
 * retried when taken.
 */
export async function createCampaign(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<CampaignRecord> {
  const parsed = parseInput(createCampaignSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    await requireActiveOrganisation(tx, parsed.clientOrgId, "client");
    await requireActiveOrganisation(tx, parsed.agencyOrgId, "agency");
    const created = await insertWithPublicRef(tx, { prefix: "CMP", constraint: "campaign_public_ref_unique", randomBytes: deps.randomBytes }, async (attempt, publicRef) => {
      const [row] = await attempt.insert(campaign).values({ ...parsed, publicRef }).returning(campaignColumns);
      if (row === undefined) throw new Error("The campaign insert returned no row");
      return row;
    });
    await audit({ action: "campaign.create", subject: { table: "campaign", id: created.id, ref: created.publicRef }, before: null, after: snapshotCampaign(created) });
    return record(created);
  });
}

/**
 * Changes a campaign's details or its status. The client and the agency are fixed at creation. A status change must be one
 * `canMoveCampaign` allows, and moving into or out of `archived` has its own audit action. The row is locked while it is read, so
 * two admins editing one campaign take turns and the second sees the first's result.
 */
export async function updateCampaign(deps: DomainDeps, actor: FynixActor, campaignId: string, input: unknown): Promise<CampaignRecord> {
  const id = parseInput(uuidSchema, campaignId);
  const parsed = parseInput(updateCampaignSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [before] = await tx.select(campaignColumns).from(campaign).where(eq(campaign.id, id)).limit(1).for("update");
    if (before === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const nextStatus = parsed.status ?? before.status;
    if (nextStatus !== before.status && !canMoveCampaign(before.status, nextStatus)) {
      throw new DomainError("invalid-transition", `A ${before.status} campaign cannot become ${nextStatus}.`);
    }
    const startDate = parsed.startDate ?? before.startDate;
    const endDate = parsed.endDate ?? before.endDate;
    if (endDate < startDate) throw new DomainError("invalid-input", "endDate must not be before the start date");
    const [after] = await tx.update(campaign).set(parsed).where(eq(campaign.id, id)).returning(campaignColumns);
    if (after === undefined) throw new Error("The campaign update returned no row");
    await audit({ action: campaignAuditAction(before.status, after.status), subject: { table: "campaign", id, ref: after.publicRef }, before: snapshotCampaign(before), after: snapshotCampaign(after) });
    return record(after);
  });
}
```


- [ ] **Step 3: Run the tests and the checks**

```bash
pnpm exec vitest run server/domain/inputs
pnpm exec vitest run --config vitest.integration.config.mts server/domain
pnpm test && pnpm test:integration
pnpm lint && pnpm typecheck
```

Expected: the targeted tests pass. Then the whole suites: `pnpm test`: 67 files, 772 tests pass, `pnpm test:integration`: 14 files, 402 tests pass. Lint and typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add server/domain
git commit -m "Add the organisation and campaign services with generated references and audit rows"
```

## Task 8: Terms, acceptance and the placeholder seed

**Files:** create `server/domain/terms.ts`, `placeholder-terms.ts`, `terms.integration.test.ts`, `scripts/terms-placeholder.ts`; modify `package.json`.

- **`publishTerms`** supersedes the current version and inserts the next number for that party in one transaction (the unique index allows one current version per party). Each party's versions are numbered on their own. A published text is never edited: Fynix has UPDATE on `status` only, tested by running the updates.
- **`recordAcceptance`** runs as `leads_auth` on the redemption transaction. The database accepts the row only for the **current** document of the party the user belongs to: a superseded version, another party's text (with the true party or with the user's own claimed) and a user with no membership are all refused, and a second acceptance of one version hits the unique constraint.
- **`seedPlaceholderTerms`** writes version 1 of the PLACEHOLDER text for any party that has none, as the owner, marked `placeholder`. It never touches a party that already has terms. It is not an admin action, so nothing is audited.

- [ ] **Step 1: Write the tests**

**File:** `server/domain/terms.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { termsAcceptance, termsDocument } from "@/server/db/schema";
import { captureErrorText, queryAs } from "@/server/db/testing";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite } from "@/server/domain/fynix-write";
import { seedPlaceholderTerms } from "@/server/domain/placeholder-terms";
import { publishTerms, readCurrentTerms, recordAcceptance } from "@/server/domain/terms";
import { auditRowsFor } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const documents = () => rig.dbs.owner.db.select({ party: termsDocument.party, version: termsDocument.version, status: termsDocument.status, placeholder: termsDocument.placeholder }).from(termsDocument).orderBy(termsDocument.party, termsDocument.version);
const TEXT = { party: "client", title: "Terms for clients", body: "Version one of the terms." } as const;
const userOf = (kind: "fynix" | "client" | "agency") => {
  const person = rig.world().users.find((candidate) => candidate.organisation.kind === kind);
  if (person === undefined) throw new Error(`No seeded ${kind} user`);
  return person;
};

describe("publishTerms", () => {
  it("publishes the first version as current, not placeholder, and audits it", async () => {
    const published = await publishTerms(rig.deps(), rig.actor, TEXT);
    expect(published.version).toBe(1);
    expect(await documents()).toEqual([{ party: "client", version: 1, status: "current", placeholder: false }]);
    const [audit] = await auditRowsFor(rig, "terms.publish");
    expect(audit).toMatchObject({ subjectTable: "terms_document", subjectId: published.id, before: null, after: { version: 1, title: "Terms for clients", party: "client", placeholder: false } });
  });

  it("supersedes the old version when a new one is published, so there is one current version and the users must accept the new text", async () => {
    const first = await publishTerms(rig.deps(), rig.actor, TEXT);
    const second = await publishTerms(rig.deps(), rig.actor, { ...TEXT, title: "Terms for clients, version two", body: "Version two." });
    expect(second.version).toBe(2);
    expect(await documents()).toEqual([
      { party: "client", version: 1, status: "superseded", placeholder: false },
      { party: "client", version: 2, status: "current", placeholder: false },
    ]);
    expect((await readCurrentTerms(rig.dbs.roles.leads_auth.db, "client"))?.id).toBe(second.id);
    const audits = await auditRowsFor(rig, "terms.publish");
    expect(audits[1]).toMatchObject({ before: { version: 1, title: "Terms for clients", status: "current" }, after: { version: 2 } });
    expect(first.id).not.toBe(second.id);
  });

  it("numbers each party's versions on its own", async () => {
    await publishTerms(rig.deps(), rig.actor, TEXT);
    await publishTerms(rig.deps(), rig.actor, { ...TEXT, party: "agency", title: "Terms for agencies" });
    await publishTerms(rig.deps(), rig.actor, TEXT);
    expect((await documents()).map((row) => `${row.party} ${row.version} ${row.status}`)).toEqual(["client 1 superseded", "client 2 current", "agency 1 current"]);
  });

  it("refuses an empty title or body, and a party that does not exist", async () => {
    for (const input of [{ ...TEXT, title: " " }, { ...TEXT, body: "" }, { ...TEXT, party: "everyone" }]) {
      try {
        await publishTerms(rig.deps(), rig.actor, input);
        throw new Error("Expected a refusal");
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe("invalid-input");
      }
    }
    expect(await documents()).toEqual([]);
  });

  it("never edits a published text: Fynix cannot update the body or the title, only the status", async () => {
    await publishTerms(rig.deps(), rig.actor, TEXT);
    for (const statement of ["update terms_document set body = 'changed'", "update terms_document set title = 'changed'", "update terms_document set placeholder = false", "delete from terms_document"]) {
      expect(await captureErrorText(queryAs(rig.dbs.roles.leads_fynix.db, { orgId: null, userId: rig.actor.userId }, statement)), statement).toContain("permission denied for table terms_document");
    }
  });

  it("allows only one current version per party, even for a write that bypasses the service", async () => {
    await publishTerms(rig.deps(), rig.actor, TEXT);
    const message = await captureErrorText(
      fynixWrite(rig.deps().fynixDb, rig.actor, async ({ tx, audit }) => {
        await tx.insert(termsDocument).values({ party: "client", version: 2, title: "t", body: "b" });
        await audit({ action: "terms.publish", subject: { table: "terms_document", id: rig.actor.userId } });
      }),
    );
    expect(message).toContain("terms_document_one_current");
  });
});

describe("readCurrentTerms", () => {
  it("is null for a party with no terms, and the current version otherwise", async () => {
    expect(await readCurrentTerms(rig.dbs.roles.leads_auth.db, "agency")).toBeNull();
    await publishTerms(rig.deps(), rig.actor, { ...TEXT, party: "agency", title: "Terms for agencies" });
    expect(await readCurrentTerms(rig.dbs.roles.leads_auth.db, "agency")).toMatchObject({ party: "agency", version: 1, title: "Terms for agencies", placeholder: false });
  });
});

describe("recordAcceptance, as leads_auth", () => {
  const authDb = () => rig.dbs.roles.leads_auth.db;
  const accepted = () => rig.dbs.owner.db.select().from(termsAcceptance);

  it("records the user, the version, the party, the time and the network address", async () => {
    const { id } = await publishTerms(rig.deps(), rig.actor, TEXT);
    const person = userOf("client");
    await recordAcceptance(authDb(), { userId: person.id, documentId: id, party: "client", networkAddress: "203.0.113.9" });
    expect(await accepted()).toMatchObject([{ userId: person.id, documentId: id, party: "client", networkAddress: "203.0.113.9" }]);
    expect((await accepted())[0]?.acceptedAt).toBeInstanceOf(Date);
  });

  it("refuses a version that is no longer current: the user must accept the new one", async () => {
    const old = await publishTerms(rig.deps(), rig.actor, TEXT);
    await publishTerms(rig.deps(), rig.actor, TEXT);
    const message = await captureErrorText(recordAcceptance(authDb(), { userId: userOf("client").id, documentId: old.id, party: "client", networkAddress: "x" }));
    expect(message).toContain('new row violates row-level security policy for table "terms_acceptance"');
    expect(await accepted()).toEqual([]);
  });

  it("refuses the terms of another party, whether the row says the true party or claims the user's own", async () => {
    const agencyTerms = await publishTerms(rig.deps(), rig.actor, { ...TEXT, party: "agency", title: "Terms for agencies" });
    const client = userOf("client");
    expect(await captureErrorText(recordAcceptance(authDb(), { userId: client.id, documentId: agencyTerms.id, party: "agency", networkAddress: "x" }))).toContain("row-level security");
    expect(await captureErrorText(recordAcceptance(authDb(), { userId: client.id, documentId: agencyTerms.id, party: "client", networkAddress: "x" }))).toContain("terms_acceptance_document_fk");
    expect(await accepted()).toEqual([]);
  });

  it("refuses a user who belongs to no organisation, and a second acceptance of the same version", async () => {
    const { id } = await publishTerms(rig.deps(), rig.actor, TEXT);
    const person = userOf("client");
    expect(await captureErrorText(recordAcceptance(authDb(), { userId: "99999999-9999-4999-8999-999999999999", documentId: id, party: "client", networkAddress: "x" }))).toContain("violates");
    await recordAcceptance(authDb(), { userId: person.id, documentId: id, party: "client", networkAddress: "x" });
    expect(await captureErrorText(recordAcceptance(authDb(), { userId: person.id, documentId: id, party: "client", networkAddress: "y" }))).toContain("terms_acceptance_user_document_unique");
  });

  it("is readable by Fynix, who sees who accepted which version, and by nobody else on the identity side", async () => {
    const { id } = await publishTerms(rig.deps(), rig.actor, TEXT);
    const person = userOf("client");
    await recordAcceptance(authDb(), { userId: person.id, documentId: id, party: "client", networkAddress: "203.0.113.9" });
    const seen = await queryAs(rig.dbs.roles.leads_fynix.db, { orgId: null, userId: rig.actor.userId }, "select user_id, network_address from terms_acceptance");
    expect(seen).toEqual([{ user_id: person.id, network_address: "203.0.113.9" }]);
    expect(await captureErrorText(queryAs(authDb(), null, "select * from terms_acceptance"))).toContain("permission denied for table terms_acceptance");
    expect(await rig.dbs.owner.db.select({ id: termsAcceptance.id }).from(termsAcceptance).where(eq(termsAcceptance.userId, person.id))).toHaveLength(1);
  });
});

describe("seedPlaceholderTerms", () => {
  it("writes version 1 for every party, marked placeholder and current", async () => {
    expect(await seedPlaceholderTerms(rig.dbs.owner.db)).toEqual(["client", "agency", "fynix"]);
    // Ordered the way Postgres orders the organisation_kind enum: fynix, client, agency.
    expect(await documents()).toEqual([
      { party: "fynix", version: 1, status: "current", placeholder: true },
      { party: "client", version: 1, status: "current", placeholder: true },
      { party: "agency", version: 1, status: "current", placeholder: true },
    ]);
    const current = await readCurrentTerms(rig.dbs.roles.leads_auth.db, "client");
    expect(current?.title).toContain("PLACEHOLDER");
    expect(current?.body).toContain("PLACEHOLDER");
  });

  it("never touches a party that already has terms, and writes nothing the second time", async () => {
    await publishTerms(rig.deps(), rig.actor, TEXT);
    expect(await seedPlaceholderTerms(rig.dbs.owner.db)).toEqual(["agency", "fynix"]);
    expect(await seedPlaceholderTerms(rig.dbs.owner.db)).toEqual([]);
    expect((await documents()).filter((row) => row.party === "client")).toEqual([{ party: "client", version: 1, status: "current", placeholder: false }]);
  });

  it("is a development tool, not an admin action: nothing is audited", async () => {
    await seedPlaceholderTerms(rig.dbs.owner.db);
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});
```


Run it. Expected: FAIL: `Cannot find package '@/server/domain/placeholder-terms' imported from .../terms.integration.test.ts`.

- [ ] **Step 2: Write the code**

**File:** `server/domain/terms.ts`

```typescript
import { and, desc, eq } from "drizzle-orm";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import type { AuthDatabase } from "@/server/auth/auth-database";
import { termsAcceptance, termsDocument } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { publishTermsSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/** A published version of the terms for one party, as the accept-invite page shows it. */
export interface TermsRecord {
  readonly id: string;
  readonly party: OrganisationKind;
  readonly version: number;
  readonly title: string;
  readonly body: string;
  /** True while the text is not yet lawyer-approved (gate G2). */
  readonly placeholder: boolean;
  readonly publishedAt: Date;
}

const termsColumns = {
  id: termsDocument.id,
  party: termsDocument.party,
  version: termsDocument.version,
  title: termsDocument.title,
  body: termsDocument.body,
  placeholder: termsDocument.placeholder,
  publishedAt: termsDocument.publishedAt,
};

/** The current terms of a party, or `null` when none has been published. Read by `leads_auth` (invite redemption) and, in scripts, by the owner. */
export async function readCurrentTerms(db: Pick<AuthDatabase, "select">, party: OrganisationKind): Promise<TermsRecord | null> {
  const [row] = await db.select(termsColumns).from(termsDocument).where(and(eq(termsDocument.party, party), eq(termsDocument.status, "current"))).limit(1);
  return row ?? null;
}

/**
 * Publishes a new version of the terms for a party. The old current version becomes `superseded` in the same transaction and
 * the new one is `current` (the database allows exactly one current version per party), so every user of the party is asked
 * to accept the new text. A published text is never edited: the way to change it is to publish another version.
 */
export async function publishTerms(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<{ readonly id: string; readonly version: number }> {
  const parsed = parseInput(publishTermsSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    // The newest version is the one with the highest number, current or not; the lock stops two admins publishing the same number.
    const [latest] = await tx.select({ id: termsDocument.id, version: termsDocument.version, title: termsDocument.title, status: termsDocument.status }).from(termsDocument).where(eq(termsDocument.party, parsed.party)).orderBy(desc(termsDocument.version)).limit(1).for("update");
    if (latest?.status === "current") await tx.update(termsDocument).set({ status: "superseded" }).where(eq(termsDocument.id, latest.id));
    const version = (latest?.version ?? 0) + 1;
    const [created] = await tx.insert(termsDocument).values({ party: parsed.party, version, title: parsed.title, body: parsed.body }).returning({ id: termsDocument.id });
    if (created === undefined) throw new Error("The terms insert returned no row");
    await audit({
      action: "terms.publish",
      subject: { table: "terms_document", id: created.id, ref: `${parsed.party} v${version}` },
      before: latest === undefined ? null : { version: latest.version, title: latest.title, status: latest.status },
      after: { version, title: parsed.title, party: parsed.party, placeholder: false },
    });
    return { id: created.id, version };
  });
}

export interface NewAcceptance {
  readonly userId: string;
  readonly documentId: string;
  readonly party: OrganisationKind;
  /** The network address the person accepted from (`clientAddressFrom`), `unknown` when no proxy header was present. */
  readonly networkAddress: string;
}

/**
 * Records that a user accepted a version of the terms. Runs as `leads_auth`, on the transaction that creates the account for
 * invite redemption, and the database allows the row only for the current document of the party the user belongs to
 * (migration 0013). A second acceptance of the same version is refused by the unique constraint.
 */
export async function recordAcceptance(db: Pick<AuthDatabase, "insert">, acceptance: NewAcceptance): Promise<void> {
  await db.insert(termsAcceptance).values(acceptance);
}
```


**File:** `server/domain/placeholder-terms.ts`

```typescript
import { eq } from "drizzle-orm";
import { PLACEHOLDER_TERMS } from "@/lib/terms/placeholder";
import type { Database } from "@/server/db/pool";
import { termsDocument } from "@/server/db/schema";

const PARTIES = ["client", "agency", "fynix"] as const;

/**
 * Writes version 1 of the PLACEHOLDER terms for every party that has no terms at all, marked `placeholder = true` and
 * `current`. Run as the owner by `pnpm terms:placeholder` for a development database, and by the tests. It never touches a
 * party that already has a document, so it cannot replace real terms. Returns the parties it wrote. Not an admin action:
 * the owner is not Fynix, and nothing is audited. In production the first real terms are published through the terms
 * screen (phase 1D) after gate G2.
 */
export async function seedPlaceholderTerms(ownerDb: Database): Promise<readonly (typeof PARTIES)[number][]> {
  const written: (typeof PARTIES)[number][] = [];
  for (const party of PARTIES) {
    const existing = await ownerDb.select({ id: termsDocument.id }).from(termsDocument).where(eq(termsDocument.party, party)).limit(1);
    if (existing.length > 0) continue;
    const { title, body } = PLACEHOLDER_TERMS[party];
    await ownerDb.insert(termsDocument).values({ party, version: 1, title, body, placeholder: true });
    written.push(party);
  }
  return written;
}
```


**File:** `scripts/terms-placeholder.ts`

```typescript
import { createDatabase } from "@/server/db/pool";
import { seedPlaceholderTerms } from "@/server/domain/placeholder-terms";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Development only: writes the PLACEHOLDER terms (lib/terms/placeholder.ts) for any party that has none, so an invite can be
// redeemed against a development database. They are marked placeholder and are replaced with lawyer-approved text before
// any real user is invited (gate G2). It never overwrites a party that already has terms.
runScript(async () => {
  loadEnvLocal();
  const owner = createDatabase(getToolingEnv().DATABASE_URL_OWNER, { max: 1 });
  try {
    const written = await seedPlaceholderTerms(owner.db);
    console.log(written.length === 0 ? "Every party already has terms. Nothing was written." : `Wrote placeholder terms for: ${written.join(", ")}. They are placeholder text, not legal terms.`);
  } finally {
    await owner.close();
  }
});
```


**Edit:** `package.json`

Replace:

```json
    "db:seed": "tsx scripts/db-seed.ts",
    "admin:create": "tsx scripts/admin-create.ts",
    "mail:last": "tsx scripts/mail-last.ts",
    "outbox:run": "tsx scripts/outbox-run.ts"
  },
  "dependencies": {
    "@base-ui/react": "^1.9.0",
```

With:

```json
    "db:seed": "tsx scripts/db-seed.ts",
    "admin:create": "tsx scripts/admin-create.ts",
    "mail:last": "tsx scripts/mail-last.ts",
    "outbox:run": "tsx scripts/outbox-run.ts",
    "terms:placeholder": "tsx scripts/terms-placeholder.ts"
  },
  "dependencies": {
    "@base-ui/react": "^1.9.0",
```


- [ ] **Step 3: Run the tests and the checks**

```bash
pnpm exec vitest run --config vitest.integration.config.mts server/domain/terms
pnpm test && pnpm test:integration
pnpm lint && pnpm typecheck
```

Expected: the targeted tests pass. Then the whole suites: `pnpm test`: 67 files, 772 tests pass, `pnpm test:integration`: 15 files, 417 tests pass. Lint and typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add server scripts package.json
git commit -m "Add terms publishing and acceptance and the placeholder terms seed"
```

## Task 9: Invites: issue, resend, revoke and preview

**Files:** create `server/domain/invite-token.ts`, `aliases.ts`, `invites.ts` and their tests; modify `server/db/scope.ts`, `scope.test.ts`, `lib/auth/rate-limit-rules.ts`, `rate-limit-rules.test.ts`, `server/domain/test-helpers.ts`.

- **The token** is 32 random bytes as 43 base64url characters; only its SHA-256 (also 43 characters) is stored, and the `invite_token_hash_format` check says so. `generateInviteToken` is a pure function of the bytes, so a test can fix it.
- **`withInviteHash(db, hash, work)`** opens a transaction on `leads_auth` with `app.invite_hash` set, which is what the invite policies compare against (decision C3). It refuses anything that is not 43 base64url characters before it opens a transaction.
- **`issueInvite`** runs in one Fynix transaction: the checks (the organisation exists, is not Fynix and is active; an agency invite has an alias and a client invite does not; the address has no account; the party has current terms, and on https they are not placeholder), then the revoke of any live invite for the address together with the cancel of its unsent email, then the alias check, the new invite and its email in the outbox, and the audit rows. The alias check comes after the revoke so re-inviting a person under their own alias is not a clash with themselves, and a clash rolls the revoke back (tested).
- **The token is returned to nobody.** It exists in the link in the outbox row until that message is sent, and nowhere else: the tests search the invite rows, the audit rows and the stored copy for it.
- **`resendInvite`** revokes and issues again with the same person, organisation, role and alias, because the old link cannot be recovered. **`revokeInvite`** locks the row, refuses a used or already revoked invite, and cancels the unsent email.
- **`previewInvite`** is what the accept-invite page reads. It consumes the lookup limit first, for any input, so a scan costs requests; a value that is not shaped like a token never reaches the database; and the states other than `pending` carry no name and no address.
- The database repeats what the services check: the tests also redeem directly as `leads_auth` with an invite that is expired, revoked or used, and the update policy refuses each, and an insert that bypasses the service hits `invite_one_live`.

- [ ] **Step 1: Write the tests**

**Edit:** `server/db/scope.test.ts`

Replace:

```typescript
import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { assertUuid, withOrgScope, withScope } from "@/server/db/scope";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
```

With:

```typescript
import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { assertUuid, withInviteHash, withOrgScope, withScope } from "@/server/db/scope";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
```

**Edit:** `server/db/scope.test.ts`

Replace:

```typescript
      );
    },
  );
});
```

With:

```typescript
      );
    },
  );
});

describe("withInviteHash", () => {
  const HASH = "a".repeat(43);

  it.each(["", "short", `${HASH}x`, `${"a".repeat(42)}!`, `${HASH}'; drop table invite`])("refuses %j before opening a transaction, without echoing it", async (value) => {
    const { db, calls } = spyDatabase();
    await expect(withInviteHash(db, value, async () => "unreachable")).rejects.toThrow("tokenHash must be a 43 character base64url SHA-256");
    expect(calls).toEqual([]);
  });

  it("sets the hash inside one transaction, then runs the work", async () => {
    const { db, calls } = spyDatabase();
    await expect(withInviteHash(db, HASH, async () => "done")).resolves.toBe("done");
    expect(calls).toEqual(["transaction", "set_config"]);
  });
});
```


**Edit:** `lib/auth/rate-limit-rules.test.ts`

Replace:

```typescript
import { describe, expect, it } from "vitest";
import { resetCompleteChecks, resetRequestChecks, retryMessage, signInChecks } from "./rate-limit-rules";

describe("signInChecks", () => {
  const checks = signInChecks("a@example.com", "203.0.113.9");
```

With:

```typescript
import { describe, expect, it } from "vitest";
import { inviteLookupChecks, inviteRedeemChecks, resetCompleteChecks, resetRequestChecks, retryMessage, signInChecks } from "./rate-limit-rules";

describe("signInChecks", () => {
  const checks = signInChecks("a@example.com", "203.0.113.9");
```

**Edit:** `lib/auth/rate-limit-rules.test.ts`

Replace:

```typescript
  });
});

describe("retryMessage", () => {
  it("rounds up to whole minutes and never says 0", () => {
    expect(retryMessage(1)).toBe("Too many attempts. Try again in 1 minute.");
```

With:

```typescript
  });
});

describe("inviteLookupChecks and inviteRedeemChecks", () => {
  it("limit a network's lookups, and a network's and an invite's redemptions, each under its own key", () => {
    expect(inviteLookupChecks("203.0.113.9")).toEqual([{ key: "invite-lookup:network:203.0.113.9", rule: { limit: 30, windowSeconds: 900 } }]);
    const [network, token] = inviteRedeemChecks("HASH", "203.0.113.9");
    expect(network).toEqual({ key: "invite-redeem:network:203.0.113.9", rule: { limit: 10, windowSeconds: 3600 } });
    expect(token).toEqual({ key: "invite-redeem:token:HASH", rule: { limit: 10, windowSeconds: 3600 } });
  });

  it("do not share a budget with sign-in or reset", () => {
    const keys = [...signInChecks("a@example.com", "x"), ...resetRequestChecks("a@example.com", "x"), ...resetCompleteChecks("x"), ...inviteLookupChecks("x"), ...inviteRedeemChecks("h", "x")].map((check) => check.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("retryMessage", () => {
  it("rounds up to whole minutes and never says 0", () => {
    expect(retryMessage(1)).toBe("Too many attempts. Try again in 1 minute.");
```


**File:** `server/domain/invite-token.test.ts`

```typescript
import { createHash, randomFillSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken, isWellFormedInviteToken } from "./invite-token";

const bytes = (count: number): Uint8Array => randomFillSync(new Uint8Array(count));

describe("generateInviteToken", () => {
  it("makes a 43 character base64url token and stores only its SHA-256, also 43 characters", () => {
    const { token, tokenHash } = generateInviteToken(bytes);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("base64url"));
    expect(tokenHash).not.toBe(token);
  });

  it("is different every time", () => {
    expect(new Set(Array.from({ length: 200 }, () => generateInviteToken(bytes).token)).size).toBe(200);
  });

  it("is a pure function of the random bytes, so a test can fix it", () => {
    const fixed = () => Uint8Array.from({ length: 32 }, (_, index) => index);
    expect(generateInviteToken(fixed)).toEqual(generateInviteToken(fixed));
    expect(generateInviteToken(fixed).token).toBe("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");
  });

  it("refuses a random source that returns too few bytes", () => {
    expect(() => generateInviteToken(() => new Uint8Array(8))).toThrow(RangeError);
  });
});

describe("hashInviteToken and isWellFormedInviteToken", () => {
  it("hashes the same token to the same value, and different tokens to different values", () => {
    expect(hashInviteToken("a".repeat(43))).toBe(hashInviteToken("a".repeat(43)));
    expect(hashInviteToken("a".repeat(43))).not.toBe(hashInviteToken("b".repeat(43)));
  });

  it.each(["", "short", "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)} `, `${"a".repeat(42)}/`])("does not accept %j as a token", (value) => {
    expect(isWellFormedInviteToken(value)).toBe(false);
  });

  it("accepts a generated token", () => {
    expect(isWellFormedInviteToken(generateInviteToken(bytes).token)).toBe(true);
  });
});
```


**Edit:** `server/domain/test-helpers.ts`

Replace:

```typescript
import { asc, eq, getTableColumns } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { auditLog } from "@/server/db/schema";
import type { AuditAction } from "@/server/domain/audit";
import type { DomainRig } from "@/server/domain/testing";

/** A random source that answers from a list, one entry per call, and repeats the last entry when the list runs out. For forcing a reference collision. */
```

With:

```typescript
import { asc, desc, eq, getTableColumns } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { auditLog, emailOutbox } from "@/server/db/schema";
import type { AuditAction } from "@/server/domain/audit";
import { publishTerms } from "@/server/domain/terms";
import type { DomainRig } from "@/server/domain/testing";

/** A random source that answers from a list, one entry per call, and repeats the last entry when the list runs out. For forcing a reference collision. */
```

**Edit:** `server/domain/test-helpers.ts`

Replace:

```typescript
  return (action === undefined ? query : query.where(eq(auditLog.action, action))).orderBy(asc(auditLog.at));
}
```

With:

```typescript
  return (action === undefined ? query : query.where(eq(auditLog.action, action))).orderBy(asc(auditLog.at));
}

/** Publishes approved (not placeholder) terms for every party, through the service, so invites can be issued and redeemed. */
export async function publishApprovedTerms(rig: DomainRig): Promise<void> {
  for (const party of ["client", "agency", "fynix"] as const) {
    await publishTerms(rig.deps(), rig.actor, { party, title: `Terms for ${party} users`, body: `The approved terms for ${party} users, version one.` });
  }
}

/** The link in the newest queued message for an address, which is where the token lives until the message is sent. */
export async function latestInviteLink(rig: DomainRig, email: string): Promise<{ readonly link: string; readonly token: string }> {
  const [row] = await rig.dbs.owner.db.select({ link: emailOutbox.link }).from(emailOutbox).where(eq(emailOutbox.recipient, email)).orderBy(desc(emailOutbox.createdAt)).limit(1);
  const token = row?.link == null ? null : new URL(row.link).searchParams.get("token");
  if (row?.link == null || token === null) throw new Error(`No invite link is queued for ${email}`);
  return { link: row.link, token };
}
```


**File:** `server/domain/invites.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agencyAlias, emailOutbox, invite, member } from "@/server/db/schema";
import { withInviteHash } from "@/server/db/scope";
import { captureErrorText, queryAs } from "@/server/db/testing";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import { hashInviteToken } from "@/server/domain/invite-token";
import { issueInvite, previewInvite, resendInvite, revokeInvite } from "@/server/domain/invites";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { seedPlaceholderTerms } from "@/server/domain/placeholder-terms";
import { auditRowsFor, latestInviteLink, publishApprovedTerms } from "@/server/domain/test-helpers";
import { publishTerms } from "@/server/domain/terms";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
  await publishApprovedTerms(rig);
});

const refusal = async (work: Promise<unknown>): Promise<DomainErrorCode> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
};
const CLIENT_INVITE = () => ({ organisationId: rig.world().kestrel.id, email: "Priya.Nair@Kestrel.example", name: "Priya Nair" });
const AGENCY_INVITE = () => ({ organisationId: rig.world().northgate.id, email: "rahul@northgate.example", name: "Rahul Verma", alias: "Rahul, Fynix" });
const invites = () => rig.dbs.owner.db.select().from(invite).orderBy(invite.createdAt);
const mails = () => rig.dbs.owner.db.select().from(emailOutbox).orderBy(emailOutbox.createdAt);
const SOME_ADDRESS = "203.0.113.50";

describe("issueInvite", () => {
  it("stores the address in lower case, the name, the role and a hash of the token that is valid for seven days", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const [row] = await invites();
    expect(row).toMatchObject({ id: issued.inviteId, orgId: rig.world().kestrel.id, orgKind: "client", email: "priya.nair@kestrel.example", name: "Priya Nair", role: "member", alias: null, redeemedAt: null, revokedAt: null, createdBy: rig.actor.userId });
    expect(row?.tokenHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row?.expiresAt.getTime()).toBe(rig.clock.now.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(issued.expiresAt).toEqual(row?.expiresAt);
  });

  it("queues the email in the same transaction: the link carries the token, the stored copy does not, and nothing stores the token itself", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const { link, token } = await latestInviteLink(rig, "priya.nair@kestrel.example");
    expect(link).toBe(`http://localhost:3020/accept-invite?token=${token}`);
    const [row] = await invites();
    expect(row?.tokenHash).toBe(hashInviteToken(token));
    const [mail] = await mails();
    expect(mail).toMatchObject({ recipient: "priya.nair@kestrel.example", template: "invite", status: "pending", inviteId: issued.inviteId, subject: "You are invited to Fynix Leads", params: { name: "Priya Nair", organisationName: "Kestrel Logistics Ltd" } });
    expect(mail?.body).toContain("Hello Priya Nair,");
    expect(mail?.body).not.toContain(token);
    const everythingElse = JSON.stringify([await invites(), await auditRowsFor(rig), { ...mail, link: null }]);
    expect(everythingElse).not.toContain(token);
  });

  it("audits the issue with the person, the organisation and the expiry, and never the token, its hash or the link", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const { token } = await latestInviteLink(rig, "priya.nair@kestrel.example");
    const [row] = await invites();
    const audits = await auditRowsFor(rig, "invite.issue");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "invite", before: null, after: { orgId: rig.world().kestrel.id, email: "priya.nair@kestrel.example", name: "Priya Nair", role: "member", alias: null } });
    const text = JSON.stringify(audits);
    for (const secret of [token, row?.tokenHash ?? "x", "accept-invite"]) expect(text).not.toContain(secret);
  });

  it("issues an agency invite with its alias", async () => {
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    const [row] = await invites();
    expect(row).toMatchObject({ orgKind: "agency", alias: "Rahul, Fynix" });
  });

  it("revokes the live invite for the same address in the same transaction, cancels its unsent email, and leaves one live invite", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const firstLink = (await latestInviteLink(rig, "priya.nair@kestrel.example")).token;
    const second = await issueInvite(rig.deps(), rig.actor, { ...CLIENT_INVITE(), name: "Priya N" });
    const [old, current] = await invites();
    expect(old).toMatchObject({ id: first.inviteId, name: "Priya Nair" });
    expect(old?.revokedAt).toBeInstanceOf(Date);
    expect(current).toMatchObject({ id: second.inviteId, name: "Priya N", revokedAt: null });
    const [oldMail, newMail] = await mails();
    expect(oldMail).toMatchObject({ status: "cancelled", link: null, lastError: "the invite was revoked" });
    expect(newMail).toMatchObject({ status: "pending" });
    expect((await latestInviteLink(rig, "priya.nair@kestrel.example")).token).not.toBe(firstLink);
    expect((await auditRowsFor(rig)).map((entry) => entry.action).slice(-3)).toEqual(["invite.issue", "invite.revoke", "invite.issue"]);
  });

  it("leaves a message that was already sent alone when the invite is replaced", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await rig.dbs.owner.db.update(emailOutbox).set({ status: "sent", link: null });
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    expect((await mails()).map((mail) => mail.status)).toEqual(["sent", "pending"]);
  });

  it("is all or nothing: a refusal after the old invite was revoked puts it back", async () => {
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    await issueInvite(rig.deps(), rig.actor, { ...AGENCY_INVITE(), email: "other@northgate.example", name: "Other Person", alias: "Other, Fynix" });
    // Re-inviting the first person under the second person's alias fails at the alias check, after the revoke.
    expect(await refusal(issueInvite(rig.deps(), rig.actor, { ...AGENCY_INVITE(), alias: "Other, Fynix" }))).toBe("alias-taken");
    const live = (await invites()).filter((row) => row.revokedAt === null);
    expect(live.map((row) => row.email).sort()).toEqual(["other@northgate.example", "rahul@northgate.example"]);
    expect((await mails()).map((mail) => mail.status)).toEqual(["pending", "pending"]);
    expect((await auditRowsFor(rig)).map((entry) => entry.action)).toEqual(["terms.publish", "terms.publish", "terms.publish", "invite.issue", "invite.issue"]);
  });

  it("refuses an address that already has an account, whatever its case, and an alias that is held or promised", async () => {
    const taken = rig.world().users[1]?.email ?? "";
    expect(await refusal(issueInvite(rig.deps(), rig.actor, { ...CLIENT_INVITE(), email: taken.toUpperCase() }))).toBe("email-in-use");
    const person = rig.world().users.find((candidate) => candidate.organisation.kind === "agency");
    if (person === undefined) throw new Error("no agency user");
    const [seededMember] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, person.id));
    await rig.dbs.owner.db.insert(agencyAlias).values({ memberId: seededMember?.id ?? "", alias: "Held, Fynix" });
    expect(await refusal(issueInvite(rig.deps(), rig.actor, { ...AGENCY_INVITE(), alias: "held, FYNIX" }))).toBe("alias-taken");
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    expect(await refusal(issueInvite(rig.deps(), rig.actor, { ...AGENCY_INVITE(), email: "second@northgate.example", alias: "RAHUL, Fynix" }))).toBe("alias-taken");
    expect(await invites()).toHaveLength(1);
  });

  it.each([
    ["an agency invite with no alias", (): Record<string, unknown> => ({ ...AGENCY_INVITE(), alias: undefined }), "invalid-input"],
    ["a client invite with an alias", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), alias: "Priya, Fynix" }), "invalid-input"],
    ["an invite into the Fynix organisation", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), organisationId: rig.world().fynix.id }), "invalid-input"],
    ["an organisation that does not exist", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), organisationId: "99999999-9999-4999-8999-999999999999" }), "not-found"],
    ["an address that is not an address", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), email: "not an address" }), "invalid-input"],
    ["a role that does not exist", (): Record<string, unknown> => ({ ...CLIENT_INVITE(), role: "owner" }), "invalid-input"],
  ])("refuses %s, and writes nothing", async (_label, make, code) => {
    expect(await refusal(issueInvite(rig.deps(), rig.actor, make() as never))).toBe(code);
    expect(await invites()).toEqual([]);
    expect(await mails()).toEqual([]);
  });

  it("refuses an archived organisation", async () => {
    await setOrganisationStatus(rig.deps(), rig.actor, rig.world().kestrel.id, "archived");
    expect(await refusal(issueInvite(rig.deps(), rig.actor, CLIENT_INVITE()))).toBe("organisation-archived");
  });

  it("refuses to invite someone when their party has no current terms to accept", async () => {
    await rig.reset();
    expect(await refusal(issueInvite(rig.deps(), rig.actor, CLIENT_INVITE()))).toBe("no-current-terms");
  });

  it("gate G2: refuses while the current terms are placeholder text on an https deployment, and allows it in development", async () => {
    await rig.reset();
    await seedPlaceholderTerms(rig.dbs.owner.db);
    expect(await refusal(issueInvite(rig.deps({ allowPlaceholderTerms: false }), rig.actor, CLIENT_INVITE()))).toBe("placeholder-terms");
    expect(await invites()).toEqual([]);
    await issueInvite(rig.deps({ allowPlaceholderTerms: true }), rig.actor, CLIENT_INVITE());
    expect(await invites()).toHaveLength(1);
    await publishTerms(rig.deps(), rig.actor, { party: "agency", title: "Approved agency terms", body: "Approved." });
    await issueInvite(rig.deps({ allowPlaceholderTerms: false }), rig.actor, AGENCY_INVITE());
    expect(await invites()).toHaveLength(2);
  });
});

describe("resendInvite and revokeInvite", () => {
  it("resends with a new link: the old invite is revoked, its unsent email cancelled, and the person, role and alias carry over", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    const firstToken = (await latestInviteLink(rig, "rahul@northgate.example")).token;
    const second = await resendInvite(rig.deps(), rig.actor, first.inviteId);
    expect(second.inviteId).not.toBe(first.inviteId);
    const [old, current] = await invites();
    expect(old?.revokedAt).toBeInstanceOf(Date);
    expect(current).toMatchObject({ email: "rahul@northgate.example", name: "Rahul Verma", alias: "Rahul, Fynix", orgKind: "agency", revokedAt: null });
    expect((await latestInviteLink(rig, "rahul@northgate.example")).token).not.toBe(firstToken);
    expect((await mails()).map((mail) => mail.status)).toEqual(["cancelled", "pending"]);
  });

  it("resends an invite that has run out", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() - 1000) });
    const second = await resendInvite(rig.deps(), rig.actor, first.inviteId);
    expect(second.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to resend an invite that was used, or one that does not exist", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await rig.dbs.owner.db.update(invite).set({ redeemedAt: new Date() });
    expect(await refusal(resendInvite(rig.deps(), rig.actor, first.inviteId))).toBe("invite-not-live");
    expect(await refusal(resendInvite(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999"))).toBe("not-found");
  });

  it("revokes a live invite and cancels its email, and audits it", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await revokeInvite(rig.deps(), rig.actor, issued.inviteId);
    const [row] = await invites();
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect((await mails())[0]).toMatchObject({ status: "cancelled", link: null });
    const [audit] = await auditRowsFor(rig, "invite.revoke");
    expect(audit).toMatchObject({ subjectId: issued.inviteId, before: { email: "priya.nair@kestrel.example" }, after: { reason: "revoked by Fynix" } });
  });

  it("cannot revoke an invite twice, a used invite or one that does not exist", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await revokeInvite(rig.deps(), rig.actor, issued.inviteId);
    expect(await refusal(revokeInvite(rig.deps(), rig.actor, issued.inviteId))).toBe("invite-not-live");
    const second = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await rig.dbs.owner.db.update(invite).set({ redeemedAt: new Date() }).where(eq(invite.id, second.inviteId));
    expect(await refusal(revokeInvite(rig.deps(), rig.actor, second.inviteId))).toBe("invite-not-live");
    expect(await refusal(revokeInvite(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999"))).toBe("not-found");
  });
});

describe("previewInvite", () => {
  const link = async () => (await latestInviteLink(rig, "priya.nair@kestrel.example")).token;

  it("shows a pending invite to whoever holds the link: the name, the address, the party and the current terms", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const preview = await previewInvite(rig.deps(), { token: await link(), address: SOME_ADDRESS });
    expect(preview).toMatchObject({ status: "pending", name: "Priya Nair", email: "priya.nair@kestrel.example", party: "client", terms: { party: "client", version: 1, placeholder: false, title: "Terms for client users" } });
  });

  it("answers invalid, with nothing about any invite, for a token that is malformed or was never issued", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    expect(await previewInvite(rig.deps(), { token: "short", address: SOME_ADDRESS })).toEqual({ status: "invalid" });
    expect(await previewInvite(rig.deps(), { token: "A".repeat(43), address: SOME_ADDRESS })).toEqual({ status: "invalid" });
  });

  it("says why a link no longer works, without any personal data: expired, revoked or used", async () => {
    const issued = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const token = await link();
    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await previewInvite(rig.deps(), { token, address: SOME_ADDRESS })).toEqual({ status: "expired" });
    await rig.dbs.owner.db.update(invite).set({ revokedAt: new Date() }).where(eq(invite.id, issued.inviteId));
    expect(await previewInvite(rig.deps(), { token, address: SOME_ADDRESS })).toEqual({ status: "revoked" });
    await rig.dbs.owner.db.update(invite).set({ revokedAt: null, redeemedAt: new Date() }).where(eq(invite.id, issued.inviteId));
    expect(await previewInvite(rig.deps(), { token, address: SOME_ADDRESS })).toEqual({ status: "redeemed" });
  });

  it("uses the clock it was given for expiry", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const token = await link();
    rig.clock.now = new Date(rig.clock.now.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(await previewInvite(rig.deps(), { token, address: SOME_ADDRESS })).toEqual({ status: "expired" });
  });

  it("limits lookups per network before it looks anything up, and counts a malformed token like any other", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const token = await link();
    for (let attempt = 1; attempt <= 30; attempt += 1) expect((await previewInvite(rig.deps(), { token: "x", address: "203.0.113.77" })).status, `attempt ${attempt}`).toBe("invalid");
    expect((await previewInvite(rig.deps(), { token, address: "203.0.113.77" })).status).toBe("rate-limited");
    expect((await previewInvite(rig.deps(), { token, address: "203.0.113.78" })).status).toBe("pending");
  });
});

describe("what the database itself allows on invite", () => {
  const authDb = () => rig.dbs.roles.leads_auth.db;

  it("shows leads_auth no invite unless the transaction names one's hash, and then only that one", async () => {
    const first = await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    expect(await queryAs(authDb(), null, "select count(*)::int as n from invite")).toEqual([{ n: 0 }]);
    const [one] = (await invites()).filter((row) => row.id === first.inviteId);
    const seen = await withInviteHash(authDb(), one?.tokenHash ?? "", (tx) => tx.select({ email: invite.email }).from(invite));
    expect(seen).toEqual([{ email: "priya.nair@kestrel.example" }]);
  });

  it("lets leads_auth redeem the named invite and nothing else, and refuses an invite that is expired, revoked or used, whatever the service checked", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    await issueInvite(rig.deps(), rig.actor, AGENCY_INVITE());
    const [client, agency] = await invites();
    const redeem = (hash: string) => withInviteHash(authDb(), hash, (tx) => tx.update(invite).set({ redeemedAt: new Date() }).returning({ id: invite.id }));

    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invite.id, client?.id ?? ""));
    expect(await redeem(client?.tokenHash ?? "")).toEqual([]);
    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() + 1000) , revokedAt: new Date() }).where(eq(invite.id, client?.id ?? ""));
    expect(await redeem(client?.tokenHash ?? "")).toEqual([]);

    expect(await redeem(agency?.tokenHash ?? "")).toEqual([{ id: agency?.id }]);
    expect(await redeem(agency?.tokenHash ?? "")).toEqual([]);
    expect((await invites()).map((row) => row.redeemedAt !== null)).toEqual([false, true]);
  });

  it("allows one live invite per address, even for an insert that bypasses the service", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const [row] = await invites();
    const message = await captureErrorText(rig.dbs.owner.db.insert(invite).values({ orgId: row?.orgId ?? "", orgKind: "client", email: row?.email ?? "", name: "Dup", tokenHash: "b".repeat(43), expiresAt: new Date(Date.now() + 1000), createdBy: rig.actor.userId }));
    expect(message).toContain("invite_one_live");
  });

  it("lets Fynix read everything about an invite except the token hash, and change only revoked_at", async () => {
    await issueInvite(rig.deps(), rig.actor, CLIENT_INVITE());
    const scope = { orgId: null, userId: rig.actor.userId };
    const fynix = rig.dbs.roles.leads_fynix.db;
    expect(await queryAs(fynix, scope, "select email, name, alias, expires_at is not null as has_expiry from invite")).toEqual([{ email: "priya.nair@kestrel.example", name: "Priya Nair", alias: null, has_expiry: true }]);
    for (const statement of ["select token_hash from invite", "select * from invite", "update invite set email = 'x@example.com'", "update invite set token_hash = 'x'", "update invite set redeemed_at = now()", "delete from invite"]) {
      expect(await captureErrorText(queryAs(fynix, scope, statement)), statement).toContain("permission denied for table invite");
    }
  });
});
```


Run `pnpm exec vitest run server/db/scope lib/auth server/domain/invite-token`. Expected: FAIL: 2 tests in `lib/auth/rate-limit-rules.test.ts` and 6 in `server/db/scope.test.ts` (`withInviteHash`, `inviteLookupChecks` and `inviteRedeemChecks` do not exist), and `./invite-token` cannot load.

- [ ] **Step 2: Write the code**

**Edit:** `server/db/scope.ts`

Replace:

```typescript
  return withScope(getDatabase(role).db, scope, work);
}

/** Runs `work` as Fynix. Policies allow every row; the user id is for the audit log phase 1C adds. */
export async function withFynixScope<T>(scope: FynixScope, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withScope(getDatabase("leads_fynix").db, { orgId: null, userId: scope.userId }, work);
}
```

With:

```typescript
  return withScope(getDatabase(role).db, scope, work);
}

const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Runs `work` as `leads_auth` with one invite in view: the row whose `token_hash` is `tokenHash`, and no other. The policies on
 * `invite` (migration 0014) compare against `app.invite_hash`, so without this a connection sees no invite at all. The
 * hash is the SHA-256 of the token in the link, which only the holder knows. Like the other scopes it is set with
 * `set_config(..., true)`, so it ends with the transaction.
 */
export async function withInviteHash<T>(db: Database, tokenHash: string, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  if (!TOKEN_HASH_PATTERN.test(tokenHash)) throw new Error("tokenHash must be a 43 character base64url SHA-256");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.invite_hash', ${tokenHash}, true)`);
    return work(tx);
  });
}

/** Runs `work` as Fynix. Policies allow every row; the user id is the actor of the audit log (server/domain/fynix-write.ts). */
export async function withFynixScope<T>(scope: FynixScope, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withScope(getDatabase("leads_fynix").db, { orgId: null, userId: scope.userId }, work);
}
```


**Edit:** `lib/auth/rate-limit-rules.ts`

Replace:

```typescript
  return [{ key: `reset-complete:network:${address}`, rule: { limit: 20, windowSeconds: ONE_HOUR } }];
}

/** "Try again in 3 minutes", from the seconds left in the window. */
export function retryMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
```

With:

```typescript
  return [{ key: `reset-complete:network:${address}`, rule: { limit: 20, windowSeconds: ONE_HOUR } }];
}

/**
 * Looking an invite link up (the accept-invite page) is a way to guess tokens, so it is limited before the lookup, per
 * network. The token itself is 32 random bytes, so guessing is hopeless; the limit is for the load and for scanners.
 */
export function inviteLookupChecks(address: string): readonly RateLimitCheck[] {
  return [{ key: `invite-lookup:network:${address}`, rule: { limit: 30, windowSeconds: FIFTEEN_MINUTES } }];
}

/**
 * Redeeming an invite sets a password, so a network may try ten times an hour, and so may one invite: a person who gets
 * the password wrong or picks a breached one a few times is fine, a script is not. `tokenHash` is the stored hash, not the token.
 */
export function inviteRedeemChecks(tokenHash: string, address: string): readonly RateLimitCheck[] {
  return [
    { key: `invite-redeem:network:${address}`, rule: { limit: 10, windowSeconds: ONE_HOUR } },
    { key: `invite-redeem:token:${tokenHash}`, rule: { limit: 10, windowSeconds: ONE_HOUR } },
  ];
}

/** "Try again in 3 minutes", from the seconds left in the window. */
export function retryMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
```


**File:** `server/domain/invite-token.ts`

```typescript
import { createHash } from "node:crypto";
import type { RandomBytes } from "@/lib/domain/public-ref";

/** 32 random bytes, 256 bits: unguessable, and never stored. */
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface InviteToken {
  /** What goes in the link. Shown to nobody but the invitee, kept nowhere but the outbox row until it is sent. */
  readonly token: string;
  /** What is stored: the SHA-256 of the token as base64url, 43 characters (the `invite_token_hash_format` constraint). */
  readonly tokenHash: string;
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function generateInviteToken(randomBytes: RandomBytes): InviteToken {
  const bytes = randomBytes(TOKEN_BYTES);
  if (bytes.length < TOKEN_BYTES) throw new RangeError(`The random source returned ${bytes.length} bytes, ${TOKEN_BYTES} are needed`);
  const token = Buffer.from(bytes.subarray(0, TOKEN_BYTES)).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

/** True for text shaped like a token (43 base64url characters). Checked before any lookup so a malformed value never reaches the database. */
export function isWellFormedInviteToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}
```


**File:** `server/domain/aliases.ts`

```typescript
import { and, isNull, ne, sql } from "drizzle-orm";
import { agencyAlias, invite } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { DomainError } from "@/server/domain/errors";

/**
 * An alias belongs to one person (the client must never see two people under one name). It is refused when another member
 * holds it or another live invite carries it, compared without regard to case. `exceptMemberId` is the member who is renaming
 * themselves: their own current alias is not a clash. The database repeats the first half (`agency_alias_alias_unique`).
 */
export async function requireFreeAlias(tx: ScopedTransaction, alias: string, exceptMemberId?: string): Promise<void> {
  const held = await tx
    .select({ id: agencyAlias.id })
    .from(agencyAlias)
    .where(and(sql`lower(${agencyAlias.alias}) = lower(${alias})`, exceptMemberId === undefined ? undefined : ne(agencyAlias.memberId, exceptMemberId)))
    .limit(1);
  const promised = await tx
    .select({ id: invite.id })
    .from(invite)
    .where(and(sql`lower(${invite.alias}) = lower(${alias})`, isNull(invite.redeemedAt), isNull(invite.revokedAt)))
    .limit(1);
  if (held.length > 0 || promised.length > 0) throw new DomainError("alias-taken", "Another person already has that alias.");
}
```


**File:** `server/domain/invites.ts`

```typescript
import { and, eq, isNull } from "drizzle-orm";
import { normaliseEmail } from "@/lib/auth/email";
import { inviteLookupChecks } from "@/lib/auth/rate-limit-rules";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import { inviteExpiry, inviteState } from "@/lib/domain/invite-state";
import { formatEmailDate } from "@/lib/email/templates";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import { invite, organisation, user } from "@/server/db/schema";
import { withInviteHash } from "@/server/db/scope";
import { requireFreeAlias } from "@/server/domain/aliases";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite, type FynixActor, type FynixWrite } from "@/server/domain/fynix-write";
import { issueInviteSchema, uuidSchema, type IssueInviteInput } from "@/server/domain/inputs";
import { generateInviteToken, hashInviteToken, isWellFormedInviteToken } from "@/server/domain/invite-token";
import { parseInput } from "@/server/domain/parse";
import { snapshotInvite } from "@/server/domain/snapshots";
import { readCurrentTerms, type TermsRecord } from "@/server/domain/terms";
import { cancelInviteMail, enqueueEmail } from "@/server/mail/outbox";

/** The path of the accept-invite page. The reset link is `/reset-password`, in the same place. */
export const ACCEPT_INVITE_PATH = "/accept-invite";

export interface IssuedInvite {
  readonly inviteId: string;
  readonly expiresAt: Date;
}

const inviteColumns = {
  id: invite.id,
  orgId: invite.orgId,
  email: invite.email,
  name: invite.name,
  role: invite.role,
  alias: invite.alias,
  expiresAt: invite.expiresAt,
  redeemedAt: invite.redeemedAt,
  revokedAt: invite.revokedAt,
};

/**
 * The whole of issuing, inside the caller's Fynix transaction: checks, revoking any live invite for the address, the new
 * invite, its email in the outbox and the audit rows. Because it is one transaction, "issue a new invite revokes the old
 * one" cannot be half done, and an invite never exists without its email being queued.
 */
async function issueWithin({ tx, audit }: FynixWrite, actor: FynixActor, deps: DomainDeps, input: IssueInviteInput): Promise<IssuedInvite> {
  const parsed = parseInput(issueInviteSchema, input);
  const email = normaliseEmail(parsed.email);

  const [org] = await tx.select({ id: organisation.id, kind: organisation.kind, name: organisation.name, status: organisation.status }).from(organisation).where(eq(organisation.id, parsed.organisationId)).limit(1);
  if (org === undefined) throw new DomainError("not-found", "There is no such organisation.");
  if (org.kind === "fynix") throw new DomainError("invalid-input", "Nobody is invited into the Fynix organisation.");
  if (org.status !== "active") throw new DomainError("organisation-archived", "The organisation is archived.");
  if (org.kind === "agency" && parsed.alias === undefined) throw new DomainError("invalid-input", "alias is required for an agency invite");
  if (org.kind === "client" && parsed.alias !== undefined) throw new DomainError("invalid-input", "alias is not allowed for a client invite");

  const existing = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing.length > 0) throw new DomainError("email-in-use", "That address already has an account.");

  const terms = await readCurrentTerms(tx, org.kind);
  if (terms === null) throw new DomainError("no-current-terms", `There are no current terms for ${org.kind} users to accept.`);
  if (terms.placeholder && !deps.allowPlaceholderTerms) throw new DomainError("placeholder-terms", "The current terms are still placeholder text. Publish approved terms first.");

  // The previous live invite for this address goes first (the unique index allows one). Its unsent email is cancelled so
  // the person is not sent a link that is already dead.
  const now = deps.now();
  const replaced = await tx.update(invite).set({ revokedAt: now }).where(and(eq(invite.email, email), isNull(invite.redeemedAt), isNull(invite.revokedAt))).returning(inviteColumns);
  for (const old of replaced) {
    await cancelInviteMail(tx, old.id);
    await audit({ action: "invite.revoke", subject: { table: "invite", id: old.id }, before: snapshotInvite(old), after: { ...snapshotInvite(old), revokedAt: now.toISOString(), reason: "replaced by a new invite" } });
  }

  if (parsed.alias !== undefined) {
    // After the old invite is revoked: re-inviting the same person with the same alias is not a clash with themselves.
    await requireFreeAlias(tx, parsed.alias);
  }

  const { token, tokenHash } = generateInviteToken(deps.randomBytes);
  const expiresAt = inviteExpiry(now);
  const [created] = await tx
    .insert(invite)
    .values({ orgId: org.id, orgKind: org.kind, email, name: parsed.name, role: parsed.role, alias: parsed.alias ?? null, tokenHash, expiresAt, createdBy: actor.userId })
    .returning({ id: invite.id });
  if (created === undefined) throw new Error("The invite insert returned no row");

  const link = new URL(ACCEPT_INVITE_PATH, deps.origin);
  link.searchParams.set("token", token);
  await enqueueEmail(tx, { to: email, content: { template: "invite", params: { name: parsed.name, organisationName: org.name, expiresOn: formatEmailDate(expiresAt) } }, link: link.toString(), inviteId: created.id });
  await audit({
    action: "invite.issue",
    subject: { table: "invite", id: created.id },
    before: null,
    after: snapshotInvite({ orgId: org.id, email, name: parsed.name, role: parsed.role, alias: parsed.alias ?? null, expiresAt }),
  });
  return { inviteId: created.id, expiresAt };
}

/**
 * Issues an invite: a 32 byte token, its SHA-256 stored, a link in the outbox, valid for seven days. Any live invite for
 * the same address is revoked first, in the same transaction. Refused when the address already has an account, when the
 * organisation is archived or is Fynix, when an agency invite has no alias or a client invite has one, when the alias is
 * taken, and when the party has no current terms (or only placeholder terms on an https deployment, gate G2). The token
 * is returned to nobody: it exists in the email link only.
 */
export async function issueInvite(deps: DomainDeps, actor: FynixActor, input: IssueInviteInput): Promise<IssuedInvite> {
  return fynixWrite(deps.fynixDb, actor, (write) => issueWithin(write, actor, deps, input));
}

/**
 * Sends an invite again: the old link cannot be recovered (only its hash is stored), so this revokes it and issues a new
 * one with the same person, organisation, role and alias. The old invite must not be redeemed.
 */
export async function resendInvite(deps: DomainDeps, actor: FynixActor, inviteId: string): Promise<IssuedInvite> {
  const id = parseInput(uuidSchema, inviteId);
  return fynixWrite(deps.fynixDb, actor, async (write) => {
    const [old] = await write.tx.select({ ...inviteColumns, orgKind: invite.orgKind }).from(invite).where(eq(invite.id, id)).limit(1);
    if (old === undefined) throw new DomainError("not-found", "There is no such invite.");
    if (old.redeemedAt !== null) throw new DomainError("invite-not-live", "That invite has been used already.");
    return issueWithin(write, actor, deps, { organisationId: old.orgId, email: old.email, name: old.name, role: old.role, ...(old.alias === null ? {} : { alias: old.alias }) });
  });
}

/** Revokes a live invite and cancels its unsent email. A used or already revoked invite cannot be revoked. */
export async function revokeInvite(deps: DomainDeps, actor: FynixActor, inviteId: string): Promise<void> {
  const id = parseInput(uuidSchema, inviteId);
  await fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [row] = await tx.select(inviteColumns).from(invite).where(eq(invite.id, id)).limit(1).for("update");
    if (row === undefined) throw new DomainError("not-found", "There is no such invite.");
    if (row.redeemedAt !== null || row.revokedAt !== null) throw new DomainError("invite-not-live", "That invite is not live.");
    const now = deps.now();
    await tx.update(invite).set({ revokedAt: now }).where(eq(invite.id, id));
    await cancelInviteMail(tx, id);
    await audit({ action: "invite.revoke", subject: { table: "invite", id }, before: snapshotInvite(row), after: { ...snapshotInvite(row), revokedAt: now.toISOString(), reason: "revoked by Fynix" } });
  });
}

/** What the accept-invite page needs to show for a link. Every state but `pending` carries no personal data. */
export type InvitePreview =
  | { readonly status: "invalid" }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number }
  | { readonly status: "expired" | "revoked" | "redeemed" }
  | {
      readonly status: "pending";
      /** The name and address Fynix typed, shown so the person knows the link is theirs. */
      readonly name: string;
      readonly email: string;
      readonly party: OrganisationKind;
      readonly expiresAt: Date;
      /** The current terms of the party. `null` only if Fynix unpublished them after inviting: the page then cannot be accepted. */
      readonly terms: TermsRecord | null;
    };

/**
 * Looks a link up for the accept-invite page. The network's lookup limit is consumed first, for any input, so guessing
 * costs requests; a value that is not shaped like a token never reaches the database. The read runs as `leads_auth` with
 * only the invite whose hash it names in view.
 */
export async function previewInvite(deps: DomainDeps, input: { readonly token: string; readonly address: string }): Promise<InvitePreview> {
  const blocked = await firstBlockedLimit(deps.publicDb, inviteLookupChecks(input.address), deps.now());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  if (!isWellFormedInviteToken(input.token)) return { status: "invalid" };

  return withInviteHash(deps.authDb, hashInviteToken(input.token), async (tx) => {
    const [row] = await tx
      .select({ name: invite.name, email: invite.email, orgKind: invite.orgKind, expiresAt: invite.expiresAt, redeemedAt: invite.redeemedAt, revokedAt: invite.revokedAt })
      .from(invite)
      .limit(1);
    if (row === undefined) return { status: "invalid" } as const;
    const state = inviteState(row, deps.now());
    if (state !== "pending") return { status: state } as const;
    return { status: "pending", name: row.name, email: row.email, party: row.orgKind, expiresAt: row.expiresAt, terms: await readCurrentTerms(tx, row.orgKind) } as const;
  });
}
```


- [ ] **Step 3: Run the tests and the checks**

```bash
pnpm exec vitest run server/db/scope lib/auth server/domain/invite-token
pnpm exec vitest run --config vitest.integration.config.mts server/domain/invites
pnpm test && pnpm test:integration
pnpm lint && pnpm typecheck
```

Expected: the targeted tests pass. Then the whole suites: `pnpm test`: 68 files, 792 tests pass, `pnpm test:integration`: 16 files, 448 tests pass. Lint and typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add lib server
git commit -m "Add invite issue, resend, revoke and preview, with the token hash, the capability policy helper and the invite rate limits"
```

## Task 10: Redeem an invite

**Files:** create `server/domain/redeem-invite.ts` and `redeem-invite.integration.test.ts`.

This task proves the first exit criterion. `redeemInvite` does, in order:

1. Consume the network's and the invite's redeem limits, **before any lookup** and outside any transaction (a malformed token counts too).
2. Refuse a malformed token, and a missing acceptance of the terms.
3. In one transaction on `leads_auth` that names the invite's hash: read the invite and check its state; compare the terms the person ticked with the current ones of the party (`terms-changed` if they differ, which includes "none is published"); **claim the invite** (the update policy lets the row through only while it is unused, unrevoked and unexpired, so of two redemptions at once the second waits for the first, re-checks and finds no row); create the account with Better Auth **on the same transaction** inside `withAccountCreationGrant`, using the invite's address and name (nothing from the form but the password); insert the member, the alias for an agency, and the acceptance.
4. Every refusal after the claim rolls everything back and leaves the invite usable.

The tests are the exit criterion written out: the whole flow (account, membership with the invited name, acceptance of the current terms with the address and time, used invite, **and the person can sign in and resolves to the right role and organisation**), the agency alias, single use, two redemptions at once, then everything that must not happen: expired by the database clock and by the application's, revoked, replaced by a newer invite, never issued, a short or long or breached password, a breach service that is down, terms not ticked, a stale version, another party's terms, an address that already has an account, a failure after the account was created (the account is rolled back), the three rate limits, and what `leads_auth` can and cannot write to `member` and `agency_alias` whatever the service does.

- [ ] **Step 1: Write the tests**

**File:** `server/domain/redeem-invite.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAccountWithGrant } from "@/server/auth/create-account";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD, NEW_PASSWORD } from "@/server/auth/testing";
import { account, agencyAlias, invite, member, session, termsAcceptance, user } from "@/server/db/schema";
import { withInviteHash } from "@/server/db/scope";
import { captureErrorText } from "@/server/db/testing";
import { DomainError } from "@/server/domain/errors";
import { hashInviteToken } from "@/server/domain/invite-token";
import { issueInvite, previewInvite } from "@/server/domain/invites";
import { redeemInvite, type RedeemInput, type RedeemResult } from "@/server/domain/redeem-invite";
import { latestInviteLink, publishApprovedTerms } from "@/server/domain/test-helpers";
import { publishTerms, readCurrentTerms } from "@/server/domain/terms";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Phase 1C's exit criterion, end to end: an invite becomes an accepted account. The first describe is the whole flow; the rest
 * are what must not happen.
 */

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
  await publishApprovedTerms(rig);
});

const ADDRESS = "203.0.113.60";
const CLIENT_EMAIL = "priya.nair@kestrel.example";
const AGENCY_EMAIL = "rahul@northgate.example";
const issueClient = () => issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().kestrel.id, email: CLIENT_EMAIL, name: "Priya Nair" });
const issueAgency = () => issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().northgate.id, email: AGENCY_EMAIL, name: "Rahul Verma", alias: "Rahul, Fynix" });
const termsId = async (party: "client" | "agency" | "fynix"): Promise<string> => (await readCurrentTerms(rig.dbs.roles.leads_auth.db, party))?.id ?? "";
const redeem = async (email: string, party: "client" | "agency", overrides: Partial<RedeemInput> = {}): Promise<RedeemResult> =>
  redeemInvite(rig.deps(), { token: (await latestInviteLink(rig, email)).token, password: GOOD_PASSWORD, acceptedTermsId: await termsId(party), address: ADDRESS, ...overrides });
const counts = async () => ({
  users: (await rig.dbs.owner.db.select({ id: user.id }).from(user)).length - 5,
  accounts: (await rig.dbs.owner.db.select({ id: account.id }).from(account)).length - 5,
  members: (await rig.dbs.owner.db.select({ id: member.id }).from(member)).length - 5,
  acceptances: (await rig.dbs.owner.db.select({ id: termsAcceptance.id }).from(termsAcceptance)).length,
  aliases: (await rig.dbs.owner.db.select({ id: agencyAlias.id }).from(agencyAlias)).length,
});
const NOTHING = { users: 0, accounts: 0, members: 0, acceptances: 0, aliases: 0 };
const inviteRow = async (email: string) => (await rig.dbs.owner.db.select().from(invite).where(eq(invite.email, email)))[0];

describe("an invite becomes an accepted account", () => {
  it("creates the account, the membership with the invited name, the acceptance of the current terms and the used invite, and the person can sign in", async () => {
    await issueClient();
    const redeemed = await redeem(CLIENT_EMAIL, "client");
    expect(redeemed).toMatchObject({ status: "redeemed", email: CLIENT_EMAIL, party: "client" });
    if (redeemed.status !== "redeemed") throw new Error("not redeemed");

    const [created] = await rig.dbs.owner.db.select().from(user).where(eq(user.id, redeemed.userId));
    expect(created).toMatchObject({ email: CLIENT_EMAIL, name: "Priya Nair" });
    const [membership] = await rig.dbs.owner.db.select().from(member).where(eq(member.userId, redeemed.userId));
    expect(membership).toMatchObject({ orgId: rig.world().kestrel.id, orgKind: "client", role: "member", displayName: "Priya Nair", status: "active" });
    const [acceptance] = await rig.dbs.owner.db.select().from(termsAcceptance).where(eq(termsAcceptance.userId, redeemed.userId));
    expect(acceptance).toMatchObject({ documentId: await termsId("client"), party: "client", networkAddress: ADDRESS });
    expect(acceptance?.acceptedAt).toBeInstanceOf(Date);
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeInstanceOf(Date);
    expect((await counts()).aliases).toBe(0);

    const auth = rig.deps().authFactory(rig.dbs.roles.leads_auth.db);
    const services = { auth, publicDb: rig.dbs.roles.leads_public.db };
    const signedIn = await signInWithPassword(services, { email: CLIENT_EMAIL, password: GOOD_PASSWORD, address: ADDRESS });
    expect(signedIn.status).toBe("signed-in");
    if (signedIn.status !== "signed-in") throw new Error("not signed in");
    const cookie = new Headers({ cookie: signedIn.headers.getSetCookie().map((line) => line.split(";")[0] ?? "").join("; ") });
    expect(await resolveSessionContext({ reader: auth, authDb: rig.dbs.roles.leads_auth.db }, cookie)).toMatchObject({ kind: "client", role: "leads_client", orgId: rig.world().kestrel.id, userId: redeemed.userId, name: "Priya Nair" });
    expect(await rig.dbs.owner.db.select({ id: session.id }).from(session).where(eq(session.userId, redeemed.userId))).toHaveLength(1);
  });

  it("creates an agency user's alias with the account", async () => {
    await issueAgency();
    const redeemed = await redeem(AGENCY_EMAIL, "agency");
    expect(redeemed.status).toBe("redeemed");
    const [membership] = await rig.dbs.owner.db.select().from(member).where(eq(member.displayName, "Rahul Verma"));
    const aliases = await rig.dbs.owner.db.select().from(agencyAlias);
    expect(aliases).toMatchObject([{ memberId: membership?.id, alias: "Rahul, Fynix", memberOrgKind: "agency" }]);
  });

  it("uses the password the person chose: the stored hash is not the password, and a different password does not sign in", async () => {
    await issueClient();
    await redeem(CLIENT_EMAIL, "client", { password: NEW_PASSWORD });
    const stored = await rig.dbs.owner.db.select({ password: account.password }).from(account).innerJoin(user, eq(user.id, account.userId)).where(eq(user.email, CLIENT_EMAIL));
    expect(stored[0]?.password).toBeTruthy();
    expect(stored[0]?.password).not.toContain(NEW_PASSWORD);
    const services = { auth: rig.deps().authFactory(rig.dbs.roles.leads_auth.db), publicDb: rig.dbs.roles.leads_public.db };
    expect((await signInWithPassword(services, { email: CLIENT_EMAIL, password: GOOD_PASSWORD, address: ADDRESS })).status).toBe("invalid-credentials");
    expect((await signInWithPassword(services, { email: CLIENT_EMAIL, password: NEW_PASSWORD, address: ADDRESS })).status).toBe("signed-in");
  });

  it("is single use: the same link answers redeemed afterwards, for the page and for a second redemption, and creates nothing more", async () => {
    await issueClient();
    const { token } = await latestInviteLink(rig, CLIENT_EMAIL);
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "invite-unavailable", reason: "redeemed" });
    expect(await previewInvite(rig.deps(), { token, address: ADDRESS })).toEqual({ status: "redeemed" });
    expect(await counts()).toEqual({ ...NOTHING, users: 1, accounts: 1, members: 1, acceptances: 1 });
  });

  it("two redemptions of one invite at the same moment: exactly one account", async () => {
    await issueClient();
    const input = { token: (await latestInviteLink(rig, CLIENT_EMAIL)).token, password: GOOD_PASSWORD, acceptedTermsId: await termsId("client"), address: ADDRESS };
    const results = await Promise.all([redeemInvite(rig.deps(), input), redeemInvite(rig.deps(), input)]);
    expect(results.map((result) => result.status).sort()).toEqual(["invite-unavailable", "redeemed"]);
    expect(await counts()).toEqual({ ...NOTHING, users: 1, accounts: 1, members: 1, acceptances: 1 });
  });

  it("takes the address and the name from the invite and not from anything the caller sends", async () => {
    await issueClient();
    const redeemed = await redeem(CLIENT_EMAIL, "client", { ...({ email: "attacker@example.com", name: "Someone Else" } as object) });
    expect(redeemed).toMatchObject({ status: "redeemed", email: CLIENT_EMAIL });
    expect((await rig.dbs.owner.db.select({ email: user.email }).from(user).where(eq(user.email, "attacker@example.com")))).toEqual([]);
  });
});

describe("a link that cannot be used creates nothing", () => {
  it("expired: by the database clock, and by the application's clock", async () => {
    const issued = await issueClient();
    rig.clock.now = new Date(rig.clock.now.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "invite-unavailable", reason: "expired" });
    rig.clock.now = new Date();
    await rig.dbs.owner.db.update(invite).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invite.id, issued.inviteId));
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "invite-unavailable", reason: "expired" });
    expect(await counts()).toEqual(NOTHING);
  });

  it("revoked", async () => {
    const issued = await issueClient();
    await rig.dbs.owner.db.update(invite).set({ revokedAt: new Date() }).where(eq(invite.id, issued.inviteId));
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "invite-unavailable", reason: "revoked" });
    expect(await counts()).toEqual(NOTHING);
  });

  it("replaced by a newer invite: the old link is revoked and the new one works", async () => {
    await issueClient();
    const oldToken = (await latestInviteLink(rig, CLIENT_EMAIL)).token;
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { token: oldToken })).toEqual({ status: "invite-unavailable", reason: "revoked" });
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
  });

  it("never issued, or malformed", async () => {
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { token: "A".repeat(43) })).toEqual({ status: "invite-unavailable", reason: "invalid" });
    expect(await redeem(CLIENT_EMAIL, "client", { token: "not a token" })).toEqual({ status: "invite-unavailable", reason: "invalid" });
    expect(await counts()).toEqual(NOTHING);
  });
});

describe("a password that is refused leaves the invite usable and nothing behind", () => {
  it.each([
    ["too short", "short", { status: "weak-password", message: "Use at least 12 characters." }],
    ["too long", "x".repeat(129), { status: "weak-password", message: "Use at most 128 characters." }],
  ])("%s", async (_label, password, expected) => {
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { password })).toEqual(expected);
    expect(await counts()).toEqual(NOTHING);
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeNull();
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
  });

  it("found in a breach", async () => {
    await issueClient();
    rig.breach.breached.add("correct-horse-battery-staple");
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "weak-password", message: "That password has appeared in a data breach. Choose a different one." });
    expect(await counts()).toEqual(NOTHING);
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeNull();
    expect((await redeem(CLIENT_EMAIL, "client", { password: NEW_PASSWORD })).status).toBe("redeemed");
  });

  it("the breach service is down: nothing is accepted unchecked, and the invite works once it is back", async () => {
    await issueClient();
    rig.breach.unavailable = true;
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "check-unavailable" });
    expect(await counts()).toEqual(NOTHING);
    rig.breach.unavailable = false;
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
  });
});

describe("the terms", () => {
  it("must be ticked: with no acceptance nothing is created", async () => {
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { acceptedTermsId: null })).toEqual({ status: "terms-not-accepted" });
    expect(await redeem(CLIENT_EMAIL, "client", { acceptedTermsId: "" })).toEqual({ status: "terms-not-accepted" });
    expect(await counts()).toEqual(NOTHING);
  });

  it("must be the current version: a version published after the page was shown is refused, and the new one is accepted", async () => {
    await issueClient();
    const shown = await termsId("client");
    await publishTerms(rig.deps(), rig.actor, { party: "client", title: "Terms for client users, version two", body: "Changed." });
    expect(await redeem(CLIENT_EMAIL, "client", { acceptedTermsId: shown })).toEqual({ status: "terms-changed" });
    expect(await counts()).toEqual(NOTHING);
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeNull();
    expect((await redeem(CLIENT_EMAIL, "client")).status).toBe("redeemed");
    const [acceptance] = await rig.dbs.owner.db.select().from(termsAcceptance);
    expect(acceptance?.documentId).toBe(await termsId("client"));
  });

  it("must be the party's own: a client cannot accept the agency terms", async () => {
    await issueClient();
    expect(await redeem(CLIENT_EMAIL, "client", { acceptedTermsId: await termsId("agency") })).toEqual({ status: "terms-changed" });
    expect(await counts()).toEqual(NOTHING);
  });
});

describe("everything or nothing", () => {
  it("an address that already has an account: the invite is not used up, and no second account appears", async () => {
    await issueClient();
    await createAccountWithGrant(rig.deps().authFactory(rig.dbs.roles.leads_auth.db), rig.dbs.roles.leads_auth.db, { email: CLIENT_EMAIL, name: "Existing", password: GOOD_PASSWORD });
    expect(await redeem(CLIENT_EMAIL, "client")).toEqual({ status: "account-exists" });
    expect((await inviteRow(CLIENT_EMAIL))?.redeemedAt).toBeNull();
    expect(await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.displayName, "Priya Nair"))).toEqual([]);
  });

  it("a failure after the account was created takes the account back with it", async () => {
    await issueAgency();
    // Someone else takes the alias between the invite and the redemption, so the alias insert fails after the account exists.
    const [other] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.orgKind, "agency")).limit(1);
    await rig.dbs.owner.db.insert(agencyAlias).values({ memberId: other?.id ?? "", alias: "Rahul, Fynix" });
    const input = { token: (await latestInviteLink(rig, AGENCY_EMAIL)).token, password: GOOD_PASSWORD, acceptedTermsId: await termsId("agency"), address: ADDRESS };
    await expect(redeemInvite(rig.deps(), input)).rejects.toBeInstanceOf(DomainError);
    expect(await counts()).toEqual({ ...NOTHING, aliases: 1 });
    expect((await inviteRow(AGENCY_EMAIL))?.redeemedAt).toBeNull();
    expect(await rig.dbs.owner.db.select({ id: user.id }).from(user).where(eq(user.email, AGENCY_EMAIL))).toEqual([]);
  });
});

describe("rate limits", () => {
  it("stop a network after ten attempts in an hour, before the lookup: even the right password is refused", async () => {
    await issueClient();
    const token = (await latestInviteLink(rig, CLIENT_EMAIL)).token;
    const attempt = (address: string, password = "short") => redeemInvite(rig.deps(), { token, password, acceptedTermsId: "x", address });
    for (let index = 1; index <= 10; index += 1) expect((await attempt("203.0.113.90", GOOD_PASSWORD)).status, `attempt ${index}`).toBe("terms-changed");
    expect((await attempt("203.0.113.90", GOOD_PASSWORD)).status).toBe("rate-limited");
    expect(await counts()).toEqual(NOTHING);
  });

  it("stop one invite after ten attempts from any networks", async () => {
    await issueClient();
    const token = (await latestInviteLink(rig, CLIENT_EMAIL)).token;
    for (let index = 1; index <= 10; index += 1) await redeemInvite(rig.deps(), { token, password: "x", acceptedTermsId: "x", address: `203.0.113.${100 + index}` });
    const blocked = await redeemInvite(rig.deps(), { token, password: GOOD_PASSWORD, acceptedTermsId: await termsId("client"), address: "203.0.113.150" });
    expect(blocked.status).toBe("rate-limited");
    expect(await counts()).toEqual(NOTHING);
  });

  it("count a malformed token too, so scanning costs requests", async () => {
    for (let index = 1; index <= 10; index += 1) expect((await redeemInvite(rig.deps(), { token: "junk", password: "x", acceptedTermsId: null, address: "203.0.113.160" })).status).toBe("invite-unavailable");
    expect((await redeemInvite(rig.deps(), { token: "junk", password: "x", acceptedTermsId: null, address: "203.0.113.160" })).status).toBe("rate-limited");
  });
});

describe("what leads_auth can and cannot do to members, whatever the service does", () => {
  const authDb = () => rig.dbs.roles.leads_auth.db;
  const newUser = async (email: string): Promise<string> => (await createAccountWithGrant(rig.deps().authFactory(authDb()), authDb(), { email, name: "N", password: GOOD_PASSWORD })).userId;

  it("may add a member only for a user whose invite was redeemed, in that invite's organisation, role and name", async () => {
    const issued = await issueClient();
    const token = (await latestInviteLink(rig, CLIENT_EMAIL)).token;
    const [row] = await rig.dbs.owner.db.select().from(invite).where(eq(invite.id, issued.inviteId));
    const person = await newUser(CLIENT_EMAIL);
    const add = (values: Partial<typeof member.$inferInsert>) =>
      withInviteHash(authDb(), hashInviteToken(token), async (tx) => {
        await tx.update(invite).set({ redeemedAt: new Date() }).where(eq(invite.id, issued.inviteId));
        await tx.insert(member).values({ userId: person, orgId: row?.orgId ?? "", orgKind: "client", role: "member", displayName: "Priya Nair", ...values });
      });
    const refused = 'new row violates row-level security policy for table "member"';
    expect(await captureErrorText(add({ orgId: rig.world().halden.id }))).toContain(refused);
    expect(await captureErrorText(add({ role: "manager" }))).toContain(refused);
    expect(await captureErrorText(add({ displayName: "Someone Else" }))).toContain(refused);
    expect(await captureErrorText(add({ status: "suspended" }))).toContain(refused);
    expect(await captureErrorText(add({ orgId: rig.world().fynix.id, orgKind: "fynix" }))).toContain(refused);
    expect(await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, person))).toEqual([]);
    await add({});
    expect(await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, person))).toHaveLength(1);
  });

  it("cannot add a member for a user with no redeemed invite, with no invite in view at all", async () => {
    const person = await newUser("stranger@example.com");
    const message = await captureErrorText(authDb().insert(member).values({ userId: person, orgId: rig.world().kestrel.id, orgKind: "client", displayName: "Stranger" }));
    expect(message).toContain('new row violates row-level security policy for table "member"');
  });

  it("cannot change a member, give an alias to anyone but the redeemed invite's person, or read the aliases", async () => {
    const [existing] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.orgKind, "agency")).limit(1);
    expect(await captureErrorText(authDb().update(member).set({ status: "suspended" }))).toContain("permission denied for table member");
    expect(await captureErrorText(authDb().insert(agencyAlias).values({ memberId: existing?.id ?? "", alias: "Sneaky, Fynix" }))).toContain('row-level security policy for table "agency_alias"');
    expect(await captureErrorText(authDb().select({ alias: agencyAlias.alias }).from(agencyAlias))).toContain("permission denied for table agency_alias");
  });
});
```


Run it. Expected: FAIL: `Cannot find package '@/server/domain/redeem-invite' imported from .../redeem-invite.integration.test.ts`.

- [ ] **Step 2: Write the code**

**File:** `server/domain/redeem-invite.ts`

```typescript
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { inviteRedeemChecks } from "@/lib/auth/rate-limit-rules";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import { inviteState, type InviteState } from "@/lib/domain/invite-state";
import { AccountAlreadyExistsError, createAccountWithGrant } from "@/server/auth/create-account";
import { authErrorCode, authErrorMessage, PASSWORD_CHECK_UNAVAILABLE_CODE, PASSWORD_PROBLEM_CODES } from "@/server/auth/errors";
import { firstBlockedLimit } from "@/server/auth/rate-limit";
import { agencyAlias, invite, member } from "@/server/db/schema";
import { withInviteHash } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { hashInviteToken, isWellFormedInviteToken } from "@/server/domain/invite-token";
import { readCurrentTerms, recordAcceptance } from "@/server/domain/terms";

export interface RedeemInput {
  /** The token from the link. */
  readonly token: string;
  /** The password the person chose. Checked by the same policy as every password (length, breached passwords). */
  readonly password: string;
  /** The id of the terms document the person was shown and ticked. Empty or missing when the box was not ticked. */
  readonly acceptedTermsId: string | null;
  /** The network address of the request (`clientAddressFrom`), for the rate limit and the acceptance record. */
  readonly address: string;
}

export type RedeemResult =
  | { readonly status: "redeemed"; readonly userId: string; readonly email: string; readonly party: OrganisationKind }
  /** The link cannot be used: never issued, or `expired`, `revoked` or `redeemed` already. Nothing was created. */
  | { readonly status: "invite-unavailable"; readonly reason: "invalid" | Exclude<InviteState, "pending"> }
  | { readonly status: "rate-limited"; readonly retryAfterSeconds: number }
  /** `message` is worded for the person: too short, too long, or found in a breach. The invite is still usable. */
  | { readonly status: "weak-password"; readonly message: string }
  /** The breached-password service could not be reached. Nothing was created and the invite is still usable. */
  | { readonly status: "check-unavailable" }
  /** The box was not ticked. */
  | { readonly status: "terms-not-accepted" }
  /** The terms the person ticked are not the current ones (a new version was published, or none is). The page shows the current text again. */
  | { readonly status: "terms-changed" }
  /** The address already has an account, so the invite cannot create one. Fynix has to look at it. */
  | { readonly status: "account-exists" };

/** Thrown inside the transaction to roll everything back and carry the result out. */
class Rollback extends Error {
  constructor(readonly result: RedeemResult) {
    super("redeem rolled back");
  }
}

/**
 * Redeems an invite: one database transaction as `leads_auth`, so the account, the membership, the alias, the acceptance of
 * the terms and the invite's `redeemed_at` all commit together or not at all (decision C1). A weak password, a breached one,
 * a service outage or a clash found half way leaves nothing behind and the invite usable.
 *
 * Order: the network's and the invite's redeem limits are consumed first, outside any transaction and before any lookup;
 * then, in the transaction, the invite is read and checked, the current terms are compared with the ones ticked, the invite is
 * claimed (the database refuses an invite that is used, revoked or expired, so two redemptions at once cannot both win),
 * the account is created inside the account creation grant with Better Auth running on the same transaction, and the
 * membership, the alias and the acceptance are written. The email and the name are the invite's, not the form's.
 *
 * It does not sign anyone in: the caller does, with the same password, through the normal sign-in.
 */
export async function redeemInvite(deps: DomainDeps, input: RedeemInput): Promise<RedeemResult> {
  const tokenHash = hashInviteToken(input.token);
  const blocked = await firstBlockedLimit(deps.publicDb, inviteRedeemChecks(tokenHash, input.address), deps.now());
  if (blocked !== null) return { status: "rate-limited", retryAfterSeconds: blocked.retryAfterSeconds };
  if (!isWellFormedInviteToken(input.token)) return { status: "invite-unavailable", reason: "invalid" };
  if (input.acceptedTermsId === null || input.acceptedTermsId === "") return { status: "terms-not-accepted" };
  const acceptedTermsId = input.acceptedTermsId;

  try {
    return await withInviteHash(deps.authDb, tokenHash, async (tx) => {
      const [row] = await tx
        .select({ id: invite.id, orgId: invite.orgId, orgKind: invite.orgKind, email: invite.email, name: invite.name, role: invite.role, alias: invite.alias, expiresAt: invite.expiresAt, redeemedAt: invite.redeemedAt, revokedAt: invite.revokedAt })
        .from(invite)
        .limit(1);
      if (row === undefined) return { status: "invite-unavailable", reason: "invalid" } as const;
      const state = inviteState(row, deps.now());
      if (state !== "pending") return { status: "invite-unavailable", reason: state } as const;

      const terms = await readCurrentTerms(tx, row.orgKind);
      if (terms === null || terms.id !== acceptedTermsId) return { status: "terms-changed" } as const;

      // The claim. The update policy lets the row through only while it is unused, unrevoked and unexpired, so of two
      // redemptions at once the second finds no row (it waits for the first to commit, then re-checks).
      const claimed = await tx.update(invite).set({ redeemedAt: new Date() }).where(eq(invite.id, row.id)).returning({ id: invite.id });
      if (claimed.length === 0) return { status: "invite-unavailable", reason: "redeemed" } as const;

      let userId: string;
      try {
        ({ userId } = await createAccountWithGrant(deps.authFactory(tx), tx, { email: row.email, name: row.name, password: input.password }));
      } catch (error) {
        if (error instanceof AccountAlreadyExistsError) throw new Rollback({ status: "account-exists" });
        const code = authErrorCode(error);
        if (code === PASSWORD_CHECK_UNAVAILABLE_CODE) throw new Rollback({ status: "check-unavailable" });
        if (code !== undefined && PASSWORD_PROBLEM_CODES.has(code)) throw new Rollback({ status: "weak-password", message: authErrorMessage(error) ?? "Choose a different password." });
        throw error;
      }

      const memberId = randomUUID();
      await tx.insert(member).values({ id: memberId, userId, orgId: row.orgId, orgKind: row.orgKind, role: row.role, displayName: row.name });
      if (row.alias !== null) {
        try {
          await tx.insert(agencyAlias).values({ memberId, alias: row.alias });
        } catch (error) {
          if (isUniqueViolation(error)) throw new DomainError("alias-taken", "Another person has taken this invite's alias since it was issued.");
          throw error;
        }
      }
      await recordAcceptance(tx, { userId, documentId: terms.id, party: row.orgKind, networkAddress: input.address });
      return { status: "redeemed", userId, email: row.email, party: row.orgKind } as const;
    });
  } catch (error) {
    if (error instanceof Rollback) return error.result;
    throw error;
  }
}
```


- [ ] **Step 3: Run the tests and the checks**

```bash
pnpm exec vitest run --config vitest.integration.config.mts server/domain/redeem
pnpm test && pnpm test:integration
pnpm lint && pnpm typecheck
```

Expected: the targeted tests pass. Then the whole suites: `pnpm test`: 68 files, 792 tests pass, `pnpm test:integration`: 17 files, 473 tests pass. Lint and typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add server/domain
git commit -m "Redeem an invite in one transaction: account, membership, alias and acceptance of the terms"
```

## Task 11: Members and agency aliases

**Files:** create `server/domain/members.ts` and `members.integration.test.ts`.

- **Suspend and reactivate** change `member.status` and nothing else, and audit the member's state before and after. Suspending takes effect on the very next request because session resolution reads `member.status` every time (1B decision B4): the test signs a real person in, suspends them, and sees `resolveSessionContext` return nothing and a new sign-in refused, then reactivates them and sees the same session work again. An admin cannot suspend their own membership (with one admin that would lock everyone out); a repeat is an `invalid-transition`.
- **Rename** changes the display name other people in the organisation see; the account's own name is untouched.
- **`setAgencyAlias`** gives an agency member the alias a client sees, or changes it. It must be free: another member's alias or a live invite's alias is a clash (case-insensitively, through the shared `requireFreeAlias`), but changing the case of your own is not. Aliases already copied onto records a client reads are not rewritten (phase 2 stores a copy).
- Nothing is deleted.

- [ ] **Step 1: Write the tests**

**File:** `server/domain/members.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveSessionContext } from "@/server/auth/session-context";
import { signInWithPassword } from "@/server/auth/sign-in";
import { GOOD_PASSWORD } from "@/server/auth/testing";
import { agencyAlias, member } from "@/server/db/schema";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";
import { issueInvite } from "@/server/domain/invites";
import { reactivateMember, renameMember, setAgencyAlias, suspendMember } from "@/server/domain/members";
import { redeemInvite } from "@/server/domain/redeem-invite";
import { auditRowsFor, latestInviteLink, publishApprovedTerms } from "@/server/domain/test-helpers";
import { readCurrentTerms } from "@/server/domain/terms";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
  await publishApprovedTerms(rig);
});

const refusal = async (work: Promise<unknown>): Promise<DomainErrorCode> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
};
const memberOf = async (userId: string) => {
  const [row] = await rig.dbs.owner.db.select().from(member).where(eq(member.userId, userId));
  if (row === undefined) throw new Error("no member");
  return row;
};
const ADDRESS = "203.0.113.70";

/** A real person: invited, redeemed, and signed in, so a session exists to be refused. */
async function realClient() {
  await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().kestrel.id, email: "priya@kestrel.example", name: "Priya Nair" });
  const redeemed = await redeemInvite(rig.deps(), { token: (await latestInviteLink(rig, "priya@kestrel.example")).token, password: GOOD_PASSWORD, acceptedTermsId: (await readCurrentTerms(rig.dbs.roles.leads_auth.db, "client"))?.id ?? "", address: ADDRESS });
  if (redeemed.status !== "redeemed") throw new Error("not redeemed");
  const auth = rig.deps().authFactory(rig.dbs.roles.leads_auth.db);
  const services = { auth, publicDb: rig.dbs.roles.leads_public.db };
  const signedIn = await signInWithPassword(services, { email: "priya@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS });
  if (signedIn.status !== "signed-in") throw new Error("not signed in");
  const cookie = new Headers({ cookie: signedIn.headers.getSetCookie().map((line) => line.split(";")[0] ?? "").join("; ") });
  return { userId: redeemed.userId, services, resolve: () => resolveSessionContext({ reader: auth, authDb: rig.dbs.roles.leads_auth.db }, cookie) };
}

describe("suspendMember and reactivateMember", () => {
  it("suspending ends the person's access on the very next request, and reactivating gives it back", async () => {
    const person = await realClient();
    expect(await person.resolve()).not.toBeNull();
    const row = await memberOf(person.userId);

    expect(await suspendMember(rig.deps(), rig.actor, row.id)).toMatchObject({ status: "suspended", displayName: "Priya Nair" });
    expect(await person.resolve()).toBeNull();
    expect((await signInWithPassword(person.services, { email: "priya@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS })).status).toBe("invalid-credentials");

    expect(await reactivateMember(rig.deps(), rig.actor, row.id)).toMatchObject({ status: "active" });
    expect(await person.resolve()).toMatchObject({ kind: "client", userId: person.userId });
    expect((await signInWithPassword(person.services, { email: "priya@kestrel.example", password: GOOD_PASSWORD, address: ADDRESS })).status).toBe("signed-in");
  });

  it("audits each change with the member's state before and after, and deletes nothing", async () => {
    const person = await realClient();
    const row = await memberOf(person.userId);
    await suspendMember(rig.deps(), rig.actor, row.id);
    await reactivateMember(rig.deps(), rig.actor, row.id);
    const audits = [...(await auditRowsFor(rig, "member.suspend")), ...(await auditRowsFor(rig, "member.reactivate"))];
    expect(audits).toMatchObject([
      { action: "member.suspend", subjectTable: "member", subjectId: row.id, before: { status: "active" }, after: { status: "suspended" } },
      { action: "member.reactivate", subjectId: row.id, before: { status: "suspended" }, after: { status: "active" } },
    ]);
    expect(await rig.dbs.owner.db.select({ id: member.id }).from(member)).toHaveLength(6);
  });

  it("refuses an admin suspending their own membership, a repeat, and an unknown member", async () => {
    const own = await memberOf(rig.actor.userId);
    expect(await refusal(suspendMember(rig.deps(), rig.actor, own.id))).toBe("cannot-suspend-self");
    const person = await realClient();
    const row = await memberOf(person.userId);
    expect(await refusal(reactivateMember(rig.deps(), rig.actor, row.id))).toBe("invalid-transition");
    await suspendMember(rig.deps(), rig.actor, row.id);
    expect(await refusal(suspendMember(rig.deps(), rig.actor, row.id))).toBe("invalid-transition");
    expect(await refusal(suspendMember(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999"))).toBe("not-found");
    expect((await memberOf(rig.actor.userId)).status).toBe("active");
  });
});

describe("renameMember", () => {
  it("changes the display name only, and audits it", async () => {
    const person = await realClient();
    const row = await memberOf(person.userId);
    expect(await renameMember(rig.deps(), rig.actor, row.id, "  Priya N.  ")).toMatchObject({ displayName: "Priya N.", orgId: rig.world().kestrel.id });
    expect((await auditRowsFor(rig, "member.rename"))[0]).toMatchObject({ before: { displayName: "Priya Nair" }, after: { displayName: "Priya N." } });
  });

  it("refuses an empty name and an unknown member", async () => {
    const person = await realClient();
    const row = await memberOf(person.userId);
    expect(await refusal(renameMember(rig.deps(), rig.actor, row.id, "   "))).toBe("invalid-input");
    expect(await refusal(renameMember(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999", "Name"))).toBe("not-found");
    expect((await memberOf(person.userId)).displayName).toBe("Priya Nair");
  });
});

describe("setAgencyAlias", () => {
  const agencyMember = async (index = 0) => {
    const rows = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.orgKind, "agency")).orderBy(member.displayName);
    const row = rows[index];
    if (row === undefined) throw new Error("no agency member");
    return row.id;
  };
  const aliasOf = async (memberId: string) => (await rig.dbs.owner.db.select({ alias: agencyAlias.alias }).from(agencyAlias).where(eq(agencyAlias.memberId, memberId)))[0]?.alias;

  it("gives an agency member an alias, then changes it, and audits both with the before state", async () => {
    const id = await agencyMember();
    expect(await setAgencyAlias(rig.deps(), rig.actor, id, "Rahul, Fynix")).toEqual({ alias: "Rahul, Fynix" });
    expect(await setAgencyAlias(rig.deps(), rig.actor, id, "Rahul V, Fynix")).toEqual({ alias: "Rahul V, Fynix" });
    expect(await aliasOf(id)).toBe("Rahul V, Fynix");
    expect(await rig.dbs.owner.db.select({ id: agencyAlias.id }).from(agencyAlias)).toHaveLength(1);
    expect(await auditRowsFor(rig, "agency_alias.set")).toMatchObject([
      { before: null, after: { memberId: id, alias: "Rahul, Fynix" } },
      { before: { memberId: id, alias: "Rahul, Fynix" }, after: { memberId: id, alias: "Rahul V, Fynix" } },
    ]);
  });

  it("lets a person change the case of their own alias, but not take another person's, whatever the case", async () => {
    const first = await agencyMember(0);
    const second = await agencyMember(1);
    await setAgencyAlias(rig.deps(), rig.actor, first, "Rahul, Fynix");
    await setAgencyAlias(rig.deps(), rig.actor, first, "RAHUL, Fynix");
    expect(await aliasOf(first)).toBe("RAHUL, Fynix");
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, second, "rahul, fynix"))).toBe("alias-taken");
    expect(await aliasOf(second)).toBeUndefined();
  });

  it("refuses an alias that a live invite carries", async () => {
    await issueInvite(rig.deps(), rig.actor, { organisationId: rig.world().northgate.id, email: "new@northgate.example", name: "New Person", alias: "Promised, Fynix" });
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, await agencyMember(), "promised, FYNIX"))).toBe("alias-taken");
  });

  it("refuses a client member, an alias that is too short or long, and an unknown member", async () => {
    const client = rig.world().users.find((candidate) => candidate.organisation.kind === "client");
    const [row] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, client?.id ?? ""));
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, row?.id ?? "", "Client, Fynix"))).toBe("invalid-input");
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, await agencyMember(), "x"))).toBe("invalid-input");
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, await agencyMember(), "y".repeat(61)))).toBe("invalid-input");
    expect(await refusal(setAgencyAlias(rig.deps(), rig.actor, "99999999-9999-4999-8999-999999999999", "Someone, Fynix"))).toBe("not-found");
  });
});
```


Run it. Expected: FAIL: `Cannot find package '@/server/domain/members' imported from .../members.integration.test.ts`.

- [ ] **Step 2: Write the code**

**File:** `server/domain/members.ts`

```typescript
import { eq } from "drizzle-orm";
import { member, agencyAlias } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import { requireFreeAlias } from "@/server/domain/aliases";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { aliasSchema, displayNameSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotMember } from "@/server/domain/snapshots";

export interface MemberRecord {
  readonly id: string;
  readonly userId: string;
  readonly orgId: string;
  readonly orgKind: "fynix" | "client" | "agency";
  readonly role: "member" | "manager";
  readonly displayName: string;
  readonly status: "active" | "suspended";
}

const columns = {
  id: member.id,
  userId: member.userId,
  orgId: member.orgId,
  orgKind: member.orgKind,
  role: member.role,
  displayName: member.displayName,
  status: member.status,
};

async function loadForUpdate(tx: ScopedTransaction, id: string): Promise<MemberRecord> {
  const [row] = await tx.select(columns).from(member).where(eq(member.id, id)).limit(1).for("update");
  if (row === undefined) throw new DomainError("not-found", "There is no such member.");
  return row;
}

async function setStatus(deps: DomainDeps, actor: FynixActor, memberId: string, status: "active" | "suspended"): Promise<MemberRecord> {
  const id = parseInput(uuidSchema, memberId);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadForUpdate(tx, id);
    if (status === "suspended" && before.userId === actor.userId) throw new DomainError("cannot-suspend-self", "An admin cannot suspend their own membership.");
    if (before.status === status) throw new DomainError("invalid-transition", `The member is already ${status}.`);
    const [after] = await tx.update(member).set({ status }).where(eq(member.id, id)).returning(columns);
    if (after === undefined) throw new Error("The member update returned no row");
    await audit({ action: status === "suspended" ? "member.suspend" : "member.reactivate", subject: { table: "member", id }, before: snapshotMember(before), after: snapshotMember(after) });
    return after;
  });
}

/**
 * Suspends a member. They get no new session, and the sessions they hold stop resolving on the very next request, because
 * session resolution reads `member.status` every time (phase 1B, decision B4). Nothing is deleted. An admin cannot suspend
 * themselves: with one admin that would lock everyone out.
 */
export function suspendMember(deps: DomainDeps, actor: FynixActor, memberId: string): Promise<MemberRecord> {
  return setStatus(deps, actor, memberId, "suspended");
}

/** Reactivates a suspended member. Their old sessions work again until they end, and they can sign in. */
export function reactivateMember(deps: DomainDeps, actor: FynixActor, memberId: string): Promise<MemberRecord> {
  return setStatus(deps, actor, memberId, "active");
}

/** Changes the name other people in the organisation see. The name on the account (`user.name`) is not touched. */
export async function renameMember(deps: DomainDeps, actor: FynixActor, memberId: string, displayName: string): Promise<MemberRecord> {
  const id = parseInput(uuidSchema, memberId);
  const name = parseInput(displayNameSchema, displayName);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadForUpdate(tx, id);
    const [after] = await tx.update(member).set({ displayName: name }).where(eq(member.id, id)).returning(columns);
    if (after === undefined) throw new Error("The member update returned no row");
    await audit({ action: "member.rename", subject: { table: "member", id }, before: snapshotMember(before), after: snapshotMember(after) });
    return after;
  });
}

/**
 * Gives an agency member the Fynix alias the client sees, or changes it. The alias must be free (another member's, or a live
 * invite's, is a clash). Aliases already copied onto records the client reads are not rewritten (phase 2 stores a copy).
 */
export async function setAgencyAlias(deps: DomainDeps, actor: FynixActor, memberId: string, alias: string): Promise<{ readonly alias: string }> {
  const id = parseInput(uuidSchema, memberId);
  const text = parseInput(aliasSchema, alias);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const row = await loadForUpdate(tx, id);
    if (row.orgKind !== "agency") throw new DomainError("invalid-input", "Only an agency member has an alias.");
    await requireFreeAlias(tx, text, id);
    const [existing] = await tx.select({ id: agencyAlias.id, alias: agencyAlias.alias }).from(agencyAlias).where(eq(agencyAlias.memberId, id)).limit(1);
    let subjectId: string;
    try {
      if (existing === undefined) {
        const [created] = await tx.insert(agencyAlias).values({ memberId: id, alias: text }).returning({ id: agencyAlias.id });
        if (created === undefined) throw new Error("The alias insert returned no row");
        subjectId = created.id;
      } else {
        await tx.update(agencyAlias).set({ alias: text, updatedAt: deps.now() }).where(eq(agencyAlias.id, existing.id));
        subjectId = existing.id;
      }
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError("alias-taken", "Another person already has that alias.");
      throw error;
    }
    await audit({ action: "agency_alias.set", subject: { table: "agency_alias", id: subjectId }, before: existing === undefined ? null : { memberId: id, alias: existing.alias }, after: { memberId: id, alias: text } });
    return { alias: text };
  });
}
```


- [ ] **Step 3: Run the tests and the checks**

```bash
pnpm exec vitest run --config vitest.integration.config.mts server/domain/members
pnpm test && pnpm test:integration
pnpm lint && pnpm typecheck
```

Expected: the targeted tests pass. Then the whole suites: `pnpm test`: 68 files, 792 tests pass, `pnpm test:integration`: 18 files, 482 tests pass. Lint and typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add server/domain
git commit -m "Add suspending, reactivating and renaming members and assigning agency aliases"
```

## Task 12: Wiring, boundaries and documentation

**Files:** create `server/domain/index.ts`, `index.test.ts`, `boundaries.test.ts`; modify `server/auth/boundaries.test.ts`, `CLAUDE.md`, `README.md`.

- **`getDomain()`** builds `DomainDeps` for the running app from the environment and caches it: the Fynix, identity and public pools, the real clock and randomness, `APP_ORIGIN`, `allowPlaceholderTerms` (false on https: gate G2), and a Better Auth factory for redemption whose mailer refuses (redemption never asks for a reset). **`getMailTransport()`** is the Brevo transport, or `null` without a key. **`sendQueuedMail()`** runs the sender once; phase 1D calls it after an admin action commits, without awaiting it in the request.
- **`server/domain/boundaries.test.ts`** reads source: `withScope` and `withFynixScope` are called only by the scope helper, the session helper, the Fynix write helper and the test harness; no service opens a transaction of its own (the reference savepoint and the redemption, which names an invite, are the two exceptions); nothing writes the audit table but `appendAudit`; the modules scripts import do not import `server-only`; nothing logs; only the outbox reads the `link` column; the token is hashed in one module; the Brevo key is read in the wiring, the environment schema and the outbox script only.
- 1B's rule that only `server/auth/index.ts` and scripts open the identity, public and owner pools now also names `server/domain/index.ts`.

- [ ] **Step 1: Write the tests**

**File:** `server/domain/index.test.ts`

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabases } from "@/server/db/client";
import { buildEnvFile, generateSecrets } from "@/server/env-init";
import { resetEnvCache } from "@/server/env";

function stubEnvironment(overrides: Record<string, string>): void {
  const entries = buildEnvFile(generateSecrets("tester"))
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const);
  for (const [name, value] of [...entries, ...Object.entries(overrides)]) vi.stubEnv(name, value);
}

beforeEach(() => resetEnvCache());
afterEach(async () => {
  await closeDatabases();
  vi.unstubAllEnvs();
  resetEnvCache();
  // The module keeps its dependencies once built; a fresh import gives the next test its own.
  vi.resetModules();
});

describe("getDomain", () => {
  it("allows placeholder terms on an http origin, which is development", async () => {
    stubEnvironment({});
    const { getDomain: fresh } = await import("@/server/domain");
    const deps = fresh();
    expect(deps.origin).toBe("http://localhost:3020");
    expect(deps.allowPlaceholderTerms).toBe(true);
    expect(deps.randomBytes(8)).toHaveLength(8);
    expect(Math.abs(deps.now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it("gate G2: refuses placeholder terms on an https origin", async () => {
    stubEnvironment({ APP_ORIGIN: "https://leads.fynix.digital", BREVO_API_KEY: "xkeysib-test-0123456789abcdef" });
    const { getDomain: fresh } = await import("@/server/domain");
    expect(fresh().allowPlaceholderTerms).toBe(false);
  });

  it("opens the Fynix, identity and public pools and builds a Better Auth instance on a database it is given", async () => {
    stubEnvironment({});
    const { getDomain: fresh } = await import("@/server/domain");
    const deps = fresh();
    expect(new Set([deps.fynixDb, deps.authDb, deps.publicDb]).size).toBe(3);
    expect(typeof deps.authFactory(deps.authDb).api.signUpEmail).toBe("function");
    expect(fresh()).toBe(deps);
  });
});

describe("getMailTransport", () => {
  it("is null without a Brevo key, so development only writes the outbox", async () => {
    stubEnvironment({});
    const { getMailTransport: fresh } = await import("@/server/domain");
    expect(fresh()).toBeNull();
  });

  it("is the Brevo transport with a key", async () => {
    stubEnvironment({ BREVO_API_KEY: "xkeysib-test-0123456789abcdef" });
    const { getMailTransport: fresh } = await import("@/server/domain");
    expect(typeof fresh()?.send).toBe("function");
  });
});
```


**File:** `server/domain/boundaries.test.ts`

```typescript
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Source-level rules that keep the domain layer's guarantees from being undone by accident. They read files, not the database. */

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path);

function sourceFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(ROOT, path)).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !isTest(path) ? [path] : [];
  });
}
const domainFiles = (): string[] => sourceFiles("server/domain").filter((path) => path !== join("server", "domain", "testing.ts") && path !== join("server", "domain", "test-helpers.ts"));
const everything = (): string[] => ["server", "scripts", "lib"].flatMap(sourceFiles);

describe("every Fynix write goes through one helper", () => {
  it("withScope and withFynixScope are called only by the scope helper, the session helper, the Fynix write helper and the test harness", () => {
    const allowed = new Set([join("server", "db", "scope.ts"), join("server", "auth", "with-session.ts"), join("server", "domain", "fynix-write.ts"), join("server", "db", "testing", "index.ts")]);
    const offenders = everything().filter((path) => !allowed.has(path) && /\bwith(Fynix)?Scope\s*\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("no domain service opens a transaction of its own, apart from the reference savepoint and the redemption, which names an invite", () => {
    const allowed = new Set([join("server", "domain", "refs.ts"), join("server", "domain", "redeem-invite.ts")]);
    const offenders = domainFiles().filter((path) => !allowed.has(path) && /\.transaction\s*\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("the services that change data as Fynix call fynixWrite", () => {
    for (const path of ["organisations", "campaigns", "invites", "members", "terms"]) expect(read(`server/domain/${path}.ts`), path).toContain("fynixWrite(");
  });

  it("no service writes the audit table directly: only appendAudit does", () => {
    const offenders = domainFiles().filter((path) => path !== join("server", "domain", "audit.ts") && /insert\(\s*auditLog\s*\)/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("what scripts may load", () => {
  it("the mail and placeholder modules scripts import do not import server-only code", () => {
    for (const path of ["server/mail/outbox.ts", "server/mail/brevo.ts", "server/mail/transport.ts", "server/domain/placeholder-terms.ts"]) {
      const source = read(path);
      expect(source, path).not.toMatch(/from\s+["']server-only["']|import\s+["']server-only["']/);
      expect(source, path).not.toMatch(/@\/server\/db\/(scope|client)["']/);
    }
  });

  it("only server/domain/index.ts among the domain files imports server-only", () => {
    const offenders = domainFiles().filter((path) => path !== join("server", "domain", "index.ts") && /import\s+["']server-only["']/.test(read(path)));
    expect(offenders).toEqual([]);
    expect(read("server/domain/index.ts")).toMatch(/^import "server-only";/m);
  });
});

describe("secrets stay out of places they must not be", () => {
  it("no domain or mail file logs", () => {
    const offenders = [...domainFiles(), ...sourceFiles("server/mail")].filter((path) => /console\.(log|info|debug|warn|error)\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("only the invite and redeem services and the outbox know the invite link path, and only the outbox sender reads the link column", () => {
    const readers = [...domainFiles(), ...sourceFiles("server/mail")].filter((path) => /emailOutbox\.link\b/.test(read(path)));
    expect(readers.sort()).toEqual([join("server", "mail", "outbox.ts")]);
  });

  it("the invite token is generated and hashed in one module", () => {
    const offenders = domainFiles().filter((path) => path !== join("server", "domain", "invite-token.ts") && /createHash\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("the Brevo key is read from the environment in the wiring and the outbox script only", () => {
    const offenders = everything().filter((path) => /BREVO_API_KEY/.test(read(path)) && ![join("server", "env.ts"), join("server", "domain", "index.ts"), join("scripts", "outbox-run.ts")].includes(path) && !path.endsWith("env-init.ts"));
    expect(offenders).toEqual([]);
  });
});
```


**Edit:** `server/auth/boundaries.test.ts`

Replace:

```typescript
    expect(exports.filter((line) => !line.startsWith("export async function "))).toEqual([]);
  });

  it("only server/auth/index.ts and scripts open the leads_auth, leads_public or owner pools", () => {
    const offenders = everything()
      .filter((path) => !isTest(path) && path !== join("server", "auth", "index.ts") && !path.startsWith("scripts") && !path.startsWith(join("server", "db")))
      .filter((path) => /getDatabase\(\s*["']leads_(auth|public|owner)["']/.test(read(path)));
    expect(offenders).toEqual([]);
  });
```

With:

```typescript
    expect(exports.filter((line) => !line.startsWith("export async function "))).toEqual([]);
  });

  it("only server/auth/index.ts, server/domain/index.ts and scripts open the leads_auth, leads_public or owner pools", () => {
    const offenders = everything()
      .filter((path) => !isTest(path) && path !== join("server", "auth", "index.ts") && path !== join("server", "domain", "index.ts") && !path.startsWith("scripts") && !path.startsWith(join("server", "db")))
      .filter((path) => /getDatabase\(\s*["']leads_(auth|public|owner)["']/.test(read(path)));
    expect(offenders).toEqual([]);
  });
```


Run `pnpm exec vitest run server/domain server/auth/boundaries`. Expected: FAIL: the 5 tests of `index.test.ts` (the wiring does not exist) and 1 of the 10 in `server/domain/boundaries.test.ts` (`ENOENT ... server/domain/index.ts`).

- [ ] **Step 2: Write the wiring**

**File:** `server/domain/index.ts`

```typescript
import "server-only";
import { randomFillSync } from "node:crypto";
import { breachCheckerFor } from "@/server/auth/breach-check";
import { createAuth } from "@/server/auth/create-auth";
import { getDatabase } from "@/server/db/client";
import type { DomainDeps } from "@/server/domain/deps";
import { getEnv } from "@/server/env";
import { brevoTransport } from "@/server/mail/brevo";
import { drainOutbox, type DrainResult } from "@/server/mail/outbox";
import type { MailTransport } from "@/server/mail/transport";

/**
 * The domain services' dependencies for the running app: the three pools they use, the real clock and randomness, the origin
 * links point at, and a Better Auth factory for invite redemption. Built on first use from the environment, like
 * server/auth/index.ts. The services themselves are plain functions that take this (server/domain/*.ts); the admin screens
 * of phase 1D and the accept-invite action call them with `getDomain()`.
 */
let deps: DomainDeps | undefined;

export function getDomain(): DomainDeps {
  if (deps !== undefined) return deps;
  const env = getEnv();
  deps = {
    fynixDb: getDatabase("leads_fynix").db,
    authDb: getDatabase("leads_auth").db,
    publicDb: getDatabase("leads_public").db,
    now: () => new Date(),
    randomBytes: (count) => randomFillSync(new Uint8Array(count)),
    origin: env.APP_ORIGIN,
    // Gate G2: on an https deployment nobody is invited while a party's terms are still placeholder text.
    allowPlaceholderTerms: new URL(env.APP_ORIGIN).protocol !== "https:",
    authFactory: (db) =>
      createAuth({
        db,
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.APP_ORIGIN,
        breachChecker: breachCheckerFor(env.PASSWORD_BREACH_CHECK),
        // Redemption creates an account and never asks for a reset, so this instance has no use for the mailer.
        mailer: { sendPasswordReset: async () => { throw new Error("A reset email is never sent while an invite is redeemed."); } },
        nextCookies: false,
      }),
  };
  return deps;
}

/** The Brevo transport, or `null` when no key is set (development): then queued messages stay in the outbox. */
export function getMailTransport(): MailTransport | null {
  const { BREVO_API_KEY } = getEnv();
  return BREVO_API_KEY === undefined ? null : brevoTransport({ apiKey: BREVO_API_KEY });
}

/**
 * Sends what is waiting in the outbox once. The admin actions that queue an invite call it after their transaction commits,
 * without awaiting it in the request (Next.js `after()`), and a timer or `pnpm outbox:run` calls it too. It never throws for
 * a delivery problem: those are recorded on the message and retried.
 */
export function sendQueuedMail(): Promise<DrainResult> {
  return drainOutbox(getDomain().authDb, getMailTransport());
}
```


- [ ] **Step 3: Update the documentation**

**Edit:** `CLAUDE.md`

Replace:

```markdown
# fynix-leads

Lead generation tracking portal. A client reviews leads that the Fynix team submits and approves, rejects or asks for clarification. An agency does the work behind Fynix. Fynix runs both. The screens are still a clickable prototype on sample data (phase 0): nothing is saved and there is no sign-in or email yet. Phase 1 is replacing the foundations underneath them, starting with the database layer (1A, in `server/db/`).

## Where things are
```

With:

```markdown
# fynix-leads

Lead generation tracking portal. A client reviews leads that the Fynix team submits and approves, rejects or asks for clarification. An agency does the work behind Fynix. Fynix runs both. The screens are still a clickable prototype on sample data (phase 0): nothing is saved and there is no sign-in or email yet. Phase 1 is replacing the foundations underneath them: the database layer (1A, `server/db/`), sign-in (1B, `server/auth/`) and the domain behind the admin screens (1C, `server/domain/`, `server/mail/`).

## Where things are
```

**Edit:** `CLAUDE.md`

Replace:

```markdown
  - **Dev databases** are `fynix_leads` and `fynix_leads_test` on the Postgres 16 already running on this machine, shared with other projects. Create only those and the `leads_*` roles. The test harness refuses any database whose name does not end in `_test`.
- **Auth (`server/auth/`, rules in `docs/superpowers/plans/2026-11-12-phase-1b-auth.md`):** Better Auth 1.7.20, pinned exactly, email and password, no public sign-up.
  - **Better Auth stays inside `server/auth/`** and its HTTP handler is never mounted: sign-in, reset and account creation are server code calling `auth.api`, behind our rate limits (`server/auth/rate-limit.ts`, Postgres, `leads_public`, never inside a transaction) and our password policy (12 or more characters, not in a breach, `server/auth/breach-check.ts`). `server/auth/boundaries.test.ts` enforces it.
  - **Only `leads_auth` touches `user`, `session`, `account`, `verification` and `member`.** The access matrix in `server/db/structure.integration.test.ts` lists, for every table, the roles that may touch it: adding a table or widening a grant means editing that list on purpose.
  - **Accounts are created only inside `withAccountCreationGrant`** (`server/auth/create-account.ts`), by `pnpm admin:create` today and by invite redemption in phase 1C. A user with no active `member` row gets no session.
  - **A request resolves like this:** `getSessionContext()` (cookie, session, `member`, organisation kind), then `withSessionScope(context, work)` (`server/auth/with-session.ts`), which picks the role pool and sets the scope. Sessions are fixed length: 14 days for client and agency, 12 hours for Fynix, never extended.
  - **Three Better Auth quirks, each guarded and tested:** a 403 in the user-create hook becomes a fake success (the hook returns `false`); a duplicate address answers with an id that was never stored (`createAccountWithGrant` reads the row back); a short secret falls back to a public default (`assertUsableSecret` refuses). Canary tests fail when a Better Auth upgrade changes any of them.
  - **Fynix is password only until gate G1.** The place for a second factor is `server/auth/second-factor.ts`. Do not build one elsewhere.
  - **The reset link** goes to `email_outbox` through `leads_public`; nothing is sent in development. `pnpm mail:last` prints it. Phase 1C adds the Brevo transport.
  - **`x-real-ip`, not `x-forwarded-for`,** is the network address for rate limits. The production nginx must overwrite `x-real-ip` (phase 6).
- **Dev server:** `pnpm dev` serves http://localhost:3020. Next.js allows one dev server per project, so reuse the running one. Do not stop a server unless the owner says so.

## Commands
```

With:

```markdown
  - **Dev databases** are `fynix_leads` and `fynix_leads_test` on the Postgres 16 already running on this machine, shared with other projects. Create only those and the `leads_*` roles. The test harness refuses any database whose name does not end in `_test`.
- **Auth (`server/auth/`, rules in `docs/superpowers/plans/2026-11-12-phase-1b-auth.md`):** Better Auth 1.7.20, pinned exactly, email and password, no public sign-up.
  - **Better Auth stays inside `server/auth/`** and its HTTP handler is never mounted: sign-in, reset and account creation are server code calling `auth.api`, behind our rate limits (`server/auth/rate-limit.ts`, Postgres, `leads_public`, never inside a transaction) and our password policy (12 or more characters, not in a breach, `server/auth/breach-check.ts`). `server/auth/boundaries.test.ts` enforces it.
  - **Only `leads_auth` touches `session`, `account` and `verification`.** Fynix reads four columns of `user` (id, name, email, created time) and nothing else of it. The access matrix in `server/db/structure.integration.test.ts` lists, for every table, the roles that may touch it: adding a table or widening a grant means editing that list on purpose.
  - **Accounts are created only inside `withAccountCreationGrant`** (`server/auth/create-account.ts`), by `pnpm admin:create` and by invite redemption (`server/domain/redeem-invite.ts`). A user with no active `member` row gets no session.
  - **A request resolves like this:** `getSessionContext()` (cookie, session, `member`, organisation kind), then `withSessionScope(context, work)` (`server/auth/with-session.ts`), which picks the role pool and sets the scope. Sessions are fixed length: 14 days for client and agency, 12 hours for Fynix, never extended.
  - **Three Better Auth quirks, each guarded and tested:** a 403 in the user-create hook becomes a fake success (the hook returns `false`); a duplicate address answers with an id that was never stored (`createAccountWithGrant` reads the row back); a short secret falls back to a public default (`assertUsableSecret` refuses). Canary tests fail when a Better Auth upgrade changes any of them.
  - **Fynix is password only until gate G1.** The place for a second factor is `server/auth/second-factor.ts`. Do not build one elsewhere.
  - **The reset link** is queued in `email_outbox` through `leads_public`, like every email (see Domain below). `pnpm mail:last` prints the newest message and its link in development.
  - **`x-real-ip`, not `x-forwarded-for`,** is the network address for rate limits. The production nginx must overwrite `x-real-ip` (phase 6).
- **Domain (`server/domain/`, `server/mail/`, rules in `docs/superpowers/plans/2026-11-12-phase-1c-domain.md`):** organisations, invites, terms, campaigns, members and aliases, as plain functions that take `DomainDeps` (`server/domain/deps.ts`). The running app builds it with `getDomain()` (`server/domain/index.ts`).
  - **Every Fynix write goes through `fynixWrite`** (`server/domain/fynix-write.ts`): the Fynix scope transaction plus an `audit` function that appends to `audit_log` in the same transaction. The database backs it: a transaction as `leads_fynix` that changes a domain table without an audit row cannot commit (`audit_required`), and `audit_log` refuses UPDATE and DELETE for every role including the owner. A new table Fynix can write needs the `audit_required` trigger in its grants migration (a structural test fails without it).
  - **Nothing is deleted.** Organisations and campaigns are archived by status, invites are revoked, terms are superseded, members are suspended. Audit snapshots (`server/domain/snapshots.ts`) never hold a token, a hash, a link or a password.
  - **Invites:** a 32 byte token, only its SHA-256 stored, seven days, one live invite per address (issuing a new one revokes the old one in the same transaction). `leads_auth` sees an invite only when its transaction names the hash (`withInviteHash`). Redemption (`redeemInvite`) is one transaction on `leads_auth` with Better Auth running on it, so the account, the membership, the alias, the acceptance of the terms and `redeemed_at` commit together or not at all.
  - **Terms:** a published document is never edited. The text seeded by `pnpm terms:placeholder` is PLACEHOLDER (gate G2): on an https deployment no invite is issued while a party's current terms are placeholder.
  - **Email:** every message is written to `email_outbox` first (`enqueueEmail`) and sent by `drainOutbox` (`pnpm outbox:run`, as `leads_auth`) through Brevo from `hello@fynix.digital`. The link lives in its own column, only while the row is `pending`, and is cleared on send, on a permanent failure, on cancel and by the purge after a day; the stored copy of the text has no link. Without `BREVO_API_KEY` development only writes the table, and an https deployment refuses to start without a key. A failure to send is recorded and retried (five attempts, backing off), never thrown into a request. Tests use `FakeTransport` and never call Brevo.
- **Dev server:** `pnpm dev` serves http://localhost:3020. Next.js allows one dev server per project, so reuse the running one. Do not stop a server unless the owner says so.

## Commands
```

**Edit:** `CLAUDE.md`

Replace:

```markdown
pnpm db:seed            # two clients, two agencies, four campaigns (refuses a non-empty database)
pnpm db:generate        # SQL from server/db/schema/; add --custom --name=<name> for hand-written SQL
pnpm admin:create --email=<address> --name="<full name>"   # the first Fynix admin; asks for the password
pnpm mail:last          # prints the newest message in the dev email outbox (the password reset link)
```

Before calling a change done, run lint, typecheck, test and build. Add `pnpm test:integration` when the change touches `server/db/`, a migration or a grant.
```

With:

```markdown
pnpm db:seed            # two clients, two agencies, four campaigns (refuses a non-empty database)
pnpm db:generate        # SQL from server/db/schema/; add --custom --name=<name> for hand-written SQL
pnpm admin:create --email=<address> --name="<full name>"   # the first Fynix admin; asks for the password
pnpm mail:last          # prints the newest message in the dev email outbox (a reset or invite link)
pnpm outbox:run         # sends what is waiting in the outbox once (needs BREVO_API_KEY; without it nothing is sent)
pnpm terms:placeholder  # writes PLACEHOLDER terms for any party that has none (development only)
```

Before calling a change done, run lint, typecheck, test and build. Add `pnpm test:integration` when the change touches `server/db/`, a migration or a grant.
```


**Edit:** `README.md`

Replace:

```markdown
- `pnpm db:migrate`, then `pnpm admin:create --email=you@fynix.digital --name="Your Name"` creates the first Fynix admin. It asks for the password twice, or reads the first line of standard input. New passwords need 12 or more characters and must not appear in a known breach (checked through the k-anonymity range API of Have I Been Pwned, which sees five characters of a hash). With no network, set `PASSWORD_BREACH_CHECK=off` in `.env.local`; it is refused on an https `APP_ORIGIN`.
- In development nothing is emailed. A reset link is written to the `email_outbox` table, and `pnpm mail:last` prints the newest one.

## Check it

```bash
```

With:

```markdown
- `pnpm db:migrate`, then `pnpm admin:create --email=you@fynix.digital --name="Your Name"` creates the first Fynix admin. It asks for the password twice, or reads the first line of standard input. New passwords need 12 or more characters and must not appear in a known breach (checked through the k-anonymity range API of Have I Been Pwned, which sees five characters of a hash). With no network, set `PASSWORD_BREACH_CHECK=off` in `.env.local`; it is refused on an https `APP_ORIGIN`.
- In development nothing is emailed. A reset link is written to the `email_outbox` table, and `pnpm mail:last` prints the newest one.

## Invites, terms and email (phase 1C)

- `pnpm terms:placeholder` writes PLACEHOLDER terms for the client, the agency and Fynix, so an invite can be redeemed. They are not legal text. Lawyer-approved text replaces them before any real user is invited.
- Invites, organisations, campaigns and members are managed by the services in `server/domain/` (the admin screens that call them come in phase 1D). Every Fynix change is recorded in `audit_log`.
- Email goes through the `email_outbox` table. To send it for real set `BREVO_API_KEY` in `.env.local` (an https deployment refuses to start without one) and run `pnpm outbox:run`. Without a key nothing is sent and `pnpm mail:last` prints the newest message.

## Check it

```bash
```


- [ ] **Step 4: Run the checks**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build
node -e '
const fs = require("fs"), path = require("path");
const bad = [];
const scan = (f) => { if (/[\u2013\u2014]/.test(fs.readFileSync(f, "utf8"))) bad.push(f); };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(tsx?|css|md|sql)$/.test(f)) scan(f); });
["app", "components", "lib", "server", "scripts"].forEach(walk);
["DESIGN.md", "CLAUDE.md", "README.md"].forEach(scan);
if (bad.length) { console.error("Dashes found in:\n" + bad.join("\n")); process.exit(1); }
console.log("No em or en dashes.");
'
```

Expected: everything green (70 files, 807 tests, 18 files, 482 tests), `pnpm build` passes, and `No em or en dashes.`.

- [ ] **Step 5: Commit**

```bash
git add server CLAUDE.md README.md
git commit -m "Wire the domain services for the running app, add the boundary tests and document phase 1C"
```

## Task 13: The accept-invite action and the page's read

**Files:** create `lib/domain/invite-form-state.ts`, `invite-messages.ts`, `invite-messages.test.ts`, `server/domain/actions.ts`, `actions.test.ts`, `page-data.ts`; modify `server/domain/boundaries.test.ts`, `CLAUDE.md`.

The page of Part B is markup and routing only, because everything it calls is built and tested here, the way 1B built the sign-in actions before the sign-in page.

- **`InviteFormState`** is what the action hands the form: `idle`, a fixable `error` with its message, `rate-limited`, `terms-changed` (the page refreshes to show the current text) and `unavailable` (the link stopped working while the person typed, with the reason). The password is never in it.
- **`redeemInviteAction`** reads the form (`token`, `password`, the `termsId` the page carried, and the `accept` checkbox), reads the network address from `x-real-ip` only (never `x-forwarded-for`, the 1B rule), and calls `redeemInvite`. **The terms are sent only when the box is ticked**, even though the page always carries a terms id. On success it signs the person in with the password they chose (decision C17) and redirects to `/welcome`; if the sign-in cannot be completed it redirects to `/sign-in?invite=accepted`. A fault becomes the neutral message and only the error's name is logged.
- **`loadInvitePage(token)`** is the page's one read: `previewInvite` with the request's network address. A missing token is answered like a wrong one.
- **Messages** (`lib/domain/invite-messages.ts`) are every sentence the page shows, tested for sentence case, no exclamation marks and no dashes, and for naming nobody.

- [ ] **Step 1: Write the tests**

**File:** `lib/domain/invite-messages.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { ACCOUNT_EXISTS, INVITE_ACCEPTED_NOTICE, TERMS_CHANGED, TERMS_NOT_ACCEPTED, unavailableMessage, type InviteUnavailableReason } from "./invite-messages";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("invite messages", () => {
  it.each(["invalid", "expired", "revoked", "redeemed"] satisfies InviteUnavailableReason[])("%s: has its own sentence, says what to do and names nobody", (reason) => {
    const message = unavailableMessage(reason);
    expect(message.length).toBeGreaterThan(20);
    expect(message).toMatch(/[Aa]sk Fynix|Sign in instead/);
    expect(message).not.toMatch(/@/);
  });

  it("gives every reason a different sentence", () => {
    const messages = (["invalid", "expired", "revoked", "redeemed"] satisfies InviteUnavailableReason[]).map(unavailableMessage);
    expect(new Set(messages).size).toBe(4);
  });

  it("uses sentence case, no exclamation marks and no em or en dashes anywhere", () => {
    const all = [...(["invalid", "expired", "revoked", "redeemed"] satisfies InviteUnavailableReason[]).map(unavailableMessage), TERMS_NOT_ACCEPTED, TERMS_CHANGED, ACCOUNT_EXISTS, INVITE_ACCEPTED_NOTICE];
    for (const message of all) {
      expect(DASHES.test(message), message).toBe(false);
      expect(message, message).not.toContain("!");
      expect(message, message).toMatch(/^[A-Z]/);
    }
  });
});
```


**File:** `server/domain/actions.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INVITE_IDLE } from "@/lib/domain/invite-form-state";

/**
 * The accept-invite action with everything outside it replaced: the Next.js request APIs and the services. It proves the
 * wiring: which address is read, what is passed on, and how each result becomes a form state or a redirect.
 */

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

const state = vi.hoisted(() => ({ requestHeaders: new Headers(), redeem: vi.fn(), signIn: vi.fn() }));

vi.mock("next/headers", () => ({ headers: async () => state.requestHeaders }));
vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Redirected(to);
  },
}));
vi.mock("@/server/auth", () => ({ getAuthServices: () => ({ services: true }) }));
vi.mock("@/server/auth/sign-in", () => ({ signInWithPassword: state.signIn }));
vi.mock("@/server/domain", () => ({ getDomain: () => ({ deps: true }) }));
vi.mock("@/server/domain/redeem-invite", () => ({ redeemInvite: state.redeem }));

const { redeemInviteAction } = await import("./actions");

const form = (values: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};
const FULL = { token: "T".repeat(43), password: "a long enough password", termsId: "terms-1", accept: "on" };
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

describe("redeemInviteAction", () => {
  it("passes the token, the password, the terms that were ticked and the proxy address (not x-forwarded-for) to the service", async () => {
    state.redeem.mockResolvedValue({ status: "invite-unavailable", reason: "invalid" });
    await redeemInviteAction(INVITE_IDLE, form(FULL));
    expect(state.redeem).toHaveBeenCalledWith({ deps: true }, { token: FULL.token, password: FULL.password, acceptedTermsId: "terms-1", address: "203.0.113.9" });
  });

  it("sends no accepted terms when the box was not ticked, even though the page carried a terms id", async () => {
    state.redeem.mockResolvedValue({ status: "terms-not-accepted" });
    const result = await redeemInviteAction(INVITE_IDLE, form({ ...FULL, accept: "" }));
    expect(state.redeem.mock.calls[0]?.[1]).toMatchObject({ acceptedTermsId: null });
    expect(result).toEqual({ status: "error", message: "Tick the box to accept the terms and continue." });
  });

  it("signs the person in with the password they chose and lands on the welcome page", async () => {
    state.redeem.mockResolvedValue({ status: "redeemed", userId: "u", email: "priya@kestrel.example", party: "client" });
    state.signIn.mockResolvedValue({ status: "signed-in", userId: "u", headers: new Headers() });
    expect(await redirectTarget(redeemInviteAction(INVITE_IDLE, form(FULL)))).toBe("/welcome");
    expect(state.signIn).toHaveBeenCalledWith({ services: true }, { email: "priya@kestrel.example", password: FULL.password, address: "203.0.113.9", headers: state.requestHeaders });
  });

  it("sends the person to the sign-in page when the account is ready but the sign-in could not be completed, whether it refused or failed", async () => {
    state.redeem.mockResolvedValue({ status: "redeemed", userId: "u", email: "priya@kestrel.example", party: "client" });
    state.signIn.mockResolvedValue({ status: "rate-limited", retryAfterSeconds: 60 });
    expect(await redirectTarget(redeemInviteAction(INVITE_IDLE, form(FULL)))).toBe("/sign-in?invite=accepted");
    state.signIn.mockRejectedValue(new Error("database is down for priya@kestrel.example"));
    expect(await redirectTarget(redeemInviteAction(INVITE_IDLE, form(FULL)))).toBe("/sign-in?invite=accepted");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("priya@kestrel.example");
  });

  it.each([
    [{ status: "weak-password", message: "Use at least 12 characters." }, { status: "error", message: "Use at least 12 characters." }],
    [{ status: "check-unavailable" }, { status: "error", message: "We could not check that password just now. Try again in a minute." }],
    [{ status: "account-exists" }, { status: "error", message: "This address already has an account. Ask your Fynix contact for help." }],
    [{ status: "terms-changed" }, { status: "terms-changed", message: "The terms were updated while you were reading. Read the new version and accept it to continue." }],
    [{ status: "rate-limited", retryAfterSeconds: 130 }, { status: "rate-limited", message: "Too many attempts. Try again in 3 minutes." }],
    [{ status: "invite-unavailable", reason: "expired" }, { status: "unavailable", reason: "expired", message: "This invite has expired. Ask Fynix to send you a new one." }],
    [{ status: "invite-unavailable", reason: "redeemed" }, { status: "unavailable", reason: "redeemed", message: "This invite has been used already. Sign in instead." }],
  ])("turns %j into the form state %j", async (result, expected) => {
    state.redeem.mockResolvedValue(result);
    expect(await redeemInviteAction(INVITE_IDLE, form(FULL))).toEqual(expected);
    expect(state.signIn).not.toHaveBeenCalled();
  });

  it("answers a fault with the neutral message and logs only the error's name", async () => {
    state.redeem.mockRejectedValue(Object.assign(new Error("connection refused for priya@kestrel.example"), { name: "DatabaseError" }));
    expect(await redeemInviteAction(INVITE_IDLE, form(FULL))).toEqual({ status: "error", message: "Something went wrong. Try again in a moment." });
    expect(vi.mocked(console.error).mock.calls).toEqual([["The accept-invite action failed", "DatabaseError"]]);
  });
});
```


**Edit:** `server/domain/boundaries.test.ts`

Replace:

```typescript
    }
  });

  it("only server/domain/index.ts among the domain files imports server-only", () => {
    const offenders = domainFiles().filter((path) => path !== join("server", "domain", "index.ts") && /import\s+["']server-only["']/.test(read(path)));
    expect(offenders).toEqual([]);
    expect(read("server/domain/index.ts")).toMatch(/^import "server-only";/m);
  });
});

describe("secrets stay out of places they must not be", () => {
  it("no domain or mail file logs", () => {
    const offenders = [...domainFiles(), ...sourceFiles("server/mail")].filter((path) => /console\.(log|info|debug|warn|error)\(/.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("only the invite and redeem services and the outbox know the invite link path, and only the outbox sender reads the link column", () => {
```

With:

```typescript
    }
  });

  it("only server/domain/index.ts and page-data.ts among the domain files import server-only", () => {
    const allowed = new Set([join("server", "domain", "index.ts"), join("server", "domain", "page-data.ts")]);
    const offenders = domainFiles().filter((path) => !allowed.has(path) && /import\s+["']server-only["']/.test(read(path)));
    expect(offenders).toEqual([]);
    for (const path of allowed) expect(read(path), path).toMatch(/^import "server-only";/m);
  });

  it("the actions file is a use server module that exports only async functions, because every export is a public endpoint", () => {
    const source = read("server/domain/actions.ts");
    expect(source.startsWith('"use server";')).toBe(true);
    const exports = source.split("\n").filter((line) => line.startsWith("export "));
    expect(exports.length).toBeGreaterThan(0);
    expect(exports.filter((line) => !line.startsWith("export async function "))).toEqual([]);
  });
});

describe("secrets stay out of places they must not be", () => {
  it("no domain or mail file logs, except the action, which logs an error's name and never its message", () => {
    const offenders = [...domainFiles(), ...sourceFiles("server/mail")].filter((path) => path !== join("server", "domain", "actions.ts") && /console\.(log|info|debug|warn|error)\(/.test(read(path)));
    expect(offenders).toEqual([]);
    const logged = read("server/domain/actions.ts").match(/console\.\w+\([^)]*\)/g) ?? [];
    for (const call of logged) expect(call, call).toMatch(/error instanceof Error \? error\.name : "unknown error"/);
  });

  it("only the invite and redeem services and the outbox know the invite link path, and only the outbox sender reads the link column", () => {
```


Run `pnpm exec vitest run lib/domain server/domain/actions server/domain/boundaries`. Expected: FAIL: `lib/domain/invite-messages.test.ts` and `server/domain/actions.test.ts` cannot load, and 3 of the 11 tests in `server/domain/boundaries.test.ts` fail (the action file does not exist, and `page-data.ts` is not there to be allowed).

- [ ] **Step 2: Write the code**

**File:** `lib/domain/invite-form-state.ts`

```typescript
/**
 * What the accept-invite action hands back to its form through React's `useActionState`. The form renders from this alone,
 * and the password is never in it: React 19 resets a form after its action runs, and the page has nothing to refill but the
 * password, which is never sent back.
 */
export type InviteFormState =
  | { readonly status: "idle" }
  /** The attempt failed in a way the person can fix (a short or breached password, the box not ticked) or can only retry. `message` is ready to show. */
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "rate-limited"; readonly message: string }
  /** A newer version of the terms was published while the page was open. The page refreshes to show the current text; the person must read and accept it. */
  | { readonly status: "terms-changed"; readonly message: string }
  /** The link stopped working while the person was typing: it ran out, was withdrawn, or was used in another tab. */
  | { readonly status: "unavailable"; readonly reason: "invalid" | "expired" | "revoked" | "redeemed"; readonly message: string };

export const INVITE_IDLE: InviteFormState = { status: "idle" };
```


**File:** `lib/domain/invite-messages.ts`

```typescript
/**
 * The words a person reads on the accept-invite page. Plain sentences in sentence case, no dashes, no exclamation marks. The
 * messages for a link that does not work never say whose invite it was.
 */
export type InviteUnavailableReason = "invalid" | "expired" | "revoked" | "redeemed";

export const INVITE_INVALID = "This link is not valid. Check that you copied all of it, or ask Fynix for a new invite.";
export const INVITE_EXPIRED = "This invite has expired. Ask Fynix to send you a new one.";
export const INVITE_REVOKED = "This invite was withdrawn. Ask Fynix to send you a new one.";
export const INVITE_USED = "This invite has been used already. Sign in instead.";

export function unavailableMessage(reason: InviteUnavailableReason): string {
  switch (reason) {
    case "invalid":
      return INVITE_INVALID;
    case "expired":
      return INVITE_EXPIRED;
    case "revoked":
      return INVITE_REVOKED;
    case "redeemed":
      return INVITE_USED;
  }
}

export const TERMS_NOT_ACCEPTED = "Tick the box to accept the terms and continue.";
export const TERMS_CHANGED = "The terms were updated while you were reading. Read the new version and accept it to continue.";
export const ACCOUNT_EXISTS = "This address already has an account. Ask your Fynix contact for help.";
/** Shown on the sign-in page after an invite was accepted but the automatic sign-in could not be completed. */
export const INVITE_ACCEPTED_NOTICE = "Your account is ready. Sign in with the password you chose.";
```


**File:** `server/domain/actions.ts`

```typescript
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BREACH_CHECK_UNAVAILABLE, GENERIC_FAILURE, retryMessage } from "@/lib/auth/messages";
import type { InviteFormState } from "@/lib/domain/invite-form-state";
import { ACCOUNT_EXISTS, TERMS_CHANGED, TERMS_NOT_ACCEPTED, unavailableMessage } from "@/lib/domain/invite-messages";
import { getAuthServices } from "@/server/auth";
import { clientAddressFrom } from "@/server/auth/client-address";
import { signInWithPassword } from "@/server/auth/sign-in";
import { getDomain } from "@/server/domain";
import { redeemInvite } from "@/server/domain/redeem-invite";

/**
 * The server action behind the accept-invite form, a thin shell like the ones in server/auth/actions.ts: read the form, read
 * the network address from the proxy header, call `redeemInvite`, and turn its result into an `InviteFormState` or a redirect.
 * All the rules are in the service. Every export of a "use server" file is a public endpoint, so this file exports only actions.
 */

/** Where a person lands after the account is created and signed in. The same page every sign-in lands on. */
const DEFAULT_LANDING = "/welcome";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function redeemInviteAction(_previous: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const requestHeaders = await headers();
  const address = clientAddressFrom(requestHeaders);
  const password = field(formData, "password");
  // The checkbox sends "on" when ticked and nothing when not. The hidden field carries the id of the terms that were on the page.
  const acceptedTermsId = field(formData, "accept") === "on" ? field(formData, "termsId") : null;

  let result;
  try {
    result = await redeemInvite(getDomain(), { token: field(formData, "token"), password, acceptedTermsId, address });
  } catch (error) {
    // A fault (the database is down, a bug, an alias clash found at the last step). Only the name is logged: the message can carry an address.
    console.error("The accept-invite action failed", error instanceof Error ? error.name : "unknown error");
    return { status: "error", message: GENERIC_FAILURE };
  }

  switch (result.status) {
    case "redeemed":
      break;
    case "rate-limited":
      return { status: "rate-limited", message: retryMessage(result.retryAfterSeconds) };
    case "weak-password":
      return { status: "error", message: result.message };
    case "check-unavailable":
      return { status: "error", message: BREACH_CHECK_UNAVAILABLE };
    case "terms-not-accepted":
      return { status: "error", message: TERMS_NOT_ACCEPTED };
    case "terms-changed":
      return { status: "terms-changed", message: TERMS_CHANGED };
    case "account-exists":
      return { status: "error", message: ACCOUNT_EXISTS };
    case "invite-unavailable":
      return { status: "unavailable", reason: result.reason, message: unavailableMessage(result.reason) };
  }

  // The account exists. Sign in with the password just chosen, through the normal sign-in (its own limits and cookie). If that
  // cannot be completed for any reason the account is still ready, so the person is sent to the sign-in page.
  let signedIn = false;
  try {
    signedIn = (await signInWithPassword(getAuthServices(), { email: result.email, password, address, headers: requestHeaders })).status === "signed-in";
  } catch (error) {
    console.error("Signing in after an invite failed", error instanceof Error ? error.name : "unknown error");
  }
  redirect(signedIn ? DEFAULT_LANDING : "/sign-in?invite=accepted");
}
```


**File:** `server/domain/page-data.ts`

```typescript
import "server-only";
import { headers } from "next/headers";
import { clientAddressFrom } from "@/server/auth/client-address";
import { getDomain } from "@/server/domain";
import { previewInvite, type InvitePreview } from "@/server/domain/invites";

/**
 * What the accept-invite page reads for a link: the state of the invite and, when it is usable, the person's name, address,
 * party and the current terms (`previewInvite`). Called from the page inside a `<Suspense>` boundary, because with Cache
 * Components the request's headers are request-time data. A missing token is answered like a wrong one.
 */
export async function loadInvitePage(token: string | undefined): Promise<InvitePreview> {
  return previewInvite(getDomain(), { token: token ?? "", address: clientAddressFrom(await headers()) });
}
```


**Edit:** `CLAUDE.md`

Replace:

```markdown
  - **Every Fynix write goes through `fynixWrite`** (`server/domain/fynix-write.ts`): the Fynix scope transaction plus an `audit` function that appends to `audit_log` in the same transaction. The database backs it: a transaction as `leads_fynix` that changes a domain table without an audit row cannot commit (`audit_required`), and `audit_log` refuses UPDATE and DELETE for every role including the owner. A new table Fynix can write needs the `audit_required` trigger in its grants migration (a structural test fails without it).
  - **Nothing is deleted.** Organisations and campaigns are archived by status, invites are revoked, terms are superseded, members are suspended. Audit snapshots (`server/domain/snapshots.ts`) never hold a token, a hash, a link or a password.
  - **Invites:** a 32 byte token, only its SHA-256 stored, seven days, one live invite per address (issuing a new one revokes the old one in the same transaction). `leads_auth` sees an invite only when its transaction names the hash (`withInviteHash`). Redemption (`redeemInvite`) is one transaction on `leads_auth` with Better Auth running on it, so the account, the membership, the alias, the acceptance of the terms and `redeemed_at` commit together or not at all.
  - **Terms:** a published document is never edited. The text seeded by `pnpm terms:placeholder` is PLACEHOLDER (gate G2): on an https deployment no invite is issued while a party's current terms are placeholder.
  - **Email:** every message is written to `email_outbox` first (`enqueueEmail`) and sent by `drainOutbox` (`pnpm outbox:run`, as `leads_auth`) through Brevo from `hello@fynix.digital`. The link lives in its own column, only while the row is `pending`, and is cleared on send, on a permanent failure, on cancel and by the purge after a day; the stored copy of the text has no link. Without `BREVO_API_KEY` development only writes the table, and an https deployment refuses to start without a key. A failure to send is recorded and retried (five attempts, backing off), never thrown into a request. Tests use `FakeTransport` and never call Brevo.
- **Dev server:** `pnpm dev` serves http://localhost:3020. Next.js allows one dev server per project, so reuse the running one. Do not stop a server unless the owner says so.
```

With:

```markdown
  - **Every Fynix write goes through `fynixWrite`** (`server/domain/fynix-write.ts`): the Fynix scope transaction plus an `audit` function that appends to `audit_log` in the same transaction. The database backs it: a transaction as `leads_fynix` that changes a domain table without an audit row cannot commit (`audit_required`), and `audit_log` refuses UPDATE and DELETE for every role including the owner. A new table Fynix can write needs the `audit_required` trigger in its grants migration (a structural test fails without it).
  - **Nothing is deleted.** Organisations and campaigns are archived by status, invites are revoked, terms are superseded, members are suspended. Audit snapshots (`server/domain/snapshots.ts`) never hold a token, a hash, a link or a password.
  - **Invites:** a 32 byte token, only its SHA-256 stored, seven days, one live invite per address (issuing a new one revokes the old one in the same transaction). `leads_auth` sees an invite only when its transaction names the hash (`withInviteHash`). Redemption (`redeemInvite`) is one transaction on `leads_auth` with Better Auth running on it, so the account, the membership, the alias, the acceptance of the terms and `redeemed_at` commit together or not at all.
  - **The accept-invite page** reads through `loadInvitePage` (`server/domain/page-data.ts`) and posts to `redeemInviteAction` (`server/domain/actions.ts`), which redeems, signs the person in with the password they chose and lands on `/welcome`. Pages import nothing else from `server/domain`.
  - **Terms:** a published document is never edited. The text seeded by `pnpm terms:placeholder` is PLACEHOLDER (gate G2): on an https deployment no invite is issued while a party's current terms are placeholder.
  - **Email:** every message is written to `email_outbox` first (`enqueueEmail`) and sent by `drainOutbox` (`pnpm outbox:run`, as `leads_auth`) through Brevo from `hello@fynix.digital`. The link lives in its own column, only while the row is `pending`, and is cleared on send, on a permanent failure, on cancel and by the purge after a day; the stored copy of the text has no link. Without `BREVO_API_KEY` development only writes the table, and an https deployment refuses to start without a key. A failure to send is recorded and retried (five attempts, backing off), never thrown into a request. Tests use `FakeTransport` and never call Brevo.
- **Dev server:** `pnpm dev` serves http://localhost:3020. Next.js allows one dev server per project, so reuse the running one. Do not stop a server unless the owner says so.
```


- [ ] **Step 3: Run the tests and the checks**

```bash
pnpm exec vitest run lib/domain server/domain
pnpm test && pnpm test:integration
pnpm lint && pnpm typecheck && pnpm build
```

Expected: the targeted tests pass. Then `pnpm test`: 72 files, 828 tests pass and `pnpm test:integration`: 18 files, 482 tests pass. Lint, typecheck and build clean.

- [ ] **Step 4: Commit**

```bash
git add lib server CLAUDE.md
git commit -m "Add the accept-invite server action, its form state and messages, and the page's read"
```

---

# PART B: The accept-invite page

Part A built everything this screen calls: `redeemInviteAction` (`server/domain/actions.ts`), `loadInvitePage` (`server/domain/page-data.ts`), the form state (`lib/domain/invite-form-state.ts`) and every sentence the page shows (`lib/domain/invite-messages.ts`, with `lib/auth/messages.ts` and `lib/auth/password-policy.ts` for the password). Part B is **markup and routing only**.

This is a new screen, so the owner's standing rule applies: **visual comps are shown and approved before any UI is built**, in the approved hybrid design (`docs/superpowers/specs/design-directions-v2/d-hybrid/`, `DESIGN.md`: structured softness, never boxy-outlined and never borderless clutter), on the frame the owner approved for sign-in (`docs/superpowers/specs/phase-1b-auth-comps/`, built in `app/(auth)/layout.tsx` and `components/auth/`). Task 14 produces the comps and stops. Tasks 15 and 16 are written without component markup on purpose: they say what the page must do, which state each form renders, what accessibility requires and exactly how to check it. Wherever this part says **component markup finalised after comp approval**, the structure, spacing, type and colour come from the approved comps and `DESIGN.md`, and nothing is invented before then.

**What the 1B pages taught that applies here** (see the findings at the top of 1B Part B): a form that uses an action resets its uncontrolled fields after the action runs, so the password field comes back empty after a refusal, which is what is wanted here (the password is never carried back); with Cache Components a request-time read (`searchParams`, headers) must sit inside a `<Suspense>` boundary, and a `redirect()` inside one reaches the browser after the shell, so the shell of this page holds nothing private (the invitee's name and address are inside the boundary, the frame is not).

## Task 14: Step 0, visual comps for owner approval

**Files:** create `docs/superpowers/specs/phase-1c-invite-comps/` (HTML, PNG and `index.html`). No file under `app/`, `components/` or `lib/` changes in this task.

- [ ] **Step 1: Read the design authority and the 1B comps**

Read `DESIGN.md`, `docs/superpowers/specs/design-directions-v2/d-hybrid/NOTES.md` and `tokens.css`, and the 1B folder `docs/superpowers/specs/phase-1b-auth-comps/` (`comps.css`, `frame.html`, `reset-password.html`, `CHECKLIST.md`, `APPROVED.md`). Copy `tokens.css` and `comps.css` next to the new comps; do not touch the app. The rules that matter: four depths only (canvas, tonal pane, white panel with `shadow-raised`, navy hero), inputs are filled (`--navy-05`) not outlined, buttons and chips are pills, panels are radius 22, Geist Sans, sentence case, light mode only, no outlines to make zones, one hero tile per screen at most. The rail-less frame is the approved one: a centred white panel on the canvas, the brand mark above it.

- [ ] **Step 2: Render the comps**

Render static HTML and capture each state as a PNG with the browser pane. One HTML file per screen, every state on the same sheet so the owner can compare, each at desktop (1280 wide) and mobile (390 wide). Light mode only.

| Screen | States to render |
|---|---|
| Accept invite, a client invitee | default: the greeting with the name Fynix typed, the address shown as text (not an input), "Client" as the one word for the party, the new-password field with the rule hint (`PASSWORD_RULE`) and the show control, the terms panel (the document's title, its version, the text in a scrollable region, the PLACEHOLDER notice above it while the document is placeholder), the box "I accept these terms", the primary button "Create account"; focus on each of the password field, the show control, the terms region, the box and the button; submitting (button "Creating account", disabled); the box ticked; the layout with long terms text scrolled. |
| Accept invite, an agency invitee | The same, with the agency terms (the placeholder text mentions joining meetings under the Fynix alias). Nothing on the page shows an alias or the other party. |
| Errors, one at a time, on the same layout | `Use at least 12 characters.` (under the field, field invalid); `That password has appeared in a data breach. Choose a different one.`; `We could not check that password just now. Try again in a minute.`; `Tick the box to accept the terms and continue.` (by the box); `Too many attempts. Try again in 3 minutes.`; `This address already has an account. Ask your Fynix contact for help.`; `Something went wrong. Try again in a moment.` |
| Terms changed | The notice `The terms were updated while you were reading. Read the new version and accept it to continue.` above the refreshed terms, the box cleared. |
| Link that does not work | `This link is not valid. Check that you copied all of it, or ask Fynix for a new invite.`; `This invite has expired. Ask Fynix to send you a new one.`; `This invite was withdrawn. Ask Fynix to send you a new one.`; `This invite has been used already. Sign in instead.` with the way to the sign-in page. These four share the layout of the 1B dead-link state (`components/auth/link-not-valid.tsx`) and show no name and no address. |
| Success | The page redirects, so there is nothing to render for it: show the two places it can land: `/welcome` (the 1B holding page, already approved) and the sign-in page with the new notice `Your account is ready. Sign in with the password you chose.`. |

Use the exact strings above: they are the strings in `lib/domain/invite-messages.ts`, `lib/auth/messages.ts` and `lib/auth/password-policy.ts`, so the comps cannot drift from the build.

- [ ] **Step 3: Check the comps against the design rules**

For each sheet, tick: no outlined input or panel; at most two surface levels inside a module (the terms region is a tonal fill inside the white panel, not a box with an outline); radii from the scale; status text on its soft fill passes the contrast figures in `DESIGN.md`; no error is conveyed by colour alone (an icon or the words carry it); text sizes from the type scale; the terms region is reachable and scrollable by keyboard; the layout holds at 390 wide with no horizontal scroll and no tap target under 44 by 44 CSS pixels. Fix the comps until every box is ticked, and write the result into `docs/superpowers/specs/phase-1c-invite-comps/CHECKLIST.md` in the form of the 1B one.

- [ ] **Step 4: Stop and ask the owner**

Add `docs/superpowers/specs/phase-1c-invite-comps/index.html` linking every sheet, commit the comps, and ask the owner to approve them or say what to change. **Do not start Task 16 until the owner has approved in chat.** Record the approval in `docs/superpowers/specs/phase-1c-invite-comps/APPROVED.md` (date, what was approved, any change requested). If changes are requested, revise the comps and ask again.

```bash
git add docs/superpowers/specs/phase-1c-invite-comps
git commit -m "Add the visual comps for the accept-invite screen"
```

**Acceptance for Task 14:** the owner's approval is in chat and in `APPROVED.md`, and every state in the table above has a rendered comp at both widths.

## Task 15: Route, security headers and the thin-page rule

**Files:** modify `next.config.ts`, `server/auth/boundaries.test.ts`. (Component markup is Task 16.)

- **Route.** `/accept-invite?token=...` in the route group `app/(auth)/`, the group of the sign-in and reset pages, which has its own layout and no rail. The invite email (Task 9) links to exactly this path (`ACCEPT_INVITE_PATH` in `server/domain/invites.ts`). The token is a query value and nothing else carries it.
- **Headers.** The page has a one-time token in its URL, so it must not leak through a `Referer` header or sit in a cache, exactly like `/reset-password`. This is a configuration change, not markup:

**Edit:** `next.config.ts`

Replace:

```typescript
      // The reset token is in the URL of this page: send no referrer from it and cache nothing.
      { source: "/reset-password", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/sign-in", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  turbopack: {
```

With:

```typescript
      // The reset token is in the URL of this page: send no referrer from it and cache nothing.
      { source: "/reset-password", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/sign-in", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // The invite token is in the URL of this page, like the reset token above.
      { source: "/accept-invite", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
  turbopack: {
```


- **The thin-page rule** (1B Task 13) allows a page to import from `server/` only the 1B modules. The accept-invite page needs two more, and only these two:

**Edit:** `server/auth/boundaries.test.ts`

Replace:

```typescript
});

describe("pages stay thin", () => {
  /** The only server modules a page or a client form may import: the actions, the session read and the page guard. */
  const ALLOWED_SERVER_IMPORTS: ReadonlySet<string> = new Set(["@/server/auth", "@/server/auth/actions", "@/server/auth/guard"]);
  const pageFiles = (): string[] => ["app/(auth)", "app/(app)"].filter((directory) => existsSync(join(ROOT, directory))).flatMap(sourceFiles);
  const serverImports = (path: string): string[] => serverSpecifiers(read(path));

  it("import from server/ only the actions, the session read and the guard: never the database, Better Auth, the limiter or the breach check", () => {
    const offenders = pageFiles().flatMap((path) => serverImports(path).filter((name) => !ALLOWED_SERVER_IMPORTS.has(name)).map((name) => `${path} imports ${name}`));
    expect(offenders).toEqual([]);
  });
```

With:

```typescript
});

describe("pages stay thin", () => {
  /** The only server modules a page or a client form may import: the actions, the session read and the page guard, and the accept-invite action and page read. */
  const ALLOWED_SERVER_IMPORTS: ReadonlySet<string> = new Set(["@/server/auth", "@/server/auth/actions", "@/server/auth/guard", "@/server/domain/actions", "@/server/domain/page-data"]);
  const pageFiles = (): string[] => ["app/(auth)", "app/(app)"].filter((directory) => existsSync(join(ROOT, directory))).flatMap(sourceFiles);
  const serverImports = (path: string): string[] => serverSpecifiers(read(path));

  it("import from server/ only the actions, the session read, the guard and the accept-invite action and page read: never the database, Better Auth, the limiter or the breach check", () => {
    const offenders = pageFiles().flatMap((path) => serverImports(path).filter((name) => !ALLOWED_SERVER_IMPORTS.has(name)).map((name) => `${path} imports ${name}`));
    expect(offenders).toEqual([]);
  });
```

**Edit:** `server/auth/boundaries.test.ts`

Replace:

```typescript
  });
});

describe("files that reach a database pool", () => {
  it("server/auth/index.ts, guard.ts and with-session.ts import server-only, so a client component cannot pull them in", () => {
    for (const path of ["server/auth/index.ts", "server/auth/guard.ts", "server/auth/with-session.ts"]) expect(read(path), path).toMatch(/^import "server-only";/m);
```

With:

```typescript
  });
});

describe("pages that carry a one-time token in the URL", () => {
  /** What `headers()` in next.config.ts promises for a path. Next applies these to a page that exists; a 404 gets its own defaults. */
  async function headersFor(source: string): Promise<Record<string, string>> {
    const { default: config } = await import("../../next.config");
    const rules = (await config.headers?.()) ?? [];
    return Object.fromEntries(rules.filter((rule) => rule.source === source).flatMap((rule) => rule.headers.map((header) => [header.key, header.value])));
  }

  it.each(["/reset-password", "/accept-invite"])("%s sends no referrer and is never cached, so its token cannot leave through a header or sit in a cache", async (source) => {
    expect(await headersFor(source)).toEqual({ "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" });
  });
});

describe("files that reach a database pool", () => {
  it("server/auth/index.ts, guard.ts and with-session.ts import server-only, so a client component cannot pull them in", () => {
    for (const path of ["server/auth/index.ts", "server/auth/guard.ts", "server/auth/with-session.ts"]) expect(read(path), path).toMatch(/^import "server-only";/m);
```


  (The same edit adds the headers rule described in Step 2.) Everything else under `server/domain` stays unreachable from a page: the services, the pools and the database. The existing `never import better-auth or drizzle directly, and never log` rule covers the page too.
- **No third-party resources** (fonts, scripts, images from another origin) on this page; it only loads its own assets and the `geist` fonts already served from this origin.

- [ ] **Step 1: Apply and run**

```bash
pnpm exec vitest run server/auth/boundaries
pnpm test
pnpm lint && pnpm typecheck && pnpm build
```

Expected: the boundaries test passes. Then `pnpm test`: 72 files, 830 tests pass. Lint, typecheck and build clean.

- [ ] **Step 2: Check the headers**

The new rule in `server/auth/boundaries.test.ts` calls `headers()` from `next.config.ts` and says what each token page promises: `/reset-password` and `/accept-invite` both send `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. Next applies these to a page that exists, and a 404 gets its own defaults: a request for `/accept-invite` on a built app before Task 16 answers 404 without the referrer header, while `/reset-password`, which exists, answers both. So the check on a real response belongs to Task 16 (acceptance check 11), and this task's check is the rule.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts server/auth/boundaries.test.ts
git commit -m "Send no referrer and cache nothing from the accept-invite path, and let pages import the accept-invite action"
```

## Task 16: The accept-invite page

**Files (component markup finalised after comp approval):** create `app/(auth)/accept-invite/page.tsx` (server) and `accept-invite-form.tsx` (client); modify `app/(auth)/sign-in/page.tsx` (one notice).

- **Data flow.** The page is a server component. Its static shell is the frame (`AuthPanel`, from `components/auth/auth-frame.tsx`). Everything that depends on the request sits in a `<Suspense>` boundary: it awaits `searchParams`, reads `token` (one string, or nothing) and calls `loadInvitePage(token)`. A visitor who is already signed in is not special-cased: the invite is for a new account, and the page behaves the same. The result decides the rendering:

| `loadInvitePage` result | What the page renders |
|---|---|
| `pending` | The form, with the name and address as text, the party word ("Client" or "Agency"), the terms panel from `terms`, and the hidden fields `token` and `termsId` (the terms document's id). If `terms` is `null` (Fynix withdrew them after inviting) the dead-link layout with `INVITE_INVALID`: the person cannot accept nothing. |
| `invalid`, `expired`, `revoked`, `redeemed` | The dead-link layout (`components/auth/link-not-valid.tsx`) with the sentence from `unavailableMessage(reason)`. For `redeemed` it offers the way to `/sign-in`; for the others it says to ask Fynix, with no link to ask (there is no public way to ask). No name, no address. |
| `rate-limited` | The same layout with `retryMessage(retryAfterSeconds)`. |

- **Form.** A client component using `useActionState(redeemInviteAction, INVITE_IDLE)` and `<form action={formAction}>`. Fields: `password` (type `password`, `autocomplete="new-password"`, never given a value, the show control the 1B comps approved: a button with `aria-pressed` that only toggles the input's `type`, the hint `PASSWORD_RULE` under it), the checkbox `accept` (a real checkbox with a label, value `on`), and the hidden `token` and `termsId`. **No email field and no name field**: the address and name are the invite's and are shown as text. Never validate the password's length or strength in the browser beyond `required`; the server owns the rule.
- **Form states** (every string from `lib/domain/invite-messages.ts`, `lib/auth/messages.ts` or `lib/auth/password-policy.ts`):

| State | What the page does |
|---|---|
| `idle` | The form. Primary button "Create account". |
| pending (`useActionState`'s flag) | Button disabled, label "Creating account", fields as typed. |
| `error` | The message in a live region directly above the button, the password field emptied and focused when the message is about the password (a short, long or breached password, or a failed breach check), the box left as the person set it, `aria-invalid` on the field the message is about. For `Tick the box to accept the terms and continue.` focus goes to the box. |
| `rate-limited` | The message in the same place; the form stays usable. |
| `terms-changed` | The message above the terms, the box cleared, and the page re-reads the terms: the form calls `router.refresh()` once when this state arrives, so the server component renders the current document and its new `termsId`. The person must read and tick again. |
| `unavailable` | The form is replaced by the dead-link layout for the reason in the state. |
| success | The action redirects (to `/welcome`, or to `/sign-in?invite=accepted`); the page renders nothing for it. |

- **Terms panel.** The document's title and "Version N", the text in a region that scrolls (`tabindex="0"`, a visible focus ring, `role="region"` with the title as its label), the `PLACEHOLDER_NOTICE` from `lib/terms/placeholder.ts` above it **whenever `terms.placeholder` is true** (decision C12: the screen says so), and the checkbox label "I accept these terms". The text is rendered as plain paragraphs split on blank lines and line breaks: never as HTML.
- **Sign-in page.** `app/(auth)/sign-in/page.tsx` gains one notice: `?invite=accepted` shows `INVITE_ACCEPTED_NOTICE` in the same position and tone as the "password changed" notice, and never together with another. The query carries no data and grants nothing.
- **Accessibility.** Labels are real `<label>` elements tied by `htmlFor` (no placeholder as label); the address and name are text, not disabled inputs; the status message is in an element with `role="alert"` or an `aria-live="polite"` region; the error text is associated with its field by `aria-describedby`; the primary button is the only submit; the tab order is the show control (after the password field), the terms region, the box, the button; focus rings are the `--navy` ring from `DESIGN.md`; every control is at least 44 by 44 CSS pixels; paste is never blocked; the layout holds at 390 wide with no horizontal scroll; motion respects `prefers-reduced-motion`.
- **Tests.** The rules live in Part A and are already tested (`redeemInvite`, the action and the messages), and the Task 15 boundary rule already forbids this page from importing the database, Better Auth or any service. The page tests are that rule plus the browser checks below.

**Getting a real link in development.** There is no admin screen until phase 1D, so create an invite the way a test does, as the owner, with psql. This needs the first admin (`pnpm admin:create`), at least one organisation (`pnpm db:seed`) and terms (`pnpm terms:placeholder`):

```bash
set -a; . ./.env.local; set +a
TOKEN=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')
HASH=$(node -e 'console.log(require("crypto").createHash("sha256").update(process.argv[1]).digest("base64url"))' "$TOKEN")
psql "$DATABASE_URL_OWNER" -c "insert into invite (org_id, org_kind, email, name, token_hash, expires_at, created_by)
  select o.id, 'client', 'priya@example.com', 'Priya Nair', '$HASH', now() + interval '7 days', m.user_id
  from organisation o, member m where o.public_ref = 'ORG-4K9P' and m.org_kind = 'fynix' limit 1"
echo "http://localhost:3020/accept-invite?token=$TOKEN"
```

**Acceptance checks** (dev server on a free port or the running one):

1. `/accept-invite?token=...` with that link renders the approved comp at 1280 and at 390 wide, in light mode, with the name and address as text, the "Client" word, the terms and the PLACEHOLDER notice.
2. Submitting with the box unticked shows `Tick the box to accept the terms and continue.`, focus on the box, and creates nothing (`select count(*) from "user" where email = 'priya@example.com'` as the owner is 0).
3. `short` as the password shows `Use at least 12 characters.`, the password field empty and focused; `Password123456` shows the breach message (needs a network); the invite is still usable after each (`redeemed_at` is null).
4. A good password and the box ticked lands on `/welcome` showing the name and "Client"; `select count(*) from terms_acceptance` is 1 and `select redeemed_at from invite` is set. The cookie `fynix-leads.session_token` is `HttpOnly` with no `Domain`.
5. Opening the same link again shows `This invite has been used already. Sign in instead.` and no name or address. A made-up token, a token of the wrong length and no token at all show `This link is not valid...`. Setting `expires_at` in the past shows the expired sentence; setting `revoked_at` shows the withdrawn one.
6. Publish a new version of the terms in another tab (a second `terms_document` row as the owner, with the old one `superseded`) after the page loaded, then submit: the `terms-changed` message appears, the page now shows the new text, and the box is clear.
7. Thirty reloads of the link from one browser (the dev address is the shared `unknown`) show the rate-limited sentence; `select count(*) from rate_limit` shows rows and no address.
8. `/sign-in?invite=accepted` shows the notice and nothing else changes.
9. Keyboard only: the tab order above, Enter on the button submits, Space ticks the box, the terms region scrolls with the arrow keys, focus is visible everywhere.
10. Page-source check (the `CLAUDE.md` isolation rule): `pnpm build`, then `grep -rl "BETTER_AUTH_SECRET\|BREVO_API_KEY\|DATABASE_URL\|leads_auth\|better-auth" .next/static` prints nothing, and the HTML of the invalid-link state contains no organisation id, no invite id and no address.
11. `pnpm build && pnpm exec next start --port 3057` (a free port: never stop another project's process), then `curl -sI http://localhost:3057/accept-invite` shows `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and `pnpm build` are green, and the browser console has no errors.

**Commit** (one commit once the page is built from the approved comps):

```bash
git add app/\(auth\)
git commit -m "Add the accept-invite page from the approved comps"
```

---

## Self-review

**1. Coverage against the master plan 1C row, the exit criteria and the brief**

| Requirement | Where it is proved |
|---|---|
| **Exit: an invite to accepted-account flow works end to end in tests** | Task 10 `an invite becomes an accepted account`: the invite becomes an account, a membership with the invited name, an acceptance of the current terms (with the address and the time) and a used invite, and the person then **signs in and resolves to the right role and organisation**; the agency variant adds the alias; `is single use`, `two redemptions ... at the same moment: exactly one account`. Before it: Task 9 (issue, the email in the outbox, the preview). After it: Task 13 (the action signs the person in and lands on `/welcome`, with the Next.js APIs mocked). Mutations that break it are in the appendix (skip the terms acceptance, let an expired invite redeem). |
| **Exit: every admin action is in `audit_log`** | The database: `audit_required` on every table Fynix can write, deferred to commit (migrations 0012 to 0016), checked by `fynixWritableTablesWithoutAuditTrigger` and its self-test (Task 4), and exercised by `a Fynix change with no audit row cannot commit` (Task 4) and `cannot commit a change that has no audit row` (Task 5). The helper: `fynixWrite` (Task 5). Each service: Tasks 7, 8, 9 and 11 read the audit rows back and check the action, the subject, the reference and the before and after for every operation (`organisation.create/update/archive/restore`, `campaign.create/update/archive/restore`, `terms.publish`, `invite.issue/revoke`, `member.suspend/reactivate/rename`, `agency_alias.set`). Source rule: only the helper opens the Fynix scope, only `appendAudit` writes the table (Task 12). Mutations: remove the audit insert, drop the trigger on `invite` (appendix). |
| **Exit: outbox states are tested** | Task 6, `outbox.integration.test.ts` (21 tests): queueing (`pending`, by `leads_public` and by Fynix in a transaction), `sent` (provider id, time, no link), the retry (`pending` again, the exact backoff 60, 300, 1800 and 7200 seconds, the link kept), `failed` (permanent refusal, five attempts, a pending row with no link, content that cannot be rendered), `cancelled` (revoked invite), no transport, the one-day purge, the lease, two senders at once, and the database constraint that a link exists only on a pending row. |
| Tables with grants, RLS, triggers and the leak and access matrix extensions | Task 3 (migrations 0011 to 0017 and the matrix), Task 4 (26 new probes run as both tenant roles for both organisations of each kind, the seeded values the matrix searches for, the audit catalog check). Mutation: `grant select on invite to leads_client` fails 11 tests (appendix). |
| `agency_alias`: the client reads aliases only through snapshots, never by joining agency users | No tenant role holds any privilege on `agency_alias` or `member` (access matrix, Task 3); the probes in Task 4 deny reads and writes of both to both tenants; phase 2 copies the alias onto each row the client reads, phase 1E gives an agency user its own alias. Fynix assigns and changes aliases (Task 11), unique case-insensitively across members and live invites. |
| `invite`: SHA-256 token hash, 7 days, revoke the old one in the same transaction, single use, narrow access | Tasks 3, 9, 10: `invite_token_hash_format`; `inviteExpiry`; `revokes the live invite ... in the same transaction`, `is all or nothing`; `invite_one_live`; `withInviteHash` and the policies (`shows leads_auth no invite unless the transaction names one's hash`, `refuses an invite that is expired, revoked or used, whatever the service checked`). |
| `terms_document`, `terms_acceptance` | Task 8 (versioning, supersede, never edited, acceptance only of the current terms of the user's own party), Task 10 (accepted in the redemption transaction), Task 13 (`terms-changed`, `terms-not-accepted`). |
| `audit_log`: append only for every role including the owner, rows with actor, role, action, subject, before and after | Task 4: `refuses UPDATE and DELETE even for the owner`, `holds no UPDATE, DELETE or TRUNCATE for any runtime role`, `an audit row cannot be written in another person's name`, `takes its actor and role from the request and the connection`. Mutations: grant UPDATE, drop the trigger (appendix). |
| Campaign management for Fynix: reference with retry, requirement columns added additively, status, archive | Task 3 (additive columns, `archived`), Task 7 (`CMP-XXXX` with a forced collision and a source where every attempt collides, status lifecycle, client and agency fixed, archive and restore). |
| Member additions for Fynix, never password hashes or tokens | Task 3 and Task 4: `user: leads_fynix reads id, name, email and created_at, and writes nothing`; `member: leads_auth may add a row ... and Fynix may change only status and display_name`; Task 11. |
| Services: organisation, member and display name, issue/resend/revoke, redeem, publish terms, record acceptance, campaign, archive, suspend/reactivate, alias | Tasks 7 to 11 as above. Redemption: rate limited before lookup (Task 10 `rate limits`), password policy (`a password that is refused leaves the invite usable and nothing behind`), terms accepted in the same transaction, account inside the grant, member row, invite marked redeemed. |
| Every Fynix write through one helper that audits in the same transaction | Task 5 (`fynixWrite`) and Task 12 (`withScope and withFynixScope are called only by ...`, `no domain service opens a transaction of its own`). |
| Email: templates, Brevo transport, outbox state machine, link copy and purge, failure recorded and retried, dev writes only, production guard, escaped values, fake transport | Task 2 (templates, escaping, `safeHref`), Task 1 (`BREVO_API_KEY` required on https), Task 6 (transport mapping with a fake `fetch`, the sender, the purge), Task 12 (`getMailTransport` is `null` without a key). No test calls Brevo. |
| Scripts | Task 6 (`outbox:run`, `mail:last`), Task 8 (`terms:placeholder`), Task 4 (`db:seed`). Run for real in the appendix. |
| Terms text clearly PLACEHOLDER (D2, gate G2) | Task 2 (text and notice), Task 8 (seed marks `placeholder`), Task 9 (`gate G2: refuses while the current terms are placeholder text on an https deployment`), Part B (the screen shows the notice). |
| UI: only the accept-invite page, comps first | Part B: Task 14 stops for approval; Tasks 15 and 16 mark markup as finalised after approval. |

**2. Placeholder scan.** Part A has no unfinished marker, no step that points at another task instead of showing its code, and no step that describes code without showing it. The non-literal instructions are the one hand edit of the generated `0011_domain_tables.sql` in Task 3 Step 4 (shown as the resulting file), the six `drizzle-kit generate --custom` commands in Step 5 (which only create empty files, whose content is shown) and the psql recipe in Part B. Part B has no code for component markup by design; its configuration change and its source rule are shown in full.

**3. Names and types.** Names used across tasks, checked against the code: `DomainDeps` (Task 5) is the first argument of every service in Tasks 7 to 11 and is built by `getDomain()` (Task 12); `FynixActor`, `fynixWrite`, `fynixRead` (Task 5) by every Fynix service; `AuditEntry`, `appendAudit`, `AuditAction` (Task 5) by `fynixWrite` and the services' `audit` calls; `OrganisationRecord`, `CampaignRecord`, `MemberRecord`, `TermsRecord`, `IssuedInvite`, `InvitePreview`, `RedeemInput`, `RedeemResult` (Tasks 7 to 11) by the action and the page read (Task 13); `Outbox`, `QueuedEmail`, `enqueueEmail`, `drainOutbox`, `cancelInviteMail` (Task 6) by `passwordResetMailer`, `issueInvite` and `revokeInvite`; `AuthDatabase` (Task 5) by `createAuth`, `readMembership`, `createAccountWithGrant` and `redeemInvite`; `withInviteHash` (Task 9) by `previewInvite` and `redeemInvite`; `INVITE_IDLE`, `InviteFormState` and the messages (Task 13) by the action and, in Part B, the form. The whole file set was compiled together (`tsc --noEmit`, strict, through `pnpm typecheck`) and linted with the repository's ESLint configuration after every task.

**4. Judgement calls and gaps, stated plainly.**

- **Redemption holds a connection and a transaction open while Better Auth hashes the password** (scrypt, about a tenth of a second) **and while the breached-password service answers** (a network call, up to its timeout). One redemption at a time per invitee is rare, and the alternative (check the breach service first, outside the transaction, then hash and write) means two code paths for the password rule. A question below asks which the owner prefers.
- **`audit_required` counts rows of the same transaction, not of the same subject.** It guarantees that no Fynix change commits with an empty log; it cannot know that the row is the right one. The service tests assert the exact rows for every operation, and the snapshots are built by hand.
- **Append only has two documented escapes:** the owner can TRUNCATE the table (the test harness needs it) and a superuser can disable the trigger. Phase 6 ships the log off the machine.
- **Delivery is at least once.** A message sent whose result could not be recorded is sent again after the ten minute lease. Harmless for a reset or an invite link.
- **The sender is `leads_auth`** (decision C7). When phase 4 sends notifications that carry lead data it should get a role of its own.
- **Brevo is not exercised for real.** The transport is tested against a fake `fetch`, the status mapping is Brevo's documented behaviour and the headers and body follow its transactional API, but no request was made. The first real send is a manual `pnpm outbox:run` with one invite to an address the owner controls, after gate G3 (a key for this app).
- **The invite expiry is checked twice:** by the service with the injected clock, and by the database with `now()` in the update policy. A skew between the two machines matters only at the edge of the seventh day.
- **Archiving an organisation does not end its members' sessions** (decision C15; a question below).
- **A Fynix terms party exists and the Fynix admin is never asked to accept it.** The gate for signed-in users is phase 1E, and the admin console is phase 1D; nothing in 1C asks the single admin to accept.
- **The network address stored with an acceptance is personal data.** Its retention belongs with the open question on GDPR scope (spec section 16, question 5).
- **Fynix has no DELETE anywhere**, so expired invites, superseded terms and suspended members accumulate. That is decision D8 working as intended.
- **No read functions for the admin screens** (lists of organisations, members, invites, campaigns, the audit log). They are phase 1D's, written with explicit column lists: Fynix's grant on `invite` excludes `token_hash`, so a `select()` with no column list on it fails by design.
- **A suspended member's session rows stay.** Fynix holds no grant on `session`; resolution refuses the session on the next request (1B behaviour), and the rows expire.
- **The accept-invite comps are not drawn.** Part B waits for the owner, as the master plan requires.

**5. Questions for the owner.**

Each has a recommended default; the plan is written to the default.

1. **Should archiving an organisation end its members' sessions?** Default: **no.** Archiving stops new invites and campaigns; Fynix suspends people one by one. Ending many sessions at once is a decision with consequences.
2. **Should the accept-invite page show an agency invitee the Fynix alias they will appear under?** Default: **no.** The page stays the same for both parties; the agency terms already say they join meetings under the alias.
3. **Redemption with the breach check inside the transaction, or before it?** Default: **inside** (one code path, one rollback). The cost is a connection held for the length of one network call during a rare event.
4. **Is the code-level gate G2 acceptable** (on an https deployment no invite is issued while a party's current terms are placeholder)? Default: **yes.** It makes the lawyer-approved terms a precondition the software checks, not a note.
5. **Plain templates now, React Email in phase 4?** Default: **yes** (decision C10). It departs from the master plan and spec section 14.
6. **Keep the email sender on `leads_auth`** (decision C7), or add a seventh role now? Default: **keep it on `leads_auth`** until phase 4 sends emails with lead data.
7. **Should the single Fynix admin accept the Fynix terms,** and when? Default: **yes, with the same gate as everyone else,** built in phase 1D or 1E; the Fynix terms exist and are seeded as placeholder.
8. **Retention of the network address stored with each acceptance?** Default: **keep it for now** and decide with the GDPR question (spec section 16, question 5).
9. **Sign the person in automatically after they accept** (decision C17), or send them to the sign-in page? Default: **sign in automatically,** and fall back to the sign-in page with a notice when that cannot be completed.
10. **Should resending an invite be rate limited?** Default: **no.** Only an admin can do it, and each one revokes the one before.
11. **The invite email's wording and the placeholder terms text** are mine and are meant to be replaced. Who reviews the invite email before G3? Default: the owner, from `pnpm mail:last` output, before the first real send.

---

## Verification appendix

All of this was run against PostgreSQL 16.14 (Homebrew, the shared local cluster), Node 24.14.0, pnpm 11.3.0 (the pinned `packageManager`), in scratch copies of the repository at commit `a219aca` plus this plan's files. The scratch copies used scratch role names (`s1ccc2a_owner`, `s1ccc2a_auth`, `s1ccc2a_fynix`, `s1ccc2a_client`, `s1ccc2a_agency`, `s1ccc2a_public`) and scratch databases (`scratch_leads_1c_cc2a` and its `_test`, used for development, the scripts and the mutation proofs; `scratch_leads_1c_cc2a_rp` and its `_test`, used by the replay), because the real `leads_*` roles and the real `fynix_leads` and `fynix_leads_test` databases exist on this machine and were not touched (only their names were listed, read only, before starting). The substitution is mechanical: every `leads_` role name, the two database names, and the escaped `leads\\_%` pattern in `server/db/testing/structure.ts`, which a plain substitution misses (the first scratch run failed two role checks because they then looked at the real roles). The plan shows the real names.

**Replay.** Every code block in Part A is the content of the file that was run: a script read the File and Edit blocks out of this document and applied them, task by task, to a fresh copy of the repository (the 1B build at `a219aca`), tests first, then code, running the suites after each task. Edits whose text was not unique, or did not apply, would have stopped it; none did. `pnpm db:generate` and the six `--custom` commands were run by the script where Task 3 says to.

| After | Unit (`pnpm test`) | Integration (`pnpm test:integration`) | Tests first |
|---|---|---|---|
| baseline (1B) | 57 files, 666 tests | 10 files, 282 tests | n/a |
| Task 1 | 57 files, 670 tests | n/a | 3 of 26 tests fail |
| Task 2 | 64 files, 745 tests | n/a | 7 files cannot load |
| Task 3 | 64 files, 745 tests | 10 files, 287 tests | 15 of 114 tests in the access matrix file fail |
| Task 4 | 64 files, 745 tests | 10 files, 351 tests | 3 of 125 and 1 of 82 tests fail |
| Task 5 | 64 files, 745 tests | 11 files, 357 tests | the new file cannot load |
| Task 6 | 66 files, 757 tests | 12 files, 378 tests | 3 `passwordResetMailer` tests fail, 2 files cannot load |
| Task 7 | 67 files, 772 tests | 14 files, 402 tests | 3 files cannot load (inputs, organisations, campaigns) |
| Task 8 | 67 files, 772 tests | 15 files, 417 tests | the new file cannot load |
| Task 9 | 68 files, 792 tests | 16 files, 448 tests | 8 tests fail, 1 file cannot load |
| Task 10 | 68 files, 792 tests | 17 files, 473 tests | the new file cannot load |
| Task 11 | 68 files, 792 tests | 18 files, 482 tests | the new file cannot load |
| Task 12 | 70 files, 807 tests | 18 files, 482 tests | 5 of 5 and 1 of 10 tests fail |
| Task 13 | 72 files, 828 tests | 18 files, 482 tests | 3 of 11 tests fail, 2 files cannot load |
| Task 15 | 72 files, 830 tests | 18 files, 482 tests | (config and rule; no failing-first step) |

As a last check, the final text of this document's blocks was applied to a second fresh copy and compared with the replayed tree: `diff -r` printed nothing (apart from the snapshot and journal files drizzle-kit generates).

Baseline before the plan: unit 57 files, 666 tests; integration 10 files, 282 tests (both green). The final run: **unit 72 files, 830 tests, integration 18 files, 482 tests, `pnpm lint` and `pnpm typecheck` clean, `pnpm build` passes, `pnpm db:generate` reports no schema changes, and the dash check prints `No em or en dashes.`** The Task 12 dash check was run on the final tree and printed `No em or en dashes.`; this document was scanned for the same two characters separately: none.

**Found by running it (each is fixed in the code above).**

| Found | What happened |
|---|---|
| The audit trigger read `audit_log` for every role | The first `audit_required` was one condition, `IF current_user = 'leads_fynix' AND NOT EXISTS (SELECT ... FROM audit_log ...)`. Postgres evaluated the subquery for the identity role too, which has no SELECT on `audit_log`, so redeeming an invite failed at commit with `permission denied for table audit_log`. Two nested `IF`s fix it. With the old function put back, 13 of the 25 redemption tests fail (mutation M7). |
| drizzle-kit orders two statements wrongly | The foreign key `agency_alias_member_fk` was written before the unique constraint it points at, so `0011` failed on an empty database. Task 3 Step 4 is the one hand edit. |
| An application clock and the database clock in one millisecond | A message queued with `next_attempt_at = now()` from the database was not yet due for a run that read its clock in the application in the same millisecond: 5 of 21 outbox tests failed. The tests fix a clock five seconds ahead (Task 6). |
| 1A's rule that no source calls `.select()` with no columns | The first version of a domain test helper read the audit log with `.select()`; the replay found the 1A boundary test failing at Task 7. The helper now names the columns (`getTableColumns`). |
| 1A's tests wrote as Fynix | `rls.integration.test.ts` created organisations and campaigns as Fynix, which the audit rule now refuses. Its `asFynix` helper appends a minimal audit row (Task 3). |
| A plain role-name substitution misses an escaped pattern | See above. It would not matter on the real machine. |
| Headers on a 404 | A request for `/accept-invite` on a built app before the page exists answers 404 without `Referrer-Policy`, while `/reset-password` (a real page) answers it. The headers are therefore proved by a source rule on `headers()` in Task 15 and by a response check in Task 16. |

**The checks can fail** (each mutation applied to the scratch copy, the named tests failing, then reverted; "fails" counts failing tests in the files run):

| # | Mutation | Result |
|---|---|---|
| M1 | `grant select on invite to leads_client` | 11 fail (of 283 in `server/db`): the four invite probes as `leads_client`, the table-level grant check, the grant-without-policy check, the access matrix entry for `invite`, `select *` and "table it holds no grant on" for `leads_client`, and two self-tests whose expected lists the real grant disturbs. |
| M2 | the audit insert removed from the Fynix write helper (`appendAudit` writes nothing) | 93 of 110 fail in `server/domain`: every service test, because the database refuses each Fynix commit (`A change to ... by Fynix has no audit_log row in its transaction`), and the helper's own tests. |
| M3a | `grant update on audit_log to leads_fynix` | 1 fails: `holds no UPDATE, DELETE or TRUNCATE for any runtime role, and only Fynix may read or append`. |
| M3b | the append-only trigger on `audit_log` disabled | 1 fails: `refuses UPDATE and DELETE even for the owner, and leaves the rows as they were`. |
| M4 | redemption skips the terms acceptance (the `recordAcceptance` call removed) | 4 fail: the whole flow, `is single use`, `two redemptions ... exactly one account`, and the stale-version test, each of which looks for the acceptance row. |
| M5a | an expired invite redeems: the service no longer checks the invite's state (the database's update policy still does) | 3 fail: `expired`, `revoked` and `replaced by a newer invite` (the person is told `redeemed` instead of the real reason). **Nothing was created in any of them:** the policy refused the claim. |
| M5b | an expired invite redeems: neither the service nor the update policy checks it | 6 fail, including `lets leads_auth redeem the named invite and nothing else, and refuses an invite that is expired, revoked or used, whatever the service checked`: with both defences gone an expired invite creates an account. |
| M6 | the `audit_required` trigger dropped from `invite` | 2 fail: `every table Fynix can write has the audit_required trigger` and its self-test. |
| M7 | `audit_required` written as one condition (the first version) | 13 of 25 fail in the redemption tests (`permission denied for table audit_log` at commit). |
| M8 | the outbox claim no longer leases a message | 2 fail: `holds a claimed message for the lease while it is being sent` and `send every message exactly once` (two senders sent the same message). |
| M9 | revoking an invite no longer cancels its unsent email | 1 fails: `revokes a live invite and cancels its email, and audits it`. |
| M10 | redemption does not consume the rate limits | 3 fail: the network, the invite and the malformed-token limits. |
| M11 | the `invite_auth_read` policy changed to `using (true)` | 2 fail: `shows leads_auth no invite unless the transaction names one's hash` and `answers invalid ... for a token that is malformed or was never issued` (a malformed lookup found a row). |
| M12 | the `member_auth_insert` policy changed to `with check (true)` | 2 fail: `may add a member only for a user whose invite was redeemed ...` and `cannot add a member for a user with no redeemed invite`. |
| M13 | Brevo's 401 treated as permanent | 1 fails: `treats a 401 answer as permanent: false`. |
| M14 | the link purge looks at a cutoff a thousand times too far back | 2 fail: both purge tests. |
| M15 | the `invite_one_live` unique index dropped | 1 fails: `allows one live invite per address, even for an insert that bypasses the service`. |
| M16 | the outbox keeps the link on a sent message (the check constraint dropped and the clear removed) | 3 fail: the constraint test, the send test and the retry test. |
| M17 | the `/accept-invite` entry in `next.config.ts` loses its `Referrer-Policy` | 1 fails: `/accept-invite sends no referrer and is never cached ...`. |
| M18 | a table with an INSERT grant for `leads_fynix` and no audit trigger added | 8 fail, among them `every table Fynix can write has the audit_required trigger ...` and `lists every table`. |

**The scripts, run for real** against the scratch development database, with `PASSWORD_BREACH_CHECK=off` and no `BREVO_API_KEY`: `pnpm db:migrate` printed `Migrations applied to the dev database.`; `pnpm db:seed` printed `Seeded 2 clients, 2 agencies and 4 campaigns.` (and wrote no phase 1C rows); `pnpm admin:create` created the admin (as in 1B, the owner writes the first membership); `pnpm terms:placeholder` printed `Wrote placeholder terms for: client, agency, fynix. They are placeholder text, not legal terms.` and, the second time, `Every party already has terms. Nothing was written.`; `pnpm mail:last` printed `The outbox is empty.`; after a pending invite email was inserted as the owner it printed the message as it would be sent, link included; after that row was aged 26 hours `pnpm outbox:run` printed `Outbox run: 1 purged, 0 claimed, 0 sent, 0 to retry, 0 failed.` and `BREVO_API_KEY is not set, so nothing was sent.`, the row was `failed` with no link and `the link was not sent within a day`, and `pnpm mail:last` then printed the stored copy. The psql recipe in Part B inserted a real invite for the seeded organisation (a 43 character token and a 43 character hash).

**Part B's configuration, checked.** `headers()` in `next.config.ts` returns `Referrer-Policy: no-referrer` and `Cache-Control: no-store` for `/accept-invite` (the new rule; with the entry removed, that test fails, mutation M17). On a built app (`next start`, port 3057, started with a 40 second self-expiring timeout) `/reset-password` answered 200 with both headers, `/sign-in` answered 200 with `Cache-Control: no-store`, and `/accept-invite` answered 404 without the referrer header, which is why the response check moves to Task 16.

**Not verified.** A real Brevo request (no key exists for this app: gate G3; the transport is tested against a fake `fetch`); the accept-invite page and its comps (they do not exist until the owner approves comps); the Next.js request path of `redeemInviteAction` in a browser (its logic is covered with the Next.js APIs mocked, as 1B's actions were, and the services by the integration tests; 1B's throwaway-page run covered the same cookie and redirect mechanics for the sign-in action it calls); the breach check against the real service during a redemption (the fake is used; 1B ran the live check once); the GitHub Actions `database` job (it runs the same commands as the replay, and `pnpm env:init` writes no key); a second machine; the real database names; behaviour behind the production nginx (`x-real-ip` is a phase 6 requirement); more than two senders at once.

**Clean-up.** All scratch databases and the six scratch roles were dropped, the scratch copies deleted, and every name was recorded in a file the moment it was created. The last `psql` of the run printed `databases starting with scratch_leads_1c or scratch_s1c: 0` and `roles starting with s1c: 0`, and the real `fynix_leads` and `fynix_leads_test` databases and the six real `leads_` roles were still there, listed read only. Nothing else on the cluster was touched, and no process was stopped (the one server started, for the header check, had a 40 second self-expiring timeout).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-12-phase-1c-domain.md`. Two execution options:

**1. Subagent-Driven (recommended)** - a fresh subagent per task, review between tasks, fast iteration. Required sub-skill: superpowers:subagent-driven-development. Part A (Tasks 1 to 13) can run now. Stop at Task 14 until the owner approves the comps.

**2. Inline Execution** - execute tasks in this session using superpowers:executing-plans, with batch execution and checkpoints for review.

Which approach?
