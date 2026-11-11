@AGENTS.md

# fynix-leads

Lead generation tracking portal. A client reviews leads that the Fynix team submits and approves, rejects or asks for clarification. An agency does the work behind Fynix. Fynix runs both. Phase 0 is a clickable prototype on sample data: nothing is saved, and there is no database, sign-in or email yet.

## Where things are

- Spec and decisions: `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md` (open questions in section 16).
- Plans: `docs/superpowers/plans/` (phase 0 and the restyle to the hybrid design).
- Approved look: `docs/superpowers/specs/design-directions-v2/` (`d-hybrid` is the chosen design; open `index.html` there to compare directions).
- Design system: `DESIGN.md` is authoritative (tokens, shapes, shadows, components, banned patterns, approved exceptions).

Stack: Next.js 16 (App Router, Cache Components) · React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui on Base UI · Phosphor icons · Geist · TanStack Table v9 · Vitest. pnpm, Node 24.

## Rules

- Work on `development`. `main` is production and only changes through a PR.
- **Design:** the mockups in `d-hybrid` are the visual authority, the owner rejected both boxy outlined UI and borderless clutter ("structured softness"). Never settle a design language from text alone: show a visual first. Layout switches by CSS breakpoints only, never by JavaScript.
- **Isolation:** the client never sees agency identity; the agency never sees client people, rep names or emails. Agency screens receive only data shaped by `lib/leads/agency-view.ts`. Shared client code must never import `lib/sample/data` (`lib/sample/isolation.test.ts` enforces it). When you add a screen, check the page source and its JavaScript chunks for forbidden names.
- **Logic:** domain rules live in `lib/` as plain TypeScript with tests next to them. Components render; they do not decide business rules. Which month a delivered lead counts toward is an open question and is decided in one place: `lib/domain/counting-month.ts`.
- **Copy:** sentence case, plain verbs, no exclamation marks, no em or en dashes in any text.
- **Tailwind gotcha:** the `cn` helper treats unknown `text-*` utilities as colours, so inside `cn(...)` write sizes as `text-[13px]`, not `text-table`.
- **Dev server:** `pnpm dev` serves http://localhost:3020. Next.js allows one dev server per project, so reuse the running one. Do not stop a server unless the owner says so.

## Commands

```bash
pnpm dev          # http://localhost:3020
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Before calling a change done, run lint, typecheck, test and build.
