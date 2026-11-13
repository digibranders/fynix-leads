# Fynix Leads: lead generation portal, spec v2

Status: draft for the owner's approval.
Date: 2026-11-12. Replaces `2026-11-11-leadgen-portal-design.md` (v1). The decisions behind every change are
recorded, numbered D1 to D37, in `2026-11-12-v2-workflow-review.md`. This spec cites them as (D12) and so on.

## 1. Purpose

Fynix sells qualified meetings to a **client**, for example Upwind, a cyber security company. Fynix buys those
meetings from a trusted **supplier** (A), who books them itself or through its **partner agencies** (P, Q, R).
An agency finds a prospect, for example Vijendra, CISO at company Z, and books a video meeting between the
prospect and one of the client's people, for example Simarpreet.

Today this runs on a WhatsApp group, email and a Google Sheet. Nobody can see in one place how many meetings
were booked, held or missed, or where each came from. Everyone sees everyone's phone number and email, so an
agency can go straight to the client and cut out the supplier and Fynix.

The portal replaces all of that. It tracks every lead from submission to a counted meeting, sends every
notification, books the meeting without anyone seeing another party's email or phone, and counts delivered
meetings against two agreements: Fynix with the client, and Fynix with the supplier.

## 2. Parties

| Party | Example | Portal role | Does |
|---|---|---|---|
| Client | Upwind and its staff | Client | Agrees the target with Fynix, sets who takes meetings and when, accepts or declines each lead and time, attends, can dispute a meeting |
| Fynix | Fynix admin and staff | Fynix | Sets up every client, supplier and campaign. Sees everything. Talks to the client and the supplier. Settles disputes |
| Supplier | A: a person or a company | Supplier | Agrees its target with Fynix. Finds prospects and books meetings itself, and invites its partner agencies and splits the target between them (D2) |
| Partner agency | P, Q, R and their staff | Agency | Finds prospects, books meetings, joins them, records the outcome. Talks only to the supplier (D5) |
| Prospect | Vijendra | No account | Receives the invite and reminders from the agency's alias identity. Replies go to that alias |

A supplier who works alone is a supplier with no partner agencies; its own users submit leads.

## 3. Scope

### In v1

- Organisations: clients, suppliers, partner agencies under a supplier. Users, invites, password sign-in,
  terms acceptance. Fynix admin and Fynix staff roles (D23).
- Campaigns with a brief (ICP, BANT criteria, instructions), meeting hosts and their available hours.
- Virtual agreements: the client target and the supplier target, accepted in the portal (D22). Supplier shares
  for its agencies.
- Alias identities for agency people, verified by code (D31, D32).
- Leads with BANT answers, duplicate check and the client's exclusion list.
- The lead lifecycle in section 8: client acceptance before the meeting, outcomes, 48 hour dispute window.
- Meetings: open Google Meet rooms created by the portal, meeting emails per audience with calendar files,
  reminders to the prospect, outcome recording (D25 to D29).
- Messaging along the chain client, Fynix, supplier, agency, with documents (D5, D7).
- Email templates per event and audience, set by Fynix (D35). In-app notifications.
- Activity history on every lead and campaign. Dashboards and exports per role.

### Not in v1

- Money: prices, payouts, invoices. Counts only.
- Meeting recording (D19).
- Reading the hosts' real calendars (D18). Hosts type their hours.
- Sending email as the alias domains themselves. The sender is the portal's own domain (D26, D33).
- WhatsApp or SMS (D24).
- Microsoft Teams or Zoom rooms. Google Meet only.
- Dark mode.
- Any line of contact between Fynix and partner agencies (D5), or between the client and the supply side (D7).

## 4. What changed from v1

| v1 | v2 |
|---|---|
| One agency per campaign | A supplier per campaign, with any number of partner agencies under it (D2) |
| Only Fynix invites people | The supplier invites and manages its agencies' users (D16) |
| Agency users appear as "Fynix aliases" | Agency users appear as **client-brand aliases** with alias emails, for example "Gaurav, Upwind, gaurav@upwind-io.com" (D1, D36). Each person keeps several (D31) |
| Client approves or rejects after the meeting; delivered = completed and approved | Client accepts or declines before the meeting; held or client no-show = delivered; 48 hour dispute window after (D6, D10) |
| Replacement owed and "replaces" links | Dropped. The shortfall against the target already shows what is owed |
| Relayed, scrubbed threads between client and agency | No client to agency messages. A chain: client, Fynix, supplier, agency (D5, D7) |
| Agency never sees client people's names | Names and companies are shown everywhere; only emails and phone numbers are hidden (D3) |
| Google Calendar event with the prospect and host as hidden guests | Open Meet room with no invitees; the portal emails each person separately with a calendar file (D25 to D28) |
| One monthly target | Two agreements: client target X and supplier target Y, plus the supplier's shares for its agencies |
| One Fynix admin | Fynix admin and staff roles (D23) |
| Sender `hello@fynix.digital` | A separate sender domain for all portal mail, name to be given (D26, D37) |
| Counting month open | The month the meeting was held, in the campaign's time zone (D20) |

## 5. Identities and isolation

### 5.1 What each party sees

"Sees" means the server sends it. Hiding a field in the browser does not count.

| Data | Client | Supplier | Agency | Fynix |
|---|---|---|---|---|
| Client brand, offer, campaign brief | Own | Yes | Yes | Yes |
| Meeting hosts: name, title, company | Own | Yes | Yes | Yes |
| Client people: emails, phones | Own | No | No | Yes |
| Host available hours and blocked times | Own | Yes | Yes | Yes |
| Client target X and its agreement | Yes | No (D21) | No | Yes |
| Supplier name | No (D15) | Own | Yes | Yes |
| Partner agency names | No (D15) | Its agencies | Own | Yes, as the source of each lead (D16) |
| Supplier target Y, agency shares | No | Yes | Its own share | Yes |
| Agency people: real names, emails, phones | No | Its agencies' people | Own org | Yes |
| Alias identities: name, title, alias email | Yes (D36) | Its agencies' | Own | Yes |
| Prospect details (name, title, company, email, phone, LinkedIn) | Yes | Its agencies' leads | Own leads | Yes |
| Client's decline or dispute reason | Yes | Yes, as "Client" | Yes, as "Client" | Yes, with the person's name |
| Conversations | With Fynix | With Fynix, with its agencies | With its supplier | With clients and suppliers. Not supplier to agency (D5) |
| Exclusion list | Own, editable | Match results only | Match results only | Yes |

### 5.2 Rules

1. **Emails and phone numbers of parties never cross a boundary** (D3). Names and companies do.
2. **The prospect never sees Fynix, the supplier or the agency.** Everything the prospect receives comes from the
   agency's alias identity under the client's brand (D1).
3. **The client never sees the supply side**, only alias identities (D15, D36).
4. **No direct lines.** The client talks to Fynix, Fynix to the supplier, the supplier to its agencies (D5, D7).
5. **The contract does the rest.** The terms each user accepts include non-circumvention and non-solicitation.
   The portal cannot stop people exchanging details in a call. It removes the routine leaks (groups, email
   threads, guest lists) and keeps a record of every contact.

### 5.3 Enforcement (carried over from v1, already built in phases 1A to 1C)

- One database login role per party, column grants and row-level security on every tenant table.
- Role-shaped server reads: no generic "return the row" path.
- Opaque public references (`CMP-7Q2X`, `LD-4K9P`).
- Leak tests: for each role, every read path is called and checked for forbidden values. They now cover the
  client, the supplier and the agency, plus every email sent to a prospect.

## 6. Organisations and accounts

- `organisation.kind` stays `fynix`, `client` or `agency`. A supplier is an agency with no parent; a partner
  agency has `parent_org_id` pointing at its supplier. Two levels at most.
- Fynix creates clients and suppliers and invites their first users. A supplier manager invites partner
  agencies and their users (D16). Every invite is audited.
- Invite link, single use, 7 days, the user sets a password. Password rule: at least 8 characters with a
  letter, a number and a special character, checked against breached passwords.
- Terms per party kind, accepted on first sign-in and again when a new version is published.
- Fynix roles (D23): **admin** sets up organisations, campaigns, agreements, templates and terms; **staff** work
  leads, meetings, messages and disputes but cannot change set-up.
- Fynix users need a second factor before real data is entered (gate G1).

## 7. Campaigns and agreements

### 7.1 Campaign

One client, one supplier. Holds the brief (geography, industries, company size, ICP, job titles, seniority,
technologies, the four BANT criteria, instructions), start and end dates, the campaign time zone (for counting),
the default meeting length (30 minutes unless set), and Fynix-only internal notes.

### 7.2 Virtual agreements (D22)

Not legal documents; they exist for trust and confidence.

| Agreement | Between | Holds | Accepted by |
|---|---|---|---|
| Client agreement | Fynix and the client | Target X per month and in total, the dispute window, the no-show and cancellation rules, any notes | A manager at the client |
| Supplier agreement | Fynix and the supplier | Target Y per month and in total, the same rules | A supplier manager |
| Shares | Supplier and each of its agencies | A monthly share of Y | Set by the supplier; agencies see their own |

Fynix writes and changes an agreement; each change makes a new version that the other side accepts again.
Every version and acceptance is kept. Both agreements use the same counting rules (D6), so Fynix never pays the
supplier for a meeting it cannot count for the client.

### 7.3 Meeting hosts and availability (D18)

The client marks which of its people take meetings for a campaign. Each host sets weekly working hours in their
own time zone and blocks out times. Agencies see the free blocks only. Calendar connection (read busy times from
Google or Outlook) is a later add-on.

## 8. Leads and their lifecycle

### 8.1 A lead

Prospect name, title, company, company domain, LinkedIn URL, email, phone, the four BANT answers, the chosen
host, the chosen alias identity, the source agency (or the supplier itself), and the person who submitted it.

On submit the server checks for duplicates (same email, or same normalised LinkedIn URL, for the same client
across all campaigns and all agencies, naming who got there first if the submitter may see it) and for the
client's exclusion list (domain, email or company). Either blocks the submission.

A submission beyond the agency's share, or beyond the campaign target, is allowed and flagged for Fynix, who
decides whether it counts (D17).

### 8.2 Stages

One stage that every role reads.

```
Draft ─submit─> Awaiting client ─client accepts a time─> Scheduled ─meeting ends─> Outcome due
                 │       │                                 │                         │
                 │       └─client proposes other times     ├─rescheduled             ├─ Held ─────────────> Delivered
                 │          ─agency picks one─> Scheduled  │  (new time agreed)      ├─ Client no-show ───> Delivered
                 │                                         │                         └─ Prospect no-show ─> Reschedule needed
                 └─client declines (reason)─> Declined     └─client cancels <24h ─> Delivered (client no-show)

Reschedule needed ─agency proposes new times─> Awaiting client (no limit, D14)
Any open stage ─agency or supplier withdraws─> Withdrawn      Any open stage ─Fynix─> Lost
Delivered ─client disputes within 48 hours─> Disputed ─Fynix decides─> Delivered (final) or Rejected
```

| Stage | Who acts | Counts |
|---|---|---|
| Draft | Agency or supplier; only they see it | No |
| Awaiting client | Client: accept one proposed time, propose other times, or decline with a reason. Fynix may act on the client's behalf with a note | No |
| Scheduled | Nobody; reminders go out | No |
| Outcome due | The agency that booked it, or its supplier, records the outcome within 24 hours of the end time. Fynix can record it too | No |
| Reschedule needed | Agency proposes new times | No |
| Delivered | Client may dispute for 48 hours (D10) | Yes |
| Disputed | Fynix decides | Yes until decided |
| Declined, Withdrawn, Lost, Rejected | Closed | No |

### 8.3 Rules

- The agency proposes 1 to 3 times, agreed with the prospect beforehand, inside the host's free blocks. A time
  outside them, or outside 8 am to 7 pm for the host or the prospect, shows a warning.
- **Accepting a time is accepting the lead.** After that the client can reschedule but not decline.
- **Client cancels less than 24 hours before** the meeting: client no-show, the lead is delivered (D13).
- **Client reschedules earlier than that**: free; the client proposes new times and the agency picks one (D13).
- **Client no-show** (host absent) counts for both agreements (D6). There is no automatic lateness rule; the
  agency records what happened, with the attendance data as evidence (D13).
- **Prospect no-show or prospect asks to move**: the agency reschedules, with no limit (D14). A lead nobody
  reschedules is closed by the agency or supplier (Withdrawn) or by Fynix (Lost).
- **Disputes** are for facts the agency got wrong (for example the prospect is not the stated title, or has no
  budget though the lead says otherwise). Reason from a preset list plus a note. Fynix decides; a rejected
  dispute keeps the lead delivered, an upheld one makes it Rejected. Without a dispute the lead is final after
  48 hours.
- **Fynix may check any lead but does not have to** (D8). While a lead waits for the client, Fynix can edit it,
  withdraw it, or decide on the client's behalf, always with a note in the history.
- After submit the agency cannot edit prospect fields; corrections go through the supplier to Fynix.

### 8.4 Counting

A delivered lead counts in the month its meeting was held, read in the campaign's time zone (D20), toward both
the client target and the supplier target (and the agency's share). Only an upheld dispute (Rejected) removes
it. One function decides the month, so the rule can change without a migration.

## 9. Meetings

### 9.1 Booking

1. When the client accepts a time, the portal creates an **open Google Meet room with no invitees** from a
   Fynix Google Workspace account, through the Meet API, access type open: anyone with the link joins without
   knocking (D25). No calendar event is created by Google, so there is no guest list.
2. The portal sends the meeting emails (9.2) and shows the meeting on everyone's meeting page with a Join
   button.
3. A reschedule keeps the same room and link and sends "moved" emails. A cancel sends "cancelled" emails.
4. The Fynix account that owns the room never joins. Fynix staff who join (D19) do so under a client-brand
   display name, not signed in to a Fynix account, because the prospect must not see Fynix.
5. After the meeting the portal reads the room's attendance (who joined, when, for how long) and shows it on the
   outcome form. People not signed in to Google appear only under the name they typed, so the join instructions
   ask the agency person to use their alias name.

### 9.2 Meeting emails (D26 to D29, D33, D34)

- One email per person. Never several people in To or CC.
- Sent from the portal's own sender domain (D37).
- Every email carries a calendar file (.ics) with a fixed id and a rising sequence number, so a reschedule or
  cancel updates calendars that imported it. Buttons add it to Google Calendar or Outlook; those copies cannot
  be updated, so the "moved" email says to remove the old time.

| Recipient | Template style | Contains | Never contains |
|---|---|---|---|
| Prospect | Personal letter from the chosen alias identity, Reply-To that alias email | Client brand, host name and title, time in the prospect's zone, Meet link, calendar buttons, the agency's optional note | Fynix, supplier or agency names, any portal link |
| Every client contact (D28) | Portal notice | Prospect details, host, alias identity, time in the reader's zone, Meet link, calendar, link to the lead | Supplier or agency names |
| The agency person who booked, and the supplier (D34) | Portal notice | Client company, host name and title, prospect, Meet link, calendar, link | Client people's emails or phones |
| Fynix | Portal notice | All of the above plus the source agency | |

Events with these emails: booked, moved, cancelled. The prospect also gets reminders a day and an hour before
(D29).

### 9.3 Alias identities (D31 to D33)

Each agency person (and supplier person who books) keeps several identities: display name, title, alias email,
and the client brand it belongs to. An alias email can be used only after the person enters a code sent to that
mailbox. At booking the person picks one identity for that lead; it signs every prospect email for the lead.
Alias domains and mailboxes belong to the supplier or the agency (D11); prospect replies go there.

### 9.4 Templates (D35)

Fynix keeps one default set: one template per audience (prospect, client contact, agency and supplier, Fynix)
for each event (booked, moved, cancelled, reminder a day before, reminder an hour before). A campaign can
override the prospect letter. The agency can type a short optional note when booking. The default prospect
letter is drafted in the review document, section 8.0.1.

## 10. Notifications

All email goes through the outbox and the portal's sender domain. Every notification also appears in the
in-app centre. "Self" means the person who acted gets it in the app only.

| Event | Client | Supplier | Agency | Fynix | Timing |
|---|---|---|---|---|---|
| Lead submitted | Email | Email if an agency submitted | Self | Email | Client and Fynix: one email every 2 hours listing new leads, only if any |
| Client accepted a time | Meeting email to every contact | Meeting email | Meeting email | Meeting email | Instant, plus the prospect |
| Client proposed other times | Self | Email | Email | Email | Instant |
| Client declined | Self | Email with reason | Email with reason | Email | Instant |
| Meeting moved or cancelled | Meeting email | Meeting email | Meeting email | Meeting email | Instant, plus the prospect |
| Prospect reminders | | | | | A day and an hour before |
| Outcome due | | Email if not recorded after 24 hours | Email at the end time, again after 24 hours | Email after 48 hours | |
| Outcome recorded | Email | Email | Self | Email | Instant |
| Client still to respond | Daily reminder | | | Copy | 9 am client time, if a lead has waited over 24 hours |
| Dispute raised | Self | Email | Email | Email | Instant |
| Dispute decided | Email | Email | Email | Self | Instant |
| Over share or over target | | | | Email | Instant |
| Agreement changed, acceptance needed | Email to managers | Email to managers | | Self | Instant |
| Monthly or total target met | Email | Email (its target) | Email (its share) | Email | Instant |

## 11. Messaging (D5, D7)

| Conversation | Members | Threads |
|---|---|---|
| Client and Fynix | Client users, Fynix | One per campaign, one per lead |
| Supplier and Fynix | Supplier users, Fynix | One per campaign, one per lead |
| Supplier and an agency | Supplier users, that agency's users | One per agency, one per lead. Fynix does not read it |

- A question about a lead travels hop by hop. Each hop is its own thread on the lead, and a person can forward a
  message to the next hop in one click.
- When Fynix forwards between the client side and the supply side, emails and phone numbers are removed from the
  forwarded text automatically, as a safety net.
- Documents: PDF, Word, Excel, PNG, JPG, up to 10 MB each, stored privately on the server and served only to
  members of that conversation, scanned for malware on upload. Files are forwarded only by a person, never
  automatically.
- No messages from or to the prospect inside the portal. The prospect writes to the alias mailbox.

## 12. Dashboards and exports

| Role | Dashboard |
|---|---|
| Client | Delivered against target this month and in total, leads waiting for your response with how long, upcoming meetings with Join, open disputes |
| Supplier | Delivered against its target, split by agency against shares, leads waiting for the client, outcomes due, over-share flags |
| Agency | Delivered against its share, upcoming meetings, outcomes due, declined leads with reasons |
| Fynix | Every campaign: delivered against X and against Y, by source agency, oldest lead waiting for a client, overdue outcomes, open disputes, flags |

At most six figures per page, each linking to the table behind it, every comparison spelled out ("of 40").

Exports (CSV and XLSX) of what each role can see: the client's has no supply-side names; the supplier's and
agency's have no client people's emails or phones.

## 13. UI plan

The navy rail shell, the tokens and the "structured softness" direction from phase 0 stay. Every new screen
gets comps that the owner approves before markup, as before.

| Role | Screens |
|---|---|
| Fynix | Overview · Clients · Suppliers (each with its agencies) · Campaign (brief, hosts, agreements, shares, leads, meetings, activity) · Leads · Meetings · Inbox · Disputes · Templates · Audit log · Settings (terms, reason lists, Fynix team) |
| Client | Home · To respond (table of leads waiting, actions in the side panel, 13.2) · Meetings · Leads (table and record, dispute) · Messages · Hosts and hours · Agreement |
| Supplier | Home · Leads (all its agencies, plus submit) · Meetings · Agencies (invite, shares, people) · Messages (Fynix, each agency) · Agreement · My aliases |
| Agency | Home · New lead (prospect, host, times in both zones, alias) · My leads · Meetings (Join, record outcome) · Messages (supplier) · My aliases (add, verify) |
| Everyone | Meeting page: time in your zone, Join, instructions; afterwards the outcome form with attendance |

### 13.1 Tables first

Every list in the portal is a table: leads, meetings, disputes, agencies and shares, people, aliases, hosts and
hours, agreements and their versions, templates, flags, the audit log. Each table has the same toolbar (search,
stage or status filter, sort by any column header, export where 12 allows it), shows times in the reader's zone
with the zone named once in the toolbar, and keeps its filters in the URL so a link opens the same view.
Dashboard figures (12) link to the table behind them, already filtered. Below 768 wide a table becomes a list of
rows with the two or three most useful columns, never a sideways scroll of the whole page.

### 13.2 Leads: table, side panel, full record

The lead table and the lead record from phase 0 stay, with one change in how they connect:

1. **Table.** Columns: reference, prospect and company, stage, meeting time, host, and (Fynix and supplier
   only) source agency. Columns hidden by role follow 5.1.
2. **Side panel.** Clicking a row opens a panel on the right with the lead's summary and the actions open to
   the reader in that stage (accept a time, propose times, decline, record outcome, dispute). The table stays in
   view, so a person can work down the list without losing their place. Arrow keys move between rows, as in the
   phase 0 review queue.
3. **Full record.** "Open record" in the panel goes to the lead's own page: details, activity and messages side
   by side, as built in phase 0 (tabs on a phone).

The client's "To respond" is the same table filtered to Awaiting client, oldest first, with the accept,
other-times and decline actions in the side panel. This replaces the one-lead-at-a-time screen.

### 13.3 Messages: one page, plus the thread on each lead

A thread lives in one place in the data and shows in two places on screen:

- **On the lead.** The lead record's messages panel shows that lead's thread for the reader's hop (11), as in
  phase 0. This is where most lead questions get asked.
- **Messages page.** Every role has a Messages page (Fynix calls it Inbox) with two panes: on the left a table
  of the reader's threads (conversation, campaign or lead, last message, time, unread), filterable by
  conversation and by unread; on the right the open thread with its documents. A lead thread links to its lead.
- **Fynix's Inbox** also groups threads by side (client side, supply side) and offers "Forward to the other
  side" on each message, with the scrub from 11 shown before it is sent.

Unread counts show on the Messages item in the rail.

### 13.4 Carried over and revised

What carries over: the lead record with its timeline, the lead table (one stage column now, plus a source
column for Fynix and the supplier), the relay thread component, the sign-in, reset and accept-invite pages. The
client approval queue becomes the "To respond" table (13.2). The accept-invite page needs one revised comp for
an agency invited by its supplier.

## 14. Data model

All changes are additive, as the repo requires; anything removed goes in two deploys.

| Entity | State | Change |
|---|---|---|
| `organisation`, `member`, `invite`, `terms_document`, `terms_acceptance`, `audit_log`, `email_outbox`, `rate_limit`, auth tables | Built (1A to 1C) | `organisation.parent_org_id`; Fynix admin and staff roles; invites from a supplier manager; outbox gains sender domain, Reply-To and a calendar attachment |
| `campaign` | Built | `agency_org_id` now means the supplier; add campaign time zone and default meeting length |
| `agency_alias` | Built | Retired in favour of `alias_identity`; dropped in a later deploy |
| `alias_identity` | New | Member, client brand, display name, title, alias email, verified at, status |
| `agreement`, `agreement_acceptance` | New | Campaign, party (client or supplier), monthly and total target, rules, version; who accepted when |
| `campaign_share` | New | Campaign, agency, monthly share |
| `campaign_host`, `host_hours`, `host_block` | New | Hosts per campaign, weekly hours with time zone, blocked times |
| `exclusion_entry` | New | As in v1 |
| `lead` | New | Prospect fields, BANT answers, stage, host, alias identity, source org, submitter, flags |
| `meeting`, `time_proposal`, `attendance` | New | Attempts per lead, proposed times and who proposed, Meet space and link, calendar id and sequence, outcome, attendance rows |
| `dispute`, `reason_code` | New | Decline and dispute reasons (Fynix-managed lists), dispute decisions |
| `conversation`, `message`, `attachment` | New | Section 11 |
| `email_template` | New | Event, audience, campaign override, subject, body, version |
| `activity`, `notification` | New | Per-lead and per-campaign history with visibility per role; in-app centre |

## 15. Architecture

As in v1: Next.js 16, React 19, TypeScript strict, pnpm, PostgreSQL with Drizzle and row-level security, Better
Auth, Brevo through the outbox, Vitest and Playwright, Sentry without personal data, hosted on the Firstfold VPS
at `leads.fynix.digital` (D30). Additions:

| Concern | Choice |
|---|---|
| Meetings | Google Meet REST API from one Fynix Workspace account (plan chosen after gate G4) |
| Sender domain | Separate domain for all portal mail (D26), with SPF, DKIM and DMARC and a gradual start in volume |
| Calendar files | Generated by the server (RFC 5545), attached to every meeting email |
| Files | Private storage on the VPS, malware scan on upload |
| Scheduled jobs | Prospect reminders, outcome-due reminders, closing dispute windows, attendance import, digests: one cron endpoint guarded by a secret |

## 16. Privacy

- Prospects can be in the EU or UK, India, the US and elsewhere (D24), so the strictest rules apply: GDPR
  and the UK GDPR, India's DPDPA.
- The prospect's data comes from the agency, not from the prospect, so the prospect must be told who holds it.
  The prospect letter needs a short privacy line in the client's name; its wording and where it points are open
  (section 19), because the letter may not link to the portal.
- Retention: prospect data of closed leads is kept for a period to be set, then deleted or anonymised. Deletion
  on request through Fynix.
- No personal data in logs or Sentry. No recording (D19).

## 17. Acceptance criteria

1. No agency or supplier user can find any client person's email or phone in any page, response, export or
   email.
2. No client user can find the supplier's or any agency's name, or any agency person's real name, email or
   phone.
3. No email to a prospect contains "Fynix", a supplier or agency name, or a portal link.
4. No email has more than one recipient.
5. An agency sees only its own leads and share; a supplier sees only its own agencies; one client never sees
   another's data.
6. Fynix has no conversation with a partner agency, and cannot read supplier to agency conversations.
7. A lead counts only when delivered, in the month of its meeting in the campaign's time zone, toward both
   agreements.
8. A client cancel less than 24 hours before the meeting counts as a client no-show.
9. A dispute is possible only within 48 hours of delivery; after that the lead is final.
10. An unverified alias email cannot be used.
11. A duplicate or excluded lead cannot be submitted; an over-share lead is flagged.
12. Every stage change, decision and agreement acceptance is in the history with who, before, after and when.
13. A meeting time shows correctly to people in different time zones, and a reschedule moves the event in a
    calendar that imported the file.

## 18. Gates before real use

| Gate | What | Blocks |
|---|---|---|
| G1 | Second factor for Fynix users | Real data |
| G2 | Terms for each party, with non-circumvention and non-solicitation | Inviting anyone real |
| G3 | Brevo key and the sender domain (D37) set up and warmed up | Real email |
| G4 | One-day test on a Google Workspace trial: open room without the owner, attendance for people not signed in, owner's name kept out of the call, two meetings at once, calendar files in Gmail, Outlook and a company Exchange | Phase 3 build and the Workspace plan choice |

## 19. Open questions

| # | Question | Blocks |
|---|---|---|
| 1 | The sender domain name (D37) | G3 |
| 2 | Terms texts for client, supplier, agency and Fynix | G2 |
| 3 | The privacy line in the prospect letter, and where it points | Phase 3 templates |
| 4 | How long to keep prospect data of closed leads | Phase 6 |
| 5 | Which Workspace plan, after G4 | Phase 3 |
| 6 | Defaults in this spec to confirm: 30 minute meetings, 10 MB files, outcome due within 24 hours, digest every 2 hours, warnings outside 8 am to 7 pm | Each phase as it starts |

## 20. Build phases

Phases 1A (foundation), 1B (auth) and 1C (domain: organisations, members, invites, terms, campaigns, audit
log, outbox) are built and stay.

| Phase | Delivers | Needs first |
|---|---|---|
| 1D | Fynix admin: clients, suppliers and their agencies, Fynix team roles, campaigns with brief and hosts, agreements, terms, audit log | Comps approved |
| 1E | Role-shaped apps for client, supplier, agency; supplier invites agencies; shares; agreement acceptance; alias identities with verification; leak tests for all roles | 1D |
| 2 | Leads: submit, duplicates, exclusions, over-share flags, To respond, Fynix actions, history | 1E |
| 3 | Meetings: host hours, booking, Meet rooms, meeting emails and calendar files, templates, reminders, outcomes, attendance, disputes, counting | 2, G4 |
| 4 | Messaging and documents, in-app notification centre, digests | 2 |
| 5 | Dashboards and exports | 3, 4 |
| 6 | Hardening, accessibility audit, deploy | 5, G1 to G3 |
| Later | Calendar connection, recording, sending as the alias domains, Teams or Zoom rooms | |

Each phase gets its own implementation plan and ends with lint, typecheck, tests and build passing.
