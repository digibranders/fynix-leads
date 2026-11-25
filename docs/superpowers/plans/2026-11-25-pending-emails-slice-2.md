# Pending emails, slice 2: a letter per campaign. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Fynix admin writes one opening paragraph for a campaign's confirmation letter to prospects. Everything else in the letter stays fixed.

**Architecture:** One nullable text column on `campaign` that only Fynix reads or writes. One pure check, `checkLetterOpening`, used when saving and again when the letter is rendered. The database adds the paragraph to the letter's params when it queues `prospect_confirmed`, and leaves it out if it holds the name of the coordinator or of an agency on the campaign at that moment. A paragraph that fails any check never blocks a letter: the default wording goes out.

**Tech stack:** TypeScript, zod, Vitest, PostgreSQL 16, Drizzle migrations.

Design: `docs/superpowers/specs/2026-11-25-pending-emails-design.md`, "Slice 2". Base commit: `48335d5`.

---

## Files

| File | Change |
|---|---|
| `lib/email/letter-opening.ts` (new) | `LETTER_OPENING_MAX`, `tidyLetterOpening`, `checkLetterOpening(text, forbiddenNames)` |
| `lib/email/letter-opening.test.ts` (new) | The rules |
| `lib/email/launch-templates.ts` | Param `letterOpening`; `prospect_confirmed` uses it when it passes the check |
| `lib/email/templates.test.ts` | The letter with a paragraph, and the fall back |
| `server/db/schema/campaign.ts` | `prospectLetterOpening`, with a length check |
| `server/db/migrations/` | One generated (the column), one custom (`app_prospect_letter_opening`, and `app_email_enqueue` calls it) |
| `server/domain/campaign-privacy.ts` | `setProspectLetterOpening`; the read returns the paragraph |
| `server/domain/audit.ts`, `server/domain/errors.ts`, `server/fynix/errors.ts` | Action `campaign.set_letter_opening`, refusal `letter-names-supply-side` |
| `server/fynix/actions.ts` | `setLetterOpeningAction`, `removeLetterOpeningAction` |
| `components/fynix/forms/campaign-forms.tsx` | `LetterOpeningForm` |
| `components/fynix/campaigns/prospect-email-panel.tsx` | A third row with the paragraph, its buttons and a preview of the letter |
| `server/db/structure.integration.test.ts`, `server/db/testing/leak-matrix.ts` | No tenant reads or writes the column |
| `server/domain/phase6a.integration.test.ts`, `components/fynix/campaigns/prospect-email-panel.test.tsx` | Behaviour |

## Rules of the paragraph

1. Plain text, one paragraph, 1 to 600 characters after tidying (runs of white space become one space).
2. No web address and no email address: no `://`, no `www.`, no `@`, nothing shaped like `name.tld`.
3. Never the word "Fynix".
4. Never the name of the campaign's coordinator, of an agency holding a share of it, or of the agency that sent the lead.
5. No em or en dash and no exclamation mark, like every other text.

Rules 1, 2, 3 and 5 are checked when saving and when the letter is rendered. Rule 4 is checked when saving and by the database when the letter is queued.

## Tasks

- [ ] **1. The check (pure).** Write `lib/email/letter-opening.test.ts` first: a plain paragraph passes; each rule fails with one plain sentence; names match whatever the case; `tidyLetterOpening` collapses white space. Run: fail. Write `lib/email/letter-opening.ts`. Run: pass.
- [ ] **2. The letter.** In `lib/email/templates.test.ts` add: `prospect_confirmed` with `letterOpening` shows it after the greeting, drops "Thank you for agreeing to talk.", keeps the time, and holds the shared invariants; with a paragraph that fails the check the default wording is rendered. Run: fail. Change `launch-templates.ts`. Run: pass.
- [ ] **3. The column.** Add `prospectLetterOpening` to the schema, `pnpm db:generate --name=campaign_letter_opening`. Expected: one `ADD COLUMN` and one `ADD CONSTRAINT`. No grant is needed: Fynix holds the table, tenants hold named columns only. Add the column to the hidden list in `structure.integration.test.ts` and four probes to `leak-matrix.ts`.
- [ ] **4. The queue.** `pnpm db:generate --custom --name=prospect_letter_opening_enqueue`: create `app_prospect_letter_opening(p_lead uuid, p_template text) RETURNS jsonb` (security definer, revoked from PUBLIC) and patch `app_email_enqueue` in place so the prospect branch appends its result.
- [ ] **5. The service.** Integration tests first in `phase6a.integration.test.ts`: an admin sets and removes the paragraph, audited; staff are refused; a paragraph naming the coordinator or the partner agency is refused; no tenant reads or writes the column; the queued confirmation letter carries the paragraph and the moved letter does not; a paragraph that later names an agency is left out of the letter; the sent letter shows it. Then `setProspectLetterOpening`.
- [ ] **6. The screen.** Panel test first: default wording when empty, the paragraph and its buttons for an admin, read only for staff, a preview frame. Then the action, the form and the row.
- [ ] **7. Checks and commit.** Typecheck, lint of changed files, unit tests of changed folders on one worker, the integration files touched, `pnpm db:migrate`, commit.
