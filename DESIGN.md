# Design: Ledger Soft

## Purpose and the rule

Fynix Leads is a calm B2B tool for clients, suppliers, partner agencies and the Fynix team who follow lead generation campaigns. It is Fynix branded (navy, peach, a warm canvas) and built to feel like a precise instrument: dense enough to work in, quiet enough to trust.

The rule is **tone and shadow, not outlines**. A surface is separated from its neighbour by a tonal step and a 1px ring shadow at 5%. Cards, buttons, chips, tables and tabs carry no border. The one visible edge in the product is on form controls, where it is required for contrast (WCAG 1.4.11). The owner rejected two earlier extremes and this file holds the middle:

1. A boxy, outlined, hairline-on-everything look.
2. A borderless look with no separation of data.

The language follows the CleanStart partner portal in structure (labelled sidebar, thin top strip, status tabs, filter toolbar, dense table, drawers) and Fynix in colour and surface. Approved comps: `docs/superpowers/specs/design-directions-v3/b-ledger-soft/`. Where this file and the comps disagree, the comps win and this file gets fixed. Plan: `docs/superpowers/plans/2026-11-24-ledger-soft-redesign.md`.

## Surfaces

| Surface | Token | Holds |
|---|---|---|
| Canvas | `--canvas` `#F4F2EE` | The page, the page header, the top strip. |
| Panel | `--surface` white, `shadow-raised`, `rounded-lg` (14) | A module with data: a table, a list, a form, a detail. Use `Panel`. |
| Tonal block | `--surface-tonal` (navy 4.5%), `rounded-md` (12) | A fact tile or a note inside a panel or drawer. Use `Tonal` or `Facts`. A tonal block never contains another one. |
| Hero | navy, `shadow-hero` | One per screen at most. Use `Hero`. |
| Sidebar | navy | The fixed sidebar only. |

Nothing else. A fifth surface is a bug. Separate rows inside a panel with the 6% line (`--line`), never a box.

## Tokens

All tokens are CSS variables in `app/globals.css`, with Tailwind utilities for each (`bg-canvas`, `bg-surface`, `bg-tonal`, `bg-selected`, `bg-navy-05`, `text-ink-2`, `text-ink-muted`, `bg-amber-soft`, `text-red-text`, `shadow-raised`, `rounded-lg`).

### Brand and text

| Token | Value | Role |
|---|---|---|
| `--navy` | `#0C1E2E` | Sidebar, hero, primary button, focus. Ink. |
| `--peach` | `#E9AF88` | The one accent: the active place in the sidebar, selection marker, progress on navy, the hero action. Never body text. |
| `--peach-deep` | `#A9602F` | Peach as text on white only (4.8:1). |
| `--selected` | `#FBF1E7` | A selected row or card, the next meeting. A peach wash. |
| `--offwhite` | `#F3EFE9` | Text on navy. |
| `--ink` / `--ink-2` / `--ink-muted` | `#0C1E2E` / `#3F4D59` / `#56626D` | Primary, secondary, caption text. All pass 4.5:1 on white and on the canvas. |
| `--ctl-edge` | `#87929F` | The edge of an input, select, checkbox: 3.1:1 on white. |

### Status

Colour carries status only. Each has text, a soft tint (never an outline) and a solid for bars and swatches. Always pair the colour with a word.

| Status | Used for |
|---|---|
| amber | Waiting on someone (awaiting client, pending, invited) |
| blue | Booked or in progress (scheduled, rescheduled, completed campaign) |
| teal | Outcome due |
| green | Done or healthy (delivered, active, accepted) |
| red | A problem (disputed, no-show, rejected, expired invite) |
| quiet grey | Ended or inactive (declined, withdrawn, archived, draft) |

## Type

Geist Sans and Geist Mono (`next/font`), tabular numbers on for the whole page. Mono is for references like `LD-3K7M`. Sentence case everywhere. No serif.

| Utility | Size / line | Use |
|---|---|---|
| `text-caption` | 12 / 16 | Captions, muted second lines |
| `text-label` | 12.5 / 17 | Field labels, helper text |
| `text-table` | 13 / 18 | Table cells |
| `text-body` | 13.5 / 20 | Body, buttons, inputs |
| `text-row` | 14 / 20 | Values in tiles, list names |
| `text-section` | 15 / 22 | Panel titles |
| `text-lead` | 16 / 24 | The role line under a name |
| `text-title` | 22 / 28 | Page title |
| `text-name` | 26 / 32 | A record's name |
| `text-figure` | 26 / 30 | A number in a stat |
| `text-display` | 46 / 46 | The hero figure |

Weights: 400 body, 500 labels, 600 titles, names, buttons, chips.

## Shape

One scale, one rule. Controls and rows 9px (`rounded-sm`), chips and key caps 6px (`rounded-xs`), popovers and tonal blocks 12px (`rounded-md`), panels 14px (`rounded-lg`), dialogs and drawers 18px (`rounded-xl`), avatars 9px, pills only for the stage bar chips. A child inside a rounded parent uses the parent's radius minus its padding.

## Layout

- Sidebar 248px, fixed, navy, grouped (Work, then the rest), with live counts. The top strip is 56px with the trail and `⌘K` search; no band behind it. Content is at most 1280px. Below `md` the sidebar is a sheet. Layout switches by CSS breakpoints only, never by JavaScript.
- One page header per screen (`PageHeader`): title, one plain sentence of facts, at most one primary action.
- Spacing is a 4px grid. Gap between panels is 16px. Panel padding is 20 to 24px.
- Screen patterns:
  - **Overview:** header, optional `Hero`, a row of `MiniStat`, optional `StageBar`, then two `Panel` lists.
  - **List:** header, `StageBar` or `TabNav` (the filter, as links), a `Panel` with `Toolbar` + `SearchForm`, a table, `Pager`. State is in the URL (`?stage=`, `?q=`, `?page=`).
  - **Queue and record:** a list panel on the left (340px) and the record on the right, selection in the URL.
  - **Create or edit:** a right drawer (`Sheet`) with the form, one primary action in a sticky foot.
  - **Destructive or needs words:** a `Dialog`.

## Components

Primitives in `components/ui/` (Base UI headless, restyled), shared composites in `components/kit/`, lead screens in `components/leads/`, the shell in `components/shell/`.

| Component | Rule |
|---|---|
| `Button` | One primary per surface. `default` navy, `secondary` tonal, `destructive` red tint, `ghost`, `ghost-destructive`, `peach` and `onNavy` only on navy. Sizes `lg` 40, default 34, `sm` 30, `xs` 26. Actions are labelled, never icon-only (an icon-only control needs an `aria-label` and a `Hint`). |
| `Input`, `Textarea`, `Choice`/`Select`, `DateField` | Tonal fill with the 3:1 edge (`CONTROL`). Focus thickens the edge to navy, an error turns it red with a message and an icon. 16px text on a phone. Label above, helper or error below (`Field`). |
| `Badge`, `StatusChip` | A word in a tint, 6px corners. Never an outline. |
| `Table` | Tonal header band, 6% line between rows, 52px rows, hover wash, `bg-selected` when selected. Hide secondary columns on a phone with `max-md:hidden`; never hide the status or the action. |
| `Tabs` | `variant="line"` is the underline with counts; default is a segmented control. For filters that live in the URL use `TabNav` or `StageBar` (links). |
| `Sheet` | The drawer: right, 480px, `rounded-l-xl`. |
| `Dialog` | 18px corners, a title, a sentence, a footer with Cancel and the action. |
| `Tooltip`/`Hint` | Navy, for names of icon-only controls and clipped text. |
| `Skeleton` | The shape of what is loading, never a spinner. |
| `EmptyState` | An icon tile, a title, one or two sentences, at most one action. |
| `When` | Every moment in the viewer's own time zone with the zone named. Never a bare clock time. |
| `Toaster` (sonner) | For transient confirmation only. Errors that need action stay inline. |

## Motion

Motion explains a change, never decorates. Press (120ms, scale .985), hover (160ms), state (220ms), panel (320ms), soft-landing easing. Everything collapses under `prefers-reduced-motion`. No infinite loops except skeletons.

## Accessibility

- Contrast: text 4.5:1, large text and control edges 3:1. The tokens were chosen to pass; do not tint text with opacity.
- Focus: a 2px navy ring with a 2px offset on every control; on navy, an offwhite outline.
- Every control reachable and operable by keyboard. Radio groups are real radios. Dialogs trap focus and return it.
- Errors are announced (`role="alert"`) and have an icon and words, never colour alone.
- Single-character keyboard shortcuts are not used (WCAG 2.1.4). `⌘K` is a modifier shortcut.
- Touch targets are 40px on a phone (`max-md:` sizes on the buttons).
- Dates never rely on the server's zone.

## Copy

Sentence case, plain verbs, no exclamation marks, and no em or en dashes in any text, code comment or file in this repo. Numbers come from the data; do not invent precision.

## Banned

Outlined buttons or cards, a border on a table row box, pill buttons (except stage bar chips), icon-only actions without a name, colour as the only status cue, a second accent colour, gradients (the hero glow is the only one), decorative dots, section-number eyebrows, bare clock times, hand-drawn icons (use Phosphor), serif type, dark mode (light only in v1).

## Where things live

Design review page: `/dev/system` (not served in production). Tokens: `app/globals.css`. Shell: `components/shell/` (`nav.ts` is the one list of navigation for the four portals).

## Phone chrome

Below `md` the sidebar is replaced by a floating glass tab bar (`components/shell/tab-bar.tsx`) and a bottom More sheet (`more-sheet.tsx`). Direction "Ink": navy glass, peach for the open tab. Comps are in `docs/superpowers/specs/design-directions-v4-mobile/`.

- **Tabs.** Four per portal, set by `mobileTabs` in `nav.ts`, then More. Client: Home, Availability, Meetings, Messages. Supplier and agency: Home, Leads, Meetings, Messages. Fynix: Home, Leads, Inbox, Disputes. Everything else is in the More sheet, grouped as on the sidebar.
- **Motion.** The lens slides to the open tab on a spring (`--ease-lens`) and stretches on the way. A tap moves it at once, before the page loads. The sheet rises on `--ease-sheet`, follows a finger down with rubber-banding upward, closes on distance or flick speed, and otherwise springs back. The page behind sinks to 94% with rounded corners. Rows stagger in. New screens ease in (`.page-in`). All of it is off under reduced motion.
- **Glass.** `backdrop-filter` with a highlight and a 1px ring, never an outline. This is a web approximation of Liquid Glass. Under reduced transparency the glass becomes solid navy or canvas.
- **Space.** Content ends above the bar through `--tabbar-clear` (page padding) and `--tabbar-stack` (sticky feet, toasts). Fixed-height panels such as messages stop above the bar. `viewport-fit=cover` makes the safe-area insets real on an iPhone.
