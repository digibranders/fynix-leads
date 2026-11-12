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
