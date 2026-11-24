# Phase 0: Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client can reject a lead, a Fynix admin can publish terms from Settings, every Fynix form confirms a save, and the docs say how the app deploys.

**Architecture:** No new structure. One grant-only migration, one server action over the existing `publishTerms` domain function, one form in the existing `FormSheet` and `ActionForm` pattern, and one line in `ActionForm` that reaches every Fynix form.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Drizzle with Postgres and per-role grants, Vitest, sonner (already installed and mounted in `app/layout.tsx`).

**Roadmap:** `2026-11-24-build-roadmap.md`, phase 0.

---

## Before starting

Two things need the owner's yes. Neither is done by this plan without it.

- **Commit the pending work.** `development` carries about 63 uncommitted files (the desktop top bar, the Coordinator rename, the decision notes). Commit them first, or this phase's diff tangles with them.
- **Migrate the dev database.** `fynix_leads` is one migration behind (0056), so picking a time fails on `localhost:3020`. The command is `pnpm db:migrate`. It changes the owner's local data, so it waits for a yes.

House rules for this plan, which replace the skill's defaults:

- No commit per task. One commit at the end of the phase, on the owner's word, with no attribution lines.
- Work on `development` in the main checkout. No worktree.
- The dev server on port 3020 stays running. Never stop or restart it.
- Tests run for the changed files only. Integration tests already run one file at a time (`fileParallelism: false`).

## Files

| File | Change | Why |
|---|---|---|
| `server/domain/tenant-flows.integration.test.ts` | Modify | The missing test for a client rejecting a lead, and a stale comment |
| `server/db/migrations/0057_client_closes_lead.sql` | Create | The grant the rejection needs |
| `server/db/migrations/meta/_journal.json` | Generated | Written by `pnpm db:generate --custom` |
| `server/fynix/actions.ts` | Modify | `publishTermsAction` |
| `components/fynix/forms/settings-forms.tsx` | Create | `PublishTermsForm` |
| `components/fynix/settings/settings-actions.tsx` | Create | `PublishTermsButton` |
| `app/(fynix)/fynix/settings/page.tsx` | Modify | The button in the Terms panel |
| `components/fynix/forms/forms.test.tsx` | Modify | The form renders its three fields |
| `components/fynix/forms/action-form.tsx` | Modify | A "Saved" message for every Fynix form |
| `docs/deploy.md`, `CLAUDE.md`, `../CLAUDE.md` | Modify | The deployment facts |

---

### Task 1: A client can reject a lead

**Files:**
- Test: `server/domain/tenant-flows.integration.test.ts`
- Create: `server/db/migrations/0057_client_closes_lead.sql`

The cause: `clientReviewLead` in `server/domain/leads.ts` sets `closed_at` when a client declines. Migration 0034 grants `leads_client` UPDATE on eight columns of `lead`, and `closed_at` is not one of them. Postgres answers "permission denied for table lead" and the client sees "An unexpected error occurred". No test declines a lead as the real role.

- [ ] **Step 1: Write the failing test**

In `server/domain/tenant-flows.integration.test.ts`, add `lead` to the schema import on line 3:

```ts
import { agreement, aliasIdentity, auditLog, campaign, campaignHost, campaignShare, hostHours, lead, member, organisation, user } from "@/server/db/schema";
```

Add this block directly after the `describe("a lead from submission to outcome", ...)` block:

```ts
describe("a client rejects a lead before the meeting", () => {
  it("closes the lead with the reason, as the client's own database role", async () => {
    const db = rig.dbs.roles;
    await submitLead(db.leads_agency.db, rig.deps(), cast.agencyActor, leadInput([nextWeekdayAt(10, 3)]));
    const [created] = await listClientLeads(db.leads_client.db, cast.clientActor);
    if (created === undefined) throw new Error("No lead");

    await clientReviewLead(db.leads_client.db, rig.deps(), cast.clientActor, { leadId: created.id, action: "decline", declineReason: "Not in our target market" });

    const [row] = await rig.dbs.owner.db.select({ stage: lead.stage, declineReason: lead.declineReason, closedAt: lead.closedAt }).from(lead).where(eq(lead.id, created.id));
    expect(row).toMatchObject({ stage: "declined", declineReason: "Not in our target market" });
    expect(row?.closedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm db:migrate:test && pnpm exec vitest run --config vitest.integration.config.mts server/domain/tenant-flows.integration.test.ts -t "rejects a lead"
```

Expected: FAIL. The error text contains `permission denied for table lead`.

- [ ] **Step 3: Create the migration**

```bash
pnpm db:generate --custom --name=client_closes_lead
```

Expected: a new empty file `server/db/migrations/0057_client_closes_lead.sql` and a new entry with `"tag": "0057_client_closes_lead"` in `server/db/migrations/meta/_journal.json`.

Put this in the new file:

```sql
-- A client's decline sets closed_at. Migration 0034 left that column out of the client's UPDATE grant, so every decline failed
-- with "permission denied for table lead". Additive: a wider grant changes nothing for a process that is already running.
GRANT UPDATE ("closed_at") ON "lead" TO leads_client;
```

- [ ] **Step 4: Run the test and see it pass**

```bash
pnpm db:migrate:test && pnpm exec vitest run --config vitest.integration.config.mts server/domain/tenant-flows.integration.test.ts
```

Expected: PASS for the whole file, the new test included. If a second "permission denied" appears, add the missing column to this same migration file. Do not write another one: 0057 has not been applied anywhere but the test database yet.

- [ ] **Step 5: Remove the stale comment**

In the same test file, the block comment above `const rig = openDomainRig();` opens with a paragraph that starts "SKIPPED until the tenant data access is made to work" and ends "these tests are the acceptance check." Nothing in the file is skipped any more. Delete that first paragraph and keep the second one, so the comment reads:

```ts
/**
 * The tenant flows end to end, as the roles the app really runs them as (leads_client and leads_agency, never the owner):
 * a lead is submitted, reviewed and held, and people talk about it. These had no database test before, and a grant that is
 * one column short only shows up here, as "permission denied".
 */
```

---

### Task 2: Publish terms from Settings

**Files:**
- Modify: `server/fynix/actions.ts`
- Create: `components/fynix/forms/settings-forms.tsx`
- Create: `components/fynix/settings/settings-actions.tsx`
- Modify: `app/(fynix)/fynix/settings/page.tsx`
- Test: `components/fynix/forms/forms.test.tsx`

The domain function exists and is tested (`publishTerms` in `server/domain/terms.ts`, `terms.integration.test.ts`). It is admin only through `fynixWrite`, writes an audit row, and supersedes the version in force. Only the screen is missing. The text is checked as a plain trimmed string of up to 60,000 characters (`publishTermsSchema`), so line breaks pass. An invite is refused while a side has no terms or placeholder terms, so this screen is what unblocks invites.

- [ ] **Step 1: Write the failing test**

In `components/fynix/forms/forms.test.tsx`, add `publishTermsAction: action` to the object the `@/server/fynix/actions` mock returns (line 7), and add this import under the other `await import` lines:

```ts
const { PublishTermsForm } = await import("@/components/fynix/forms/settings-forms");
```

Add this test inside `describe("the forms render", ...)`:

```tsx
  it("Publish terms asks who the terms are for, a title and the text", () => {
    const markup = renderToStaticMarkup(<PublishTermsForm />);
    expect(markup).toContain('name="party"');
    expect(markup).toContain('name="title"');
    expect(markup).toContain('name="body"');
    expect(markup).toContain("Publish terms");
  });
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm exec vitest run components/fynix/forms/forms.test.tsx
```

Expected: FAIL. The module `@/components/fynix/forms/settings-forms` cannot be found.

- [ ] **Step 3: Add the server action**

In `server/fynix/actions.ts`, add `publishTermsSchema` to the import from `@/server/domain/inputs` (keep the list in its current order, after `publishAgreementSchema`), and add this import beside the other domain imports:

```ts
import { publishTerms } from "@/server/domain/terms";
```

Add this action after `publishAgreementAction`:

```ts
export async function publishTermsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: ["party", "title", "body"],
    build: () => ({ party: field(formData, "party"), title: field(formData, "title"), body: field(formData, "body") }),
    schema: publishTermsSchema,
    labels: { party: "Side", title: "Title", body: "Text" },
    perform: async (deps, actor, input) => {
      await publishTerms(deps, actor, input);
    },
  });
}
```

`server/use-server-exports.test.ts` checks that this file exports only async functions. The action above keeps that true.

- [ ] **Step 4: Add the form**

Create `components/fynix/forms/settings-forms.tsx`:

```tsx
"use client";

import { publishTermsAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { FormGroup, SelectField, TextAreaField, TextField } from "./form-parts";

const PARTIES = [
  { value: "client", label: "Clients" },
  { value: "agency", label: "Coordinators and agencies" },
] as const;

/** Publishes a new version of the terms for one side. The version in force is replaced, never edited. */
export function PublishTermsForm() {
  return (
    <ActionForm action={publishTermsAction} submitLabel="Publish terms" pendingLabel="Publishing">
      <FormGroup title="Who accepts them">
        <SelectField name="party" label="Side" options={PARTIES} placeholder="Choose a side" helper="The new version replaces the one in force for that side." />
      </FormGroup>
      <FormGroup title="The terms">
        <TextField name="title" label="Title" helper="For example: Terms for clients." />
        <TextAreaField name="body" label="Text" rows={16} helper="Paste the full approved text. A published version cannot be edited. To change it, publish another." />
      </FormGroup>
    </ActionForm>
  );
}
```

- [ ] **Step 5: Add the button**

Create `components/fynix/settings/settings-actions.tsx`, in the shape of `components/fynix/clients/client-actions.tsx`:

```tsx
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormSheet } from "../forms/form-sheet";
import { PublishTermsForm } from "../forms/settings-forms";

/** The button in the Terms panel. Shown only to an admin. */
export function PublishTermsButton() {
  return (
    <FormSheet
      trigger={
        <Button variant="secondary" size="sm">
          <Plus aria-hidden />
          Publish terms
        </Button>
      }
      title="Publish terms"
      description="People accept these before they first use the portal. An invite cannot go out to a side that has none."
    >
      <PublishTermsForm />
    </FormSheet>
  );
}
```

- [ ] **Step 6: Put the button on the page**

In `app/(fynix)/fynix/settings/page.tsx`, add the import:

```ts
import { PublishTermsButton } from "@/components/fynix/settings/settings-actions";
```

Change the Terms panel header from:

```tsx
          <PanelHeader title="Terms in force" count={terms.length} />
```

to:

```tsx
          <PanelHeader title="Terms in force" count={terms.length} action={view.canWrite ? <PublishTermsButton /> : null} />
```

and the empty state under it from:

```tsx
              Terms appear here once they are published for a party.
```

to:

```tsx
              Publish terms for each side before you invite its people.
```

- [ ] **Step 7: Run the tests and see them pass**

```bash
pnpm exec vitest run components/fynix/forms/forms.test.tsx server/use-server-exports.test.ts
```

Expected: PASS.

---

### Task 3: Every Fynix form says it saved

**Files:**
- Modify: `components/fynix/forms/action-form.tsx`

Adding a client, a host, an agreement or a share closes the drawer and says nothing. Every one of those forms is an `ActionForm`, so the message goes there once. The same `toast` from `sonner` is already used in `components/leads/review-panel.tsx`.

- [ ] **Step 1: Add the message**

In `components/fynix/forms/action-form.tsx`, add the import:

```ts
import { toast } from "sonner";
```

Add an optional prop to `Props`:

```ts
  /** What the person reads when the change is saved. */
  savedMessage?: string;
```

Change the signature and the effect to:

```tsx
export function ActionForm({ action, submitLabel, pendingLabel, savedMessage = "Saved", children }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  const close = useSheetClose();
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "done") return;
    toast.success(savedMessage);
    close();
    if (state.redirectTo !== null) router.push(state.redirectTo);
  }, [state, close, router, savedMessage]);
```

Give the new form its own words: in `components/fynix/forms/settings-forms.tsx`, add `savedMessage="Terms published"` to its `ActionForm`.

There is no unit test for this step: the repo's component tests render static markup, where effects do not run. It is checked in the browser in Task 5.

- [ ] **Step 2: Run the form tests**

```bash
pnpm exec vitest run components/fynix
```

Expected: PASS, unchanged.

---

### Task 4: The docs say how the app deploys

**Files:**
- Modify: `docs/deploy.md`
- Modify: `CLAUDE.md`
- Modify: `../CLAUDE.md` (the workspace guide, which is not in any repository)

- [ ] **Step 1: `docs/deploy.md`**

Replace line 3:

```markdown
What the app expects from the server around it. Nothing here is automated yet: this is the checklist for the first deploy.
```

with:

```markdown
What the app expects from the server around it. The app is live at `leads.fynix.digital` on the Firstfold VPS. A systemd timer (`fynix-leads-autodeploy`, in the `vps-setup` repository under `fynix/leads/`) pulls `main` every minute, runs the migrations, then builds, so a merge to `main` is a deploy. The outbox and the purge run from timers in the same folder. This file is the checklist those units implement.
```

- [ ] **Step 2: `CLAUDE.md` of this repo**

Add this bullet directly after the bullet that starts `- **Operations:**`:

```markdown
- **Deploys:** live at `leads.fynix.digital`. Merging to `main` deploys within a minute and migrates before the build (`vps-setup/fynix/leads/`). It holds test data only (owner, 2026-11-24). Merge at the end of a phase, on the owner's word. The build order is `docs/superpowers/plans/2026-11-24-build-roadmap.md`.
```

- [ ] **Step 3: The workspace guide**

In `/Users/a12345/Desktop/AI/Fynix Digital/CLAUDE.md`, in the repo table, replace the `fynix-leads/` row's two middle cells:

```markdown
Phase 0 prototype on sample data | not deployed yet (planned for the Firstfold VPS)
```

with:

```markdown
In active build, see its `docs/superpowers/plans/2026-11-24-build-roadmap.md` | leads.fynix.digital (Firstfold VPS, `main` deploys by timer)
```

In the dev server table, replace the database cell of the `fynix-leads` row, `none (sample data)`, with `` `fynix_leads` ``.

---

### Task 5: Check the phase

- [ ] **Step 1: Lint and types for what changed**

```bash
pnpm exec eslint server/fynix/actions.ts components/fynix/forms components/fynix/settings "app/(fynix)/fynix/settings" server/domain/tenant-flows.integration.test.ts
```

```bash
pnpm typecheck
```

Expected: both clean.

- [ ] **Step 2: The tests of this phase**

```bash
pnpm exec vitest run components/fynix server/use-server-exports.test.ts server/domain/boundaries.test.ts server/auth/boundaries.test.ts
```

```bash
pnpm db:migrate:test && pnpm exec vitest run --config vitest.integration.config.mts server/domain/tenant-flows.integration.test.ts server/domain/terms.integration.test.ts
```

Expected: PASS.

- [ ] **Step 3: One build**

```bash
pnpm build
```

Expected: the build completes.

- [ ] **Step 4: In the browser, on `localhost:3020`**

This needs the dev database migrated (`pnpm db:migrate`, with the owner's yes).

1. Sign in as the Fynix admin. Open Settings. Press "Publish terms", choose Clients, give a title and a text, publish. A "Terms published" message shows and the panel lists the new version without the "Placeholder text" tag.
2. Open Clients, add a client. A "Saved" message shows.
3. Sign in as the dev client. Open Availability, decline a lead with a reason. The lead leaves the queue and Leads shows it as Declined.

- [ ] **Step 5: Refresh the code graph**

```bash
cd "/Users/a12345/Desktop/AI/Fynix Digital" && graphify update .
```

- [ ] **Step 6: Check-in with the owner**

Show the three results of step 4. On the owner's word: commit on `development`, push, and open the PR to `main`. The merge puts migration 0057 on the live site.

## Not in this phase

- The texts of the terms. The owner supplies them. Anything published through this screen counts as real terms: it is stored as not placeholder, and that flag is the only thing that stops invites on the live site (gate G2). A test text is fine on the dev database. On the live site, publish only the approved text.
- A preview of the terms in force. The accept-invite page already shows them.
- Saved messages in the client, coordinator and agency portals. Their forms are rebuilt in phases 1 to 4 and get the message there.
