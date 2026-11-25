# Pending emails, slice 3: the later emails. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emails and bell notices for an agreement that needs acceptance, a target that is met, a lead beyond an agency's share, and leads still waiting for a time after 24 hours (the client daily, Fynix as one summary).

**Architecture:** Every email but one stays keyed on a lead and goes through the existing queue (`app_email_enqueue`), so nothing new decides who a person is. A target email is keyed on the lead that completed the target, the daily reminder on the lead that has waited longest. Only the agreement email is about a campaign with no lead, and gets one small queue function that Fynix alone may call. "Sent once" is one table of keys, `once_stamp`, written by security definer functions.

**Tech stack:** TypeScript, zod, Vitest, PostgreSQL 16, Drizzle migrations.

Design: `docs/superpowers/specs/2026-11-25-pending-emails-design.md`, "Slice 3". Base commit: `0a107e5`.

---

## What is sent

| Template | Event | To | Link opens |
|---|---|---|---|
| `agreement_published_info` | Fynix publishes an agreement version | Client managers, coordinator managers | The agreement |
| `target_met_info` | The campaign's monthly or total target is met | Client, coordinator, Fynix | The lead that completed it |
| `share_met_info` | An agency's monthly share is met | That agency | The lead that completed it |
| `over_share_info` | A lead is submitted beyond the sender's share | Fynix | The lead |
| `leads_waiting_daily` | A lead has waited over 24 hours for a time, at 9 am | The client | The lead that has waited longest |
| `leads_waiting_summary` | The same, once a day | Fynix | The lead that has waited longest of all |

Bell notices, kind `general`, live whatever the email switch says: target met (client, coordinator, Fynix), share met (the agency), over share (Fynix), leads waiting (the client). The agreement notice exists already. The Fynix summary has no notice.

## Database

| Object | What it does |
|---|---|
| `once_stamp (key text primary key, created_at)` | "This was sent" keys. Owner only, like `meeting_reminder` |
| `app_counted_stages()` | The stages that count, in SQL. An integration test holds it equal to `COUNTED_STAGES` in `lib/domain/counting-month.ts` |
| `app_safe_zone(first, second)` | The first of the two zones PostgreSQL knows, else Europe/London, so a mistyped zone never stops the sweep |
| `app_claim_target_notices(lead)` and `_system` | For a lead that counts: the campaign's count in the month of its meeting (campaign zone), its total, and the sender's count against its share. Each target that is met and not yet stamped is stamped, its bell notice written, and a row returned. For a person (caller checked through the lead) and for the sweep |
| `app_claim_waiting_reminders(now)` | Clients with a lead waiting over 24 hours, after 9 am local, once per local day. Writes the bell notice, returns the oldest lead and the count. Sweep only |
| `app_claim_waiting_summary(now)` | Every such client with its count, once per Fynix day after 9 am. Sweep only |
| `app_enqueue_campaign_email(...)` | Queues an email for managers of a campaign's client and coordinator, with the link to the agreement. Fynix only |

"Waiting" is measured from `lead.updated_at`, so a lead that came back to the client last night is not chased this morning.

## Tasks

- [ ] **1. Wording and audiences (pure).** Tests first in `lib/leads/lead-emails.test.ts`, `lib/leads/notices.test.ts` and `lib/email/templates.test.ts`. Then six templates in `lib/email/launch-templates.ts` (new params `campaignName`, `period`, `reached`, `target`, `scope`, `waiting`, `clients`, `version`; a portal email may name its own button), samples and catalogue entries, the new events in `lib/leads/lead-emails.ts` (`target_met`, `leads_waiting`, `leads_waiting_summary`, `lead_over_share`, and `campaignEmailDeliveries` for the agreement), and the over share notice in `lib/leads/notices.ts`.
- [ ] **2. Enum values.** Six values on `emailTemplate`, `pnpm db:generate --name=email_template_slice_3`.
- [ ] **3. The stamp table.** `server/db/schema/once-stamp.ts`, generate, then a custom migration with row level security, the owner policy and every function above. Add the table to the access matrix in `structure.integration.test.ts` and probes to `leak-matrix.ts`.
- [ ] **4. The server.** `claimTargetNotices` in `server/mail/lead-emails.ts`, called by `notify()` for the events that change a count and by the sweep after an automatic acceptance; `lead_over_share` from both submit paths; the agreement email from `notify()`; two sweep steps in `server/mail/launch-sweep.ts` and `scripts/leads-sweep.ts`.
- [ ] **5. Integration tests** in `server/domain/phase6a.integration.test.ts`: each row of the table above; a target notice is sent once, also after the count falls and is met again; the month is the meeting's month in the campaign zone; a target of zero is never met; the daily reminder goes once a day, after 9 am local, skips leads waiting for a decision, and survives a mistyped zone; `app_counted_stages()` equals `COUNTED_STAGES`.
- [ ] **6. Checks, docs and commit.** Typecheck, lint of changed files, unit and integration tests of the touched files, one `pnpm build`, `pnpm db:migrate`. Update `CLAUDE.md`, `docs/owner-checklist.md` and the two decision notes. Commit.
