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
