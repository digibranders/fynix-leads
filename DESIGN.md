# Design

## Purpose

Fynix Leads is a dense, calm B2B tool used by non-technical clients and agency staff to track lead generation campaigns. It is Fynix branded: navy and peach, one accent, light mode only in v1. It should look like a well-made internal tool, not generic AI output.

This file is the source of truth for every screen. The product-level rationale is in `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md`, section 13.

## Tokens

All tokens are CSS variables in `app/globals.css`. The shadcn semantic variables (`--background`, `--primary`, and so on) are mapped onto them. Use the semantic Tailwind utilities (`bg-background`, `text-muted-foreground`, `border-border`) first, and the tone utilities (`text-tone-approved`, `bg-tone-approved-surface`, `border-tone-approved-border`) for status.

### Warm neutral scale

| Token | Value | Role |
|---|---|---|
| `--gray-1` | `#fcfcfb` | App background (`--background`) |
| `--gray-2` | `#f7f6f4` | Muted surface, sidebar (`--muted`, `--sidebar`) |
| `--gray-3` | `#f0efec` | Hover surface, secondary fill (`--accent`, `--secondary`) |
| `--gray-4` | `#e9e7e3` | Active sidebar item (`--sidebar-accent`) |
| `--gray-5` | `#e1dfda` | Borders, dividers (`--border`) |
| `--gray-6` | `#d6d3cd` | Input borders (`--input`) |
| `--gray-7` | `#c5c1ba` | Strong borders, disabled outlines |
| `--gray-8` | `#a9a49c` | Neutral chart series, icons at rest |
| `--gray-9` | `#8a857d` | Placeholder text, decorative icons only |
| `--gray-10` | `#6e6a63` | Muted text (`--muted-foreground`), 5.24:1 on `--gray-1` |
| `--gray-11` | `#4f4b45` | Secondary text, sidebar text |
| `--gray-12` | `#1f1d1a` | Primary text (`--foreground`) |

Cards and popovers use `#ffffff` (`--card`, `--popover`), so panels lift off the `--gray-1` page without a shadow.

### Fynix colours

| Token | Value | Role |
|---|---|---|
| `--navy` | `#0c1e2e` | Primary buttons, focus ring, active markers (`--primary`, `--ring`). 16.49:1 against `--gray-1` text |
| `--navy-hover` | `#172d40` | Primary button hover |
| `--peach` | `#e9af88` | Small markers only (a selected row edge, a count dot on a filter) |
| `--peach-subtle` | `#fbede3` | Selection highlight (text selection, selected table row) |

### Approval status tones

Each tone is a text colour, a surface and a border. Contrast is the text colour on its own surface.

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--tone-pending` | `#8a5a12` | Pending text | 5.28 |
| `--tone-pending-surface` | `#fbf1de` | Pending chip fill | |
| `--tone-pending-border` | `#eed9ae` | Pending chip border | |
| `--tone-approved` | `#2d6a4a` | Approved text | 5.61 |
| `--tone-approved-surface` | `#e8f2ec` | Approved chip fill | |
| `--tone-approved-border` | `#c6dfcf` | Approved chip border | |
| `--tone-rejected` | `#9b3530` | Rejected text, `--destructive` | 6.21 |
| `--tone-rejected-surface` | `#fbecea` | Rejected chip fill | |
| `--tone-rejected-border` | `#f0cbc7` | Rejected chip border | |
| `--tone-clarify` | `#2f5679` | Needs clarification text | 6.69 |
| `--tone-clarify-surface` | `#e9f0f6` | Needs clarification chip fill | |
| `--tone-clarify-border` | `#c8d8e7` | Needs clarification chip border | |
| `--tone-problem` | `#9b3530` | Problem meeting outcomes (no-show, declined, cancelled). 6.94 on `--gray-1`, 7.13 on card | |

Other contrast checks: muted text on card 5.38, muted text on `--gray-2` 4.98, primary button text on navy 16.49.

### Charts

`--chart-1` navy, `--chart-2` gray-8, `--chart-3` peach, `--chart-4` approved green, `--chart-5` pending amber. Use navy for the main series and grey for comparison.

## Type

- Font: Geist, loaded from the `geist` package in `app/layout.tsx`. Geist Mono only for references like `LD-4K9P` and for IDs.
- Body is 14px (`text-sm`). Table cells are 13px with a 20px line height (`text-table`). Meta text (timestamps, helper text, column captions) is 12px (`text-xs`).
- Tabular numbers are on everywhere through `font-variant-numeric: tabular-nums` on `body`, so counts and dates align in columns.
- Sentence case everywhere: headings, buttons, tabs, column headers.

## Shape

- Controls are 6px (`rounded-md`): buttons, inputs, selects, badges, kbd, menu items.
- Panels are 8px (`rounded-lg`): cards, popovers, dialogs, sheets, dropdown content.
- `rounded-full` is for avatars only.
- No shadows, except on popovers, dropdown menus, select menus, command dialogs, tooltips, dialogs and sheets. Cards, inputs and table containers get a 1px border or ring instead.
- `--radius` is `0.5rem`. `--radius-md` resolves to 6px and `--radius-lg` to 8px. Avoid `rounded-xl` and larger.

## Density

- Table rows are 40px high with 12px horizontal cell padding.
- Page gutter is 24px on desktop and 16px on mobile.
- Prefer a tight vertical rhythm of 8, 12 and 16px inside panels. Do not pad panels to look airy; the tool is read all day.

## Status rules

- Approval chips carry colour plus icon plus text label. Never colour alone.
- Meeting chips are icon plus text in neutral grey. Only problem outcomes (no-show, declined, cancelled) take the `--tone-problem` tint.
- One chip per column. If a row needs two statuses, they belong in two columns.
- Peach is for selection highlights and small markers only. Never text, never a large fill.
- Icons are Phosphor, 16px in chips and tables.

## Motion

- 150 to 200ms, ease-out, on state changes only: hover, focus, open and close, row selection.
- No decorative animation, no entrance choreography, no looping effects.
- Reduced motion is respected globally in `app/globals.css`; do not add motion that bypasses it.

## Copy

- Plain verbs: "Approve", "Reject", "Ask for clarification", "Export".
- Sentence case. No exclamation marks.
- No em dashes or en dashes in any copy, code comment or doc. Use a full stop, a colon, commas or brackets. Number ranges use "to".
- No filler words such as "seamless", "robust", "leverage".
- Say what happened and what to do next. Error messages name the cause and the fix.

## Banned patterns

- Gradient or glowing KPI cards.
- An icon tile on every metric.
- A sparkline in every card.
- Gauges or donuts for target vs actual.
- Trend arrows without a stated comparison.
- Purple or neon accents.
- Decorative status dots.
- Emoji.
- Em dashes in any copy.
- Invented sample names like "John Doe" or "Acme".
