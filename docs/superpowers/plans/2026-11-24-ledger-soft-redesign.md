# Ledger Soft redesign

Owner decision 2026-11-24: replace the hybrid look (floating icon rail, beige canvas, pill buttons) with "Ledger Soft", direction B of `docs/superpowers/specs/design-directions-v3/`. Every screen and every UI element is rebuilt, not re-skinned. Branch: `redesign/sleek`. The language is in `DESIGN.md`.

## What does not change

- `server/`, `lib/` business rules, the database, the session guards (`requireClient()`, `requireFynix()` and the like in every page), the server actions and their field names.
- Agency isolation: agency screens receive only the columns listed in the `agency*Columns` in `server/db/columns.ts` (read through `server/db/tenant-reads.ts`); check page source and chunks for forbidden names when you touch an agency screen.
- CSS-only breakpoints. No dashes in copy.

## Foundation (done)

Tokens (`app/globals.css`), primitives (`components/ui/`), one shell for the four portals (`components/shell/`, `nav.ts`), the kit (`components/kit/`), pipeline grouping, filtering and paging (`lib/leads/`), `When` for time zones.

## Route inventory

Reference screens, done: client overview, client To respond (split pane), client leads (stage bar, search, table, pager).

- [ ] Client: campaigns, meetings, hosts, agreement, messages
- [ ] Supplier: overview, leads, leads/new, meetings, messages, campaigns, agencies, aliases, agreement
- [ ] Agency: overview, leads, leads/new, meetings, messages, campaigns, aliases
- [ ] Fynix: overview, leads, meetings, inbox, disputes, clients, suppliers (table, panel, forms), campaigns and `[ref]` (overview, activity, agreements, hosts), settings, not-found, loading states
- [ ] Auth and states: sign-in, forgot password, reset password, accept invite, welcome, root error and not-found
- [ ] `/dev/system` rebuilt as the design review page of this language
- [ ] Old look removed: `components/tenant/*` and `components/fynix/*` shells and cards, unused tokens, `lib/sample` consumers that only fed the old page
- [ ] Tests that assert markup rewritten (`components/tenant/screens.test.tsx`, `components/fynix/screens.test.tsx`, `components/fynix/forms/forms.test.tsx`, nav tests), lint, typecheck, unit tests, one build

## Checks

Targeted only, serial, one worker: `pnpm lint` on changed files, `pnpm typecheck`, `pnpm vitest run --maxWorkers=1 <paths>`, one `pnpm build` at the end. No `test:integration` (nothing in the database changes).
