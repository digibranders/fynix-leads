# Fynix Leads v2: workflow review, upgrade plan and UI plan

Status: draft for discussion. Nothing here is decided until the owner answers the questions in section 12.
Date: 2026-11-12. Source: the owner's brief in chat on 2026-11-12, checked against the v1 spec
(`2026-11-11-leadgen-portal-design.md`) and what phases 1A to 1C built.

## 0. Owner decisions (2026-11-12, second round)

These override anything below that says otherwise.

| # | Decision |
|---|---|
| D1 | Agencies reach prospects under a **client-brand alias**, for example `gaurav@upwind-io.com` for the client Upwind. To the prospect the agency person is part of the client's team. Fynix is not in the picture for the prospect. This replaces v1's "Fynix alias" |
| D2 | The supplier A can find prospects and book meetings itself, as well as through its agencies P, Q, R |
| D3 | Hide **emails and phone numbers** only. Names and companies are shown |
| D4 | A is trusted by Fynix. No protection is needed against Fynix bypassing A |
| D5 | Lines of contact: P, Q, R talk to A; A talks to Fynix; Fynix talks to the client. No direct line between Fynix and P, Q, R |
| D6 | A client no-show means the agency's work is done: the lead is complete and counts toward both targets (Fynix bills C, Fynix pays A) |
| D7 | No messages between client and agency. Everything goes through Fynix (and A, for P, Q, R) |
| D8 | Fynix may check a lead but does not have to. No mandatory review step |
| D9 | Fynix has no Zoom or Google Workspace subscription yet. The provider is open. Ignore the Pavel workshop's Zoom code in fynix-digital-v2 completely |
| D10 | Client check (Q1): the client accepts or declines the lead before the meeting, and has a **48 hour** window after it to flag "not as described". Fynix decides disputes |
| D11 | Alias domains and mailboxes (for example `upwind-io.com`) are owned by supplier A or the agency |
| D12 | Who sends the prospect's invite and reminders: **to discuss in detail** (N2) |
| D13 | Client cancel less than 24 hours before = client no-show (counts). A client reschedule made earlier is free. No automatic "10 minutes late" rule |
| D14 | Prospect no-show: A or P, Q, R reschedule it. No fixed limit on rebooks |
| D15 | The client sees only the alias, never the supplier or agency names |
| D16 | Fynix sees which agency each lead came from, for counting. Only A invites and removes P, Q, R users |
| D17 | Submissions beyond an agency's share, or beyond the target, are allowed and flagged for Fynix |
| D18 | Availability: hosts type working hours and blocked times now; calendar connection later |
| D19 | The agency person always joins. Fynix staff may join some meetings. Recording is **out of scope for now** (owner, 2026-11-12) |
| D20 | A Delivered lead counts in the month the meeting was held (campaign time zone) |
| D21 | A sees only its own target Y, never the client's X |
| D22 | Contracts are **virtual**: targets and terms agreed inside the portal for trust and confidence, not a legal document. No PDF upload |
| D23 | Fynix team: admin and staff roles |
| D24 | Prospects can be in the EU or UK, India, the US and elsewhere. So GDPR, DPDPA and others apply. No WhatsApp in v1 (email plus in-app) |

Consequences to settle in spec v2:

- **Deferred with D19, kept for later:** recording with prospects in the EU and UK (D24) needs a recording notice in the prospect's invite and
  at the start of the call, a retention period, and a way to delete on request. It also narrows the provider:
  cloud recording needs Zoom Pro, and Meet recording needs Workspace Business Standard or higher (third-party
  figures, check in the G4 test). Who may watch recordings: Fynix only, or the client too?
- **No rebook limit (D14)** needs another way to close a stuck lead. Suggested: A or P can withdraw it, and
  Fynix can mark it Lost.
- **Virtual contracts (D22)**: an "agreement" screen where Fynix sets targets and terms, and the client (or A)
  accepts them in the portal. Each change asks for acceptance again and is kept in the history.

## 1. The business as I understand it

| Party | In the brief | Portal role | Notes |
|---|---|---|---|
| C | The client company (for example cyber security). Many users | **Client** | Buys X qualified meetings a month from Fynix. Users include the people who take meetings (Simarpreet) |
| B | Fynix | **Fynix** | Middleman. Sells to C, buys from A. Sees everything |
| A | A person or an organisation with a network of lead generation agencies | **Supplier** (new name, see 4.1) | Contracts with Fynix for Y meetings a month. May do the work itself or pass it to P, Q, R |
| P, Q, R | Agencies working for A | **Partner agency** (new) | Find prospects, book meetings, join them, record the outcome |
| Vijendra | The prospect, CISO at company Z | **Prospect** (no login) | Never has an account. Gets an invite and reminders |

Today's flow: P finds a prospect, reads Simarpreet's calendar, agrees a time with the prospect, sends the lead
and time to a WhatsApp group, Simarpreet confirms, P books a Google Meet by email, all three attend, P marks it
done in a Google Sheet.

Today's problems: no tracking, no notifications, no record of acceptance or rejection, no count by source, and
every party sees every other party's phone number and email, so P can go straight to C and cut out A and Fynix.

## 2. Is the current build going in the right direction?

Mostly yes. The v1 spec already solved the core privacy problem the same way the brief asks: the platform books
the meeting from a Fynix account, the agency joins under a Fynix alias, the client never sees the agency, the
agency sees only the client's brand, and relayed text is scrubbed. Phases 1A to 1C (database isolation, roles,
sign-in, invites, terms, audit log, email outbox) carry over unchanged.

What does not fit the new brief:

| v1 spec | New brief | Change |
|---|---|---|
| One agency per campaign | A plus any number of sub-agencies under A | Add a second supplier level (section 4) |
| Only Fynix invites people | A invites P, Q, R | A gets a limited, audited invite right |
| Lead is delivered when the meeting is completed AND the client approves it afterwards | The client accepts the time before the meeting; the meeting being held is what counts; a client no-show also counts | New lifecycle (section 5). The client's judgement moves before the meeting, plus a short dispute window after |
| Client never sees agency people; agency never sees client people's names | Agency sees the name of the client contact it books with | Agency sees the host's first name and title only. It sees them in the meeting anyway |
| Free slots typed in by each client rep | Calendar availability read through OAuth | Both: typed hours first, calendar connection as an upgrade (section 8) |
| Relayed comment threads on a lead, no attachments | A real chat with documents | Messaging with attachments (section 7) |
| One target per campaign | Two contracts: Fynix to C (X) and Fynix to A (Y), plus A's split to P, Q, R | Two ledgers (section 6) |
| Fynix admin screens (phase 1D) designed for one agency | | Not started yet, so nothing to throw away. Comps get redone for the new structure |
| Prototype screens: client approval queue, lead record, agency lead table | | Approval queue becomes the "To confirm" queue. Lead record and table carry over with new columns |

## 3. Corrections and things the brief misses

1. **Perfect isolation is not possible, and the plan should say so.** In the meeting itself everyone sees each
   other's names and faces. Simarpreet's name plus company C is enough to find her on LinkedIn. The portal can
   stop the casual leaks (no shared WhatsApp group, no email threads, no phone numbers, no calendar guest
   lists) and it can keep a record of every contact. What actually stops P from going direct is the contract:
   non-circumvention and non-solicitation clauses with a penalty and a tail period (for example 12 months),
   accepted by every user on first sign-in. The terms are already open question 4 in v1 and are now urgent.
2. ~~The same bypass risk exists one level down.~~ Closed by D4 and D5: A is trusted, and Fynix has no line
   to P, Q, R.
3. **The prospect is the weak point for no-shows, and nobody owns them today.** Most lost meetings are prospect
   no-shows. The portal should send the prospect a branded invite, a reminder the day before and an hour
   before, and a private link to confirm, ask for a new time or cancel. This needs no account and exposes no
   one's email.
4. **"Marked completed by P" is the agency grading its own work.** P is paid per meeting, so P has a reason to
   mark everything held. If Fynix hosts the meeting on Zoom, Meet or Teams, the provider reports who joined
   and for how long. The portal can pre-fill the outcome from that and flag any mismatch with what P records.
   This is also the fair way to settle "client no-show" versus "prospect no-show".
5. **Client no-show needs a rule for lateness and late cancels.** Suggested defaults: the client host has 10
   minutes' grace; a client cancel less than 24 hours before counts as a client no-show; a client reschedule
   made earlier than that does not count against anyone.
6. **Client quality judgement is missing from the new flow.** If the only check is "meeting held", a
   prospect who is not really a CISO, or has no budget, still counts. The client needs two checkpoints: before
   the meeting (accept the time, or decline the lead as off brief) and a short window after it (flag "not as
   described"), with Fynix deciding disputes.
7. **Over-delivery.** If A's agencies book more meetings than C pays for, Fynix pays A for meetings it cannot
   bill. The portal should show each allocation's remaining count and stop or flag submissions past it.
8. **Duplicates across agencies.** P and Q may both find Vijendra. v1's duplicate and exclusion checks still
   apply and now also say which agency got there first.
9. **Personal data.** The prospect's details pass through four organisations. The prospect invite needs a
   short privacy notice, and retention rules depend on where prospects live (v1 question 5: GDPR or DPDPA).

## 4. Organisations and who sees what

### 4.1 Names

"Supplier" for A and "partner agency" for P, Q, R. A can also act as its own agency: when A is one person or
does the work itself, A's users submit leads directly and there are no sub-agencies.

### 4.2 Visibility

"Sees" means the server sends it (same rule as v1).

| Data | Client C | Supplier A | Agency P | Fynix |
|---|---|---|---|---|
| Client brand, offer, campaign brief (ICP, BANT) | Own | Yes | Yes | Yes |
| Meeting host: full name, title, company (D3) | Own | Yes | Yes | Yes |
| Client people: emails, phones, full list of users | Own | No | No | Yes |
| Host availability | Own | Free or busy blocks only | Free or busy blocks only | Yes |
| Supplier A's name | No | Own | Yes | Yes |
| Agency names (P, Q, R) | No (to confirm, N3) | Its own agencies | Own | As the source of each lead (to confirm, N4) |
| Agency people: real names, emails | No. Sees each person's client-brand alias with its alias email, for example "Gaurav, Upwind, gaurav@upwind-io.com" (D1, D36) | Its agencies' people | Own org | Aliases on leads; no line of contact (D5) |
| Prospect details | Yes | Its agencies' leads | Own leads | Yes |
| Client target X | Yes | No (to confirm, Q8) | No | Yes |
| Supplier allocation Y | No | Yes | Its own share | Yes |
| Money | Not in the portal in v1 | | | |

## 5. Lead lifecycle (proposed)

One stage that everyone reads, instead of v1's two separate status columns:

```
Draft ─submit─> Awaiting client ─client accepts a time─> Scheduled ─meeting time passes─> Outcome due
                  │       │                                  │                              │
                  │       └─client proposes other times──┐   └─rescheduled (new time)       ├─ Meeting held ──────> Delivered
                  │                                      │                                  ├─ Client no-show ────> Delivered
                  └─client declines (reason)─> Declined  └─agency picks one─> Scheduled     ├─ Prospect no-show ──> Rebook ─> Awaiting client
                                                                                            │                       (no limit; withdraw or Fynix marks Lost)
                                                                                            └─ Prospect cancelled ─> Lost

Delivered ─(client flags "not as described" within 48 hours)─> Disputed ─Fynix decides─> Delivered or Rejected
```

| Stage | Who acts | Counts toward targets |
|---|---|---|
| Draft | Agency | No |
| Awaiting client | Client: accept a proposed time, propose other times, or decline with a reason | No |
| Scheduled | Nobody; reminders go out | No |
| Outcome due | Agency records the outcome; the form is pre-filled from attendance data | No |
| Delivered (meeting held) | | Yes |
| Delivered (client no-show) | | Yes (to confirm, Q6) |
| Rebook | Agency proposes new times | No |
| Declined, Lost, Rejected | | No. A replacement is owed |
| Disputed | Fynix | Not until decided |

On terminology: use **Meeting held** for the outcome and **Delivered** for the counted result. "Completed" is
ambiguous (the meeting or the lead?).

## 6. Contracts and counting

Two ledgers, kept apart:

- **Client contract (Fynix to C):** X meetings a month, the brief, the dispute window, the client no-show rule.
- **Supplier contract (Fynix to A):** Y meetings a month for that campaign. A splits Y into shares for P, Q, R
  inside the portal (A's own business; Fynix sees it).

Both ledgers should use the same counting rules, otherwise Fynix pays A for a meeting it cannot bill C for
(client no-shows are the obvious case). The "which month does it count toward" question from v1 is still open;
the meeting date in the campaign's time zone is the natural answer now that the meeting is the deliverable.

## 7. Messaging

A chain, never a shortcut (D5, D7): client to Fynix, Fynix to A, A to P.

| Conversation | Who | Notes |
|---|---|---|
| Fynix and client | Fynix staff, client users | Per campaign, plus a thread on each lead |
| Fynix and supplier | Fynix staff, A's users | Per campaign, plus a thread on each lead |
| Supplier and its agency | A's users, P's users | Per agency, plus a thread on each lead. Fynix does not read it |

A question from the client about a lead travels Fynix, then A, then P, and the answer comes back the same way.
Each hop is its own thread on the same lead, and a person can forward a message to the next hop in one click.

- Documents: PDF, Word, Excel, images, with a size limit, stored on the VPS (or object storage), scanned for
  malware.
- Because Fynix sits in every chain that crosses the client and supplier boundary, Fynix decides what to pass
  on. Scrubbing of emails and phone numbers still runs on what Fynix forwards, as a safety net.

## 8. Meetings

### 8.0 The owner's meeting design (2026-11-12, supersedes 8.1 where they differ)

| # | Decision |
|---|---|
| D25 | The portal creates an **open Google Meet room with no invitees** (Meet API, access type open). No calendar event is created by Google, so there is no guest list |
| D26 | All portal mail, meeting emails included, comes from a **separate sender domain** (name to choose) |
| D27 | Each meeting email holds: prospect company, client company, date and time, the Meet link, and add-to-calendar buttons (Google, Outlook, plus a calendar file for the rest) |
| D28 | Recipients: the agency person who booked it, **all** the client's contacts, Fynix, and the prospect. The prospect's email comes from the new domain under the client's brand |
| D29 | The portal sends the prospect's reminders |
| D30 | The portal stays at `leads.fynix.digital`. Agencies will see "fynix" in links; accepted |

Rules this design needs:

1. **One email per person.** Never one email with several people in To or CC.
2. **The prospect's emails contain no portal link and no Fynix name**, only the meeting details, the Meet link
   and the calendar buttons. Suggested: the Reply-To is the agency's alias address (for example
   `gaurav@upwind-io.com`), which the prospect already knows, so "can we move it?" lands with the agency. That
   needs each alias address stored in the portal (shown to the client? to confirm).
3. **A calendar file (.ics) with a fixed id rides along with every email,** so a reschedule or cancel moves or
   removes the event in calendars that imported it. The Google and Outlook buttons add a copy that cannot be
   updated, so the reschedule email says plainly "remove the old time".
4. **Nobody hosts the room.** The owning Fynix account never joins. Test: whether the room opens without the
   owner, and what attendance data an open room gives for people who are not signed in. (Automatic recording
   is deferred with D19.)
5. **Fynix staff who join** (D19) do so under a client-brand display name, not signed in to a Fynix account,
   because the prospect must not see Fynix (D1).
6. **The sender domain is visible to the prospect**, so its name should read like a neutral scheduling service.
   It needs SPF, DKIM and DMARC records and a few weeks of gradual sending before volume, or the first invites
   land in spam. A CISO's mail filter is the strictest audience there is.

### 8.0.1 Alias identities and email templates (2026-11-12)

| # | Decision |
|---|---|
| D31 | An agency person keeps **several alias identities**: display name, title, alias email, client brand. Each person adds and manages their own; their manager and A can see them |
| D32 | An alias email must be **verified by a code** sent to that mailbox before it can be used |
| D33 | At booking, the agency picks which identity the prospect's emails use. The prospect sees that alias in the signature, and replies go to that alias address (Reply-To). The technical sender stays the new domain |
| D34 | Supplier A gets a copy of every meeting email when one of its agencies books |
| D35 | Templates: Fynix sets them. One default set, a per-campaign override for the prospect letter, and a short optional note the agency types at booking. Confirmed by the owner 2026-11-12 |
| D36 | The client sees the agency's alias identities in full: alias name, title and alias email (for example `gaurav@upwind-io.com`). Still never the agency person's real name or real email |
| D37 | Sender domain name: the owner will give it later. Blocks sending real portal mail (gate G3) |

Templates: one per audience (prospect, client contacts, agency and A, Fynix) for each event (booked,
rescheduled, cancelled, reminder a day before, reminder an hour before). Only the prospect's is a personal
letter; the others are portal notices. The prospect's never names Fynix, A or the agency, and has no portal
link.

Draft default prospect letter (placeholders in braces):

```
Subject: Confirmed: {client_brand} and {prospect_company}, {meeting_date}

Dear {prospect_first_name},

Thank you for your time. Your meeting with {host_name}, {host_title} at {client_brand}, is confirmed.

Date: {meeting_date}
Time: {meeting_time_prospect_zone} ({duration} minutes)
Join: {meet_link}

[Add to Google Calendar]  [Add to Outlook]  [Calendar file]

{agency_note}

If you need a different time, just reply to this email.

Best regards,
{alias_name}
{alias_title}, {client_brand}
{alias_email}
```

### 8.1 The answer to "can we book without sharing emails": yes

Do not let the meeting provider send invites at all. Fynix creates the meeting room from its own account, then
the portal emails each person their **own** calendar invite (.ics) from `meetings@fynix.digital`:
organiser = Fynix, one attendee = that person. Nobody's invite contains anyone else's address, so there is no
guest list to leak. Join buttons also sit on the portal's meeting page and on the prospect's private page.

Because of D1 the prospect must never see Fynix. So the sender differs by person:

| Person | Gets | From | Sees of the others |
|---|---|---|---|
| Client host (Simarpreet) | Invite, Join in the portal | Fynix (C knows Fynix) | Prospect's details (they are the lead), the agency person's alias |
| Prospect (Vijendra) | Invite, reminders, private confirm or reschedule page | The client-brand alias the prospect already knows, on the alias domain (N1, N2) | Host's name and company, the alias. No Fynix anywhere |
| Agency person (P) | Invite, Join in the portal | The portal | Host's name, title and company, prospect details it already had |

The meeting itself is titled under the client's brand ("Upwind and Company Z"). The Fynix account that owns
the room never joins, so its name does not show in the call (to confirm in the G4 test).

Calendar replies (RSVPs) go to the Fynix mailbox and are not relied on. Confirmation happens in the portal and
on the prospect page. Updates reuse the same invite id with a higher sequence number so calendars move the
event instead of adding a second one.

What this cannot hide: names and faces inside the call, and anything people say. That is the contract's job
(section 3, point 1).

### 8.2 Which video provider

| Option | Cost | Attendance data | Prospect trust | Effort | Verdict |
|---|---|---|---|---|---|
| **Zoom**, Fynix's account | Pro about $14 a user a month on annual billing, $17 monthly (third-party figures, check zoom.us). Participant reports need Pro or higher. Fynix has no subscription yet (D9); the Pavel workshop code in fynix-digital-v2 uses a Zoom account whose owner is to confirm (N6) | Join and leave times per person. With registration, each person gets a unique join link, so the report maps to the right person | High | Low | **Recommended for v1** |
| Google Meet API, Fynix Workspace | Business Starter about $7, Standard about $14 a user a month on annual billing (third-party figures). Which edition gives the API's attendance records is unconfirmed | Join and leave times, but people not signed in are identified only by the name they typed | High | Medium | Good second option |
| Microsoft Teams | Needs a licensed Fynix Teams user and admin policy setup | Good | Highest inside enterprises | High | Only if clients insist |
| Own room (LiveKit, Jitsi, Daily) | $0 to about $50 a month at this volume | Full control | Lowest: an unknown meeting link sent to a CISO looks like phishing, and corporate firewalls often block it | Weeks of work | **Not for v1** |

For a cyber security client whose prospects are CISOs, an unfamiliar meeting domain is the biggest risk to
turn-up rates. That rules out building our own room for now. It stays a v2 option if full control of identity
ever matters more than trust.

### 8.3 Availability

| Step | How | Why |
|---|---|---|
| v1 | Each host types working hours and blocks time in the portal. The agency sees free blocks only | Works for every client, no IT approval |
| v2 | "Connect calendar": Google free/busy scope or Microsoft `getSchedule`. Reads busy times only, never event details | Security-minded companies often block staff from connecting third-party apps, and Google may require app verification. So it is an add-on, not the base |

### 8.4 Must be tested before we commit (gate G4)

A one-day spike with real accounts (Gmail, Outlook, a company Exchange mailbox):

1. Our own .ics invites arrive as proper invites in each, and updates move the event.
2. Zoom: link-only join and registration with Zoom's own registrant emails switched off; what other
   participants see (display name only?); the participant report on Fynix's plan.
3. If Meet stays in the running: which Workspace edition allows open access, and whether an email shows on
   hover in the people panel.
4. Two meetings at the same time on the one Fynix host account (two agencies booking the same slot). Zoom may
   limit one host to one live meeting at a time.
5. The room owner's name stays out of the call when the owner never joins.

Both providers can be tested on a free trial or one month's subscription, so the test costs at most one month
of one account. The choice is made from the results.

Sources and unconfirmed points are in the research notes from 2026-11-12 (Google Calendar and Meet API
references, Zoom rate limits and reports, Microsoft Graph application access policy, LiveKit quotas).

## 9. Data model changes

All additive to what 1A to 1C built (migrations stay additive, as the repo requires).

| Change | Why |
|---|---|
| `organisation.parent_org_id` for agencies (P, Q, R point at A; two levels at most) | Supplier and partner agencies |
| `campaign.agency_org_id` stays and now means the supplier A | Existing column and RLS keep working |
| New `campaign_allocation` (campaign, agency, monthly share) | A's split of Y |
| New `campaign_host` (campaign, client member, working hours, time zone) | Who takes meetings, and their availability |
| Invites: a supplier manager can invite into their own agencies, audited | A creates P, Q, R accounts |
| RLS: supplier reads leads of its agencies; agency reads campaigns it has a share of | New visibility rules in 4.2 |
| Phase 2 and 3 tables change shape: one `lead.stage`, meeting attempts, attendance rows, disputes | Section 5 |
| New `conversation`, `message`, `attachment` | Section 7 |
| Contract documents per campaign (client and supplier), versioned | Contracts in the portal |

## 10. UI plan

The navy rail shell, the tokens and the "structured softness" direction stay. New screens need comps and the
owner's approval first, as before.

| Role | Screens |
|---|---|
| Fynix | Overview (every campaign: delivered vs X, allocations vs Y, things waiting on someone) · Clients · Suppliers (A with its agencies as a tree) · Campaign (brief, client contract, supplier allocation, shares, leads, meetings, activity) · Leads · Meetings (calendar and list) · Inbox (all conversations, release queue) · Disputes · Audit log · Settings (terms, reasons, templates) |
| Client | Home (delivered vs target this month, next meetings with Join, count to confirm) · To confirm (replaces the approval queue: lead card, proposed times, accept, other times, decline) · Meetings · Leads (table and record, dispute button) · Messages (with Fynix) · Team and availability (hosts, working hours, connect calendar) · Brief and contract (read only) |
| Supplier A | Home (Y vs delivered, split by agency) · Leads (all its agencies, plus submit) · Meetings · Agencies (invite, shares, people) · Messages (Fynix, each agency) · Brief |
| Agency P | Home (its share, outcomes due, next meetings) · New lead (prospect form, host picker, time picker in both time zones) · My leads · Meetings (join, record outcome) · Messages (with A) |
| Prospect | One private page from the invite: time in their zone, Join, add to calendar, confirm, ask for a new time, cancel |
| Everyone | Meeting page: countdown, Join, instructions (agency users: join under your alias), and after the meeting the outcome form with attendance evidence |

## 11. Upgrade plan

| Step | Delivers | Depends on |
|---|---|---|
| 0 | Owner answers section 12; this review becomes spec v2 and is approved | Owner |
| 1D | Fynix admin: clients, suppliers and agencies, campaigns with two ledgers and shares, hosts, members, terms, audit log. Comps first | Spec v2 |
| 1E | Role-shaped apps for client, supplier and agency; A invites its agencies; leak tests for four roles | 1D |
| 2 | Leads, the new lifecycle, duplicates and exclusions, disputes, replacements | 1E |
| 3 | Meetings: provider integration, typed availability, booking, prospect page, reminders, attendance import, outcomes | 2, provider account (gate G4) |
| 4 | Messaging and attachments, notifications (instant, digest, in-app) | 2 |
| 5 | Dashboards and exports per role | 3, 4 |
| 6 | Hardening, calendar connection (OAuth), deploy | 5 |

Gates: G1 second factor for Fynix, G2 lawyer-approved terms (now including non-circumvention for suppliers and
agencies), G3 Brevo key, and new G4: the meeting provider account and plan chosen and verified.

## 12. Questions for the owner

Answers from the second round are in section 0 (D10 to D24); they supersede the suggestions in this table.
N2 is settled by D28 and D33, and the alias email question by D36. Still open: the sender domain name (D37,
owner to give), N7 (one alias per person per client; D31 lets each person keep several, so likely settled).
N5 is settled by D30. Recording is deferred (D19).

| # | Question | My suggestion or answer |
|---|---|---|
| Q1 | Replace v1's "client approves after the meeting" with "client accepts before, plus a 72 hour dispute window after"? | **Answered (D10):** yes, with a 48 hour window |
| Q2 | Does Fynix check each lead before the client sees it? | **Answered (D8):** optional, no gate |
| Q3 | Who creates P, Q, R: A alone, or A asks and Fynix approves? | A alone (follows from D4 and D5), to confirm |
| Q4 | Can Fynix see and message P, Q, R directly? | **Answered (D5):** no line of contact |
| Q5 | Can Fynix read conversations between A and its agencies? | **Answered (D5):** no |
| Q6 | Client no-show counts for both contracts? 10 minute grace? Client cancel under 24 hours = no-show? | **Counts for both (D6).** Grace and late cancel still to confirm |
| Q7 | Client and agency messages on a lead? | **Answered (D7):** everything through Fynix |
| Q8 | Can A see the client's target X? | No |
| Q9 | Prospect no-show: how many rebooks before the lead is lost? | One |
| Q10 | Zoom or Google Meet for v1? Do clients like C require Teams? | **No subscription yet (D9).** Decide after the G4 test on trials |
| Q11 | Typed availability first, calendar connection later? | Yes |
| Q12 | Must the agency person join every meeting? Does Fynix staff ever join? Record meetings as evidence (needs everyone's consent)? | Agency joins; no recording in v1 |
| Q13 | Prospect invites: from "Fynix", or under the client's brand ("C via Fynix")? | Client brand, sent by Fynix |
| Q14 | Submissions beyond an agency's share: block, or allow with a flag for Fynix? | Flag |
| Q15 | Contract documents in the portal (upload, versions), or only the numbers? | Numbers plus the signed PDF |
| Q16 | More than one Fynix staff user now? The inbox suggests a team | Yes, two roles: admin and staff |
| v1 | Still open from v1: counting month and zone, terms drafts with non-circumvention, GDPR or DPDPA, WhatsApp | Meeting date in the campaign zone |
| N1 | Who owns the alias domain and mailboxes (`upwind-io.com`): the client, Fynix, A or the agency? On Google Workspace or Microsoft 365? Does the client know these aliases exist? | Open |
| N2 | The prospect's invite and reminders: sent by the portal in the alias's name from the alias domain (needs DNS access to verify that domain for sending), or sent by the agency itself from its alias mailbox with a file the portal gives it? | The portal sends them, so reminders and reschedules stay automatic |
| N3 | Does the client ever see which supplier or agency found a lead, or only the alias? | Only the alias |
| N4 | Does Fynix see P, Q, R's names on leads, to count by source? Who manages P's users: only A? | Fynix sees names for counting; only A manages users |
| N5 | P's portal says "Fynix Leads". Fine, or should P not see Fynix at all? | Fine |
| N6 | The Pavel workshop code uses a Zoom account through Server-to-Server OAuth. Whose account is that? | Open |
| N7 | One alias per agency person per client (Gaurav is "Gaurav, Upwind" on Upwind and something else on another client)? | Yes |
