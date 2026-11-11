# Fynix Leads

Lead generation tracking for Fynix campaigns. A client reviews leads, an agency submits them, and Fynix runs both. This repository holds the phase 0 prototype: three screens on sample data, built in the approved hybrid design.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3020
```

Screens: `/` (index), `/client/review`, `/client/leads/LD-4K9P`, `/agency/leads`, `/dev/system` (design system).

## Check it

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Read first

- `CLAUDE.md`: working rules for this repo.
- `DESIGN.md`: the design system.
- `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md`: what the product does and the open questions.
- `docs/superpowers/specs/design-directions-v2/index.html`: the design directions and the approved hybrid.
