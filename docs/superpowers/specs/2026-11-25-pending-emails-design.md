# Pending emails: client emails, bell-only events, a letter per campaign and the later emails

Owner decisions, 2026-11-25. This is a design, not yet built. It adds to `2026-11-24-meetings-and-email-decision.md` and does not change it. Building starts only after the work now uncommitted in this checkout (the coordinator rename, client contacts, campaign set-up fields) is committed.

## Decided

| Topic | Decision |
|---|---|
| Scope | Build all four pending pieces: the three client emails, emails for the four bell-only events, the later emails, and a letter per campaign |
| "Lead submitted" email | Sent at once, as built. No 2 hour summary |
| Letter per campaign | A Fynix admin can write one opening paragraph for the confirmation letter. Everything else in the letter stays fixed |
| Target met | Fynix, the client and the coordinator are told when the campaign reaches its monthly or total target. Each agency is told when it reaches its own monthly share |
| Overturn note | When Fynix changes a rejection to accepted, the client reads Fynix's note |
| Daily reminder, Fynix copy | Fynix gets one summary email a day, not one per client |
| Client meeting emails | Unchanged: they go to the client's people who have meeting emails switched on (roadmap decision) |

## Not in this build

- Switching on the neutral sender and the Meet rooms. That waits for the domain, the room account and the two tests (`docs/owner-checklist.md`, section 2).
- The "First email" and "Second email" on the campaign sheet. Open with the owner's senior.
- A short note the agency types at booking (D35). Nobody asked for it yet.
- Editing any other email wording in the app.

## Rules that stay true for everything below

- One email per person. The person who acted is left out.
- Every email here is behind `LAUNCH_EMAILS_ENABLED`, like the other launch emails. Bell notices are not: a new bell notice is live as soon as the code is deployed.
- A prospect letter never names Fynix, the coordinator or an agency, and holds no web address but the Meet link and the client's privacy page.
- No em or en dash and no exclamation mark in any wording.

## Slice 1: client emails and the bell-only events

| Event | Bell today | New email | To |
|---|---|---|---|
| Lead accepted for the client after 48 hours | Check at build time what the sweep writes for the client | `lead_auto_accepted_client` | Client |
| Fynix changes a rejection to accepted | Agency and coordinator only | `rejection_overturned_client`, with Fynix's note. The client also gets a bell notice | Client |
| Client no-show recorded | Everyone | `client_no_show_client`. It says the lead counts as one and that the outcome can be contested from the lead | Client |
| New meeting time proposed by the client | Agency, coordinator, Fynix | `postponement_proposed_info` | Agency, coordinator, Fynix |
| New meeting time proposed by the agency or coordinator | Client, Fynix | `postponement_proposed_info` | Client, Fynix |
| Outcome contested | Everyone | `outcome_contested_info`, with the note and which side wrote it | Client, agency, coordinator, Fynix |
| Fynix decides a contest | Everyone | `contest_decided_info`, with the decided outcome and Fynix's note | Client, agency, coordinator, Fynix |
| Review of a rejection asked for | Fynix | `review_requested_info` | Fynix |

How it fits the code:

- Who gets which email is one pure function, `leadEmailDeliveries` in `lib/leads/lead-emails.ts`. Each row above is a new case or a new delivery there. Its `default` branch, which sends nothing for these events today, shrinks.
- The form where Fynix overturns a rejection gains one line: "The client, the agency and the coordinator read this note."
- `rejection_overturned` in `lib/leads/notices.ts` gains the client as an audience, with the same note.
- Each new template is added in four places together: `LAUNCH_TEMPLATES`, the samples behind the Templates screen, the database enum `email_template`, and the allowed list inside `app_email_enqueue`.

## Slice 2: a letter per campaign

- One new field on the campaign: the opening paragraph, plain text, at most 600 characters, empty by default.
- It appears in the confirmation letter only, after the greeting, in place of "Thank you for agreeing to talk." The meeting time, the join button, the signature and the privacy line stay as they are. The moved, cancelled and reminder letters keep the default wording.
- A Fynix admin edits it on the campaign's "Prospect email" panel, with a preview of the full letter. No other role sees or edits it.
- Checks when saving, in one pure function: no web address, no email address, no "Fynix", no name of the campaign's coordinator or of an agency that holds a share, no em or en dash, no exclamation mark.
- Checks again when the letter is queued and sent. The database leaves the paragraph out if it holds the name of the coordinator or of any agency on the campaign at that moment. The sender leaves it out if it fails the other checks. In both cases the default letter goes out. A letter is never held back because of this field.

## Slice 3: the later emails

| Event | Bell | Email | To | When |
|---|---|---|---|---|
| Agreement changed, acceptance needed | Exists | `agreement_published_info` | Client managers, coordinator managers | At once |
| Campaign monthly target met | New | `target_met_info` | Client, coordinator, Fynix | Once per campaign and month |
| Campaign total target met | New | `target_met_info` | Client, coordinator, Fynix | Once per campaign |
| Agency reaches its monthly share | New | `share_met_info` | That agency only | Once per agency, campaign and month |
| Lead submitted beyond the agency's share | New | `over_share_info` | Fynix | At once, on submit |
| Leads still waiting for a time after 24 hours | New, to the client | `leads_waiting_daily` | Client | Daily at 9 am, client's time zone |
| Daily summary of the above | None | `leads_waiting_summary` | Fynix | Daily at 9 am, Fynix's time zone |

Targets:

- "Counts" means what `lib/domain/counting-month.ts` says: the stages in `COUNTED_STAGES`, in the month of the meeting read in the campaign's time zone. The target check reuses that rule and never restates it.
- A lead's count changes in six places: the client accepts, Fynix accepts, Fynix overturns a rejection, a client no-show is recorded, Fynix decides a contest, and the sweep accepts after 48 hours. One database function does the check for a lead and is called from all six, the sweep included.
- The check looks at the month of that lead's meeting, not today's month.
- A count can fall again after a contest. Each target notice is therefore stamped (campaign, period, kind, and the agency for a share) and is sent once only.
- A target of zero is never "met". An agency is told its share number only, never the campaign's target.

Over share:

- The flag is set at submission from that month's submissions (`server/domain/leads.ts`). The notice and the email are sent from both submit paths: a new lead and a draft sent on.

Daily reminder:

- It covers leads waiting for the client to pick a time for more than 24 hours. Leads waiting for accept or reject are left out: they have the 12 hour reminders.
- One email per client person with the number of leads waiting and a link to their list. Sent at the first sweep run after 9 am in the client's time zone. If the client has no time zone set, the zone of the campaign of its oldest waiting lead is used.
- One stamp per client and local day, so it is sent once a day.
- Fynix's summary lists each client with leads waiting and how many, once a day after 9 am in the Fynix organisation's time zone, or Europe/London if none is set. Nothing is sent on a day with none.

Queueing:

- Today's queue function, `app_email_enqueue`, is keyed on a lead. The agreement email, the campaign target emails, the daily reminder and the Fynix summary are not about one lead. They need queue functions keyed on a campaign and on an organisation, built the same way: security definer, a fixed list of allowed templates and audiences, the acting person excluded.

## Tests

- Unit: every new case of `leadEmailDeliveries`; the letter check; every new template through the shared invariants (`lib/email/invariants.ts`), so no dash, no exclamation mark and the right link rule hold for all of them.
- Unit: a prospect confirmation letter with an opening paragraph still passes the prospect rules, and one with a forbidden word falls back to the default.
- Integration: each new database function. A target notice is sent once when a count crosses, and not again after it falls and crosses a second time. The daily reminder is sent once per day and skips leads waiting for a decision. Each email has one recipient and the acting person gets none.

## How the build runs

1. Wait until the uncommitted work in this checkout is committed. Do not poll for it: the owner says when.
2. Re-read the code at that commit. Migration numbers, folder names (`supplier` or `coordinator`) and the latest bodies of `app_email_enqueue` and the notice functions are taken from there, not from this note. A function is re-created from its latest body, so an older copy never undoes a newer migration.
3. Build the three slices in order, each with its own tests and its own commit on `development`. New enum values go in their own migration, as migration 0073 did. Every migration is additive.
4. Checks per slice: lint and typecheck of the changed files, the unit tests of the changed files on one worker, and the integration tests of the new functions. One build at the end.

## Still open

- The Fynix organisation's time zone, used for the daily summary. Europe/London is assumed until it is set.
- Whether a rejection less than 24 hours before the meeting counts as one (unchanged, see `docs/owner-checklist.md`, section 4).
