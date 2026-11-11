# Phase 1: Accounts, database-enforced isolation and the Fynix admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. This is the master plan for phase 1. Each sub-phase (1A to 1E) gets its own detailed task plan, written just before it is executed, with complete code per step (see the phase 0 plans for the format).

**Goal:** replace the prototype's sample data with real foundations: a PostgreSQL database that itself enforces the client and agency isolation, invite-only sign-in, organisations, users, terms acceptance, campaigns, and the Fynix admin screens to manage them. Client and agency users sign in to the real shell and see their real campaign with calm empty states. Real leads arrive in phase 2.

**Spec:** `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md` (sections 4, 5, 6, 12, 14, 17). **Spike evidence:** `docs/superpowers/specs/phase-1/rls-column-grant-spike.sql`.

---

## 1. Decisions

| # | Decision | Source |
|---|---|---|
| D1 | After sign-in a client or agency user sees the real shell, their real campaign (name, brand, dates, targets from the database) and "no leads yet" empty states. The sample-data screens stay only behind a development flag as the design reference. | Owner, 2026-11-11 |
| D2 | Terms: a versioned accept-on-first-sign-in gate with clearly marked placeholder text. Lawyer-approved text replaces it **before any real user is invited** (gate G2). | Owner, 2026-11-11 |
| D3 | The Fynix admin signs in with a password only for now. This departs from spec section 12 (TOTP). Gate G1: a second factor (TOTP or passkey) is added **before any real client or agency data is entered**. The auth design leaves room for it. | Owner, 2026-11-11 |
| D4 | Email sender is `hello@fynix.digital` (already verified in Brevo). In development mail is only written to the outbox table; nothing is sent. | Owner, 2026-11-11 |
| D5 | The app runs at `leads.fynix.digital`. The admin lives at `/admin` on the same host. Routing is host-agnostic so a separate admin host later is configuration only. | Owner, confirmed 2026-11-11 |
| D6 | Local development uses the Postgres 16 already running on this machine (databases `fynix_leads` and `fynix_leads_test`). Production Postgres is on the Firstfold VPS (phase 6). | Checked 2026-11-11 |
| D7 | Phase 1 includes transactional email (invites, password reset) through an outbox, which the spec had placed in phase 4. Invites cannot work without it. Notification emails stay in phase 4. | Plan |

## 2. What the spike proved (PostgreSQL 16, throwaway database)

1. Column-level `SELECT` grants hide columns for real: `select *`, selecting a hidden column, filtering on it (`where agency_org = ...`) and sorting on it all fail with `permission denied`. Probing by predicate is blocked.
2. A row-level security policy may reference a column the role cannot read; it still works.
3. With no scope variable set, a scoped role sees zero rows.
4. **Hazard:** an ordinary view runs as its owner and bypasses row-level security (a client saw all 3 rows). Views must be `WITH (security_invoker = true)`; a test must fail if any view lacks it.
5. **Hazard:** `SET ROLE` is checked against the session user. From a superuser or owner session it can switch to any role. With one login role per connection pool, `SET ROLE` and `SET SESSION AUTHORIZATION` to another role are denied.
6. A `SECURITY DEFINER` boolean function (with `search_path = pg_catalog, public`) can answer "is this domain excluded?" without granting any read of the exclusion list.
7. Denied writes return a plain `permission denied for table`, with no row data in the message.

## 3. Architecture

**Database roles (one login role and one connection pool per surface, no `SET ROLE` anywhere):**

| Role | Used by | Can |
|---|---|---|
| `leads_owner` | migrations and `drizzle-kit` only | owns all objects, never used by the running app |
| `leads_auth` | Better Auth | read and write the auth tables (`user`, `session`, `account`, `verification`) and read `member` |
| `leads_fynix` | Fynix admin screens | everything, under allow-all policies; every write also appends to `audit_log` |
| `leads_client` | client screens | rows of its own organisation's campaigns, through column grants that exclude agency identity |
| `leads_agency` | agency screens | rows of its own campaigns, through column grants that exclude client people and internal notes |
| `leads_public` | invite redemption, rate limits, outbox inserts | insert and narrow reads only; no read of tenant data |

**Scoping.** Each request resolves session, then organisation and kind (via `leads_auth`), then opens the pool of the matching role and runs the work in a transaction that does `set_config('app.org_id', ..., true)` and `set_config('app.user_id', ..., true)`. Policies read these through `app_current_org_id()` and `app_current_user_id()` (plain `LANGUAGE sql STABLE`, `pg_catalog`-qualified, so they stay inlinable). Ids are validated as UUIDs before they reach `set_config`.

**Two-sided isolation, in SQL.**
- Tenant rows carry both `client_org_id` and `agency_org_id`, kept consistent by a composite foreign key to `campaign`. Policies compare one column: `client_org_id = app_current_org_id()` for the client, `agency_org_id = app_current_org_id()` for the agency.
- Column grants per role hide the other side: the client gets no grant on `agency_org_id`, `created_by` or `body_original`; the agency gets none on `client_org_id`, any client user data or `internal_notes`.
- The client reads agency staff only through an alias snapshot stored on the rows it reads (`agency_alias`), never by joining to agency users. The agency reads the client's `brand_name` only, copied into campaign columns it can read.
- Drizzle `select()` with no column list fails by design ("permission denied"): each role has an explicit typed column list (for example `clientLeadColumns`).
- Auth tables are never readable by tenant roles. Tenant roles read org-mates through `member`, which has a policy on `org_id = app_current_org_id()`. (The sibling platform repo lets its tenant role read every user's email and password hash; we must not copy that.)

**Migrations.** Hand-written grants and policies live beside generated DDL as `NNNN_<table>_grants.sql`. The per-migration-commit migrator pattern from the sibling repo is copied (a Postgres enum error once broke a fresh production database). A journal test asserts strictly increasing `when` values and an unbroken snapshot chain, because drizzle-kit takes `when` from the machine clock. Roles are created by a script before the first migration and the migrator refuses to run if one is missing.

**Authentication (Better Auth).** Email and password, no public sign-up: accounts are created only by server code inside an explicit grant (the sibling repo's `withAccountCreationGrant` pattern) after an invite is redeemed. Password policy enforced in a request hook (12 or more characters and a breached-password check). Sessions: 14 days for client and agency users, 12 hours for Fynix; `revokeSessionsOnPasswordReset`; reset token valid 1 hour. Host-only cookies, never a wildcard domain. Known quirks to guard with tests: a 403 thrown in the user-create hook becomes a fake success (return `false`), a duplicate email with auto sign-in off returns an id that was never stored (check the row), a short secret silently falls back to a public default (refuse under 32 characters). The first Fynix admin is created by a command (`pnpm admin:create`), never by a public route. G1 adds a second factor through Better Auth's two-factor plugin.

**Invites.** A 32-byte random token; only its SHA-256 is stored. Single use (`redeemed_at`), revocable, 7 days. Issuing a new invite revokes the old one in the same transaction. Redemption is rate limited per network before the lookup. The invite page sets the password, shows the current terms for the party and records acceptance.

**Rate limits.** Fixed-window upserts in Postgres keyed by the SHA-256 of the key (no email or address stored). Sign-in checks three keys: per network, per account and network, per account. Rate-limit calls run outside any transaction.

**Email.** A template returns a message; a transport sends it through Brevo; every message is written to `email_outbox` with a status (`pending`, `sent`, `failed`), attempts and provider id. Link emails store a copy without the link and are purged after one day. Failure to send is recorded and retried, never thrown into the request. Without a Brevo key, development writes the outbox only; a real deployment refuses to start without one. Templates use React Email and escape all values.

**Environment.** `pnpm env:init` generates `.env.local` with random secrets (mode 0600, never overwrites), `pnpm env:check` prints names only, and a start-up guard refuses an https deployment with missing variables. The zod env schema parses lazily so builds need no secrets.

**Tests.** Integration tests run against a real `fynix_leads_test` database (the helper refuses any database name that does not end in `_test`) with one pool per role. A generated **leak matrix** runs every read path as every role against two seeded organisations of each kind and asserts that no forbidden id, name, email or column is returned, including through error messages. Further tests: every view is `security_invoker`, every table has row-level security enabled and a policy for each role that has a grant, every grant is column-level for the tenant roles, and `select *` fails for them. CI gets a `database` job with `postgres:16`.

## 4. Data model (phase 1)

| Table | Holds | Fynix | Client | Agency |
|---|---|---|---|---|
| `organisation` | public ref, kind (`fynix`, `client`, `agency`), name, brand name, status | all | own row | own row, plus the client organisations of its campaigns (ref, name, brand name only) |
| Better Auth tables | user, session, account, verification | all | none | none |
| `member` | user, organisation, role in organisation (`member`, `manager`), display name | all | organisation-mates | organisation-mates |
| `agency_alias` | agency member, alias display name (the Fynix name the client sees) | all | read through snapshots only | own |
| `invite` | organisation, email, role, token hash, expiry, redeemed, revoked, created by | all | none | none |
| `terms_document` | party kind, version, title, body, status, published at | all | current version for its party | current version for its party |
| `terms_acceptance` | user, document, accepted at, network address | all | own | own |
| `campaign` | ref `CMP-XXXX`, name, client org, agency org, dates, targets, requirements, BANT criteria, instructions, internal notes, status | all | all except agency org and internal notes | all except client org and internal notes |
| `audit_log` | actor, role, action, subject, before, after, time (append only: insert and select, no update or delete for any role) | read, insert | none | none |
| `email_outbox` | recipient, template, payload without links, status, attempts, provider id, times | all | none | none |
| `rate_limit` | key hash, window, count | none | none | none (public role only) |

Refs (`CMP-XXXX`) are random base-32 with a unique constraint and retry. Internal ids never reach the other party.

## 5. Fynix admin screens (hybrid design)

New screens, so **visual comps come first** (the owner's standing rule): one designer renders the four screens in the approved hybrid language for approval before any build, using `d-hybrid` and `DESIGN.md`.

1. **Organisations:** list with kind filter and search; create client or agency organisation.
2. **Organisation detail:** members, pending invites (resend, revoke), agency alias for agency members, invite form.
3. **Campaigns:** list; create and edit (client, one agency, dates, monthly and total target, geography, industry, size, ICP, titles, seniority, technologies, BANT criteria, instructions, internal notes), status.
4. **Terms:** versions per party, publish a new version, who has accepted which.
Also the public pages: sign-in, accept invite (set password and accept terms), forgot and reset password. The same comp round covers them.

## 6. Sub-phases

| | Delivers | Exit criteria |
|---|---|---|
| **1A Foundation** | `server/db` structure, env tooling, roles script, migrator, scope helper, test harness with the leak-matrix skeleton, CI `database` job, dev seed command | An empty database migrates cleanly; a scoped role sees only its rows; `select *` fails for tenant roles; the harness refuses non-test databases; CI green |
| **1B Auth** | Better Auth with the guards above, session reading in server code, password policy, rate limits, `pnpm admin:create`, sign-in and password reset pages | Sign in and out work for the three kinds; sessions expire as specified; tenant roles cannot read auth tables (tested) |
| **1C Domain** | Organisations, members, agency aliases, invites, terms and acceptance, campaigns, audit log, email outbox with templates and Brevo transport | Invite to accepted account flow works end to end in tests; every admin action is in `audit_log`; outbox states tested |
| **1D Fynix admin UI** | The screens in section 5, built from the approved comps | An admin can onboard a client and an agency, invite users and create a campaign without touching the database |
| **1E Role-shaped app** | Client and agency shells on real data: their campaign in the rail, empty states, terms gate, prototype data behind the dev flag, the full leak matrix across every read path | The leak matrix passes; a client and an agency invited in 1D can sign in and see only their own campaign |

Each sub-phase ends with lint, typecheck, tests (including integration) and build green, a browser check for anything visual, and an independent review before the next starts.

## 7. Gates and open items

| Gate | Condition |
|---|---|
| G1 | Second factor for the Fynix admin before any real client or agency data is entered |
| G2 | Lawyer-approved terms replace the placeholder text before any real user is invited |
| G3 | A Brevo API key for this app, and `hello@fynix.digital` confirmed as the sender, before invites are sent for real |
| G4 | Closed 2026-11-11: the admin is at `/admin` on `leads.fynix.digital` |
| Open | Meetings per lead (seniors), the month and time zone a delivered lead counts toward (single function `lib/domain/counting-month.ts`), GDPR scope for EU or UK prospects (affects retention fields from phase 2), attachments, WhatsApp |

## 8. Risks

- Column-level grants and Drizzle: untyped selects fail by design, so typed per-role column lists are required and must be generated from one source to avoid drift.
- Better Auth quirks (section 3) can silently succeed when they should fail; each is covered by a test.
- Default views bypass row-level security; the `security_invoker` test must exist before the first view.
- Error messages and constraint names can leak across organisations; the leak matrix includes error text.
- Password-only admin (D3) is the weakest link until G1; the admin sees both parties' identities.
- Dev databases are shared with other projects on this machine; the helper creates only `fynix_leads` and `fynix_leads_test` and roles prefixed `leads_`.

## 9. Execution

Per sub-phase: write the detailed plan, run it with subagents (haiku for mechanical steps, sonnet for everything else, opus only for a highly complex review), verify each result independently, then an independent sonnet review. New screens get comps and owner approval before build.
