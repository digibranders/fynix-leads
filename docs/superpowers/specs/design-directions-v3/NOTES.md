# Design directions v3: the Fynix Leads redesign

The owner rejected the current look (hybrid: floating icon rail, beige canvas, pill buttons) and pointed at the CleanStart partner portal as the bar for "sleek, clean, professional". These comps are the visual decision. Nothing in the app has been changed yet.

Same three client screens in both directions, at 1440 wide: Overview, To respond (the review queue) and Leads. Regenerate with `node docs/superpowers/specs/design-directions-v3/build.mjs` (real Phosphor icons, Geist type).

## What was taken from CleanStart

- A fixed, labelled sidebar with counts, a thin top bar with a breadcrumb and a ⌘K search, a dense 13.5px type scale, tabular numbers.
- Page head with one primary action, then one surface per job: KPI strip, status tabs with counts, a filter toolbar, a dense table, a drawer for detail.
- Colour carries status only. One accent. Quiet tinted badges.

## What was changed on purpose (CleanStart's own audit, UX-23 and others)

- Primary actions are labelled buttons ("Review", "Accept this time"), never icon-only.
- Form controls keep a visible edge at 3:1 or better (CleanStart's were 1.3:1).
- Breadcrumbs only when they add information.
- Tables become stacked rows on a phone instead of hiding the status and action columns.

## A: Ledger

A faithful translation. Cool canvas, white cards on a 1px hairline, 7px controls, 10px cards. Review opens in a right drawer. Safe, familiar, closest to CleanStart.

## B: Ledger Soft

The same architecture, with the owner's 2026-11-11 rule kept: no outlines. Cards are separated by a ring shadow and tone, tables have a tonal header and no row lines, buttons are tonal. The only line left is on form controls. Warm off-white canvas, 14px cards, 9px controls.

Differences in composition:

- Sidebar is grouped (Work, Campaign) and carries a campaign switcher.
- Overview opens with one hero module (what needs you now and progress to target), then three small stats with trend lines. No KPI strip.
- To respond is a split pane: queue on the left, the lead on the right, big time slots, one sticky action bar, J K A D keys. Triage without leaving the page.
- Leads has a stage bar that doubles as the filter, in place of tabs.

## Questions for the owner

1. A or B, or A's structure with B's surfaces.
2. Canvas: cool grey (A) or warm off-white (B). The Fynix canvas today is warmer and peachier than B.
3. Accent: navy primary buttons with peach for selection and progress (both comps). Say if peach should be louder.

## After a pick

Rebuild every route on the chosen language: tokens, all `components/ui` primitives, one shared shell for the four portals, every screen, `/dev/system`, `DESIGN.md`, the tests that assert markup. Server code and tests of business rules stay as they are.
