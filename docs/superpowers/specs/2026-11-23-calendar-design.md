# Fynix Leads: calendar experience

Status: replaced on 2026-11-26 by `2026-11-26-calendar-and-meetings-design.md`, which is the one calendar spec. Kept as history. Nothing here was built.
Date: 2026-11-23.

## 1. Purpose

Today each role has a Meetings table. There is no calendar, no way to see free time while booking, and one host
per lead. This spec adds one Calendar page for every role, a slot picker for booking, and a pool of client
hosts who confirm they will join.

It changes these v2 decisions: a lead has a pool of hosts (v2 had one chosen host), and a proposal holds its
times for a while (v2 had none). Everything else in v2 section 9 stays: open Meet rooms, one email per person,
.ics with a rising sequence, the 24 hour client no-show rule (D13), unlimited prospect reschedules (D14), counting
in the campaign time zone (D20).

## 2. Principles

1. Each person sees only what they need to act. Isolation rules in v2 section 5 are unchanged.
2. Every time is shown in the reader's own zone, with the campaign zone one click away.
3. A free slot is shown as free. Nobody guesses, and nobody sees why a slot is blocked.
4. A status is never colour alone. Each has an icon and a word.
5. The page works on a phone. Agenda is the phone default.
6. The look follows the approved tokens: no outlines, tint and elevation only, side panel on selection.

### 2.1 Phone rule for every screen (whole app, not only the calendar)

Every screen in every role works at 390 px wide, and the calendar is checked against the same list:

- No horizontal page scroll. Tables become stacked rows, as in the approved table comps.
- Side panels become bottom sheets with the action tray pinned.
- Touch targets are at least 44 px. Inputs are at least 16 px so iOS does not zoom.
- Forms are one column. The primary action stays reachable without scrolling back up.
- Text stays readable without zoom, and status keeps its icon and word.
- Proof: a 390 px screenshot of each screen, reviewed before the phase that builds or changes it is closed.

## 3. Audiences

| Audience | Job | Sees |
|---|---|---|
| Agency | Find a free time, propose 1 to 3 | Free blocks of the lead's hosts, its own meetings, its proposals. Never why a block is busy. |
| Client host | Know what is coming, set hours, confirm | Own meetings and hours, other hosts on the same meeting, RSVP state |
| Client contact (not a host) | Watch what is booked | All meetings of the client's campaigns, read only |
| Supplier | Watch its agencies | Meetings of its agencies and campaigns, no client contact names (open decision 5) |
| Fynix admin and staff | Spot problems | Everything, plus warnings (section 9) |
| Prospect | Turn up | No portal. Email, .ics and Meet link only |

## 4. The Calendar page

One route per role: `/<role>/calendar`. Replaces nothing; the Meetings table stays as a list view.

- Views: Month, Week, Day, Agenda. Agenda is the phone default and Week shows 3 days there.
- State lives in the URL: view, date, campaign, agency, host, status. A link opens the same view.
- Time zone switch: campaign zone, my zone, prospect zone (when a lead is picked). Zone and offset are shown.
- Week and Day show working hours of the visible hosts as the base layer; outside hours is shaded.
- Click a block: the side panel opens (same pattern as To respond). On phone it is a bottom sheet.
- Keyboard: arrows move between days and slots, Enter opens, Escape closes. Grid has roles and labels.
  Reduced motion removes slide transitions.

### 4.1 Block states

| State | Icon and word | Notes |
|---|---|---|
| Proposed | Clock, "Proposed" | Pale tentative block, held for the proposal window |
| Scheduled | Calendar check, "Scheduled" | Solid block |
| Outcome due | Hourglass, "Outcome due" | After end time, before outcome recorded |
| Held | Check, "Held" | Muted |
| Client no-show | Warning, "Client no-show" | Red tint |
| Prospect no-show | Warning, "Prospect no-show" | Amber tint |
| Rescheduled | Arrows, "Rescheduled" | Greyed, links to the new time |
| Cancelled | X, "Cancelled" | Greyed, struck time |
| Free | None | Agency only, inside a host's free blocks |

Block text: time, lead company, host first name. Prospect personal data stays in the panel, as on the
Meetings table today.

## 5. Booking (agency)

1. From a lead, or from a free slot, open the slot picker panel.
2. The picker shows the lead's hosts as a stack: each free block shows "2 of 3 hosts free".
3. The agency chooses 1 to 3 start times. Length is the campaign meeting length.
4. A time outside 8 am to 7 pm for a host or for the prospect shows a warning, not a block (v2 8.3).
5. Each chosen time is held. Other agencies see it as taken. The hold ends when the client declines, accepts
   another time, or the proposal expires.
6. When the client accepts one, the server rechecks that at least one host is still free. If not, the client
   sees the nearest free times to pick from instead of a bare error.

Accepting a time is still accepting the lead (v2 8.3).

## 6. Hosts and RSVP

- A campaign has a pool of hosts (existing `campaign_host`). A lead may restrict the pool, default all.
- A slot is free when at least one host in the pool is free there.
- On booking, every host free at that time is invited. Each answers Going or Can't make it in the portal or from
  the email link, before the cutoff.
- Everyone on the meeting sees who is going. The panel lists each host with their state.
- If the last Going host drops, the lead moves to Reschedule needed and the agency and Fynix are told. A meeting
  with no Going host at the cutoff does the same.
- Hosts mark their own hours and blocks (existing `host_hours`, `host_block`). A Fynix admin can edit them for
  a client that asks.
- Prospect email names one host: the first to accept (open decision 2).

## 7. Moving and cancelling

- The client reschedules from the panel by choosing from free blocks. Under 24 hours is a client no-show
  (D13); the panel says so before confirm.
- The agency reschedules for a prospect no-show or request (D14), with no limit.
- A reschedule keeps the same room and link and raises the .ics sequence. The old block stays, greyed.
- Cancelled and rescheduled blocks stay visible with history, filterable off.

## 8. Extras, in order

1. Subscribe feed: a private .ics URL per person that lists their meetings, so Google and Outlook show them.
   Token can be reset. Contains the same fields as the email .ics, never more.
2. Target strip: meetings held this month against the target, per campaign (D20 counting).
3. Buffer between meetings and minimum notice, per campaign, defaults in open decision 6.
4. Per host daily cap, open decision 7.
5. Drag a block to propose a new time (agency and client), same rules as 5 and 7.
6. Busy heatmap for agencies: which weekdays and hours convert, from held meetings.

Calendar connection to Google or Outlook (D18) stays a later add-on. Free time stays what hosts entered.

## 9. Fynix warnings

Shown on the Fynix calendar and as chips on the lead: a host double booked, a host with no hours, a campaign
with no free block in the next 14 days, outcome overdue, proposal waiting longer than 48 hours, meeting with no
Going host.

## 10. Privacy and trust

- An agency sees free blocks and its own meetings. It never sees a host's other meetings or why a block is busy.
- A client sees its own campaigns only. A host sees the other hosts' names on a shared meeting, nothing else of
  theirs.
- The prospect never sees Fynix, the supplier or the agency (v2 9.2).
- Reads are range limited (at most 62 days) and checked by the same leak matrix as other reads.
- The subscribe feed token is a bearer secret: stored hashed, shown once, reset on demand.

## 11. Engineering needs

| Need | Notes |
|---|---|
| Free-slot function | Pure, tested: hosts' hours, blocks, existing meetings, buffer, notice, cap, campaign zone, DST |
| Range reads | Meetings by date range per role, through existing role connections and RLS |
| Meeting hosts | New table: meeting, host member, RSVP state, answered at |
| Proposals and holds | New tables for proposed times with expiry; spec v2 line 405 already plans them |
| Leak tests | Add calendar reads to the leak matrix for all six audiences |
| Feed | Token table, hashed; one route returning .ics |
| Accessibility | Grid roles, focus order, non-colour status, keyboard flow; added to the phase 6 audit |

## 12. Phasing

| Step | Delivers | Needs first |
|---|---|---|
| A | This spec and the comps approved | Owner |
| B | Data layer: free-slot function, range reads, meeting hosts and RSVP, proposals and holds, leak tests | A |
| C | Read only calendar for all roles: Month, Week, Day, Agenda | B |
| D | Booking, accepting and RSVP from the calendar | C, G4 for Meet rooms |
| E | Reschedule, cancel, reminders, subscribe feed | D |
| F | Fynix warnings and the remaining extras | E |

Steps B and C do not need the Workspace trial (G4). Each step gets its own plan and ends with lint, typecheck,
tests, integration tests and build passing.

## 13. Open decisions

| # | Decision | Suggestion |
|---|---|---|
| 1 | Pool of hosts with RSVP, or one fixed host per lead | Pool with RSVP |
| 2 | Which host name goes in the prospect email | First host to accept |
| 3 | How long a proposal holds its times | 48 hours |
| 4 | RSVP cutoff | 24 hours before the meeting |
| 5 | Does the supplier see client contact names | Host names only |
| 6 | Buffer and minimum notice defaults | 15 minute buffer, 24 hours notice |
| 7 | Maximum meetings per host per day | 4, adjustable per campaign |
