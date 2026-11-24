@AGENTS.md

# fynix-leads

Lead generation tracking portal. A client reviews leads that the Fynix team submits and approves, rejects or asks for clarification. An agency does the work behind Fynix. Fynix runs both. The foundations (database, sign-in, domain, Fynix set-up) and the client, supplier and agency portals are built on a real database: leads and their lifecycle, meetings, messaging and chat groups, and analytics. What is left before production is in `docs/deploy.md` (server set-up, scheduled jobs, gates G1 and G2).

**Wording (owner decision, 2026-11-24):** the supplier role is called **Coordinator** in everything a person reads: menus, titles, forms, messages and errors. Code names, routes (`/supplier`, `/fynix/suppliers`), database values (`supplier_fynix`, the `Supplier` role label from `app_group_candidates()`) and the spec keep "supplier". Two places translate a database value for display: `RoleChip` in `components/messaging/group-chat.tsx` and the sender chip in `message-flow.tsx`. Write "coordinator" in any new visible text.

## Where things are

- Spec and decisions: `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md` (open questions in section 16).
- Lead flow decision (2026-11-24): `docs/superpowers/specs/2026-11-24-lead-flow-decision.md`. The client decides after the meeting, with a note. It overrides the lifecycle in the v2 spec and is not built yet.
- Plans: `docs/superpowers/plans/` (phase 0, the restyle to the hybrid design, the phase 1 master plan and the detailed plan for each sub-phase, `2026-11-11-phase-1a-foundation.md` first, then 1E tenant apps and phase 2 leads).
- Approved look: `docs/superpowers/specs/design-directions-v3/` (`b-ledger-soft` is the chosen design, 2026-11-24, replacing the earlier hybrid in `design-directions-v2/d-hybrid`). The redesign plan and route checklist: `docs/superpowers/plans/2026-11-24-ledger-soft-redesign.md`.
- Design system: `DESIGN.md` is authoritative (tokens, shapes, shadows, components, banned patterns, approved exceptions).

Stack: Next.js 16 (App Router, Cache Components) · React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui on Base UI · Phosphor icons · Geist · TanStack Table v9 · PostgreSQL 16 with Drizzle ORM and `pg` · zod · Vitest. pnpm, Node 24.

## Rules

- Work on `development`. `main` is production and only changes through a PR. Remote: `github.com/digibranders/fynix-leads` (private). Its default branch is `development`; `main` does not exist yet, so create it as the PR base when this goes to production.
- **Design:** the comps in `design-directions-v3/b-ledger-soft` are the visual authority ("Ledger Soft": tone and ring shadow, no outlines except on form controls). The owner rejected boxy outlined UI, borderless clutter and the earlier hybrid look. Never settle a design language from text alone: show a visual first. Layout switches by CSS breakpoints only, never by JavaScript.
- **Isolation:** the client never sees agency identity; the agency never sees client people, rep names or emails. Agency screens receive only the columns listed in the `agency*Columns` in `server/db/columns.ts` (read through `server/db/tenant-reads.ts`). When you add a screen, check the page source and its JavaScript chunks for forbidden names.
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
  - **Only a Fynix admin changes set-up** (rules in `docs/superpowers/plans/2026-11-13-phase-1d-fynix-setup.md`). Admin is `member.role = 'manager'` in the Fynix organisation, staff is `member`. `fynixWrite` refuses staff with `admin-required`, and a statement trigger (`fynix_admin_required`, migration 0029) on every table Fynix can write, except `audit_log` and `email_outbox`, refuses them in the database too; a structural test fails for a new Fynix writable table without it. `fynixRead` is open to staff. Staff work on leads (phase 2) needs its own entry point and tables without the trigger.
  - **Hierarchy and set-up tables (1D):** a supplier is an agency with no parent (`organisation.parent_org_id` null), a partner agency is an agency whose parent is a supplier, two levels at most, all enforced by constraints and triggers. `campaign.agency_org_id` is the supplier, and the database refuses a partner agency there. `campaign_share` goes to the supplier or one of its partner agencies; `campaign_host` is a member of the campaign's client, pinned by composite foreign keys; `agreement` versions are never edited, only superseded (versions count per campaign and party). Since phase 1E (migration 0032 and later) the tenant roles hold narrow grants on these tables and columns; each is in the access matrix and the leak matrix.
  - **Nothing is deleted,** with three exceptions that are settings, not records: `campaign_share`, `host_hours` and `host_block` rows are removed when a share, a weekly set of hours or a blocked time is removed, and the audit row keeps what they were. Organisations and campaigns are archived by status, invites are revoked, terms and agreements are superseded, hosts are deactivated, members are suspended. Audit snapshots (`server/domain/snapshots.ts`) never hold a token, a hash, a link or a password.
  - **Invites:** a 32 byte token, only its SHA-256 stored, seven days, one live invite per address (issuing a new one revokes the old one in the same transaction). `leads_auth` sees an invite only when its transaction names the hash (`withInviteHash`). Redemption (`redeemInvite`) is one transaction on `leads_auth` with Better Auth running on it, so the account, the membership, the alias, the acceptance of the terms and `redeemed_at` commit together or not at all.
  - **The accept-invite page** reads through `loadInvitePage` (`server/domain/page-data.ts`) and posts to `redeemInviteAction` (`server/domain/actions.ts`), which redeems, signs the person in with the password they chose and lands on `/welcome`. Pages import nothing else from `server/domain`.
  - **Terms:** a published document is never edited. The text seeded by `pnpm terms:placeholder` is PLACEHOLDER (gate G2): on an https deployment no invite is issued while a party's current terms are placeholder.
  - **Email:** every message is written to `email_outbox` first (`enqueueEmail`) and sent by `drainOutbox` (`pnpm outbox:run`, as `leads_auth`) through Brevo from `hello@fynix.digital`. The link lives in its own column, only while the row is `pending`, and is cleared on send, on a permanent failure, on cancel and by the purge after a day; the stored copy of the text has no link. Without `BREVO_API_KEY` development only writes the table, and an https deployment refuses to start without a key. A failure to send is recorded and retried (five attempts, backing off), never thrown into a request. Tests use `FakeTransport` and never call Brevo.
- **Meetings:** `meeting.google_meet_url` is null until a host adds a real link. Never generate one: Meet codes are only issued by Google, so an invented address points at no room. The screens show "Link to follow" and the `.ics` file leaves the link out.
- **Operations:** `docs/deploy.md` is the server checklist (nginx must overwrite `x-real-ip` and cap bodies per route; `pnpm outbox:run` every minute and `pnpm ratelimit:purge` daily). Every response carries the headers in `lib/http/security-headers.ts`. Posting a message, attaching files and submitting a lead are rate limited per user (`lib/auth/rate-limit-rules.ts`). A CSV cell that starts with `=`, `+`, `-` or `@` is written as text (`toCsv`).
- **Deploys:** live at `leads.fynix.digital`. Merging to `main` deploys within a minute and migrates before the build (`vps-setup/fynix/leads/`). It holds test data only (owner, 2026-11-24). Merge at the end of a phase, on the owner's word. The build order is `docs/superpowers/plans/2026-11-24-build-roadmap.md`.
- **Fynix screens (`app/(fynix)/fynix/`, `components/fynix/`, `server/fynix/`, plan `docs/superpowers/plans/2026-11-13-phase-1d-admin-screens.md`):** suppliers, campaigns, agreements and shares, hosts, for a signed-in Fynix member.
  - **Who gets in:** `requireFynix()` (`server/fynix/session.ts`) runs in the shell and in every page, because a layout does not run again on navigation. No session goes to sign-in, a client or agency session gets the not-found page. `/welcome` sends a Fynix session to `/fynix`.
  - **Reads** are the role-shaped Fynix reads in `server/domain` (`supplier-overview.ts`, `campaign-overview.ts`), open to staff. Pages call them with `getDomain()` and the actor from `requireFynix()`. Selection is in the URL (`?supplier=`, `?host=`).
  - **Writes** are the actions in `server/fynix/actions.ts`, thin shells over `runAction` (`server/fynix/run-action.ts`): session, the domain's own zod schema for field errors, the domain function, plain-words refusals (`server/fynix/errors.ts`), then `revalidatePath("/fynix", "layout")`. Staff see no write control and the domain still refuses them (`admin-required`). Every export of `actions.ts` is a public endpoint, so it exports only actions.
  - **Forms** open in a panel-sized sheet (`components/fynix/forms/`), built from the sign-in form parts. Plain text for hours, blocked times and dates is in `lib/fynix/` with tests.
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
