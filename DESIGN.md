# Design

## Purpose and the design rule

Fynix Leads is a calm B2B tool for non-technical clients and Fynix agency staff to follow lead generation campaigns. It is Fynix branded: navy, peach, warm canvas. Light mode only in v1.

The rule is **structured softness**: zones come from tint and elevation, never from outlines, and every group of data is a titled module with a clear edge.

The owner rejected two extremes, and this file exists to hold the middle:

1. **Boxy.** Hairline borders on everything, 6 to 8px radii, flat, dense. Rejected as "boxy design and all outlines".
2. **Borderless clutter.** No outlines and no containers either, so data ran together. Rejected as "no separation of data and no arrangement".

The chosen direction is the hybrid: a floating navy rail plus a modular tonal layout. The approved mockups are the visual authority: `docs/superpowers/specs/design-directions-v2/d-hybrid/` (`review.png`, `record.png`, `leads.png`, the matching `.html`, `tokens.css`, `NOTES.md`). Where this file and the mockups disagree, the mockups win and this file gets fixed.

The product rationale is in `docs/superpowers/specs/2026-11-11-leadgen-portal-design.md`, section 13.

## The four depths

Every screen is built from four depths and nothing else. A fifth level is a bug.

| Depth | Token | What it holds |
|---|---|---|
| Canvas | `--canvas` `#F1EDE6` | The page. Page header, titles, the rail's surroundings. Warm neutral. |
| Tonal pane | `--surface-tonal` (navy 6%) | A list or a column of tiles: the review list, the record detail column. Radius 22. |
| White panel | `--surface` `#FFFFFF` + `--shadow-raised` | A module with data: a table, the activity feed, the message thread, a lead detail. Radius 22. Also the lifted selected card inside a tonal pane. |
| Navy hero | `--surface-hero` (navy) + `--shadow-hero` | The one hero tile per screen. Radius 22. |

Nesting rule: at most two surface levels inside a screen module. A tile (navy 4%) sits on a white panel; a white tile sits on a tonal pane. A tile inside a tile is not allowed.

## Tokens

All tokens are CSS variables in `app/globals.css`, ported from `d-hybrid/tokens.css`. The shadcn semantic variables are mapped onto them and Tailwind utilities exist for each (`bg-canvas`, `bg-surface`, `bg-tonal`, `bg-navy-05`, `text-ink-2`, `text-ink-muted`, `bg-amber-soft`, `text-red-text`, `shadow-raised`, `rounded-lg`).

Contrast is the WCAG ratio of the text colour on the stated background.

### Brand and text

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--navy` | `#0C1E2E` | Primary buttons, focus ring, active segment, hero and rail background. Primary text (`--ink`). | 16.9 on white, 14.5 on canvas |
| `--navy-hover` | `#13293D` | Primary button hover | 13.0 for offwhite on it |
| `--peach` | `#E9AF88` | Selection and small accents: active nav pill, selected marker, progress fill, count dot. Never body text. | 8.8 against navy |
| `--peach-deep` | `#A9602F` | Peach as text or an icon on white only | 4.8 on white, 4.1 on canvas (do not use on canvas) |
| `--offwhite` | `#F3EFE9` | Text and icons on navy | 14.8 on navy |
| `--ink` | `#0C1E2E` | Primary text | 16.9 on white |
| `--ink-2` | `#3F4D59` | Secondary text, row meta, field values | 8.7 on white, 6.6 on tonal |
| `--ink-muted` | `#56626D` | Captions, labels, column heads, placeholders | 6.2 on white, 4.8 on tonal and on an input fill |

### Canvas and surfaces

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#F1EDE6` | Page background (`--background`) |
| `--surface` | `#FFFFFF` | Panels, lifted cards, popovers (`--card`, `--popover`) |
| `--surface-tonal` | navy 6% | List pane, detail column |
| `--selected` | `#FBF1E7` | Selected table row, selected row wash |
| `--selected-marker` | `--peach` | 3px marker on the lifted card |
| `--bubble-client` | `#F8E8D8` | Client message bubble (ink on it: 14.1) |
| `--bubble-fynix` | navy 5% | Fynix message bubble |
| `--scrim` | navy 30% | Dialog and sheet overlay |

### Navy alpha steps

| Token | Alpha | Role |
|---|---|---|
| `--navy-03` | 3% | Table row hover |
| `--navy-04` | 4% | Tiles on white panels, wells, action tray, row hover, table head band |
| `--navy-05` | 5% | Inputs, segmented track, secondary icon buttons (`--muted`, `--input`) |
| `--navy-06` | 6% | Inset ring on raised surfaces, tonal pane |
| `--navy-07` | 7% | Secondary buttons, key caps, hover surface (`--secondary`, `--accent`) |
| `--navy-08` | 8% | Pressed state, key cap inside a secondary button |
| `--navy-10` | 10% | Secondary button hover |
| `--line` | 7% | The only divider (`--border`) |

On navy (rail and hero): `--on-navy-05`, `--on-navy-07`, `--on-navy-10`, `--on-navy-16` (white at 5, 7, 10 and 16%) for wells, tracks, key caps and ticks, `--on-navy-text` (offwhite 68%, 7.4 on navy) and `--on-navy-muted` (offwhite 60%, 6.1 on navy) for text.

### Status

Each status has a text colour, a border-free soft fill and a solid for icons, bars and tints. The soft fill is a tint, never an outline.

| Status | Text | Soft | Solid | Text on soft |
|---|---|---|---|---|
| Amber (pending review) | `#7A4700` | `#FBEFD3` | `#D9961A` | 6.7 |
| Green (approved) | `#176B3D` | `#E0F1E7` | `#2E9A5F` | 5.6 |
| Red (rejected, problem, overdue) | `#A3251D` | `#FBE6E2` | `#D4483D` | 6.2 |
| Blue (needs clarification) | `#1D4E8F` | `#E1ECF9` | `#3B7BD0` | 6.9 |

`--red-soft-hover` (`#F6D5D0`) is the destructive button hover (red text on it: 5.4). The small chip uses the solid at 11 to 14% over the surface, which keeps text contrast at 5.7 or better.

### shadcn mapping

`--background` canvas, `--foreground` ink, `--card` and `--popover` surface, `--primary` navy, `--primary-foreground` offwhite, `--secondary` navy 7%, `--muted` navy 5%, `--muted-foreground` ink-muted, `--accent` navy 7%, `--destructive` red text, `--border` the 7% line, `--input` navy 5%, `--ring` navy. The `--sidebar*` set stays tonal (canvas, ink-2, navy 7%) until the navy rail replaces the old sidebar; the rail itself uses the on-navy tokens.

## Type

- Families: Geist Sans (`font-sans`), Geist Mono (`font-mono`, for references like `LD-4K9P` and key caps), Geist Serif (`font-serif`, **only** the large hero figure). All three load through `next/font` from the `geist` package in `app/layout.tsx`.
- Weights: 400 body, 500 labels and row text, 600 titles, names, buttons, chips and figures.
- Tabular numbers are on for the whole page.
- Sentence case everywhere.

| Utility | Size / line height | Use |
|---|---|---|
| `text-caption` | 12 / 16 | Key caps, small captions, table sub lines, column heads |
| `text-label` | 12.5 / 17 | Field labels, chip text, helper text |
| `text-table` | 13 / 17 | Table cells, row meta |
| `text-body` | 14 / 20 | Body, buttons, inputs |
| `text-row` | 14.5 / 20 | Names in lists |
| `text-value` | 15 / 20 | Values in tiles, panel titles |
| `text-lead` | 16 / 24 | Role line under a name |
| `text-title` | 28 / 34, tracking `-0.015em` | Page title on the canvas |
| `text-name` | 34 / 38, tracking `-0.015em` | Lead name |
| `text-figure` | 38 / 40, tracking `-0.02em` | Big numbers |
| `text-hero` | 96 / 96 in `font-serif`, tracking `-0.02em` | The hero figure |

## Shape and radii

| Radius | Utility | Use |
|---|---|---|
| 7px | `rounded-xs` | Key caps |
| 12px | `rounded-sm` | Rows, inputs, wells, search, tooltips, small menus, table head band |
| 16px | `rounded-md` | Tiles, lifted card, rail wells, popovers, menus, toasts |
| 22px | `rounded-lg` | Panels, panes, hero tile |
| 24px | `rounded-xl` | Navy rail, dialogs, sheets |
| pill | `rounded-full` | Buttons, chips, segmented control, nav items, avatars |

Details below the scale are allowed for four things only: the 10px peach brand mark in the rail, the 6px tight corner of a message bubble, the 3px selected marker and the 2px progress tick and empty-cell bar.

Concentric rule: a child inside a rounded parent uses the parent radius minus its padding, so corners stay parallel.

## Shadows

Depth is tinted navy, layered and soft. Never pure black, never a single hard drop.

| Utility | Use |
|---|---|
| `shadow-raised` | White panels and small tiles on the canvas: inset 6% ring plus three blurs |
| `shadow-selected` | The lifted selected card inside a tonal pane |
| `shadow-tile-lift` | A white tile on a tonal pane |
| `shadow-popover` | Dialogs, sheets, popovers, menus, tooltips, toasts |
| `shadow-tray` | The pinned action bar when content scrolls under it |
| `shadow-rail` | The floating navy rail |
| `shadow-hero` | The navy hero tile |
| `shadow-btn-primary` | Primary buttons |
| `shadow-nav-active` | The peach active nav pill |
| `shadow-disc` | The 30px icon disc on a navy 4% tile |
| `shadow-segment` | The active segment of the segmented control |
| `shadow-glow` | The peach progress fill on the hero tile |

Inset 1px dividers written as `shadow-[inset_0_1px_0_var(--line)]` (or `--on-navy-07` on navy) are the divider line, not a shadow. The 2px canvas ring around the bell's peach dot is a cut-out, not an outline.

## Spacing and layout

- 8px grid with a 4px half step. Tokens `--s-1` to `--s-12`; use Tailwind's 4px scale in markup.
- `--gap-modules` 16px between panels, panes and bento tiles. `--gap-tiles` 12px between tiles inside a panel. `--pad-panel` 24px, `--pad-tile` 16px.
- Rail: 220 wide, inset 12, radius 24. Content starts at 248 and ends 24 from the right.
- Review list pane 372 wide. Record detail pane 380 wide. Reference canvas 1440.
- Layout switches by CSS breakpoints, not JavaScript.

## Density and row heights

| Token | Value | Where |
|---|---|---|
| `--h-input`, `--h-button` | 44 | Inputs, default buttons |
| `--h-search` | 40 | Search field, icon buttons |
| `--h-button-sm` | 32 | Small buttons |
| `--h-segment` | 32 | Segmented control segment |
| `--h-nav` | 42 | Rail item |
| `--h-chip` / `--h-chip-sm` | 26 / 22 | Header chips / table chips |
| `--h-keycap` | 22 | Key caps |
| `--h-table-head` / `--h-table-row` | 38 / 50 | Table |
| `--h-list-row` | 96 | Review list row |
| `--h-timeline-row` | 40 | Activity row |
| `--h-action-bar` | 76 | Pinned action tray |

## Components

- **Rail.** Floating navy (`bg-navy`, `shadow-rail`, radius 24). Wordmark with a peach mark, items 42px pills in `--on-navy-text`, the active item a peach pill (`shadow-nav-active`) with a count that flips to navy. A campaign well (`--on-navy-05`, radius 16) and a "Viewing as" well (`--on-navy-07`) at the bottom.
- **Page header.** Sits on the canvas, no container. Title `text-title` 600, a 14px `ink-2` subtitle that states only data facts. Search, bell with a peach dot, and avatar at the right.
- **Panel.** `bg-surface rounded-lg shadow-raised`, no outer border. Header row 56px, body padding 24.
- **Tonal pane.** `bg-tonal rounded-lg`. Holds lists and the record detail column. Rows sit flat on it.
- **Lifted card.** The selected row: `bg-surface rounded-md shadow-selected` with a 3px peach marker at the left edge. The rows around it drop their divider.
- **Tile.** `bg-navy-04 rounded-md`, padding 18 by 20: a 30px icon disc, a title and a definition list. On a tonal pane the tile is white with `shadow-tile-lift` and a navy 5% icon disc.
- **Hero tile.** Navy, radius 22, `shadow-hero`, one per screen. The figure is the only Geist Serif text: `text-hero` with a smaller serif "of 72" and a peach unit word. Progress track `--on-navy-10` with a peach fill and an offwhite target marker. A soft peach glow in one corner (`--hero-glow`, a radial gradient) is the only gradient allowed in the app and it never sits under data. The peach progress fill carries a matching soft halo (`shadow-glow`).
- **Buttons.** Pills. 44px default, 32px small, 28px extra small; icon sizes 40, 32 and 28. Primary navy with `shadow-btn-primary`, secondary navy 7%, destructive red soft with red text, ghost with a navy 7% hover. No outlines. A key cap can sit inside, on the right, with a tint matched to the button. Press scales to 0.98.
- **Input.** `bg-navy-05`, radius 12, 44px, no outline. Focus shows a 2px navy ring and nothing else. Invalid shows the red soft fill and a red ring.
- **Chips.** Pills, 26px (headers) and 22px (tables), icon plus label, soft tinted fill with coloured text, no border. A neutral chip is navy 7%. A count badge is navy with offwhite text.
- **Table.** Head band navy 4 to 5% with 12px muted text, rounded 12 at both ends. Rows 50px, 13px text, an inset 7% divider under each row except the last, no outer lines. Hover navy 3 to 4%. The current row is `--selected`, rounded at the ends, no divider. Empty cells show a faint 10 by 2px bar.
- **List row.** 96px, name 14.5/500, company and role on 13px lines, a right column with the waiting figure, a caption and the ref in mono. Rows split by the inset 7% divider, which is hidden next to the selected row.
- **Action bar.** A navy 4% tray pinned to the bottom of its panel, 76px, buttons left, key hint right. `shadow-tray` when content scrolls under it.
- **Timeline.** A 96px day column and a row of 40px events: time (muted, right aligned), a 28px icon disc, text, actor at the right. Client events navy 7% disc, Fynix events peach disc with peach-deep icon. A 1px 7% line joins the discs. Runs of system events collapse to one navy 5% pill.
- **Message bubbles.** Client on the right in `--bubble-client` with a tight top-right corner; Fynix on the left in navy 5% with a tight top-left corner. 18px outer radius, 6px tight corner, 84% max width. Name and time above in 12.5px.
- **Popovers.** Dialog, sheet, popover, dropdown, select, command and tooltip are white with no border and `shadow-popover`. Radius 12 for tooltips and small menus, 16 for popovers and menus, 24 for dialogs and sheets. Menu items are 12px radius rows with a navy 7% hover.
- **Key caps.** `kbd`: navy 7%, radius 7, 22px high, Geist Mono 12px.
- **Segmented control.** Tabs list: pill track navy 5%, padding 3, 2px gap. The active segment is navy with offwhite text and a count in peach.
- **Toast.** White, radius 16, `shadow-popover`, no border. The Undo action is a small secondary pill.

## Approved exceptions

The mockups are the authority, so these deliberate departures from the rules above are part of the design. Anything else that breaks a rule is a bug.

- **Icon discs on the three small stat tiles** (awaiting decision, clarifications, replacements owed) on the agency screen. Each is a 30px disc beside a title, and the figure stands alone. A metric tile without a status has no disc.
- **The 30px `lg` chip** (`Badge size="lg"`) is used once per screen, for the approval status in the lead record header. Headers elsewhere use the 26px chip and tables the 22px chip.
- **The serif hero figure.** Geist Serif at 96px for the delivered count, and the smaller "of 72". Nothing else is serif.
- **The hero glow.** The peach corner glow and the halo on the progress fill, as written under Components.
- **Brand choices the detector flags.** `impeccable detect` reports the cream canvas, Geist, the peach shadow under the active rail pill (`shadow-nav-active`) and the halo on the progress fill, a tile on a panel as "card inside card", and the `--ease-spring` token. All are in the approved mockups and kept on purpose. The tile on a panel is the two-level nesting the four depths allow.
- **Text scale outside the named utilities.** A few components write sizes as `text-[13px]`, `text-[14.5px]` and similar. They match the named scale and may be moved to the named utilities, which `cn` merges correctly (`lib/utils.ts` registers them as font sizes).

## Component inventory

| Piece | File |
|---|---|
| App shell, skip link, floating rail | `components/shell/app-shell.tsx`, `rail.tsx`, `nav-links.tsx`, `nav-config.ts` |
| View switcher, phone menu sheet | `components/shell/role-switcher.tsx`, `mobile-nav.tsx` |
| Page header, search palette, bell | `components/shell/page-header.tsx`, `command-search.tsx`, `search-leads.tsx`, `notifications.tsx` |
| 404 and error pages (outside the shell) | `app/not-found.tsx`, `app/error.tsx`, `components/shell/message-page.tsx` |
| Panel | `components/leads/panel.tsx` |
| Tonal pane and lifted card (review list) | `components/review/queue-list.tsx`, `review-queue.tsx` |
| Lead panel with action bar, dialogs, shortcuts | `components/review/lead-panel.tsx`, `reject-dialog.tsx`, `clarify-dialog.tsx`, `use-review-keys.ts`, `review-subtitle.tsx` |
| Tiles (meeting, contact, qualification) and the tonal detail column | `components/leads/lead-tiles.tsx`, `lead-details.tsx` |
| Stat tiles and hero tile | `components/leads/stat-tiles.tsx`, `campaign-hero.tsx` |
| Lead record | `components/leads/lead-record.tsx`, `activity-timeline.tsx`, `relay-thread.tsx` |
| Leads table, filter and toolbar | `components/leads/leads-table.tsx`, `agency-leads-view.tsx`, `components/ui/table.tsx` |
| Chips | `components/ui/badge.tsx`, `components/status/status-badge.tsx` |
| Bar with a target tick, time in two zones, waiting age (shown on the design system page until the phase 1 screens use them) | `components/charts/bullet-graph.tsx`, `components/time/time-in-zones.tsx`, `waiting-age.tsx` |
| Skeletons (shown under States on the design system page) | `components/review/review-queue-skeleton.tsx`, `components/leads/leads-table-skeleton.tsx` |
| Buttons, inputs, tabs, dialogs, sheets, menus, toasts | `components/ui/*` (shadcn on Base UI, restyled) |
| Specimen helpers for `/dev/system` | `components/dev/*` |

`components/ui` also holds `avatar`, `card`, `scroll-area` and `separator`, restyled but not used by a screen yet.

## Isolation rule

The agency never sees client rep names, emails or people, so the two roles never share the full lead data.

- Agency screens receive only role-shaped data from `lib/leads/agency-view.ts` (`toAgencyView`), built on the server. Its fields are listed one by one; never spread a source lead into it.
- Shared client code (everything under `components/` and `lib/` except `lib/sample/`) must never import `lib/sample/data`. Only server files (the route pages and the prototype layout) do.
- `lib/sample/isolation.test.ts` fails if a component or a lib module imports it.

## Open question

Which month a delivered lead counts toward is undecided (spec section 16, item 2), and so is the time zone the month is read in. The prototype uses the month of the earliest completed meeting, read in the campaign zone (`CAMPAIGN_ZONE`, Europe/London). The rule lives in one function, `lib/domain/counting-month.ts`, so changing either answer is a one-file change.

## Accessibility notes

- One `h1` per page and no skipped levels. Tile titles are `h2` in the lead record and `h3` under a lead name in the review panel (`headingLevel` on the tiles).
- Every control shows a focus ring (2px navy; offwhite on the rail). Icon-only controls carry an `aria-label`, and the search button's name contains its visible text.
- Under 768px every button, tab and menu item is at least 40px tall.
- Reduced motion zeroes durations and stops looping animation, including the skeleton pulse.
- Layout switches by CSS only, so the server markup is already right on a phone.

## Status rules

- Approval chips carry an icon, a label and a soft tint. Never colour alone, never an outline. A greyscale render must still tell the four apart by icon and label.
- Meeting status is icon plus text in muted ink. Problem outcomes (no-show, declined, cancelled) take red text.
- One chip per column. A row that needs two statuses uses two columns.
- Overdue is red text with a warning icon and a caption. Working hours warnings are amber text.
- Peach is selection and small accents only. Never body text on canvas.
- Icons are Phosphor, 13 to 17px in chips and tables, 18 to 20px in buttons and nav.

## Motion

- Press 120ms, hover 180ms, state 240ms, panel 360ms, slow 520ms (`--dur-*`).
- Default easing `--ease-out` (fast start, soft landing). `--ease-in-out` for swaps and layout shifts. `--ease-spring` for press release and count badges. Every Tailwind transition inherits 180ms and the soft landing through `--default-transition-*`.
- Animate state changes only: hover, press, focus, open and close, selection. Transform and opacity, never layout properties.
- No decorative animation, no entrance choreography, no looping effects.
- Reduced motion zeroes the durations in `app/globals.css`. Do not add motion that bypasses it.

## Copy

- Plain verbs: "Approve", "Reject", "Ask for clarification", "Export".
- Sentence case. No exclamation marks. No emoji.
- No em dashes or en dashes in any copy, code comment or doc. Use a full stop, a colon, commas or brackets. Number ranges use "to".
- No filler words such as "seamless", "robust", "leverage".
- Subtitles state data facts only. Error messages name the cause and the fix.
- Sections on the system page and in the app have a title, not an eyebrow label.

## Banned

- Outlines on controls, chips, inputs or tiles.
- Dividers other than the inset 7% line between rows.
- More than two nested surface levels.
- Decorative gradients, neon, glass on data, purple, emoji.
- Hand-drawn icons. Phosphor only.
- An icon tile on every metric. The approved exception is below: three small stat tiles carry a disc beside the title, never around the number.
- A sparkline in every card.
- Gauges or donuts for target versus actual. Use a bar with a target tick.
- Trend arrows without a stated comparison.
- Decorative status dots.
- Invented sample names like "John Doe" or "Acme".
- Em dashes and en dashes.
