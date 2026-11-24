# Fynix Leads

Lead generation tracking for Fynix campaigns. A client reviews leads, an agency submits them, and Fynix runs both. A PostgreSQL database enforces the client and agency isolation itself. On top of it sit sign-in, organisations, campaigns, leads, meetings, messaging and analytics, in separate portals for clients, suppliers, agencies and Fynix. `docs/deploy.md` lists what the server needs.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3020
```

Sign in at `/sign-in`; `/welcome` sends each person to their portal (`/client`, `/supplier`, `/agency`, `/fynix`). `/dev/system` (design system) is development only.

## Set up the database on a new machine

The app, its scripts and its integration tests all need the database.

1. Install PostgreSQL 16 and start it on `localhost:5432`. Your operating system user must be a Postgres superuser (`createuser -s "$USER"` if it is not). The scripts connect as that user, to the `postgres` database, only to create roles and databases.
2. `pnpm install`
3. `pnpm env:init` writes `.env.local` with random passwords, mode 600. It never overwrites an existing file. `pnpm env:check` lists any missing or malformed variable by name.
4. `pnpm db:roles` creates six login roles: `leads_owner`, `leads_auth`, `leads_fynix`, `leads_client`, `leads_agency`, `leads_public`.
5. `pnpm db:create` creates `fynix_leads` and `fynix_leads_test`, owned by `leads_owner`, with public access removed.
6. `pnpm db:migrate` applies the migrations to `fynix_leads`. Optionally `pnpm db:seed` adds two clients, two agencies and four campaigns. `pnpm db:seed:demo` then adds sample leads, meetings and two conversations for one client campaign, so every portal screen shows rows. It needs the dev accounts `dev-client`, `dev-supplier`, `dev-agency` and `dev-admin` (all `@fynix-leads.test`), writes through the Fynix role, and refuses a database that already holds a lead.
7. `pnpm test:integration` migrates `fynix_leads_test` and runs the database tests.

Roles are cluster-wide. If other projects share this Postgres server, `pnpm db:roles` only touches roles whose names start with `leads_`, but it resets their passwords for every checkout that shares the cluster. The test helper refuses any database whose name does not end in `_test`.

## Sign in (phase 1B)

- A machine that ran `pnpm env:init` before phase 1B lacks three variables. `pnpm env:check` names them. Append them with `printf 'BETTER_AUTH_SECRET=%s\nAPP_ORIGIN=http://localhost:3020\nPASSWORD_BREACH_CHECK=hibp\n' "$(openssl rand -hex 32)" >> .env.local`. New machines get them from `pnpm env:init`.
- `pnpm db:migrate`, then `pnpm admin:create --email=you@fynix.digital --name="Your Name"` creates the first Fynix admin. It asks for the password twice, or reads the first line of standard input. New passwords need 12 or more characters and must not appear in a known breach (checked through the k-anonymity range API of Have I Been Pwned, which sees five characters of a hash). With no network, set `PASSWORD_BREACH_CHECK=off` in `.env.local`; it is refused on an https `APP_ORIGIN`.
- In development nothing is emailed. A reset link is written to the `email_outbox` table, and `pnpm mail:last` prints the newest one.

## Invites, terms and email (phase 1C)

- `pnpm terms:placeholder` writes PLACEHOLDER terms for the client, the agency and Fynix, so an invite can be redeemed. They are not legal text. Lawyer-approved text replaces them before any real user is invited.
- Invites, organisations, campaigns and members are managed by the services in `server/domain/` (the admin screens that call them come in phase 1D). Every Fynix change is recorded in `audit_log`.
- Email goes through the `email_outbox` table. To send it for real set `BREVO_API_KEY` in `.env.local` (an https deployment refuses to start without one) and run `pnpm outbox:run`. Without a key nothing is sent and `pnpm mail:last` prints the newest message.

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
