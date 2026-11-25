# Pending emails, slice 1: client emails and the bell-only events. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven new launch emails: three to the client (automatic acceptance, a rejection Fynix changed, a client no-show) and four for events that only had a bell notice (a postponement proposal, a contested outcome, a contest decision, a review request).

**Architecture:** Nothing new. Who gets which email stays in the pure function `leadEmailDeliveries`; the wording stays in `lib/email/launch-templates.ts`; the queue stays the database function `app_email_enqueue`. That function stops carrying its own list of template names and checks the `email_template` enum instead, so later slices only add enum values.

**Tech stack:** TypeScript, zod, Vitest, PostgreSQL 16, Drizzle migrations (`pnpm db:generate`).

Design: `docs/superpowers/specs/2026-11-25-pending-emails-design.md`. Base commit: `89414db`.

---

## Files

| File | Change |
|---|---|
| `lib/email/launch-templates.ts` | Seven template names, two params (`proposedBy`, `decided`), seven layouts |
| `lib/email/samples.ts` | A sample and a catalogue entry for each |
| `lib/leads/lead-emails.ts` | New deliveries; the `default` branch goes |
| `lib/leads/notices.ts` | `rejection_overturned` also goes to the client |
| `server/db/schema/enums.ts` | Seven values at the end of `emailTemplate` |
| `server/db/migrations/00NN_*.sql` | One generated (enum values), one custom (the queue function checks the enum) |
| `components/leads/lead-forms.tsx` | One sentence on the overturn form |
| Tests | `lib/leads/lead-emails.test.ts`, `lib/leads/notices.test.ts`, `lib/email/templates.test.ts` (runs over every template already), `server/domain/phase6a.integration.test.ts`, `server/domain/phase5a.integration.test.ts`, `components/leads/phase4.test.tsx` if it asserts the form text |

## Template names and wording

| Template | To | Subject |
|---|---|---|
| `lead_auto_accepted_client` | client | Lead {ref} was accepted automatically |
| `rejection_overturned_client` | client | Fynix changed your rejection of {ref} to accepted |
| `client_no_show_client` | client | Your team did not attend the meeting for {ref} |
| `postponement_proposed_info` | supply side and Fynix, or client and Fynix | The client proposed new times for {ref} / New times proposed for {ref} |
| `outcome_contested_info` | client, source, coordinator, Fynix | The outcome of {ref} is contested |
| `contest_decided_info` | client, source, coordinator, Fynix | Fynix decided the contest on {ref} |
| `review_requested_info` | Fynix | A review of the rejection of {ref} was asked for |

All are portal emails: they carry the link to the lead and never go to a prospect.

## Task 1: who gets which email (pure)

- [ ] In `lib/leads/lead-emails.test.ts`, replace the test "events with no email ... send nothing" and extend the decision and outcome tests so they expect:
  - `lead_auto_accepted` gives `lead_auto_accepted_info:source+coordinator+fynix` and `lead_auto_accepted_client:client`
  - `rejection_overturned` gives `rejection_overturned_info:source+coordinator` and `rejection_overturned_client:client`, the client's copy with `noteFrom: "Fynix"` and the note scrubbed
  - `outcome_recorded` with `client_no_show` gives `no_show_info:source+coordinator+fynix` and `client_no_show_client:client`; `prospect_no_show` is unchanged
  - `postponement_proposed` by the client gives `postponement_proposed_info:source+coordinator+fynix`, by the supply side `postponement_proposed_info:client+fynix`, each with `proposedBy`
  - `outcome_contested` gives `outcome_contested_info:client+source+coordinator+fynix` with `noteFrom` Client, Agency or Coordinator
  - `contest_decided` gives `contest_decided_info:client+source+coordinator+fynix` with `decided` and `noteFrom: "Fynix"`
  - `review_requested` gives `review_requested_info:fynix`
  - add all seven events to the list of the "every delivery builds content its own template accepts" test
- [ ] Run `pnpm vitest run lib/leads/lead-emails.test.ts --maxWorkers=1`. Expected: fail (unknown templates).
- [ ] Add the names, params, `REQUIRED` rows and layouts to `lib/email/launch-templates.ts`; add the deliveries to `lib/leads/lead-emails.ts`; add samples and catalogue entries to `lib/email/samples.ts`.
- [ ] Run `pnpm vitest run lib/leads lib/email --maxWorkers=1`. Expected: pass, including the shared invariants for the seven new templates.

## Task 2: the client's bell notice for an overturn

- [ ] In `lib/leads/notices.test.ts` add: `leadNotices({ type: "rejection_overturned", note })` has one delivery whose audience is `["client", "source", "coordinator"]`. Run it: fail.
- [ ] Change the audience in `lib/leads/notices.ts`. Run it: pass.
- [ ] Update the expectation in `server/domain/phase5a.integration.test.ts` (the test that names "when Fynix overturns") to include the client's people.

## Task 3: the database accepts the new templates

- [ ] Append the seven values to `emailTemplate` in `server/db/schema/enums.ts`. Run `pnpm db:generate --name=email_template_slice_1`. Expected: one migration holding seven `ALTER TYPE ... ADD VALUE` statements and nothing else. If it holds anything else, stop: the schema and the last snapshot disagree.
- [ ] Run `pnpm db:generate --custom --name=email_enqueue_checks_enum` and write the migration: a `DO` block that reads `app_email_enqueue` back with `pg_get_functiondef`, replaces the hard-coded `p_template NOT IN (...)` list with a check against `enum_range(NULL::public.email_template)` that still refuses the three account templates, and raises if the list was not found. This is the pattern of migration 0085, so the rest of the body, its settings and its grants stay as they are.
- [ ] In `server/domain/phase6a.integration.test.ts` add tests: the client's people get `lead_auto_accepted_client` after the sweep; `client_no_show_client` after a client no-show; `rejection_overturned_client` with Fynix's note; a postponement proposal, a contest, a contest decision and a review request each reach the audiences of the table above, never the person who acted. Adjust the existing expectations of the same describe blocks.
- [ ] Run `pnpm db:migrate:test && pnpm vitest run --config vitest.integration.config.mts server/domain/phase6a.integration.test.ts server/domain/phase5a.integration.test.ts`. Expected: pass. The test "a tenant cannot queue mail of its own" must still refuse a template that is not a launch template.

## Task 4: the overturn form

- [ ] Add to `OverturnRejectionForm` in `components/leads/lead-forms.tsx`: "The client, the agency and the coordinator read this note." Run the component tests that render the form.

## Task 5: checks and commit

- [ ] `pnpm exec eslint` on the changed files, `pnpm typecheck`, the unit tests of the changed folders on one worker.
- [ ] `pnpm db:migrate` (dev database, additive).
- [ ] Commit only the files of this slice on `development`.
