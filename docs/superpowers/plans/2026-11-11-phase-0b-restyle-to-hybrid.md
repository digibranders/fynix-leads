# Phase 0b: Restyle to the hybrid design, then finish the prototype

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Why:** the owner rejected the phase 0 look (hairline borders, 6 to 8px radii, flat, dense) as boxy, then rejected the opposite extreme (borderless clutter), and chose the **hybrid**: a floating navy rail with a modular tonal layout. The approved visual reference is in `docs/superpowers/specs/design-directions-v2/d-hybrid/` (`review.png`, `record.png`, `leads.png`, the matching `.html`, `tokens.css`, `NOTES.md`). Open `design-directions-v2/index.html` to compare all directions.

**Goal:** make the real app match the hybrid mockups, then build the agency leads overview and table in the same language, then QA.

**What stays:** domain logic, tests, scrubber, sample data, routes and behaviour from phase 0. Only presentation changes.

**Design rules (replace the old `DESIGN.md`):** structured softness. Zones come from tint and elevation: canvas, tonal pane (navy 6%), raised white panel (layered shadow plus inset 6% ring), one navy hero tile per screen. No outlines on controls, chips, inputs or tiles. Dividers only as 1px at 7%, inset, between rows. Pill buttons with key hints. Filled inputs. Chips pair an icon with a label. Peach is selection and small accents. Geist Serif only for the hero figure. Radii: 12 rows and inputs, 16 tiles, 22 panels, 24 rail, pill for controls. Light mode only.

**Acceptance for every screen task:** screenshot the built page at 1440 wide in headless Chrome (or the browser pane at a size it renders sharply) and compare it with the matching mockup PNG; fix differences in spacing, tint, type and alignment until a side-by-side is hard to tell apart; then check 1024 and 375 widths for sensible collapse. No horizontal scroll at any width, no console errors, focus visible, `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass, no em or en dashes in app text.

**Model routing (owner rule):** haiku for mechanical work, sonnet for everything else including reviews, opus only for a highly complex review.

---

### R1: Tokens, DESIGN.md and base components
- Replace the colour, radius, shadow, type and motion tokens in `app/globals.css` with `tokens.css`, mapped into Tailwind v4 `@theme` so utilities exist (surface, tonal, navy alpha steps, status text and soft fills, radii, shadow stacks, row heights). Load Geist, Geist Mono and Geist Serif.
- Rewrite `DESIGN.md` from `NOTES.md` and `tokens.css` (component specs, banned patterns, copy rules).
- Restyle `components/ui/*` to the new language (button pill 44px and 32px, filled input, chip badge, tabs as segmented control, dialog and popover radii and shadows, table header band and inset dividers, key caps, sonner, select, textarea, radio, separator) and update `components/status/status-badge.tsx`, `components/charts/bullet-graph.tsx`, `components/time/*` to match.
- Restyle `/dev/system` to show the new language.

### R2: App shell
Floating navy rail (220 wide, inset 12, radius 24, peach active pill with count, campaign well, "Viewing as" well), page header on the canvas, search with Ctrl K, bell with peach dot, avatar. Nav: Leads, Review queue, Lead record. Responsive: icon-only rail from 1024 down to 768, a sheet below 768. Layout switches by CSS breakpoints, not JavaScript.

### R3: Review queue
Match `review.png`: tonal list pane with segmented filter (Waiting, Clarifying, Decided), selected lead lifted as a white card with a peach marker, big "2d 6h" waiting figure, Meeting and Contact tiles, four Qualification tiles, pinned action tray with Approve, Reject, Ask for clarification and key hints. Keep all phase 0 behaviour (A, R, C, J, K, Undo toasts, dialogs, empty state). Mobile: list then detail view by CSS where possible.

### R4: Lead record
Match `record.png`: tiles column, activity panel (day labels, collapsed system runs), message thread with peach and navy bubbles, composer with the scrubber notice, Approve and Reject in the header for undecided leads, delivered statement for delivered leads. Keep phase 0 behaviour.

### R5: Leads overview and table (agency role)
TDD logic first (`lib/leads/filter.ts`, `lib/campaign/stats.ts`, `lib/domain/counting-month.ts` with the open-question comment, `lib/leads/agency-view.ts` role-shaped serializer proving no client rep names leave the server). Then match `leads.png`: navy hero tile, "this month" tile, three figures, table panel with toolbar, segmented filter with counts, search, sortable headers, 14 rows. Agency version: times in India, no client rep names or emails anywhere (prove with a DOM and HTML check). Clarification count is derived from data, with its wording confirmed by the owner.

### R6: QA gate
Replace the JavaScript `useIsDesktop` layout switch with CSS breakpoints (it flashes desktop markup on phones). Accessibility pass (keyboard, focus, headings, contrast), Vercel interface guidelines, impeccable critique and audit, all screens at 1440, 1024 and 375, dash scan, final checks.

### R7: Repo guide and hand-off
`CLAUDE.md`, workspace guide row and dev server entry, final screenshots to the owner, then phase 1 planning.
