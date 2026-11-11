# Fynix Leads: lead generation tracking portal

Design spec, version 1. Status: draft for review.
Date: 2026-11-11. Source brief: `Lead gen.docx` (three-party lead generation portal), corrected by the decisions below.

## 1. Purpose

Fynix sells lead generation to a **client**. Fynix subcontracts the work to a **lead generation agency**. The contract says how many qualified meetings the agency delivers each month. Today nobody can see, in one place, how many leads were submitted, how many meetings happened, and how many the client approved or rejected. This portal is that place.

Three parties use it:

| Party | Who | Does |
|---|---|---|
| Client | The company buying leads. Several users (sales reps, managers). | Reviews leads, accepts meeting times, approves, rejects or asks for clarification. |
| Agency | The subcontractor. Several users (SDRs, a manager). | Adds leads, proposes meeting times, updates meeting outcomes, answers clarifications. |
| Fynix | One admin user in v1. | Creates organisations, users and campaigns. Sees everything. Can correct records and decide on the client's behalf. |

The client believes Fynix does the work. The agency works on behalf of Fynix.

## 2. Scope

### In v1

- Organisations, users, invites, password sign-in, terms acceptance.
- Campaigns with targets and requirements.
- Leads with BANT fields, duplicate check and a client exclusion list.
- Approval workflow: approve, reject with reason, needs clarification, replacements.
- Meetings: proposal and acceptance, client free slots, Google Meet creation, outcomes.
- Relayed comment threads between client and agency, scrubbed of contact details.
- Activity history on every lead and campaign.
- Email notifications (instant and digest) and an in-app notification centre.
- Dashboards for each role, CSV and XLSX export.

### Not in v1

- Money: prices, payouts, invoices. Counts only.
- WhatsApp or SMS (pending your answer, see section 16).
- Dark mode.
- Several agencies on one campaign.
- More than one Fynix admin, or Fynix staff roles.
- File attachments (pending your answer, see section 16).

## 3. Corrections to the source brief

| Brief says | Problem | This spec |
|---|---|---|
| Client and agency never learn each other's identity | The agency pitches under the client's brand, so it must know the brand | Asymmetric isolation, section 5 |
| Meeting status "Client No-Show" only | The common case, the prospect not showing up, is missing | Both `prospect_no_show` and `client_no_show` |
| "Rescheduled by Prospect" only | The client's rep can also reschedule | One `rescheduled` outcome that records who asked |
| Approval and meeting status are independent, nothing counts | The contract number was undefined | A lead is **delivered** when its meeting is completed AND the client approved it |
| Client can approve again after every meeting change | Decisions could flip forever | A decision is final. Only Fynix can correct it, with a reason |
| Fynix gives login credentials | Passwords travel over chat or email | Invite link, user sets their own password |
| Both export rules and "agency reports" | Contradiction | Fynix and client export. Agency exports its own leads, without client contacts |
| Instant email for every event to every party | Forty emails a day for a busy campaign | Instant for key events, digest for submissions, section 10 |

## 4. Roles and what each can see

"Sees" means the server sends it. Hiding a field in the browser does not count.

| Data | Client | Agency | Fynix |
|---|---|---|---|
| Client company name and brand | Own | Yes (needed to pitch) | Yes |
| Client users: names, emails, phones | Own org | **No** | Yes |
| Agency company name | **No** | Own | Yes |
| Agency users: real names, emails | **No**. Sees each agency user's Fynix alias | Own org | Yes |
| Campaign requirements, ICP, BANT criteria, targets | Yes | Yes | Yes |
| Campaign internal notes | No | No | Yes |
| Lead prospect data (name, company, title, LinkedIn, email, phone) | Yes | Own leads | Yes |
| Approval decision and rejection reason | Yes | Yes (as "Client") | Yes, with the deciding user's name |
| Comments in the client channel and the agency channel (to Fynix only) | Client channel | Agency channel | Both |
| Relayed thread on a lead | Yes, scrubbed | Yes, scrubbed | Yes, unscrubbed original kept |
| Activity history | Client-safe events | Agency-safe events | All |
| Exclusion list | Own, editable | Matching results only ("excluded domain"), never the list | Yes |

### Fynix aliases

Every agency user has a **Fynix alias**: a display name such as "Rahul, Fynix". There are no paid Fynix accounts for agency users. Anything the client sees about an agency user uses the alias, including the name shown in Google Meet (section 9). Agency users sign in with their own email, which the client never sees.

### Override

Fynix can record an approval or rejection on the client's behalf. The record shows "Fynix on behalf of client" and a required note. The client and the agency see the decision. Only Fynix sees that it was an override.

## 5. Isolation model

Brand-only, asymmetric isolation.

1. **The client never sees the agency.** No agency name, people, emails or IDs reach a client user. Agency work appears as the work of the Fynix team.
2. **The agency sees the client's brand and offer**, because it pitches under the client's brand. It never sees the client's people, emails, phone numbers, logins or pricing.
3. **Meetings go through the platform** (section 9). The agency never needs a client rep's email address.
4. **Relayed text is scrubbed.** Rejection notes, clarification requests and replies have emails, phone numbers and URLs replaced with `[removed]` before the other side sees them. Fynix keeps the original. Messages are delivered instantly.
5. **The contract does the rest.** The terms for the client and the agency include non-circumvention and non-solicitation clauses. Each user accepts them on first sign-in and the accepted version is stored.

### How it is enforced

- **Role-shaped responses.** Every server read goes through a per-role serializer (`toClientView`, `toAgencyView`, `toFynixView`). Fields not in the view never leave the server. No generic "return the row" endpoints.
- **Database row-level security** on every tenant table, so a query bug in one page cannot read another organisation's rows.
- **Opaque public IDs.** Records are addressed by public references (`CMP-7Q2X`, `LD-4K9P`). Internal database IDs, organisation IDs and user IDs never reach the browser for the other party.
- **Leak tests.** For each role, an automated test calls every read path and asserts that no forbidden field or value (the other org's name, any of its user emails) appears anywhere in the response. These map to the acceptance criteria in section 15.

Isolation raises the cost of a leak. It cannot stop a prospect forwarding an invite. The contract covers that.

## 6. Domain model

All times are stored in UTC (`timestamptz`). Every user has a time zone on their profile.

| Entity | Key fields | Notes |
|---|---|---|
| `organisation` | kind (`fynix`, `client`, `agency`), name, brand name, status | Brand name is what the agency sees |
| `user` | org, name, email, time zone, role in org (`member`, `manager`), status | |
| `agency_alias` | user, display name | One per agency user |
| `invite` | email, org, expires at, used at | Single use, 7 day expiry |
| `terms_version` / `terms_acceptance` | party kind, version, text; user, version, accepted at, IP | |
| `campaign` | public ref, name, client org, agency org, start, end, monthly target, total target, geography, industries, company size, ICP, job titles, seniority, technologies, BANT criteria, instructions, internal notes, status | One agency per campaign |
| `exclusion_entry` | client org, kind (`domain`, `email`, `company`), value | Uploaded or typed by the client |
| `lead` | public ref, campaign, status, prospect name, company, company domain, title, LinkedIn URL, email, phone, BANT answers (4 fields), submitted at, replaces lead (nullable), created by | |
| `decision` | lead, outcome (`approved`, `rejected`), reason code, note, decided by, on behalf of client (bool), decided at | One per lead, final |
| `rejection_reason` | code, label, active | Preset list managed by Fynix |
| `meeting` | lead, status, starts at, ends at, proposed by, accepted by, Google event ID, Meet link, outcome, outcome note, rescheduled by | See the open question in section 16 |
| `meeting_proposal` | meeting, proposed slots (1 to 3), status | |
| `availability_slot` | client user, starts at, ends at, recurring rule (nullable) | Free slots, set per client rep |
| `thread_message` | lead, channel (`relay`, `client_fynix`, `agency_fynix`), author, body original, body scrubbed, created at | |
| `activity` | subject (campaign or lead), actor, actor role, action, before, after, visible to (set of roles), created at | Append only |
| `notification` | user, event, subject, read at | In-app centre |
| `email_outbox` | to, template, payload, status, provider ID, sent at, delivery status | Every email goes through it |

### Meetings and the open question

Meetings are a separate table so the answer to "one meeting per lead or several" changes a constraint, not the design. If your seniors say one, a unique index on `meeting.lead` enforces it. If several, the lead shows a meeting list.

## 7. Lead lifecycle

```
draft ──submit──> pending ──approve──> approved
                     │
                     ├──reject (reason)──> rejected ──> replacement owed
                     │
                     └──clarify (note)──> needs_clarification ──agency replies──> pending
```

- **Draft**: only the agency sees it. Editable.
- **Submit** runs the duplicate check and the exclusion check (section 8). The lead becomes `pending` and the client and Fynix are notified.
- **After submit** the agency cannot edit prospect fields. It can only answer a clarification, and its answer may update fields. Each change goes into the activity history.
- **Decisions are final.** Fynix can correct a decision with a note.
- **No auto-approval.** Pending leads stay pending. The client gets reminders (section 10).
- **Replacement owed**: a rejected lead adds one to the campaign's "owed" count. When the agency submits a lead marked "replaces LD-xxxx", the owed count drops.

### Delivered

A lead is **delivered** when it is `approved` AND it has a meeting with status `completed`. Both can happen in any order. Delivered counts drive targets and dashboards.

Which month a delivered lead counts toward is open (section 16). The model stores submit time, approval time and meeting time, and one function decides the month, so the rule can change without a migration.

## 8. Duplicates and exclusions

On submit, the server checks the new lead against:

1. Other leads for the same client (any campaign): same email, or same LinkedIn URL after normalising it.
2. The client's exclusion list: email domain, exact email, or company name.

A duplicate blocks submission and names the existing lead's ref (if the agency can see it) or says "already submitted for this client". An exclusion match blocks with "this company is on the client's exclusion list". The agency never sees the list itself.

## 9. Meetings

### Meeting statuses

| Status | Set by | Meaning |
|---|---|---|
| `proposed` | Agency | Agency proposed 1 to 3 times. Waiting for the client |
| `scheduled` | Client accepts, or agency picks a client free slot | Google Meet created, invites sent |
| `rescheduled` | Agency or client | New time agreed. Records who asked |
| `completed` | Agency | Meeting happened |
| `prospect_no_show` | Agency | Prospect did not join |
| `client_no_show` | Agency | Client rep did not join |
| `prospect_declined` | Agency | Prospect cancelled or declined |
| `cancelled` | Agency or Fynix | Called off for another reason |

### Flow

1. Each client rep publishes their own free slots. The agency picks a rep's free slot, or proposes up to 3 times to a rep.
2. If it picks a free slot, the meeting is scheduled at once. Otherwise the rep accepts one of the proposed times (or declines with a note) in the portal or from the email.
3. On scheduling, the server creates a Google Calendar event with a Meet link from a Fynix Google Workspace account (`meetings@fynix.digital`, through a service account with domain-wide delegation). Calendar guests: the prospect and the client rep only. `guestsCanSeeOtherGuests` is off.
4. The agency user is **not** a calendar guest. The portal shows them the time and the Meet link, and emails both to their own address from the portal. They join as a guest, not signed in to Google, under their Fynix alias name. The email and the meeting page say this plainly, and the agency terms require it.
5. The Meet space's access type is set to open (Google Meet API), so nobody has to admit the agency user or the prospect. To verify in phase 3: that the Meet API allows this on Fynix's Workspace plan.
6. Reschedules update the same event. Old times stay in the activity history.

Known limit: if an agency user joins while signed in to their own Google account, Meet shows their real name. The portal cannot prevent that. The terms and the join instructions cover it.

### Time display

Each person sees times in their own zone, with the zone named: "Tue 12 Nov, 3:00 pm IST". Under it, the other side's time: "9:30 am GMT for the client". A slot outside 8 am to 7 pm for either side gets a warning.

## 10. Notifications

Every email goes through the outbox, is sent by Brevo, and records delivery status (delivered, bounced) in the activity history. Emails are Fynix branded and never contain the other party's identity.

| Event | Client | Agency | Fynix | Timing |
|---|---|---|---|---|
| Lead submitted | Notify | Confirm (in-app only) | Notify | Batched: one email every 2 hours listing the new leads, sent only if there are any |
| Meeting proposed | Notify, with accept buttons | Confirm (in-app only) | Notify | Instant |
| Meeting scheduled or rescheduled | Notify | Notify | Notify | Instant |
| Meeting outcome changed | Notify | Confirm (in-app only) | Notify | Instant |
| Lead approved | Confirm (in-app only) | Notify | Notify | Instant |
| Lead rejected | Confirm (in-app only) | Notify, with reason | Notify | Instant |
| Clarification requested | Confirm (in-app only) | Notify | Notify | Instant |
| Clarification answered | Notify | Confirm (in-app only) | Notify | Instant |
| Leads pending approval | Reminder | | Copy | Daily at 9 am client time, only if any lead has been pending over 24 hours |
| Monthly target met | Notify | Notify | Notify | Instant |
| Campaign total target met | Notify | Notify | Notify | Instant |

Every notification carries the campaign ref, lead ref, action, previous and new status, time in the reader's zone, and a link to the record.

"Confirm (in-app only)" means the actor sees it in the notification centre but gets no email about their own action.

## 11. Dashboards and exports

| Role | Shows |
|---|---|
| Client | Per campaign: delivered vs monthly target and total target (bullet graph), pending approvals with how long each has waited, meetings this week, approved, rejected, replacements owed |
| Agency | Per campaign: the same targets, leads awaiting client decision, clarifications to answer, rejections with reasons, upcoming meetings, meeting outcomes |
| Fynix | Every campaign in one table: delivered vs target, pending count, oldest pending age, median approval time, rejection rate, owed replacements. Filters by client and agency |

Rules: at most 6 KPI tiles per page, every number links to the filtered lead table behind it, comparisons are spelled out ("of 40 target", "vs October").

Exports: CSV and XLSX of the lead table as filtered. Client and Fynix exports include everything they can see. Agency exports contain its own leads and no client user data.

## 12. Accounts and sign-in

- Fynix creates the organisation and invites users by email. The invite link (single use, 7 days) lets the user set a password.
- Password rules: at least 12 characters, checked against known breached passwords.
- The Fynix admin also has an authenticator-app code (TOTP).
- Sessions expire after 14 days, or 12 hours for Fynix.
- Rate limits on sign-in, invite and reset.
- First sign-in shows the current terms for that party. The user must accept to continue. A new terms version asks again.

## 13. UI system

The portal has its own design system. It takes Fynix's colours, not the website's or the platform's tokens.

### Foundation

| Layer | Choice |
|---|---|
| Components | shadcn/ui (CLI v4) on Base UI, restyled to our tokens. No component ships in its default look |
| Styling | Tailwind CSS v4, tokens in one `@theme` file |
| Tables | TanStack Table v9 with server-side sort, filter and pagination, one shared compact `DataTable` |
| Charts | shadcn charts (Recharts 3), plus a small custom bullet graph |
| Dates | react-day-picker v9, date-fns v4 with `@date-fns/tz` |
| Forms | react-hook-form and zod v4, server actions validate with the same schema |
| Feedback | Sonner toasts, cmdk command palette (Ctrl+K) |
| Icons | Phosphor, regular weight, one family only |
| Type | Geist for UI, Geist Mono for refs and IDs, tabular numbers everywhere |
| Theme | Light only in v1. Tokens are semantic so dark mode can be added later |

### Tokens

- **Primary**: Fynix navy `#0C1E2E` for primary buttons, selected navigation and focus.
- **Accent**: peach `#E9AF88` for selection highlights and small markers only. Never text, never a large fill.
- **Neutrals**: a new 12-step warm grey scale starting from off-white `#FCFCFB`. Borders are low contrast.
- **Approval status** carries colour: pending amber, approved green, rejected red, clarification blue. Each also has an icon and a text label.
- **Meeting status** is an icon and text in neutral grey. Only problem outcomes (no-show, declined, cancelled) are tinted. Two status chips on one row never compete for colour.
- **Shape**: 6px radius on controls, 8px on panels. No shadows except popovers and dialogs.
- **Density**: table rows about 40px, 14px body text, 13px table text.
- **Motion**: 150 to 200ms for state changes only. No decorative animation. Reduced motion respected.

### Screen patterns

- **Client review queue**: a triage inbox. One lead at a time with all its fields and the meeting. Keys: `A` approve, `R` reject (preset reason list plus optional note), `C` clarify. The next lead opens after each decision. Each row shows how long it has waited.
- **Lead record**: fields in a side panel. The main area is the activity timeline, with system events collapsed so people's actions stand out, and the relayed thread.
- **Lead table**: two status columns (approval, meeting), saved filters, column chooser, bulk export.
- **Meeting picker**: choose a client rep, see that rep's free slots as a week grid in the viewer's zone, plus "propose other times".
- **Empty, loading and error states** for every screen. Skeletons match the final layout.

### Not allowed

Gradient or glowing KPI cards, an icon tile on every metric, a sparkline in every card, gauges or donuts for target vs actual, trend arrows without a stated comparison, purple or neon accents, decorative status dots, emoji, em dashes in any copy, invented sample names like "John Doe" or "Acme".

### Process

1. Build the tokens and a design system page (`/dev/system`) showing every component in every state. Review it before any screen.
2. Build a clickable prototype of three screens with sample data: client review queue, lead record, agency lead table. You and your seniors click through it before backend work starts.
3. Each screen is planned and built with impeccable (dashboard mode) and the shadcn skill, then reviewed with impeccable critique and audit, the accessibility skill, Vercel's web interface guidelines, and screenshot QA at desktop and mobile widths.

## 14. Architecture

| Concern | Choice |
|---|---|
| Repo | `fynix-leads`, standalone. `development` for work, `main` for production via PR |
| App | Next.js 16 (App Router), React 19, TypeScript strict |
| Package manager | pnpm |
| Database | PostgreSQL on the Firstfold VPS, Drizzle ORM and migrations, row-level security |
| Auth | Better Auth (invites, passwords, TOTP for Fynix) |
| Email | React Email 6 templates, Brevo transport, outbox table |
| Calendar | Google Calendar API, service account on Fynix Google Workspace |
| Scheduled jobs | Digests and reminders run from a cron endpoint guarded by a secret, called by the VPS crontab |
| Errors | Sentry, with request bodies and personal data excluded |
| Hosting | Firstfold VPS behind nginx, domain to be decided (for example `leads.fynix.digital`) |
| Tests | Vitest for logic, integration tests against a test database for RLS and leak tests, Playwright for the three key flows |

Code layout: domain logic (lifecycle, delivered rule, scrubbing, visibility) lives in plain TypeScript modules with unit tests, separate from pages and UI components.

## 15. Acceptance criteria

1. An agency user cannot find any client user's name, email or phone in any page, API response, export or email.
2. A client user cannot find the agency's name or any agency user's real name or email anywhere.
3. One agency cannot see another agency's campaigns. One client cannot see another client's campaigns.
4. Submitting a lead notifies the client and Fynix.
5. Changing a meeting outcome notifies the client and Fynix.
6. The client can approve, reject with a reason, or ask for clarification. A rejection without a reason is refused.
7. The agency sees each decision as coming from "Client", with the reason.
8. Every status change and decision is in the activity history with actor, before, after and time.
9. A lead counts as delivered only when approved and its meeting is completed.
10. Relayed messages never contain an email address, phone number or URL.
11. A duplicate or excluded lead cannot be submitted.
12. A meeting time is shown correctly to two users in different time zones.

## 16. Open questions

| # | Question | Blocks |
|---|---|---|
| 1 | Can one lead have more than one meeting? (asking your seniors) | Meeting UI only, model is ready for both |
| 2 | Which month does a delivered lead count toward: meeting, approval or submission month? And in which time zone is that month read (the prototype uses the campaign zone, Europe/London)? | Monthly dashboards and target emails |
| 3 | Decided 2026-11-11: agency users join Meet as named guests under their Fynix alias. No paid seats | |
| 4 | Do you have drafts of the terms for the client, the agency and Fynix, including non-circumvention? | First sign-in |
| 5 | Will prospects include people in the EU or UK (GDPR), or only India (DPDPA) and elsewhere? | Retention and consent rules |
| 6 | Will the agency attach files to leads (call recordings, notes)? | Storage |
| 7 | Is email plus in-app enough for v1, or is WhatsApp needed? | Notifications |
| 8 | Which domain: `leads.fynix.digital` or another? | Deploy |
| 9 | Decided 2026-11-11: free slots are set per client rep | |
| 10 | Decided 2026-11-11: the Fynix admin signs in with a password only for now. A second factor (TOTP or passkey) must be added before any real client or agency data is entered | Admin sign-in (phase 1 gate G1) |
| 11 | Decided 2026-11-11: the app runs at leads.fynix.digital and the Fynix admin is at /admin on the same host | |

## 17. Build phases

| Phase | Delivers |
|---|---|
| 0 | Repo scaffold, tokens, design system page, clickable prototype of 3 screens with sample data. Your review |
| 1 | Database, auth, invites, terms, organisations, users, campaigns (Fynix side) |
| 2 | Leads, duplicate and exclusion checks, approval workflow, replacements, activity history, leak tests |
| 3 | Meetings, free slots, Google Meet creation, outcomes |
| 4 | Notifications: outbox, Brevo, instant emails, digests, reminders, in-app centre |
| 5 | Dashboards, bullet graphs, exports |
| 6 | Hardening: rate limits, Sentry, Playwright flows, accessibility audit, deploy to the VPS |

Each phase gets its own implementation plan, and ends with lint, typecheck, tests and build passing.
