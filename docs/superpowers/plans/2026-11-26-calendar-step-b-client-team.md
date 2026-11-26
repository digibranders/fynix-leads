# Client team instead of hosts: implementation plan (calendar step B)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans to work through this plan task by task, in this session. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use parallel subagents or a worktree: the machine rules allow one worker at a time.

**Goal:** Any active person of a client can be chosen for a meeting, on every campaign of that client. The per-campaign list of hosts is no longer used, and no screen says "host".

**Architecture:** The gate moves from the `campaign_host` table to "active member of the campaign's client", in three database places (one new function, two policies, the go-live function) and one shared check in the domain. Code names such as `hostMemberId` and `host_hours` stay, as `supplier` stayed when the screens began to say "coordinator". A person with no hours set counts as working Monday to Friday, 09:00 to 17:00 in the client's time zone.

**Tech stack:** Next.js 16, TypeScript strict, PostgreSQL 16 with Drizzle and hand-written SQL migrations, zod, Vitest. Spec: `docs/superpowers/specs/2026-11-26-calendar-and-meetings-design.md`, sections 4, 5.3 and 16.

---

## Read this first

**What this step delivers.** After it, the agency still chooses **one** person on a lead, as today. The only change is who is on the list: every active client team member, not only the people someone marked as hosts. Choosing nobody, inviting several people and Accept or Decline arrive in step E (one-slot booking).

**What this step leaves alone, on purpose.** These stay exactly as they are until step E, because booking still needs one chosen person:

- the check `lead_draft_complete`, which requires `lead.host_member_id`
- `meeting.host_member_id`, which is NOT NULL
- `bookMeeting` and `clientReviewLead` in `server/domain/leads.ts`
- the chooser on the lead form (only its label and its list change here)

**Repo rules that override the usual plan habits.**

- **No commit per task.** Commits happen at the end of the step, on the owner's word. Do not commit this plan either.
- **Checks stay small.** Run lint, typecheck and only the tests of the files a task changed, on one worker: `pnpm exec vitest run --maxWorkers=1 <path>`. Integration tests only for the files named in a task: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 <path>`. One `pnpm build` at the very end.
- **Migrations are additive.** Nothing is dropped or renamed. `campaign_host` and `app_campaign_host_names` stay in the database, unused, until the clean-up phase.
- **Tenant reads name their columns.** A `select()` with no columns fails the boundary test.
- **Words:** sentence case, plain verbs, no dashes other than a hyphen. Follow the word list in the spec, section 5.3.
- **Dev server:** `pnpm dev` serves http://localhost:3020. Reuse a running one. Never stop a server.
- This Next.js has breaking changes. Read `node_modules/next/dist/docs/` before writing a page or a redirect.

**Owner decision, 2026-11-26:** an agency sees the **names only** of the people of a client it serves. Never a job title, an email or a phone. Today an agency sees the name and job title of each host, so the job title goes from the agency screens in this step. The client and Fynix keep seeing job titles. Do not start building until the owner has said to start.

## File map

| File | What happens |
|---|---|
| `server/db/migrations/0096_client_team.sql` (new, hand-written) | `app_campaign_team`, `app_agency_serves_member`, the two agency policies on hours, the go-live function |
| `server/db/testing/leak-matrix.ts` | Probes for the two new functions |
| `server/db/testing/seed.ts` | The job title marker moves from `campaign_host` to `member` |
| `lib/leads/host-hours.ts`, `lib/leads/host-hours.test.ts` | Default working hours |
| `server/domain/host-availability.ts` | `listCampaignTeam`, `requireTeamMember`, default hours in the read |
| `server/domain/leads.ts`, `server/domain/lead-drafts.ts`, `server/domain/lead-reads.ts` | Use the shared check and the team list |
| `server/domain/lead-record.ts`, `server/domain/campaign-overview.ts` | Client and Fynix read the job title from `member.job_title`. An agency gets none |
| `lib/campaign-status.ts`, `lib/campaign-status.test.ts`, `server/fynix/errors.ts` | Go-live wording |
| `server/domain/setup-overview.ts`, `lib/fynix/setup-checklist.ts` | Set-up checklist wording and link |
| `server/domain/hosts-tenant.ts`, `app/(client)/client/hours/page.tsx` (moved from `hosts`), `components/hosts/*`, `components/shell/nav.ts` | The client's Working hours page |
| `server/domain/campaign-overview.ts`, `app/(fynix)/fynix/campaigns/[ref]/team/page.tsx` (moved from `hosts`), `components/fynix/campaigns/host*.tsx`, `campaign-tabs.tsx` | The campaign's Client team tab |
| About 30 files with the word "host" on screen | Word sweep, task 8 |
| `server/domain/client-contacts.ts`, `server/fynix/actions.ts`, `components/fynix/clients/contacts-panel.tsx` | Invite a saved contact, stop adding new ones |
| `CLAUDE.md` | A wording note, like the one for "coordinator" |

---

### Task 1: The database gate

**Files:**
- Create: `server/db/migrations/0096_client_team.sql`
- Modify: `server/db/testing/leak-matrix.ts` (next to the probe at line 271)
- Test: `server/db/leak-matrix.integration.test.ts`, `server/db/structure.integration.test.ts`

- [ ] **Step 1: Add the failing probes.** Open `server/db/testing/leak-matrix.ts` and find the line that probes `app_campaign_host_names` as a client. Add these two rows directly after it, in the same list:

```ts
  { name: "the team of a campaign, as a client", statement: "select * from app_campaign_team(gen_random_uuid())", expectedError: /permission denied for function app_campaign_team/ },
  { name: "whether an agency serves a member, as a client", statement: "select app_agency_serves_member(gen_random_uuid())", expectedError: /permission denied for function app_agency_serves_member/ },
```

- [ ] **Step 2: Run it and see it fail.**

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/db/leak-matrix.integration.test.ts`
Expected: the two new probes fail with "function app_campaign_team(uuid) does not exist".

- [ ] **Step 3: Create the migration file.**

Run: `pnpm db:generate --custom --name=client_team`
Expected: an empty `server/db/migrations/0096_client_team.sql` and a new entry in `server/db/migrations/meta/_journal.json`.

- [ ] **Step 4: Write the SQL.** Replace the content of `0096_client_team.sql` with:

```sql
-- The client team replaces campaign hosts (calendar spec of 2026-11-26, step B). Additive: nothing is dropped. `campaign_host` and
-- `app_campaign_host_names` stay for the process still running during a deploy, and go in the clean-up phase.

-- 1. Who an agency may choose for a lead: every active person of the campaign's client. A name and the client's time zone,
-- never a job title, an email or a phone. It answers only for a campaign the caller coordinates or has a share of.
CREATE FUNCTION public.app_campaign_team(p_campaign uuid) RETURNS TABLE (member_id uuid, display_name text, time_zone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT m.id, m.display_name, o.time_zone
    FROM public.campaign c
    JOIN public.organisation o ON o.id = c.client_org_id
    JOIN public.member m ON m.org_id = c.client_org_id
   WHERE c.id = p_campaign AND m.status = 'active'
     AND (c.agency_org_id = public.app_current_org_id()
       OR EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id()))
   ORDER BY m.display_name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_campaign_team(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_campaign_team(uuid) TO leads_agency;
--> statement-breakpoint
-- 2. The agency reads a person's hours and blocked times when that person belongs to a client it serves. The policies of 0032 asked
-- `campaign_host`. A policy runs as the caller, and an agency cannot read a client's `member` rows, so the question goes to a function.
CREATE FUNCTION public.app_agency_serves_member(p_member uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.member m
    JOIN public.campaign c ON c.client_org_id = m.org_id
    WHERE m.id = p_member AND m.status = 'active'
      AND (c.agency_org_id = public.app_current_org_id()
        OR EXISTS (SELECT 1 FROM public.campaign_share cs WHERE cs.campaign_id = c.id AND cs.agency_org_id = public.app_current_org_id()))
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_agency_serves_member(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_agency_serves_member(uuid) TO leads_agency;
--> statement-breakpoint
DROP POLICY "host_hours_agency_read" ON "host_hours";
--> statement-breakpoint
CREATE POLICY "host_hours_agency_read" ON "host_hours" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (public.app_agency_serves_member("host_hours"."member_id"));
--> statement-breakpoint
DROP POLICY "host_block_agency_read" ON "host_block";
--> statement-breakpoint
CREATE POLICY "host_block_agency_read" ON "host_block" AS PERMISSIVE FOR SELECT TO leads_agency
  USING (public.app_agency_serves_member("host_block"."member_id"));
--> statement-breakpoint
-- 3. Going live: "an active host" becomes "an active person of the client". The column keeps the name `has_host`, a code name.
CREATE OR REPLACE FUNCTION public.campaign_go_live_state(p_campaign uuid) RETURNS TABLE (agreed boolean, client_accepted boolean, supplier_accepted boolean, has_host boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    WITH versions AS (
      SELECT a.version,
        EXISTS (SELECT 1 FROM public.agreement_acceptance x WHERE x.agreement_id = a.id AND x.side = 'client') AS client_done,
        EXISTS (SELECT 1 FROM public.agreement_acceptance x WHERE x.agreement_id = a.id AND x.side = 'supplier') AS supplier_done
      FROM public.agreement a
      WHERE a.campaign_id = p_campaign AND a.party = 'client'
    ), forced AS (
      SELECT EXISTS (SELECT 1 FROM versions WHERE client_done AND supplier_done) AS yes
    ), newest AS (
      SELECT client_done, supplier_done FROM versions ORDER BY version DESC LIMIT 1
    )
    SELECT forced.yes,
           forced.yes OR COALESCE((SELECT client_done FROM newest), false),
           forced.yes OR COALESCE((SELECT supplier_done FROM newest), false),
           EXISTS (
             SELECT 1 FROM public.campaign c JOIN public.member m ON m.org_id = c.client_org_id
             WHERE c.id = p_campaign AND m.status = 'active'
           )
    FROM forced
  $$;
```

Before saving, open `server/db/migrations/0064_phase2_campaign_grants.sql` and compare its `campaign_go_live_state` with the copy above. Only the last `EXISTS` may differ. If 0064 was changed by a later migration, start from the newest definition instead.

- [ ] **Step 5: Apply it to both dev databases.**

Run: `pnpm db:migrate`
Expected: "0096_client_team" applied to `fynix_leads`. The test database is migrated by the integration run in the next step.

- [ ] **Step 6: Run the database tests for these files.**

Run: `pnpm test:integration -- --maxWorkers=1 server/db/leak-matrix.integration.test.ts server/db/structure.integration.test.ts`
Expected: the two new probes pass. If `structure.integration.test.ts` lists the SECURITY DEFINER functions or the policies by name, add `app_campaign_team` and `app_agency_serves_member` to that list on purpose and run again.

- [ ] **Step 7: Add one positive and one negative read.** In `server/domain/hosts.integration.test.ts`, add a test beside the existing ones that read hours as an agency. Use the helpers that file already uses to make two coordinators, each with its own client and campaign. Then assert:
  - as the first coordinator, `select member_id from app_campaign_team('<its campaign id>')` returns every active member of its client, including a member who was never added as a host
  - as the first coordinator, `select count(*) from host_hours where member_id = '<a member of the other client>'` returns 0
  - as the first coordinator, `select member_id from app_campaign_team('<the other campaign id>')` returns no rows

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/hosts.integration.test.ts`
Expected: PASS.

---

### Task 2: Default working hours

**Files:**
- Modify: `lib/leads/host-hours.ts`
- Test: `lib/leads/host-hours.test.ts`

- [ ] **Step 1: Write the failing tests.** Add `DEFAULT_HOURS` and `withDefaultHours` to the import at the top of `lib/leads/host-hours.test.ts`, then add at the end of the file:

```ts
describe("withDefaultHours", () => {
  const none: HostAvailability = { timeZone: null, hours: [], blocks: [] };

  it("gives a person with no hours Monday to Friday, 09:00 to 17:00 in the client's zone", () => {
    const assumed = withDefaultHours(none, "Europe/London");
    expect(assumed.timeZone).toBe("Europe/London");
    expect(assumed.hours).toEqual(DEFAULT_HOURS);
    // 2026-12-02 is a Wednesday and 2026-12-05 a Saturday. London is on UTC in December.
    expect(isOutsideHostHours(new Date("2026-12-02T10:00:00Z"), assumed)).toBe(false);
    expect(isOutsideHostHours(new Date("2026-12-02T17:00:00Z"), assumed)).toBe(true);
    expect(isOutsideHostHours(new Date("2026-12-05T10:00:00Z"), assumed)).toBe(true);
  });

  it("leaves a person's own hours alone", () => {
    expect(withDefaultHours(availability, "America/New_York")).toBe(availability);
  });

  it("uses Europe/London when the client has no zone or a wrong one", () => {
    expect(withDefaultHours(none, null).timeZone).toBe("Europe/London");
    expect(withDefaultHours(none, "Not/AZone").timeZone).toBe("Europe/London");
  });

  it("keeps the person's blocked times", () => {
    const block = { startsAt: new Date("2026-12-02T10:00:00Z"), endsAt: new Date("2026-12-02T11:00:00Z") };
    const assumed = withDefaultHours({ ...none, blocks: [block] }, "Europe/London");
    expect(isOutsideHostHours(new Date("2026-12-02T10:30:00Z"), assumed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `pnpm exec vitest run --maxWorkers=1 lib/leads/host-hours.test.ts`
Expected: FAIL, "withDefaultHours is not exported".

- [ ] **Step 3: Write the code.** In `lib/leads/host-hours.ts`, add after the `HostAvailability` interface:

```ts
/** What a person who has set no hours is taken to work: Monday to Friday, 09:00 to 17:00 (owner decision, 2026-11-26). */
export const DEFAULT_HOURS: readonly HoursWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 17 * 60 }));

const FALLBACK_ZONE = "Europe/London";

/** The zone if the runtime knows it, Europe/London otherwise: a zone typed wrong never stops a booking. */
function usableZone(zone: string | null): string {
  if (zone === null) return FALLBACK_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return FALLBACK_ZONE;
  }
}

/** A person's own hours when they have set any, the default week in the client's zone when they have not. Blocked times are kept either way. */
export function withDefaultHours(availability: HostAvailability, clientTimeZone: string | null): HostAvailability {
  if (availability.hours.length > 0) return availability;
  return { ...availability, timeZone: usableZone(clientTimeZone), hours: DEFAULT_HOURS };
}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `pnpm exec vitest run --maxWorkers=1 lib/leads/host-hours.test.ts`
Expected: PASS, the old tests included.

---

### Task 3: One shared check for the chosen person

**Files:**
- Modify: `server/domain/host-availability.ts`, `server/domain/leads.ts` (lines 127 to 142), `server/domain/lead-drafts.ts` (lines 68 to 75), `server/domain/lead-reads.ts` (line 248)
- Test: `server/domain/lead-flow.integration.test.ts`, `server/domain/phase4.integration.test.ts`

- [ ] **Step 1: Write the failing test.** In `server/domain/lead-flow.integration.test.ts`, add a test next to the existing submit tests. Using that file's own helpers, invite a second person to the client and do **not** add them as a host. Submit a lead with that person's member id as `hostMemberId`. Assert the lead is saved with stage `awaiting_client`. Add a second test that submits with the member id of a person of a different client and asserts a `DomainError` with code `not-found`.

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/lead-flow.integration.test.ts`
Expected: the first new test FAILS with "The specified host is not an active host for this campaign."

- [ ] **Step 2: Add the team list and the check.** In `server/domain/host-availability.ts`, replace `listCampaignHostChoices` with:

```ts
export interface TeamChoice {
  readonly memberId: string;
  readonly displayName: string;
  /** The client's own time zone, for a person who has set no hours. */
  readonly timeZone: string | null;
}

/** The active people of the campaign's client, for a campaign the organisation serves. A name and the client's zone, never a job title or an email. */
export async function listCampaignTeam(tx: ScopedTransaction, campaignId: string): Promise<readonly TeamChoice[]> {
  const rows = await tx.execute<{ member_id: string; display_name: string; time_zone: string | null }>(
    sql`select member_id, display_name, time_zone from public.app_campaign_team(${campaignId}::uuid)`,
  );
  return rows.rows.map((row) => ({ memberId: row.member_id, displayName: row.display_name, timeZone: row.time_zone }));
}

/** The chosen person must be an active member of the campaign's client. The lead form, a draft and the hours read all ask here. */
export async function requireTeamMember(tx: ScopedTransaction, campaignId: string, memberId: string): Promise<TeamChoice> {
  const choice = (await listCampaignTeam(tx, campaignId)).find((person) => person.memberId === memberId);
  if (choice === undefined) throw new DomainError("not-found", "That person is not an active member of this client's team.");
  return choice;
}
```

- [ ] **Step 3: Use it in the hours read.** In the same file, inside `readAvailability`, delete the `campaignHost` query and the `named` lookup (the two statements between the agency check and the `windows` query) and put this in their place:

```ts
  const named = await requireTeamMember(tx, campaignId, hostMemberId);
```

Then change the `return` of `readAvailability` to apply the default week:

```ts
  return {
    hostMemberId,
    displayName: named.displayName,
    ...withDefaultHours({ timeZone: windows[0]?.timeZone ?? null, hours: windows.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })), blocks }, named.timeZone),
  };
```

Also delete `readonly jobTitle: string;` from the `HostAvailabilityRecord` interface at the top of the file. Change the imports: remove `campaignHost` from the schema import and `and`, `eq` if nothing else in the file uses them, and import `withDefaultHours` from `@/lib/leads/host-hours`.

- [ ] **Step 4: Use it when a lead is submitted.** In `server/domain/leads.ts`, replace step 4 of `checkSubmission` (the `campaignHost` query at lines 127 to 142, with its `if (hostRow === undefined)` throw) with:

```ts
  // 4. The chosen person is an active member of the campaign's client.
  await requireTeamMember(tx, parsed.campaignId, parsed.hostMemberId);
```

Import `requireTeamMember` from `@/server/domain/host-availability` and remove `campaignHost` from the schema import.

- [ ] **Step 5: Use it when a draft is saved.** In `server/domain/lead-drafts.ts`, replace the body of the `if (values.hostMemberId !== undefined && values.hostMemberId !== null)` block with:

```ts
    await requireTeamMember(tx, campaignId, values.hostMemberId);
```

Import it and remove `campaignHost` from the schema import.

- [ ] **Step 6: Use the team list for the lead form.** In `server/domain/lead-reads.ts`, change the import to `listCampaignTeam` and line 248 to:

```ts
      for (const choice of await listCampaignTeam(tx, row.id)) hosts.push({ id: choice.memberId, campaignId: row.id, name: choice.displayName });
```

Change the comment above it to: `// The supply side sees the name of each person of the client's team and nothing else, through a function that answers for the campaigns it serves.`

- [ ] **Step 7: Run the tests.**

Run: `pnpm typecheck`
Expected: no errors. If another file still imports `listCampaignHostChoices`, point it at `listCampaignTeam`.

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/lead-flow.integration.test.ts server/domain/phase4.integration.test.ts`
Expected: PASS. A test that expected the old message "not an active host" is updated to the new message.

---

### Task 4: Job titles

Today a job title is typed when someone is made a host and stored on `campaign_host`. The client and Fynix now read it from `member.job_title`, which every invited person already has. An agency gets no job title at all (owner decision, 2026-11-26).

**Files:**
- Modify: `server/domain/lead-record.ts` (three reads, near lines 204, 263 and 322), `server/db/testing/seed.ts` (line 279), `server/domain/test-helpers.ts` (line 106)
- Test: `server/db/leak-matrix.integration.test.ts`, `server/domain/phase4.integration.test.ts`

- [ ] **Step 1: The client's lead record (near line 204).** Replace the query with one that needs no join:

```ts
        : await tx.select({ name: member.displayName, jobTitle: member.jobTitle }).from(member).where(eq(member.id, row.hostMemberId)).limit(1);
```

- [ ] **Step 2: The agency's lead record (near line 263).** Delete the `hostRow` read that selects `campaignHost.jobTitle`. Then run `grep -n "hostRow" server/domain/lead-record.ts` and `grep -rn "hostJobTitle" app components lib server`, and remove the job title from the agency's record type and from every screen that shows it to an agency. The host's name stays. Do not replace the read with another source: an agency gets no job title.

- [ ] **Step 3: The Fynix lead record (near line 322).** Change `hostJobTitle: campaignHost.jobTitle` to `hostJobTitle: host.jobTitle` and delete the `.leftJoin(campaignHost, ...)` line under it. `host` is the `member` alias already joined on `lead.hostMemberId`.

- [ ] **Step 4: Remove the unused import.** Take `campaignHost` out of the schema import in `lead-record.ts`. For the client and Fynix records, where a returned type says `jobTitle: string`, pass `?? ""` for a null.

- [ ] **Step 5: Move the seed marker.** In `server/db/testing/seed.ts`, line 279 inserts a `campaign_host` row with `jobTitle: SETUP_MARKERS.hostTitle`. The leak tests search for that marker. Replace the insert with an update of the same member:

```ts
  await db.update(member).set({ jobTitle: SETUP_MARKERS.hostTitle }).where(eq(member.id, memberOf(kestrelUser)));
```

Keep the imports the file needs (`member`, `eq`) and remove `campaignHost` if nothing else uses it.

- [ ] **Step 6: The test helper.** `server/domain/test-helpers.ts` line 106 calls `addCampaignHost`. Delete that call and its import: a campaign no longer needs it, because the client's manager is already an active member.

- [ ] **Step 7: Run the tests.**

Run: `pnpm typecheck`
Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/db/leak-matrix.integration.test.ts server/domain/phase4.integration.test.ts`
Expected: PASS. A leak probe that expected the host title marker in `campaign_host` now finds it through `member`; if a probe names the table, point it at `member.job_title`.

---

### Task 5: Go-live wording and the set-up checklist

**Files:**
- Modify: `lib/campaign-status.ts`, `server/fynix/errors.ts` (line 33), `server/domain/setup-overview.ts` (line 46), `lib/fynix/setup-checklist.ts` (line 24)
- Test: `lib/campaign-status.test.ts`, `server/domain/campaigns.integration.test.ts`

- [ ] **Step 1: Change the expected words in the tests first.** In `lib/campaign-status.test.ts`, change every expected message that says "no active host" to the new text below. The code `no-host` stays: it is a code name.

- [ ] **Step 2: Change the words.**

`lib/campaign-status.ts`, in `goLiveRefusal`:

```ts
  return state.hasHost ? null : { code: "no-host", message: "The client has no active team member yet." };
```

Change the comment above the function to: `/** The rule: a campaign goes live when the client and the coordinator have both accepted the agreement and the client has an active team member. */`

In `notLiveReason` in the same file, find the sentence shown to an agency when `hasHost` is false and reword it to: `The client has no active team member yet.`

`server/fynix/errors.ts`:

```ts
  "no-host": "The client needs at least one active team member before the campaign can go live.",
```

- [ ] **Step 3: The set-up checklist.** In `server/domain/setup-overview.ts`, the `campaignsWithoutHost` query uses `notExists(... campaignHost ...)`. Replace the inner query with one over `member`:

```ts
notExists(tx.select({ one: member.id }).from(member).where(and(eq(member.orgId, campaign.clientOrgId), eq(member.status, "active"))))
```

Remove `campaignHost` from the import. In `lib/fynix/setup-checklist.ts` line 24, change the label and the link, since the hosts tab is renamed in task 7:

```ts
    ...findings.campaignsWithoutHost.map((row) => ({ key: `host-${row.ref}`, label: `${row.name}: the client has no active team member`, href: `/fynix/campaigns/${row.ref}/team` })),
```

- [ ] **Step 4: Fix the tests that relied on "no host".** In `server/domain/campaigns.integration.test.ts` and `server/domain/phase2.integration.test.ts`, any test that expects `no-host` for a client that has an active manager now passes go-live. Rewrite it to use a client whose only member is suspended (`member.status = 'suspended'`), which is the one case that still refuses.

- [ ] **Step 5: Run the tests.**

Run: `pnpm exec vitest run --maxWorkers=1 lib/campaign-status.test.ts`
Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/campaigns.integration.test.ts server/domain/phase2.integration.test.ts`
Expected: PASS.

---

### Task 6: The client's Working hours page

The page `/client/hosts` ("Hosts & hours") becomes `/client/hours` ("Working hours"). It lists every active person of the client. Each person still edits only their own hours and blocked times. Adding and pausing a host go.

**Files:**
- Modify: `server/domain/hosts-tenant.ts` (`listClientHosts`, lines 21 to 81)
- Move: `app/(client)/client/hosts/page.tsx` to `app/(client)/client/hours/page.tsx`
- Create: `app/(client)/client/hosts/page.tsx` (a redirect)
- Modify: `components/hosts/hosts-view.tsx`, `components/hosts/host-actions.tsx`, `components/shell/nav.ts` (line 74)
- Delete: `components/hosts/host-forms.tsx`
- Test: `server/domain/tenant-flows.integration.test.ts`

- [ ] **Step 1: Write the failing test.** In `server/domain/tenant-flows.integration.test.ts`, beside the existing `listClientHosts` test, add one: a client with two active members and no `campaign_host` row at all; `listClientHosts` returns both, sorted by name, each with `hours: []`, and `own` true only for the signed-in one.

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/tenant-flows.integration.test.ts`
Expected: FAIL, the list is empty.

- [ ] **Step 2: Read people, not hosts.** In `server/domain/hosts-tenant.ts`, remove `campaigns` and `assignments` from the `TenantHost` interface and replace the first query and the early return of `listClientHosts` with:

```ts
    const people = await tx
      .select({ memberId: member.id, name: member.displayName, jobTitle: member.jobTitle, userId: member.userId })
      .from(member)
      .where(and(eq(member.orgId, actor.orgId), eq(member.status, "active")))
      .orderBy(asc(member.displayName));
    if (people.length === 0) return [];

    const memberIds = people.map((row) => row.memberId);
```

and the final `return` with:

```ts
    return people.map((person): TenantHost => ({
      memberId: person.memberId,
      name: person.name,
      jobTitle: person.jobTitle ?? "",
      own: person.userId === actor.userId,
      hours: hours.filter((row) => row.memberId === person.memberId).map(({ weekday, startMinute, endMinute, timeZone }) => ({ weekday, startMinute, endMinute, timeZone })),
      blocks: blocks.filter((row) => row.memberId === person.memberId).map(({ id, startsAt, endsAt, note }) => ({ id, startsAt, endsAt, note })),
    }));
```

Change the comment above the function to: `/** The active people of the client's organisation, with their weekly hours and their blocked times from now on. */`

In the same file delete `addClientHost`, `pauseClientHost`, `ClientHostRecord` and `requireManager`, and change the message in `requireClient` to `"Only a client can change its team's working hours."`. Remove the imports they leave unused.

- [ ] **Step 3: Remove the two actions.** In `server/domain/team-actions.ts`, delete `addClientHostAction` and `pauseClientHostAction` and their imports and schemas. Every export of an actions file is a public endpoint, so leave nothing behind.

- [ ] **Step 4: Move the page.** Move `app/(client)/client/hosts/page.tsx` to `app/(client)/client/hours/page.tsx`. In it: set the metadata title and the page title to "Working hours", and the one sentence under the title to "When each person on your team can take meetings. Everyone sets their own hours." Remove what reads `assignments` or `campaigns`, the add host form and the closed-campaign read-only logic. Pass `basePath="/client/hours"`.

- [ ] **Step 5: Leave a redirect at the old address.** Create `app/(client)/client/hosts/page.tsx`:

```tsx
import { redirect } from "next/navigation";

/** The old address of the working hours page, kept so a bookmark still lands. */
export default function OldHostsPage(): never {
  redirect("/client/hours");
}
```

Check `node_modules/next/dist/docs/` for `redirect` in this version first, and follow it if it differs.

- [ ] **Step 6: The components.** In `components/hosts/hosts-view.tsx` and `components/hosts/host-actions.tsx`: remove the campaign chips, the `ManageHosts` prop and the pause control (the `InlineAction` that uses `pauseClientHostAction`). Keep the hours form, the block form and the remove-block action. Delete `components/hosts/host-forms.tsx`.

- [ ] **Step 7: The menu.** In `components/shell/nav.ts` line 74:

```ts
          { label: "Working hours", icon: "users", href: "/client/hours" },
```

- [ ] **Step 8: Check it.**

Run: `pnpm typecheck && pnpm lint`
Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/tenant-flows.integration.test.ts`
Expected: PASS.

Then, on http://localhost:3020 as a client person: `/client/hours` lists every active person, your own row has the hours and blocked-time forms, another person's row is read only, `/client/hosts` lands on `/client/hours`, and the page works at 390 px wide.

---

### Task 7: The campaign's Client team tab (Fynix)

The tab "Hosts" on a Fynix campaign becomes "Client team". It lists every active person of the campaign's client, with the same hours and blocked-time forms as today. Adding and removing a host go.

**Files:**
- Modify: `server/domain/campaign-overview.ts` (`listCampaignHosts` near line 224, and the count near line 182)
- Move: `app/(fynix)/fynix/campaigns/[ref]/hosts/page.tsx` to `app/(fynix)/fynix/campaigns/[ref]/team/page.tsx`
- Create: `app/(fynix)/fynix/campaigns/[ref]/hosts/page.tsx` (a redirect)
- Modify: `components/fynix/campaigns/campaign-tabs.tsx` (line 14), `hosts-table.tsx`, `host-panel.tsx`, `host-actions.tsx`
- Modify: `server/domain/hosts.ts`, `server/fynix/actions.ts` (lines 605 to 630), `server/domain/inputs.ts` (lines 244 to 248)
- Test: `server/domain/campaign-overview.integration.test.ts`, `server/domain/hosts.integration.test.ts`

- [ ] **Step 1: Write the failing test.** In `server/domain/campaign-overview.integration.test.ts`, add: a campaign whose client has two active members and no `campaign_host` row; `listCampaignHosts` returns both under `hosts`, each `active: true`, and `candidates` is empty.

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/campaign-overview.integration.test.ts`
Expected: FAIL, `hosts` is empty.

- [ ] **Step 2: Read people, not hosts.** In `listCampaignHosts`, replace the `rows` query with:

```ts
    const people = await tx
      .select({ memberId: member.id, displayName: member.displayName, jobTitle: member.jobTitle })
      .from(member)
      .where(and(eq(member.orgId, target.clientOrgId), eq(member.orgKind, "client"), eq(member.status, "active")))
      .orderBy(asc(member.displayName));
    const rows = people.map((person) => ({ ...person, jobTitle: person.jobTitle ?? "", active: true }));
```

Delete the `switchedOn` and `candidates` queries and return `candidates: []`, so the page keeps its shape until the components are trimmed in step 5.

Near line 182, count people the same way:

```ts
    const [hosts] = await tx.select({ n: count() }).from(member).where(and(eq(member.orgId, row.clientOrgId), eq(member.orgKind, "client"), eq(member.status, "active")));
```

Remove `campaignHost` and `notInArray` from the imports if nothing else uses them.

- [ ] **Step 3: Remove adding and removing a host.** Delete `addCampaignHost` and `deactivateCampaignHost` from `server/domain/hosts.ts` (delete the file if nothing else is left in it), their two actions in `server/fynix/actions.ts`, and `addCampaignHostSchema` and `deactivateCampaignHostSchema` with their types in `server/domain/inputs.ts`. `setHostHours`, `addHostBlock` and `removeHostBlock` in `server/domain/availability.ts` stay: they already accept any active member of a client.

- [ ] **Step 4: Move the page.** Move the page to `app/(fynix)/fynix/campaigns/[ref]/team/page.tsx`, set its title to "Client team", and leave this at the old address:

```tsx
import { redirect } from "next/navigation";

/** The old address of the client team tab. */
export default async function OldCampaignHostsPage({ params }: PageProps<"/fynix/campaigns/[ref]/hosts">): Promise<never> {
  const { ref } = await params;
  redirect(`/fynix/campaigns/${ref}/team`);
}
```

- [ ] **Step 5: The tab and the components.** In `campaign-tabs.tsx` line 14:

```ts
    { key: "hosts", label: "Client team", href: `${base}/team`, count: hostCount },
```

In `hosts-table.tsx`, `host-panel.tsx` and `host-actions.tsx`: remove the add host form, the remove or deactivate control and the "inactive" state, which can no longer occur. Keep the hours and blocked-time forms. An empty table says: "This client has no active team member yet. Invite one from the client's People page."

- [ ] **Step 6: The old test file.** In `server/domain/hosts.integration.test.ts`, delete the tests of `addCampaignHost` and `deactivateCampaignHost`. Keep the tests of hours and blocked times, and the test added in task 1.

- [ ] **Step 7: Check it.**

Run: `pnpm typecheck && pnpm lint`
Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/campaign-overview.integration.test.ts server/domain/hosts.integration.test.ts`
Expected: PASS.

Then, on http://localhost:3020 as a Fynix admin: the campaign shows a "Client team" tab with every active person of the client, hours can be set for one of them, the old `/hosts` address lands on `/team`, and Fynix staff see no write control.

---

### Task 8: The words

No screen, email, error or notice says "host" after this task.

**Word list**

| Was | Now |
|---|---|
| Host, Meeting host | Client team member |
| Select a host | Select a team member |
| No hosts for this campaign yet | This client has no active team member yet |
| The campaign sets which alias and which host you can choose | The campaign sets which alias and which team member you can choose |
| Host hours, the host's hours | Working hours, their working hours |
| Times are in the host's zone | Times are in their time zone |
| This host has not set working hours yet, so any time can be proposed and none can be checked | Delete the sentence. It can no longer happen: a person with no hours gets the default week |
| Choose a host to see their working hours and pick from their free times | Choose a team member to see their working hours and pick from their free times |
| Use the host's hours | Use their working hours |
| `Host: <time>` under a proposed time | `Their time: <time>` |
| Hosts & hours | Working hours |
| Add host, Pause host, Host added | Removed in tasks 6 and 7 |
| A table column headed "Host" | Team member |

**Files:** every file that the command in step 1 prints. On 2026-11-26 the list was: `components/leads/submit-lead-form.tsx`, `components/leads/host-times.tsx`, `components/leads/lead-record-view.tsx`, `components/leads/review-panel.tsx`, `components/leads/fynix-leads-view.tsx`, `components/leads/lead-forms.tsx`, `components/meetings/meetings-table.tsx`, `components/meetings/upcoming-meetings.tsx`, `components/meetings/portal-meetings.tsx`, `components/meetings/meeting-actions.tsx`, `components/kit/status-chip.tsx`, `components/fynix/forms/campaign-forms.tsx`, `components/fynix/forms/availability-forms.tsx`, `components/fynix/forms/inline-action.tsx`, `components/fynix/campaigns/campaign-lifecycle-actions.tsx`, `app/(client)/client/review/page.tsx`, `app/(client)/client/leads/page.tsx`, `app/(agency)/agency/leads/new/page.tsx`, `app/(coordinator)/coordinator/leads/new/page.tsx`, `lib/leads/host-hours-text.ts`, `lib/leads/notice-display.ts`, `lib/fynix/audit-text.ts`, `lib/fynix/format.ts`, `lib/fynix/block-form.ts`, `lib/domain/weekly-hours.ts`, `server/domain/errors.ts`, and the pages and components already changed in tasks 6 and 7.

- [ ] **Step 1: List what is left.**

Run:
```bash
grep -rnE "['\"\`>][^'\"\`<>{}]*\b[Hh]osts?\b" app components lib server/fynix/errors.ts server/domain --include="*.ts" --include="*.tsx" | grep -vE "\.test\.|integration|^lib/http/security-headers.ts|^lib/auth/next-path.ts|^lib/email/launch-templates.ts"
```

The pattern looks at text inside quotes and inside JSX. The three files left out use "host" for an internet host name, which is a different word and stays.

- [ ] **Step 2: Change each line by the word list.** Change only words a person reads: text in JSX, strings shown on screen, error messages, labels, `aria-label` values. Leave every identifier alone (`hostMemberId`, `HostOption`, `hostHours`, `name="hostMemberId"`, `id="lead-host"`, file names, route segments other than the two renamed above, database names). A message thrown in `server/domain` that can reach a screen is changed too.

For the lead form, these are the exact new values in `components/leads/submit-lead-form.tsx`:

```tsx
          <Group title="Campaign and sender" note="The campaign sets which alias and which team member you can choose.">
```
```tsx
                <Field id="lead-host" label="Client team member">
```
```tsx
                    placeholder="Select a team member"
                    emptyLabel={campaignId === "" ? "Choose a campaign first" : "This client has no active team member yet"}
```

and the label of an option, which is the name alone. Also delete `jobTitle` from the `HostOption` interface in the same file (line 33) and from where `hosts` is built in the two `leads/new` pages if they set it:

```tsx
                    options={campaignHosts.map((h) => ({ value: h.id, label: h.name }))}
```

In `components/leads/host-times.tsx`, delete the branch that renders "This host has not set working hours yet": with the default week, `availability.hours` is never empty for a chosen person.

- [ ] **Step 3: Run the command of step 1 again.**

Expected: no line that a person can read. A line that is a code comment or an identifier inside a string (a form field name, a CSS class, a test id) may stay.

- [ ] **Step 4: Emails.** `lib/email/launch-templates.ts` uses "host" only for the Meet link's internet host. Confirm no template text says "host" to a reader:

Run: `pnpm exec vitest run --maxWorkers=1 lib/email`
Expected: PASS, the invariants test included.

- [ ] **Step 5: Unit tests of the changed files.**

Run: `pnpm typecheck && pnpm lint`
Run: `pnpm exec vitest run --maxWorkers=1 lib/leads lib/fynix lib/campaign-status.test.ts`
Expected: PASS. A test that asserts an old sentence is updated to the new one.

- [ ] **Step 6: The isolation check for new screens.** With the dev server running, open the agency lead form and the client Working hours page, view the page source and search it for an agency name on the client page and for a client person's email on the agency page. Neither may appear.

---

### Task 9: Saved contacts get an "Invite to portal" button

Saved client contacts stay. Fynix can invite one to the portal with one press. No new contact can be added without a login: the "Add contact" button goes, and Fynix invites a person from the People page as today.

**Files:**
- Modify: `server/domain/client-contacts.ts`, `server/fynix/actions.ts`, `components/fynix/clients/contacts-panel.tsx`
- Test: `server/domain/client-contacts.integration.test.ts`

- [ ] **Step 1: Write the failing tests.** In `server/domain/client-contacts.integration.test.ts`, with that file's helpers, add three tests of a new function `inviteClientContact(deps, actor, contactId)`:
  - a contact with a name, an email and a job title: an invite row exists for that email in the contact's client, with role `member`, and one message is in `email_outbox`
  - a contact with no email: a `DomainError` with code `invalid-input` and the message "This contact needs an email and a job title before they can be invited."
  - a contact with no job title: the same error

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/client-contacts.integration.test.ts`
Expected: FAIL, `inviteClientContact` is not exported.

- [ ] **Step 2: Write the function.** In `server/domain/client-contacts.ts`:

```ts
/**
 * Invites a saved contact to the portal as a member of their client (owner decision, 2026-11-26). The contact stays on the list. An invite needs an
 * email and a job title, so a contact without either is refused in plain words. Every other refusal is `issueInvite`'s own: the address already has
 * an account, the client is archived, or the terms are missing.
 */
export async function inviteClientContact(deps: DomainDeps, actor: FynixActor, contactId: string): Promise<IssuedInvite> {
  const id = parseInput(uuidSchema, contactId);
  const [contact] = await fynixRead(deps.fynixDb, actor, (tx) =>
    tx.select(clientContactColumns).from(clientContact).where(and(eq(clientContact.id, id), isNull(clientContact.removedAt))).limit(1),
  );
  if (contact === undefined) throw new DomainError("not-found", "That contact is gone already.");
  if (contact.email === null || contact.jobTitle === null) {
    throw new DomainError("invalid-input", "This contact needs an email and a job title before they can be invited.");
  }
  return issueInvite(deps, actor, {
    organisationId: contact.clientOrgId,
    email: contact.email,
    name: contact.name,
    jobTitle: contact.jobTitle,
    ...(contact.phone === null ? {} : { phone: contact.phone }),
    role: "member",
  });
}
```

Import `issueInvite` and `IssuedInvite` from `@/server/domain/invites`, and `fynixRead`, `uuidSchema`, `isNull`, `and`, `eq` where the file does not have them yet. Before saving, check two things in the code: that `"member"` is a value of `inviteRole` in `server/domain/inputs.ts`, and how the other functions of this file call `fynixRead`. Match them.

- [ ] **Step 3: The action.** In `server/fynix/actions.ts`, directly under `removeClientContactAction`:

```ts
export async function inviteClientContactAction(_previous: FormState, formData: FormData): Promise<FormState> {
  return runAction({
    formData,
    fieldNames: [],
    build: () => ({ contactId: field(formData, "contactId") }),
    schema: contactInput,
    labels: {},
    messages: { "not-found": "That contact is gone already." },
    ownMessages: ["invalid-input"],
    perform: async (deps, actor, input) => {
      await inviteClientContact(deps, actor, contactInput.parse(input).contactId);
    },
  });
}
```

Check how `ownMessages` is used by the campaign go-live action near line 165 and keep the same form. Add `inviteClientContact` to the import from `@/server/domain/client-contacts`.

- [ ] **Step 4: The panel.** In `components/fynix/clients/contacts-panel.tsx`:
  - remove the `action` of the `PanelHeader` (the "Add contact" `FormSheet`) and the import of `AddContactForm`
  - beside the existing remove control of each row, for `canWrite` only, add:

```tsx
                    <InlineAction action={inviteClientContactAction} fields={{ contactId: person.id }} label={`Invite ${person.name} to the portal`} variant="secondary" size="sm">
                      Invite to portal
                    </InlineAction>
```

  - under the panel title, one sentence: "Saved contacts from before. Invite one to give them a login."

  Import `inviteClientContactAction` from `@/server/fynix/actions`. Delete `AddContactPersonForm` from `components/fynix/forms/contact-person-forms.tsx`, and `addClientContactAction` from `server/fynix/actions.ts`, if nothing else uses them. `addClientContact` in the domain stays for now, because the tests and the seed use it.

- [ ] **Step 5: Check it.**

Run: `pnpm typecheck && pnpm lint`
Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/client-contacts.integration.test.ts`
Expected: PASS.

Then, as a Fynix admin on a client's page: a saved contact shows "Invite to portal", pressing it says "Saved", `pnpm mail:last` prints an invite for that address, there is no "Add contact" button, and a contact with no email gets the plain refusal. As Fynix staff the button is not shown.

---

### Task 10: Notes for the next person, and the full check

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the wording note.** In `CLAUDE.md`, directly under the paragraph that begins "**Wording (owner decision, 2026-11-24):**", add:

```markdown
**Client team, not hosts (owner decision, 2026-11-26):** there is no host concept. Every active member of a client can be chosen for a meeting, on every campaign of that client, and a person who has set no hours counts as working Monday to Friday, 09:00 to 17:00 in the client's time zone (`withDefaultHours` in `lib/leads/host-hours.ts`). Nothing a person reads says "host": write "client team member". Code names keep the old word (`hostMemberId`, `host_hours`, `host_block`, `has_host`, the code `no-host`). The agency's list comes from the database function `app_campaign_team` (migration 0096) and the one check is `requireTeamMember` in `server/domain/host-availability.ts`. The table `campaign_host` and the function `app_campaign_host_names` are no longer used and go in the clean-up phase. Spec: `docs/superpowers/specs/2026-11-26-calendar-and-meetings-design.md`.
```

In the same file, in the "Hierarchy and set-up tables" bullet, change "`campaign_host` is a member of the campaign's client, pinned by composite foreign keys" to "`campaign_host` is no longer used (see the client team note above)". In the "Nothing is deleted" bullet, change "hosts are deactivated" to "members are suspended" only if that leaves the sentence true, otherwise delete the two words.

- [ ] **Step 2: The checks, once.**

Run: `pnpm lint`
Run: `pnpm typecheck`
Run: `pnpm exec vitest run --maxWorkers=1 lib/leads lib/fynix lib/campaign-status.test.ts lib/email`
Run: `pnpm test:integration -- --maxWorkers=1 server/db/leak-matrix.integration.test.ts server/db/structure.integration.test.ts server/db/setup-tables.integration.test.ts`
Run: `pnpm build`
Expected: all pass. Report exactly which of these ran. Do not claim a full test run: the full suite runs only in the main checkout on the owner's word.

- [ ] **Step 3: The owner's check-in.** On http://localhost:3020:
  1. As Fynix, invite a second person to a client. Do nothing else for them.
  2. As the agency, start a new lead for that client's campaign. The second person is on the "Client team member" list, with Monday to Friday, 09:00 to 17:00 as their hours.
  3. Submit the lead with that person. As the client, pick a time. The meeting shows that person.
  4. As the client, open Working hours. Everyone on the team is listed.
  5. As Fynix, open the campaign's Client team tab and set hours for the second person.
  6. Make a campaign active for a client that has a team member and an accepted agreement. It goes live with no host step.
  7. On a client's page, press "Invite to portal" on a saved contact.

- [ ] **Step 4: Refresh the code graph.**

Run: `cd "/Users/a12345/Desktop/AI/Fynix Digital" && graphify update .`

- [ ] **Step 5: Stop.** Do not commit. Tell the owner what changed, which checks ran and what they showed, and wait for his word to commit on `development`.

---

## What ships to the live site with this step

One migration, 0096: two new functions, two policies recreated, one function body replaced. No table or column is added, changed or dropped. The process still running during the deploy keeps working, because `campaign_host` and `app_campaign_host_names` are untouched.

## Left for later steps

| Item | Step |
|---|---|
| `lead_draft_complete` stops requiring a chosen person. `lead.host_member_id` is no longer written | E |
| `meeting.host_member_id` becomes nullable | E |
| The chooser on the lead form goes. Several people are invited | E |
| Dropping `campaign_host`, `app_campaign_host_names`, the unused columns | Clean-up phase of the roadmap |
