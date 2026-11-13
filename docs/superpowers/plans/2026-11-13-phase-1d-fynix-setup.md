# Phase 1D: Fynix Set-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** everything a Fynix admin needs to set up a lead generation engagement, as server code behind a database that enforces it: a two level organisation hierarchy (supplier, partner agency), Fynix admin and staff roles that the database itself respects, campaigns that carry a time zone and a meeting length and are always run by a supplier, versioned client and supplier agreements with their acceptances, the monthly share each agency gets of the supplier's target, the client people who take meetings for a campaign, and their weekly hours and blocked times. Every write is audited the same way 1C audits its writes. There is no UI and no route in this phase, and no tenant role gets any access to the new data yet.

**Architecture:** the 1C architecture, unchanged. Domain services are plain functions in `server/domain/` that take `DomainDeps` and a `FynixActor`, parse their input with zod at the boundary, and change data only inside `fynixWrite`, which opens the Fynix scope transaction and appends to `audit_log` in the same transaction (the database refuses to commit a Fynix change without an audit row). New in 1D: `fynixWrite` also requires the actor to be a Fynix **admin** (`member.role = 'manager'`) and a statement trigger on every table Fynix can write repeats that rule inside the database (`fynix_admin_required`), so staff cannot change set-up even through a raw statement. Structure that a CHECK or a foreign key can say is said there (composite foreign keys pin a parent to an agency and a host to the campaign's client); structure that needs a lookup is a trigger (no grandparent, a campaign's supplier has no parent, a share goes to the supplier or its partners, no overlapping hours). Every new table enables row-level security, gets a policy for the one role that holds a grant (`leads_fynix`), appears in the access matrix and in the leak matrix, and holds nothing for the client and agency roles until phase 1E decides who sees which column.

**Tech Stack:** the 1A to 1C stack, unchanged: PostgreSQL 16, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, zod 4.6.7, Better Auth 1.7.20, Vitest 5.1.0, Next.js 16.4.6, Node 24, pnpm 11.3.0. **No new dependency** and no Postgres extension (an exclusion constraint for overlapping hours would need `btree_gist`, so the overlap rule is a trigger).

**Spec:** `docs/superpowers/specs/2026-11-12-leadgen-portal-design-v2.md`, sections 5 (identities and isolation), 6 (organisations and accounts), 7 (campaigns and agreements, hosts and availability), 14 (data model), 15 (architecture) and 20 (build phases, row 1D). **Previous plan:** `docs/superpowers/plans/2026-11-12-phase-1c-domain.md` (built on `development`).

**Exit criteria for 1D:** a Fynix admin can, through service functions and tests only, create a supplier and a partner agency, create and change a campaign for a supplier with a time zone and a meeting length, publish and supersede client and supplier agreements, record an acceptance, set and remove shares (with the over-allocation flag), add and deactivate hosts, set weekly hours and add and remove blocked times; Fynix staff are refused each of those with `admin-required` and the database refuses them even when the service is skipped; every change is in `audit_log`; every new table and column is in the structure and leak tests and no tenant role can read or write any of it.

---

## How to work through this plan

- Work on the `development` branch in `/Users/a12345/Desktop/AI/Fynix Digital/fynix-leads`. Commit after each task. Never push, never commit to `main`.
- Commit messages are plain sentences with no attribution lines and no em or en dashes (the copy rule covers commit messages, code, comments and docs).
- Run every command from the repository root. A block headed **File** is the complete content of that file. A block headed **Edit** shows the exact text to find (it occurs once) and the text to put in its place. A block headed **Append** goes at the end of the file. Several Edit blocks for one file apply in the order shown.
- TDD order inside a task: write the tests, run them and see them fail for the stated reason, write the code, run them and see them pass. Where a step says "Expected: FAIL", a pass means the test is wrong. The probes in the leak matrix (Task 14) cannot fail before the grants exist, so that task proves them with the "matrix itself" tests instead.
- Read `AGENTS.md` before touching Next.js code. This phase touches no route and no component.
- **This machine runs one Postgres 16 shared with other projects.** This plan creates no role and no database. It only adds objects to `fynix_leads_test` (through `pnpm test:integration`) and, if the owner runs it, `fynix_leads` (through `pnpm db:migrate`). Never print `.env.local`. Never kill a process.
- **Migrations are additive.** A deploy migrates before it builds, so the old process runs against the new schema for a while. Every column added to an existing table has a default or allows null; nothing is dropped or renamed. Never edit an applied migration (a migration that is not yet applied to any database, and not yet committed, may be hand edited, and the plan says where). Workflow, as in 1C: `pnpm db:generate --name=<name>` for DDL, `pnpm db:generate --custom --name=<name>` for hand written SQL (it writes an empty file, a snapshot and a journal entry), then put the SQL in. The migrator applies each migration in its own transaction. If `server/db/migration-journal.test.ts` complains that a `when` is not above the one before it, raise the new entry's `when` by hand (the machine clock was behind).
- Typing: no `any`, no casts except where a test needs a fake and says so, explicit return types on exported functions, specific errors (`DomainError` with a code). Use the `@/` import alias. Test names state the behaviour.
- Per task, "run the checks" means the commands listed in that task. The whole set (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`) runs in Task 15.

## Decisions in this plan that the scope did not settle

| # | Decision | Why |
|---|---|---|
| S1 | **The admin rule lives in two places.** `fynixWrite` (`server/domain/fynix-write.ts`) refuses a Fynix member whose role is not `manager` with `DomainError("admin-required")`, and the migration `0029_fynix_admin_required` adds a statement level `BEFORE INSERT OR UPDATE OR DELETE` trigger to every table `leads_fynix` can write, except `audit_log` and `email_outbox`, which raises unless the request's user is an active `manager` of the Fynix organisation. A structural check fails for a Fynix writable table that lacks the trigger. | 1C already has a database side guarantee for "Fynix changes are audited and only an active Fynix member can append the audit row". Without a database rule for the role, a service that forgot the check (or a raw statement on the Fynix pool) would let staff change set-up. The audit policy was not widened to admins because phase 2 staff writes (leads, messages) go through the same audit log and must stay possible; the trigger sits on set-up tables only. |
| S2 | **Every existing `fynixWrite` caller becomes admin only**, because every Fynix write that exists today is set-up (organisations, campaigns, invites, members, aliases, terms). A later phase that lets staff change leads adds its own entry point beside `fynixWrite` and its own tables without the admin trigger. | The scope says every set-up write requires an admin and lists the existing 1C functions. One helper, one rule. `fynixRead` stays open to staff. |
| S3 | **The seed makes the first Fynix user a `manager` and adds a second Fynix user who is `member` (staff).** `rig.actor` is the admin, `rig.staffActor` the staff member. | The seeded Fynix user was a plain `member` (the column default), so under the new rule `rig.actor` would be refused. `pnpm admin:create` already creates managers. |
| S4 | **`parent_org_id` is pinned by a composite foreign key** `(parent_org_id, parent_org_kind)` to `organisation (id, kind)`, where `parent_org_kind` is a generated column that is `'agency'` when a parent is set and `NULL` otherwise (the foreign key is not checked while a column is `NULL`). Checks refuse self and non agency children; a trigger refuses a grandparent. | The same pattern as `campaign.client_org_kind` and `agency_alias.member_org_kind`: the kind is a constant the database computes, so no caller can lie about it. |
| S5 | **Changing an organisation's parent is refused (trigger) when it has partner agencies, is the supplier of any campaign, or holds a campaign share.** There is no service function to change a parent in 1D; the trigger protects the data from a raw statement. A new parent can be set on an organisation that has none of those. | The scope asks for children and campaign supplier. A share that points at an organisation that stops being a partner of the campaign's supplier would break the share rule, so shares are included. |
| S6 | **A campaign's supplier is checked by trigger, not by a foreign key**: `BEFORE INSERT OR UPDATE OF agency_org_id` refuses an organisation that has a parent. The service says `not-a-supplier` first. | A foreign key cannot test "has no parent". The trigger reads the organisation `FOR SHARE`, like the brand copy trigger of 0005, so a concurrent change of that organisation's parent waits. |
| S7 | **The over-allocation flag compares the sum of a campaign's shares with the monthly target of the campaign's current supplier agreement.** With no supplier agreement the flag is `false` and `supplierMonthlyTarget` is `null` (nothing to compare with). A share to the supplier itself counts like any other share. | The supplier's target Y lives in the supplier agreement (spec 7.2), not on `campaign` (whose `monthly_target` predates the agreements and stays as it is). |
| S8 | **`campaign_host` carries a copy of the campaign's client organisation id and uses two composite foreign keys**: `(campaign_id, client_org_id)` to `campaign (id, client_org_id)` and `(member_id, client_org_id)` to `member (id, org_id)`. Two unique constraints are added for that: `campaign_id_client_unique` on `campaign` and `member_id_org_unique` on `member`. | "The member must be a member of the campaign's client" becomes a foreign key rule, with no trigger and no race. The copy is filled by the service and cannot be wrong, because both keys must match. |
| S9 | **Weekdays are 0 to 6 with 0 = Sunday** (the same as JavaScript `getUTCDay` and Postgres `extract(dow ...)`). A host's hours are replaced as a set in one transaction under a lock on the member row. A trigger refuses overlapping rows for the same member, weekday and time zone; adjacent windows (one ends when the next starts) are fine. | The scope allows the overlap rule in the database "if cheap". A trigger is eleven lines. The overlap is compared per time zone because two rows in different zones are not on one clock. |
| S10 | **`leads_fynix` gets DELETE on three configuration tables only: `campaign_share`, `host_hours` and `host_block`.** Everything else stays archive or supersede. The audit row holds what was removed. | The scope says "remove a campaign share", "replace the set" of hours and "remove a host block". Those rows are settings, not records anyone relied on, so deleting is the honest operation. `agreement`, `agreement_acceptance` and `campaign_host` (active flag) are never deleted. CLAUDE.md's "Nothing is deleted" gets this one exception, written down in Task 15. |
| S11 | **An agreement acceptance is recorded in 1D by a Fynix admin on behalf of a named user**, checked in the service: the agreement is current, and the user is an active manager of the organisation the agreement is with (the client for a client agreement, the campaign's supplier for a supplier agreement). The network address defaults to `recorded by Fynix`. The audit action is `agreement.accept`. Phase 1E adds the tenant side (the client or supplier manager accepting from their own session) with its own grant and policy. | The scope wants the domain function now and the flow in 1E, and no tenant grants exist yet. The signer rule lives in the service because the tenant side will have different database access. |
| S12 | **A published agreement is never edited.** Fynix holds `UPDATE (status)` only, and a trigger refuses `superseded` going back to `current`. A new version supersedes the current one in the same transaction, under a lock on the campaign row so two admins take turns. Versions count per campaign and party. Dispute window: 1 to 720 hours (default 48). Targets: 0 to 1,000,000. | "Follow how terms_document does it", with the revival trigger added because a column grant on `status` alone still lets `superseded` become `current` when no other version is current. |
| S13 | **The time zone is validated by the domain** (`lib/domain/campaign-settings.ts`: a shape check, then `Intl.DateTimeFormat`, so offsets such as `+01:00` and unknown names are refused); the database only checks the text is 1 to 64 characters. | `now() AT TIME ZONE x` is stable, not immutable, so a CHECK cannot validate a zone, and the scope puts it in the domain. |
| S14 | **Reads added in 1D**: `listSuppliers`, `readAgreements` (current plus history per party) and `listCampaignShares` (the shares and the flag). No other reads. Tests inspect rows as the owner. | The scope lists those three. Hosts, hours and blocks get their reads with the screens that need them (1E), shaped for the role that reads them. |
| S15 | **The audit log gains nine actions** (`agreement.publish`, `agreement.accept`, `campaign_share.set`, `campaign_share.remove`, `campaign_host.add`, `campaign_host.deactivate`, `host_hours.set`, `host_block.add`, `host_block.remove`) and six subject tables. Creating a supplier or a partner agency is `organisation.create` with the parent in the snapshot. | The audit log's `action` shape is `<table>.<verb>` and each service names its own actions. |

## File structure

New files:

| File | Responsibility |
|---|---|
| `lib/domain/campaign-settings.ts` (+ test) | The default time zone and meeting length, their bounds, and `isIanaTimeZone`. |
| `lib/domain/weekly-hours.ts` (+ test) | `HoursWindow`, `sortWindows`, `findHoursProblem` (bounds and overlaps within a day). |
| `lib/domain/share-allocation.ts` (+ test) | `summariseShares`: the total, the supplier's target, the over-allocation flag. |
| `server/db/schema/agreement.ts`, `campaign-share.ts`, `campaign-host.ts`, `host-availability.ts` | The six new tables (`host-availability.ts` holds `host_hours` and `host_block`). `organisation.ts`, `campaign.ts`, `member.ts`, `enums.ts` and `index.ts` gain columns, constraints, enums and exports. |
| `server/db/migrations/0019_org_hierarchy_campaign_settings.sql` | Generated DDL: `parent_org_id` and its kind, the checks, `time_zone`, `meeting_minutes`. |
| `server/db/migrations/0020_org_hierarchy_triggers.sql` | Hand written: the no grandparent rule and the campaign supplier rule. |
| `server/db/migrations/0021_agreement_tables.sql`, `0022_agreement_grants.sql` | Generated tables `agreement`, `agreement_acceptance`; hand written security, grants, audit triggers and the no revival trigger. |
| `server/db/migrations/0023_campaign_share_table.sql`, `0024_campaign_share_grants.sql` | Generated `campaign_share`; hand written security, grants, triggers (supplier or partner, no reparenting a shareholder). |
| `server/db/migrations/0025_campaign_host_table.sql`, `0026_campaign_host_grants.sql` | Generated `campaign_host` and the two unique constraints it needs; hand written security, grants, audit trigger. |
| `server/db/migrations/0027_host_availability_tables.sql`, `0028_host_availability_grants.sql` | Generated `host_hours`, `host_block`; hand written security, grants, audit triggers, the overlap trigger. |
| `server/db/migrations/0029_fynix_admin_required.sql` | Hand written: the admin trigger on every table Fynix can write. |
| `server/domain/suppliers.ts`, `agreements.ts`, `shares.ts`, `hosts.ts`, `availability.ts` | The new services. |
| `server/db/organisation-hierarchy.integration.test.ts`, `setup-tables.integration.test.ts`, `fynix-admin.integration.test.ts` | Database level tests of the hierarchy, of the six tables and of the admin trigger. |
| `server/domain/suppliers.integration.test.ts`, `agreements.integration.test.ts`, `shares.integration.test.ts`, `hosts.integration.test.ts`, `availability.integration.test.ts`, `admin-only.integration.test.ts` | Service tests. |

Edited files: `server/db/testing/seed.ts` (admin and staff users, the opt in set-up rows), `server/db/testing/structure.ts` (one new check), `server/db/testing/leak-matrix.ts` (probes and forbidden tokens), `server/db/structure.integration.test.ts`, `server/db/leak-matrix.integration.test.ts`, `server/domain/errors.ts`, `audit.ts`, `snapshots.ts`, `inputs.ts`, `fynix-write.ts`, `organisations.ts`, `campaigns.ts`, `testing.ts`, `test-helpers.ts`, `boundaries.test.ts`, the 1C tests named in the tasks, and `CLAUDE.md`.

## Where each scope item is proved

| Scope item | Task |
|---|---|
| 1 Organisation hierarchy, enforced in the database | 3 (and 5 for shares) |
| 2 Fynix admin and staff, applied to the 1C functions | 2, 8 |
| 3 Campaign supplier rule, `time_zone`, `meeting_minutes` | 3, 9 |
| 4 The six new tables, additive, RLS, Fynix grants, no tenant grants | 4, 5, 6, 7 |
| 5 Domain functions with integration tests | 9, 10, 11, 12, 13 |
| 6 Structure and leak matrix coverage | 3 to 8 (access matrix, grants), 14 (probes, forbidden tokens, seed) |
| 7 Out of scope: UI, routes, supplier terms, tenant grants, alias identities, leads, meetings, messaging, `agency_alias` retirement | none, by design |

---

## Task 1: Pure rules in `lib`

**Files:** create `lib/domain/campaign-settings.ts`, `campaign-settings.test.ts`, `weekly-hours.ts`, `weekly-hours.test.ts`, `share-allocation.ts`, `share-allocation.test.ts`.

Three small pure modules the services and the input schemas use. Plain TypeScript with tests next to them, as `lib/` requires (`lib/` never imports `server/`).

- [ ] **Step 1: Confirm a clean start**

```bash
cd "/Users/a12345/Desktop/AI/Fynix Digital/fynix-leads"
git checkout development
git status --short
pnpm test
```

Expected: no output from `git status` (commit this plan first if it is listed). `pnpm test` passes (the 1C numbers). Run `pnpm test:integration` once as well: it must pass before any change, so a later failure is yours.

- [ ] **Step 2: Write the failing tests**

**File:** `lib/domain/campaign-settings.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMPAIGN_TIME_ZONE, DEFAULT_MEETING_MINUTES, MEETING_MINUTES_MAX, MEETING_MINUTES_MIN, isIanaTimeZone } from "@/lib/domain/campaign-settings";

describe("campaign settings", () => {
  it("defaults to London time and a 30 minute meeting, inside the allowed range", () => {
    expect(DEFAULT_CAMPAIGN_TIME_ZONE).toBe("Europe/London");
    expect(DEFAULT_MEETING_MINUTES).toBe(30);
    expect(MEETING_MINUTES_MIN).toBe(15);
    expect(MEETING_MINUTES_MAX).toBe(240);
    expect(DEFAULT_MEETING_MINUTES).toBeGreaterThanOrEqual(MEETING_MINUTES_MIN);
    expect(DEFAULT_MEETING_MINUTES).toBeLessThanOrEqual(MEETING_MINUTES_MAX);
  });

  it.each(["Europe/London", "Asia/Kolkata", "America/Argentina/Buenos_Aires", "UTC", "Pacific/Auckland"])("accepts the time zone %s", (zone) => {
    expect(isIanaTimeZone(zone)).toBe(true);
  });

  it.each(["", " ", "Mars/Olympus", "+01:00", "GMT+1 hour", "Europe/London; drop table", "Europe//London", "x".repeat(65)])("refuses %j", (zone) => {
    expect(isIanaTimeZone(zone)).toBe(false);
  });
});
```

**File:** `lib/domain/weekly-hours.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { findHoursProblem, sortWindows } from "@/lib/domain/weekly-hours";

const slot = (weekday: number, startMinute: number, endMinute: number) => ({ weekday, startMinute, endMinute });

describe("findHoursProblem", () => {
  it("accepts an empty set, one window, several windows on a day and adjacent windows", () => {
    expect(findHoursProblem([])).toBeNull();
    expect(findHoursProblem([slot(1, 540, 1020)])).toBeNull();
    expect(findHoursProblem([slot(1, 540, 720), slot(1, 780, 1020), slot(2, 0, 1440)])).toBeNull();
    expect(findHoursProblem([slot(1, 540, 720), slot(1, 720, 1020)])).toBeNull();
  });

  it.each([
    ["a weekday past 6", [slot(7, 540, 600)], "weekday"],
    ["a negative weekday", [slot(-1, 540, 600)], "weekday"],
    ["a fractional weekday", [slot(1.5, 540, 600)], "weekday"],
    ["a start below 0", [slot(1, -1, 600)], "minutes"],
    ["an end past 1440", [slot(1, 540, 1441)], "minutes"],
    ["a fractional minute", [slot(1, 540.5, 600)], "minutes"],
    ["a window that ends where it starts", [slot(1, 600, 600)], "start before it ends"],
    ["a window that ends before it starts", [slot(1, 700, 600)], "start before it ends"],
    ["two windows that overlap, given out of order", [slot(1, 700, 800), slot(1, 540, 720)], "overlap"],
    ["one window inside another", [slot(3, 540, 1020), slot(3, 600, 660)], "overlap"],
  ])("finds %s", (_label, windows, fragment) => {
    expect(findHoursProblem(windows)).toContain(fragment);
  });

  it("does not quote the values it was given", () => {
    expect(findHoursProblem([slot(7, 123457, 600)])).not.toContain("123457");
  });
});

describe("sortWindows", () => {
  it("orders by weekday then start, and leaves its input alone", () => {
    const input = [slot(2, 600, 700), slot(1, 900, 1000), slot(1, 540, 600)];
    expect(sortWindows(input)).toEqual([slot(1, 540, 600), slot(1, 900, 1000), slot(2, 600, 700)]);
    expect(input[0]).toEqual(slot(2, 600, 700));
  });
});
```

**File:** `lib/domain/share-allocation.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { summariseShares } from "@/lib/domain/share-allocation";

describe("summariseShares", () => {
  it("adds the shares and is not over-allocated at or below the supplier's target", () => {
    expect(summariseShares(20, [8, 7, 5])).toEqual({ totalShares: 20, supplierMonthlyTarget: 20, overAllocated: false });
    expect(summariseShares(20, [3])).toEqual({ totalShares: 3, supplierMonthlyTarget: 20, overAllocated: false });
  });

  it("flags a total above the supplier's target", () => {
    expect(summariseShares(20, [10, 11])).toEqual({ totalShares: 21, supplierMonthlyTarget: 20, overAllocated: true });
  });

  it("flags nothing when there is no supplier target to compare with, and handles no shares", () => {
    expect(summariseShares(null, [100, 100])).toEqual({ totalShares: 200, supplierMonthlyTarget: null, overAllocated: false });
    expect(summariseShares(0, [])).toEqual({ totalShares: 0, supplierMonthlyTarget: 0, overAllocated: false });
    expect(summariseShares(0, [1])).toEqual({ totalShares: 1, supplierMonthlyTarget: 0, overAllocated: true });
  });
});
```

- [ ] **Step 3: Run them and see them fail**

```bash
pnpm exec vitest run lib/domain/campaign-settings lib/domain/weekly-hours lib/domain/share-allocation
```

Expected: FAIL, "Failed to resolve import" for the three modules.

- [ ] **Step 4: Write the modules**

**File:** `lib/domain/campaign-settings.ts`

```typescript
/** The campaign settings that have rules of their own: the time zone (which counting uses) and the default meeting length. */
export const DEFAULT_CAMPAIGN_TIME_ZONE = "Europe/London";
export const DEFAULT_MEETING_MINUTES = 30;
export const MEETING_MINUTES_MIN = 15;
export const MEETING_MINUTES_MAX = 240;

/** A region name with optional city parts (`Europe/London`, `America/Argentina/Buenos_Aires`) or a single name (`UTC`). Offsets such as `+01:00` do not match. */
const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/**
 * True when `value` names a time zone the runtime knows. The shape check comes first because newer ICU versions also accept
 * numeric offsets in `Intl.DateTimeFormat`, and an offset is not a zone: it has no daylight saving rules, so a campaign
 * counted in it would drift twice a year. The database cannot do this check (`AT TIME ZONE` is not immutable), so the domain does.
 */
export function isIanaTimeZone(value: string): boolean {
  if (value.length === 0 || value.length > 64 || !ZONE_SHAPE.test(value)) return false;
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: value }).resolvedOptions();
    return true;
  } catch {
    return false;
  }
}
```

**File:** `lib/domain/weekly-hours.ts`

```typescript
export const MINUTES_PER_DAY = 1440;

/** One block of working time on one weekday: `weekday` 0 is Sunday and 6 is Saturday, minutes count from midnight in the host's own time zone. */
export interface HoursWindow {
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
}

/** A copy ordered by weekday, then start. */
export function sortWindows<T extends HoursWindow>(windows: readonly T[]): T[] {
  return [...windows].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

/**
 * The first rule a weekly set breaks, in words that never quote a value, or `null` when the set is fine. A window must be
 * whole minutes inside one day and start before it ends; windows on one day must not overlap, though one may start the
 * minute another ends. The database repeats the bounds as constraints and the overlap as a trigger (migration 0028).
 */
export function findHoursProblem(windows: readonly HoursWindow[]): string | null {
  for (const slot of windows) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) return "weekday must be a whole number from 0 (Sunday) to 6 (Saturday)";
    if (!Number.isInteger(slot.startMinute) || !Number.isInteger(slot.endMinute) || slot.startMinute < 0 || slot.endMinute > MINUTES_PER_DAY) {
      return "start and end must be whole minutes from 0 to 1440";
    }
    if (slot.startMinute >= slot.endMinute) return "each window must start before it ends";
  }
  const sorted = sortWindows(windows);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous !== undefined && current !== undefined && previous.weekday === current.weekday && current.startMinute < previous.endMinute) {
      return "windows on the same day must not overlap";
    }
  }
  return null;
}
```

**File:** `lib/domain/share-allocation.ts`

```typescript
export interface ShareSummary {
  /** The sum of the campaign's shares. */
  readonly totalShares: number;
  /** The monthly target of the campaign's current supplier agreement, or `null` when there is none. */
  readonly supplierMonthlyTarget: number | null;
  /** True when the shares add up to more than the supplier's target. Allowed, and shown to the person who sets the shares. */
  readonly overAllocated: boolean;
}

export function summariseShares(supplierMonthlyTarget: number | null, shares: readonly number[]): ShareSummary {
  const totalShares = shares.reduce((sum, share) => sum + share, 0);
  return { totalShares, supplierMonthlyTarget, overAllocated: supplierMonthlyTarget !== null && totalShares > supplierMonthlyTarget };
}
```

- [ ] **Step 5: Run the checks**

```bash
pnpm exec vitest run lib/domain/campaign-settings lib/domain/weekly-hours lib/domain/share-allocation
pnpm lint
```

Expected: 3 files pass; lint prints nothing.

- [ ] **Step 6: Commit**

```bash
git add lib/domain
git commit -m "Add the pure rules for campaign settings, weekly hours and share allocation"
```

---

## Task 2: The seed and the test rig get a Fynix admin and a Fynix staff member

**Files:** modify `server/db/testing/seed.ts`, `server/domain/testing.ts`, `server/domain/test-helpers.ts`.

Under the rule this phase adds, the seeded Fynix user must be an admin or every 1C test that uses `rig.actor` would be refused. The user was a plain `member` until now (the column default). This task changes the seed and adds the rig and helper pieces the later tasks use. No behaviour changes yet, so the whole suite must stay green.

- [ ] **Step 1: Seed a manager and a staff member**

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  readonly organisation: SeededOrganisation;
  readonly passwordHash: string;
```

With:

```typescript
  readonly organisation: SeededOrganisation;
  /** `manager` is a Fynix admin (or a client or agency manager); `member` is Fynix staff (or an ordinary client or agency user). */
  readonly role: "member" | "manager";
  readonly passwordHash: string;
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  /** One user per organisation, each with a password hash, a live session token and a reset token. */
  readonly users: readonly SeededUser[];
```

With:

```typescript
  /**
   * One user per organisation, each with a password hash, a live session token and a reset token, in the order Fynix (the admin),
   * the two clients, the two agencies. A sixth user is a second Fynix member with the `member` role: Fynix staff, who may not change set-up.
   */
  readonly users: readonly SeededUser[];
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
async function seedUsers(owner: DatabaseHandle, organisations: readonly SeededOrganisation[]): Promise<{ readonly users: SeededUser[]; readonly memberIds: Map<string, string> }> {
  const { db } = owner;
  const users: SeededUser[] = [];
  const memberIds = new Map<string, string>();
  for (const [index, organisation] of organisations.entries()) {
```

With:

```typescript
async function seedUsers(
  owner: DatabaseHandle,
  people: readonly { readonly organisation: SeededOrganisation; readonly role: "member" | "manager" }[],
): Promise<{ readonly users: SeededUser[]; readonly memberIds: Map<string, string> }> {
  const { db } = owner;
  const users: SeededUser[] = [];
  const memberIds = new Map<string, string>();
  for (const [index, person] of people.entries()) {
    const { organisation, role } = person;
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
    const memberRow = firstRow(await db.insert(member).values({ userId: row.id, orgId: organisation.id, orgKind: organisation.kind, displayName: name }).returning({ id: member.id }), `member ${email}`);
    memberIds.set(row.id, memberRow.id);
    users.push({ id: row.id, email, name, organisation, passwordHash, sessionToken, resetToken });
```

With:

```typescript
    const memberRow = firstRow(await db.insert(member).values({ userId: row.id, orgId: organisation.id, orgKind: organisation.kind, role, displayName: name }).returning({ id: member.id }), `member ${email}`);
    memberIds.set(row.id, memberRow.id);
    users.push({ id: row.id, email, name, organisation, role, passwordHash, sessionToken, resetToken });
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  const seeded = options.withUsers === false ? null : await seedUsers(owner, [fynix, kestrel, halden, brightpath, northgate]);
```

With:

```typescript
  const seeded =
    options.withUsers === false
      ? null
      : await seedUsers(owner, [
          { organisation: fynix, role: "manager" },
          { organisation: kestrel, role: "member" },
          { organisation: halden, role: "member" },
          { organisation: brightpath, role: "member" },
          { organisation: northgate, role: "member" },
          { organisation: fynix, role: "member" },
        ]);
```

- [ ] **Step 2: Add the staff actor to the rig**

**Edit:** `server/domain/testing.ts`

Replace:

```typescript
  /** The seeded Fynix admin. */
  readonly actor: FynixActor;
```

With:

```typescript
  /** The seeded Fynix admin: an active member of the Fynix organisation with the `manager` role. */
  readonly actor: FynixActor;
  /** The seeded Fynix staff member: an active member of the Fynix organisation with the `member` role, who may not change set-up. */
  readonly staffActor: FynixActor;
```

**Edit:** `server/domain/testing.ts`

Replace:

```typescript
      const user = world().users[0];
      if (user === undefined) throw new Error("The seed world has no Fynix user");
      return { userId: user.id };
    },
```

With:

```typescript
      const user = world().users[0];
      if (user === undefined) throw new Error("The seed world has no Fynix user");
      return { userId: user.id };
    },
    get staffActor(): FynixActor {
      const user = world().users.find((candidate) => candidate.organisation.kind === "fynix" && candidate.role === "member");
      if (user === undefined) throw new Error("The seed world has no Fynix staff user");
      return { userId: user.id };
    },
```

- [ ] **Step 3: Add the helpers the new service tests share**

**Edit:** `server/domain/test-helpers.ts`

Replace:

```typescript
import { asc, desc, eq, getTableColumns } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { auditLog, emailOutbox } from "@/server/db/schema";
import type { AuditAction } from "@/server/domain/audit";
import { publishTerms } from "@/server/domain/terms";
import type { DomainRig } from "@/server/domain/testing";
```

With:

```typescript
import { asc, desc, eq, getTableColumns } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { auditLog, emailOutbox, member } from "@/server/db/schema";
import type { SeededCampaign, SeededOrganisation, SeededUser } from "@/server/db/testing/seed";
import type { AuditAction } from "@/server/domain/audit";
import { DomainError } from "@/server/domain/errors";
import { publishTerms } from "@/server/domain/terms";
import type { DomainRig } from "@/server/domain/testing";
```

**Append** to `server/domain/test-helpers.ts`:

```typescript

/** The error a call must be refused with. Fails the test when the call succeeds, and rethrows anything that is not a `DomainError`. */
export async function refusal(work: Promise<unknown>): Promise<DomainError> {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
}

/** The first seeded campaign: Kestrel (client) and Brightpath (supplier). */
export function firstCampaign(rig: DomainRig): SeededCampaign {
  const row = rig.world().campaigns[0];
  if (row === undefined) throw new Error("The seed world has no campaign");
  return row;
}

/** The one seeded user of a client or agency organisation. Not for Fynix, which has two (the admin and the staff member). */
export function userIn(rig: DomainRig, organisation: SeededOrganisation): SeededUser {
  const person = rig.world().users.find((candidate) => candidate.organisation.id === organisation.id);
  if (person === undefined) throw new Error(`The seed world has no user in ${organisation.publicRef}`);
  return person;
}

/** The `member.id` of a user, read as the owner. */
export async function memberIdFor(rig: DomainRig, userId: string): Promise<string> {
  const [row] = await rig.dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, userId)).limit(1);
  if (row === undefined) throw new Error(`No member row for user ${userId}`);
  return row.id;
}

/** Changes a member's role as the owner, which is how a test makes a client or supplier user a manager. */
export async function setMemberRole(rig: DomainRig, userId: string, role: "member" | "manager"): Promise<void> {
  await rig.dbs.owner.db.update(member).set({ role }).where(eq(member.userId, userId));
}
```

- [ ] **Step 4: Run the whole suite, which must stay green**

```bash
pnpm typecheck
pnpm test
pnpm test:integration
```

Expected: typecheck clean; unit and integration tests pass exactly as before the change (the seeded admin is now a manager, which no 1C test depends on, and a sixth user exists, which no test counts).

- [ ] **Step 5: Commit**

```bash
git add server/db/testing/seed.ts server/domain/testing.ts server/domain/test-helpers.ts
git commit -m "Seed a Fynix admin and a Fynix staff member and add the helpers the set-up tests share"
```

---

## Task 3: Organisation hierarchy and the campaign settings, in the database

**Files:** create `server/db/organisation-hierarchy.integration.test.ts`, `server/db/migrations/0019_org_hierarchy_campaign_settings.sql`, `0020_org_hierarchy_triggers.sql`; modify `server/db/schema/organisation.ts`, `campaign.ts`.

What the migrations add: `organisation.parent_org_id` (nullable) and the generated `parent_org_kind`, three constraints and a trigger that make "a supplier is an agency with no parent, a partner agency is an agency whose parent is a supplier, two levels at most" a property of the table; `campaign.time_zone` and `campaign.meeting_minutes` with defaults and checks; and a trigger that refuses a campaign whose agency has a parent. `leads_fynix` already holds table level `SELECT, INSERT, UPDATE` on both tables (0002, 0003), so it may write the new columns; the client and agency roles hold column grants only, so the new columns are hidden from them with no further SQL. Both tables already have the `audit_required` trigger.

- [ ] **Step 1: Write the failing test**

**File:** `server/db/organisation-hierarchy.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaign, organisation } from "@/server/db/schema";
import { captureErrorText, openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * The organisation hierarchy and the campaign settings, as the database enforces them. Everything here runs as the owner: the
 * triggers and constraints apply to every role, and the Fynix role's own rules (admin only, audited) are tested in
 * fynix-admin.integration.test.ts and by the domain tests.
 */

let dbs: TestDatabases;
let world: SeedWorld;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner, { withUsers: false });
});

const failure = (work: PromiseLike<unknown>): Promise<string> => captureErrorText(Promise.resolve(work));

async function insertAgency(publicRef: string, parentOrgId: string | null = null): Promise<{ readonly id: string; readonly parentOrgKind: "fynix" | "client" | "agency" | null }> {
  const [row] = await dbs.owner.db
    .insert(organisation)
    .values({ publicRef, kind: "agency", name: `Agency ${publicRef}`, parentOrgId })
    .returning({ id: organisation.id, parentOrgKind: organisation.parentOrgKind });
  if (row === undefined) throw new Error("The agency insert returned no row");
  return row;
}

const campaignValues = (agencyOrgId: string) =>
  ({ publicRef: "CMP-3C4D", name: "Partner campaign", clientOrgId: world.kestrel.id, agencyOrgId, startDate: "2027-01-04", endDate: "2027-06-30", monthlyTarget: 5, totalTarget: 30 }) as const;

describe("organisation.parent_org_id", () => {
  it("lets a partner agency point at a supplier, and fills in the parent's kind itself", async () => {
    const partner = await insertAgency("ORG-3C4D", world.brightpath.id);
    expect(partner.parentOrgKind).toBe("agency");
    const [client] = await dbs.owner.db.select({ parentOrgId: organisation.parentOrgId, parentOrgKind: organisation.parentOrgKind }).from(organisation).where(eq(organisation.id, world.kestrel.id));
    expect(client).toEqual({ parentOrgId: null, parentOrgKind: null });
  });

  it("refuses an organisation that is its own parent", async () => {
    const lone = await insertAgency("ORG-3C4D");
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: lone.id }).where(eq(organisation.id, lone.id)))).toContain("organisation_parent_not_self");
  });

  it("refuses a parent on a client, because only an agency may have one", async () => {
    const message = await failure(
      dbs.owner.db.insert(organisation).values({ publicRef: "ORG-5E6F", kind: "client", name: "Orchard Foods Ltd", brandName: "Orchard", parentOrgId: world.brightpath.id }),
    );
    expect(message).toContain("organisation_parent_only_agency");
  });

  it("refuses a parent that is not an agency", async () => {
    expect(await failure(dbs.owner.db.insert(organisation).values({ publicRef: "ORG-3C4D", kind: "agency", name: "Agency X", parentOrgId: world.kestrel.id }))).toContain("organisation_parent_fk");
  });

  it("refuses a parent that is itself a partner agency: two levels at most", async () => {
    const partner = await insertAgency("ORG-3C4D", world.brightpath.id);
    expect(await failure(dbs.owner.db.insert(organisation).values({ publicRef: "ORG-5E6F", kind: "agency", name: "Agency Y", parentOrgId: partner.id }))).toContain("organisation_two_levels_only");
  });

  it("refuses to give a parent to an organisation that already has partner agencies", async () => {
    await insertAgency("ORG-3C4D", world.brightpath.id);
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: world.northgate.id }).where(eq(organisation.id, world.brightpath.id)))).toContain("organisation_has_partner_agencies");
  });

  it("refuses to give a parent to an organisation that is the supplier of a campaign", async () => {
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: world.brightpath.id }).where(eq(organisation.id, world.northgate.id)))).toContain("organisation_is_a_campaign_supplier");
  });

  it("gives a parent to an agency that has no partner agencies and no campaigns", async () => {
    const lone = await insertAgency("ORG-3C4D");
    await dbs.owner.db.update(organisation).set({ parentOrgId: world.brightpath.id }).where(eq(organisation.id, lone.id));
    const [row] = await dbs.owner.db.select({ parentOrgId: organisation.parentOrgId }).from(organisation).where(eq(organisation.id, lone.id));
    expect(row?.parentOrgId).toBe(world.brightpath.id);
  });
});

describe("campaign.agency_org_id is a supplier", () => {
  it("refuses a campaign whose agency is a partner agency, on insert", async () => {
    const partner = await insertAgency("ORG-3C4D", world.brightpath.id);
    expect(await failure(dbs.owner.db.insert(campaign).values(campaignValues(partner.id)))).toContain("campaign_supplier_has_parent");
  });

  it("refuses to move a campaign to a partner agency, on update", async () => {
    const partner = await insertAgency("ORG-3C4D", world.brightpath.id);
    const target = world.campaigns[0];
    if (target === undefined) throw new Error("no campaign");
    expect(await failure(dbs.owner.db.update(campaign).set({ agencyOrgId: partner.id }).where(eq(campaign.id, target.id)))).toContain("campaign_supplier_has_parent");
  });

  it("accepts a campaign for a supplier", async () => {
    await dbs.owner.db.insert(campaign).values(campaignValues(world.northgate.id));
    const [row] = await dbs.owner.db.select({ agencyOrgId: campaign.agencyOrgId }).from(campaign).where(eq(campaign.publicRef, "CMP-3C4D"));
    expect(row?.agencyOrgId).toBe(world.northgate.id);
  });
});

describe("campaign.time_zone and campaign.meeting_minutes", () => {
  const first = (): string => {
    const row = world.campaigns[0];
    if (row === undefined) throw new Error("no campaign");
    return row.id;
  };

  it("default to London time and 30 minutes, so existing rows stay valid", async () => {
    const [row] = await dbs.owner.db.select({ timeZone: campaign.timeZone, meetingMinutes: campaign.meetingMinutes }).from(campaign).where(eq(campaign.id, first()));
    expect(row).toEqual({ timeZone: "Europe/London", meetingMinutes: 30 });
  });

  it.each([14, 241, 0, -5])("refuse a meeting length of %i minutes", async (minutes) => {
    expect(await failure(dbs.owner.db.update(campaign).set({ meetingMinutes: minutes }).where(eq(campaign.id, first())))).toContain("campaign_meeting_minutes_range");
  });

  it.each([15, 240])("accept a meeting length of %i minutes", async (minutes) => {
    await dbs.owner.db.update(campaign).set({ meetingMinutes: minutes }).where(eq(campaign.id, first()));
    const [row] = await dbs.owner.db.select({ meetingMinutes: campaign.meetingMinutes }).from(campaign).where(eq(campaign.id, first()));
    expect(row?.meetingMinutes).toBe(minutes);
  });

  it.each(["", "   ", "x".repeat(65)])("refuse the time zone text %j", async (zone) => {
    expect(await failure(dbs.owner.db.update(campaign).set({ timeZone: zone }).where(eq(campaign.id, first())))).toContain("campaign_time_zone_length");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm test:integration server/db/organisation-hierarchy
```

Expected: FAIL at compile time: `organisation.parentOrgId`, `organisation.parentOrgKind`, `campaign.timeZone` and `campaign.meetingMinutes` do not exist.

- [ ] **Step 3: Add the columns and constraints to the schema**

**Edit:** `server/db/schema/organisation.ts`

Replace:

```typescript
import { check, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
```

With:

```typescript
import { check, foreignKey, index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
```

**Edit:** `server/db/schema/organisation.ts`

Replace:

```typescript
    status: organisationStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
```

With:

```typescript
    status: organisationStatus("status").notNull().default("active"),
    /**
     * The supplier a partner agency works under. Null for Fynix, every client and every supplier. A supplier is an agency with
     * no parent; a partner agency is an agency whose parent is a supplier; two levels at most (migration 0020 refuses a grandparent).
     * Added in phase 1D, nullable, so existing rows stay valid. No tenant role has a grant on it until phase 1E.
     */
    parentOrgId: uuid("parent_org_id"),
    /** `agency` while a parent is set, else null. The composite foreign key below uses it to insist the parent is an agency. */
    parentOrgKind: organisationKind("parent_org_kind").generatedAlwaysAs(sql`CASE WHEN parent_org_id IS NULL THEN NULL ELSE 'agency'::organisation_kind END`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
```

**Edit:** `server/db/schema/organisation.ts`

Replace:

```typescript
    uniqueIndex("organisation_one_fynix").on(table.kind).where(sql`${table.kind} = 'fynix'`),
  ],
```

With:

```typescript
    uniqueIndex("organisation_one_fynix").on(table.kind).where(sql`${table.kind} = 'fynix'`),
    // The foreign key is not checked while `parent_org_kind` is null, so only an organisation with a parent is constrained.
    foreignKey({ name: "organisation_parent_fk", columns: [table.parentOrgId, table.parentOrgKind], foreignColumns: [table.id, table.kind] }),
    check("organisation_parent_not_self", sql`${table.parentOrgId} IS NULL OR ${table.parentOrgId} <> ${table.id}`),
    check("organisation_parent_only_agency", sql`${table.parentOrgId} IS NULL OR ${table.kind} = 'agency'`),
    index("organisation_parent_idx").on(table.parentOrgId),
  ],
```

**Edit:** `server/db/schema/campaign.ts`

Replace:

```typescript
    instructions: text("instructions").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
```

With:

```typescript
    instructions: text("instructions").notNull().default(""),
    /**
     * The campaign's time zone, the one that counting uses (spec 7.1), and the default meeting length. Added in phase 1D with
     * defaults so existing rows stay valid. The domain validates the zone against the IANA database
     * (lib/domain/campaign-settings.ts); the database only checks the length. No tenant role has a grant on either until 1E.
     */
    timeZone: text("time_zone").notNull().default("Europe/London"),
    meetingMinutes: integer("meeting_minutes").notNull().default(30),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
```

**Edit:** `server/db/schema/campaign.ts`

Replace:

```typescript
    check("campaign_targets_not_negative", sql`${table.monthlyTarget} >= 0 AND ${table.totalTarget} >= 0`),
  ],
```

With:

```typescript
    check("campaign_targets_not_negative", sql`${table.monthlyTarget} >= 0 AND ${table.totalTarget} >= 0`),
    check("campaign_meeting_minutes_range", sql`${table.meetingMinutes} BETWEEN 15 AND 240`),
    check("campaign_time_zone_length", sql`char_length(btrim(${table.timeZone})) BETWEEN 1 AND 64`),
  ],
```

Also update the comment above the table: replace the line ` * One client, served by one agency. Both organisation ids live here so a policy can compare one column per role.` with ` * One client, served by one supplier (an agency with no parent; \`agency_org_id\` is the supplier since phase 1D). Both organisation ids live here so a policy can compare one column per role.` (an Edit with that exact line as the find text).

- [ ] **Step 4: Generate the DDL**

```bash
pnpm db:generate --name=org_hierarchy_campaign_settings
```

Expected: drizzle-kit writes `server/db/migrations/0019_org_hierarchy_campaign_settings.sql`, `meta/0019_snapshot.json` and a journal entry. Open the SQL and check it contains exactly these statements (their order may differ) and nothing that drops or alters an existing column:

```sql
ALTER TABLE "organisation" ADD COLUMN "parent_org_id" uuid;
ALTER TABLE "organisation" ADD COLUMN "parent_org_kind" "organisation_kind" GENERATED ALWAYS AS (CASE WHEN parent_org_id IS NULL THEN NULL ELSE 'agency'::organisation_kind END) STORED;
ALTER TABLE "campaign" ADD COLUMN "time_zone" text DEFAULT 'Europe/London' NOT NULL;
ALTER TABLE "campaign" ADD COLUMN "meeting_minutes" integer DEFAULT 30 NOT NULL;
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_parent_fk" FOREIGN KEY ("parent_org_id","parent_org_kind") REFERENCES "public"."organisation"("id","kind") ON DELETE no action ON UPDATE no action;
CREATE INDEX "organisation_parent_idx" ON "organisation" USING btree ("parent_org_id");
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_parent_not_self" CHECK ("organisation"."parent_org_id" IS NULL OR "organisation"."parent_org_id" <> "organisation"."id");
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_parent_only_agency" CHECK ("organisation"."parent_org_id" IS NULL OR "organisation"."kind" = 'agency');
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_meeting_minutes_range" CHECK ("campaign"."meeting_minutes" BETWEEN 15 AND 240);
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_time_zone_length" CHECK (char_length(btrim("campaign"."time_zone")) BETWEEN 1 AND 64);
```

Check the journal's `when` for 0019 is above the one for 0018 (`1794474879401`); the journal test in Step 7 proves it. Adding a stored generated column rewrites `organisation` once; the table holds a handful of rows.

- [ ] **Step 5: Write the triggers migration**

```bash
pnpm db:generate --custom --name=org_hierarchy_triggers
```

**File:** `server/db/migrations/0020_org_hierarchy_triggers.sql`

```sql
-- The organisation hierarchy rules that a CHECK or a foreign key cannot say, and the rule that a campaign's agency is a supplier.
-- Both run with the privileges of the caller (no SECURITY DEFINER): the callers are leads_fynix and the owner, which can
-- read both tables. Rows they look at are locked FOR SHARE, like the brand copy trigger of 0005, so a concurrent change that
-- would break the rule waits for this statement and is then checked against it. Messages start with a stable name that the
-- tests match. 0024 adds a third rule (a campaign share blocks a change of parent) once campaign_share exists.
--
-- organisation_check_parent runs when a row is inserted or its parent_org_id is written, and only does anything when the
-- parent actually changes:
--   1. The parent must not itself have a parent (two levels at most).
--   2. An existing organisation that is given a parent must not have partner agencies of its own and must not be the
--      supplier of any campaign: a partner agency does not run campaigns, and a supplier with partners would make three levels.
-- That the parent is an agency, is not the organisation itself, and that only an agency has one, are constraints (0019).
CREATE FUNCTION public.organisation_check_parent() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
DECLARE
  parents_parent uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.parent_org_id IS NOT DISTINCT FROM NEW.parent_org_id THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_org_id IS NOT NULL THEN
    SELECT p.parent_org_id INTO parents_parent FROM public.organisation p WHERE p.id = NEW.parent_org_id FOR SHARE;
    IF parents_parent IS NOT NULL THEN
      RAISE EXCEPTION 'organisation_two_levels_only: the parent organisation is itself a partner agency' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.parent_org_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.organisation c WHERE c.parent_org_id = NEW.id) THEN
      RAISE EXCEPTION 'organisation_has_partner_agencies: an organisation with partner agencies cannot be given a parent' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.campaign k WHERE k.agency_org_id = NEW.id) THEN
      RAISE EXCEPTION 'organisation_is_a_campaign_supplier: the supplier of a campaign cannot be given a parent' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.organisation_check_parent() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER organisation_check_parent BEFORE INSERT OR UPDATE OF parent_org_id ON "organisation"
  FOR EACH ROW EXECUTE FUNCTION public.organisation_check_parent();
--> statement-breakpoint
-- campaign.agency_org_id is the supplier: an agency with no parent. The campaign's foreign key already insists it is an
-- agency (0001); this adds "and not a partner agency". The organisation row is read FOR SHARE, so a concurrent change that
-- gives it a parent waits (and organisation_check_parent then sees this campaign).
CREATE FUNCTION public.campaign_check_supplier() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
DECLARE
  supplier_parent uuid;
BEGIN
  SELECT o.parent_org_id INTO supplier_parent FROM public.organisation o WHERE o.id = NEW.agency_org_id FOR SHARE;
  IF supplier_parent IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_supplier_has_parent: a campaign needs a supplier, and a partner agency is not one' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.campaign_check_supplier() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER campaign_check_supplier BEFORE INSERT OR UPDATE OF agency_org_id ON "campaign"
  FOR EACH ROW EXECUTE FUNCTION public.campaign_check_supplier();
```

- [ ] **Step 6: Run the new test**

```bash
pnpm test:integration server/db/organisation-hierarchy
```

Expected: the migrator applies `0019` and `0020`; every test in the file passes.

- [ ] **Step 7: Run the checks**

```bash
pnpm exec vitest run server/db/migration-journal
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test:integration
```

Expected: the journal test passes (if it complains about `when`, raise the new entries' `when` by hand); `pnpm db:generate` prints `No schema changes, nothing to migrate`; typecheck and lint are clean; the whole integration suite passes (the existing structure tests still hold: the new columns have no tenant grant, and both tables already enable row-level security).

- [ ] **Step 8: Commit**

```bash
git add server/db
git commit -m "Add the organisation hierarchy and the campaign time zone and meeting length, with the database rules behind them"
```

---

## Task 4: Agreements: `agreement` and `agreement_acceptance`

**Files:** create `server/db/schema/agreement.ts`, `server/db/setup-tables.integration.test.ts`, `server/db/migrations/0021_agreement_tables.sql`, `0022_agreement_grants.sql`; modify `server/db/schema/enums.ts`, `index.ts`, `server/db/structure.integration.test.ts`.

| Table | `leads_fynix` | other runtime roles |
|---|---|---|
| `agreement` | SELECT, INSERT; UPDATE `status` only | none (phase 1E: the client reads its own client agreement and the supplier its own supplier agreement; nobody reads the other's, spec 5.1 and D21) |
| `agreement_acceptance` | SELECT, INSERT | none (phase 1E adds the tenant side: a client or supplier manager accepting from their own session) |

A published version is never edited. Fynix may supersede the current one (`UPDATE status`) and nothing else, and a trigger refuses a superseded version coming back.

- [ ] **Step 1: Write the failing tests**

The access matrix learns the two tables (red: they do not exist yet).

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
  agency_alias: ["leads_auth", "leads_fynix"],
};
```

With:

```typescript
  agency_alias: ["leads_auth", "leads_fynix"],
  // Phase 1D: Fynix sets these up. No tenant role holds anything on them until phase 1E decides who sees which column.
  agreement: ["leads_fynix"],
  agreement_acceptance: ["leads_fynix"],
};
```

**File:** `server/db/setup-tables.integration.test.ts`

```typescript
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, agreementAcceptance, member } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";

/**
 * The phase 1D tables as the database enforces them: who may touch each, which columns Fynix may change, the checks, the
 * unique constraints and the triggers. Everything is written as the owner unless a test is about the Fynix role. The services
 * are tested in server/domain/*.integration.test.ts.
 */

let dbs: TestDatabases;
let world: SeedWorld;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});

const failure = (work: PromiseLike<unknown>): Promise<string> => captureErrorText(Promise.resolve(work));
const PRIVILEGES = ["DELETE", "INSERT", "SELECT", "TRUNCATE", "UPDATE"] as const;

/** The table level privileges a role holds on a table, in alphabetical order. Column grants do not count here. */
async function tablePrivileges(role: string, table: string): Promise<string[]> {
  const held: string[] = [];
  for (const privilege of PRIVILEGES) {
    const result = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_table_privilege('${role}', 'public.${table}', '${privilege}') as allowed`));
    if (result.rows[0]?.allowed === true) held.push(privilege);
  }
  return held;
}

/** The columns of a table that a role may UPDATE, in table order. A table level UPDATE lists every column. */
async function updatableColumns(role: string, table: string): Promise<string[]> {
  const result = await dbs.owner.db.execute<{ name: string }>(
    sql.raw(`select a.attname::text as name from pg_attribute a
      where a.attrelid = 'public.${table}'::regclass and a.attnum > 0 and not a.attisdropped and has_column_privilege('${role}', a.attrelid, a.attnum, 'UPDATE')
      order by a.attnum`),
  );
  return result.rows.map((row) => row.name);
}

function firstOf<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`No ${what} in the seed world`);
  return row;
}

const campaignId = (): string => firstOf(world.campaigns, "campaign").id;
const userId = (index: number): string => firstOf(world.users.slice(index), "user").id;
async function memberIdOf(user: string): Promise<string> {
  return firstOf(await dbs.owner.db.select({ id: member.id }).from(member).where(eq(member.userId, user)), "member").id;
}

async function newAgreement(overrides: Partial<typeof agreement.$inferInsert> = {}): Promise<string> {
  const rows = await dbs.owner.db
    .insert(agreement)
    .values({ campaignId: campaignId(), party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, createdBy: await memberIdOf(userId(0)), ...overrides })
    .returning({ id: agreement.id });
  return firstOf(rows, "agreement").id;
}

describe("agreement", () => {
  it("is Fynix only: Fynix reads and inserts, and may change the status and nothing else; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "agreement")).toEqual(["INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "agreement")).toEqual(["status"]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "agreement"), role).toEqual([]);
      expect(await updatableColumns(role, "agreement"), role).toEqual([]);
    }
  });

  it("holds one row per campaign, party and version, and one current version per campaign and party", async () => {
    await newAgreement();
    expect(await failure(newAgreement())).toContain("agreement_campaign_party_version_unique");
    expect(await failure(newAgreement({ version: 2 }))).toContain("agreement_one_current");
    await newAgreement({ party: "supplier" });
    await newAgreement({ version: 2, status: "superseded" });
  });

  it("refuses to bring a superseded version back, even when no other version is current", async () => {
    const id = await newAgreement({ status: "superseded" });
    expect(await failure(dbs.owner.db.update(agreement).set({ status: "current" }).where(eq(agreement.id, id)))).toContain("agreement_superseded_is_final");
  });

  it("lets a current version be superseded", async () => {
    const id = await newAgreement();
    await dbs.owner.db.update(agreement).set({ status: "superseded" }).where(eq(agreement.id, id));
    expect(firstOf(await dbs.owner.db.select({ status: agreement.status }).from(agreement).where(eq(agreement.id, id)), "agreement").status).toBe("superseded");
  });

  it.each([
    ["a version below 1", { version: 0 }, "agreement_version_positive"],
    ["a negative monthly target", { monthlyTarget: -1 }, "agreement_targets_not_negative"],
    ["a negative total target", { totalTarget: -1 }, "agreement_targets_not_negative"],
    ["a dispute window of 0 hours", { disputeWindowHours: 0 }, "agreement_dispute_window_range"],
    ["a dispute window over 720 hours", { disputeWindowHours: 721 }, "agreement_dispute_window_range"],
  ])("refuses %s", async (_label, overrides, constraint) => {
    expect(await failure(newAgreement(overrides))).toContain(constraint);
  });

  it("defaults the dispute window to 48 hours and the rules and notes to empty text", async () => {
    const id = await newAgreement();
    const row = firstOf(await dbs.owner.db.select({ window: agreement.disputeWindowHours, rules: agreement.rules, notes: agreement.notes }).from(agreement).where(eq(agreement.id, id)), "agreement");
    expect(row).toEqual({ window: 48, rules: "", notes: "" });
  });

  it("must name an existing campaign and an existing member as its author", async () => {
    expect(await failure(newAgreement({ campaignId: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
    expect(await failure(newAgreement({ createdBy: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
  });

  it("cannot be changed by Fynix without an audit row", async () => {
    const author = await memberIdOf(userId(0));
    const message = await failure(
      withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: userId(0) }, (tx) =>
        tx.insert(agreement).values({ campaignId: campaignId(), party: "client", version: 1, monthlyTarget: 1, totalTarget: 1, createdBy: author }),
      ),
    );
    expect(message).toContain("A change to agreement by Fynix has no audit_log row in its transaction");
  });
});

describe("agreement_acceptance", () => {
  it("lets Fynix read and add, and nothing else: an acceptance is never changed or removed; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "agreement_acceptance")).toEqual(["INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "agreement_acceptance")).toEqual([]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "agreement_acceptance"), role).toEqual([]);
      expect(await updatableColumns(role, "agreement_acceptance"), role).toEqual([]);
    }
  });

  it("holds one acceptance per agreement and user, and each must name a real agreement and user", async () => {
    const id = await newAgreement();
    const row = { agreementId: id, userId: userId(1), networkAddress: "203.0.113.9" };
    await dbs.owner.db.insert(agreementAcceptance).values(row);
    expect(await failure(dbs.owner.db.insert(agreementAcceptance).values(row))).toContain("agreement_acceptance_agreement_user_unique");
    expect(await failure(dbs.owner.db.insert(agreementAcceptance).values({ ...row, agreementId: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
    expect(await failure(dbs.owner.db.insert(agreementAcceptance).values({ ...row, userId: "99999999-9999-4999-8999-999999999999" }))).toContain("foreign key");
  });
});


- [ ] **Step 2: Run them and see them fail**

```bash
pnpm test:integration server/db/setup-tables server/db/structure
```

Expected: FAIL: `agreement` and `agreementAcceptance` are not exported from the schema, and the access matrix test "lists every table, and no table that does not exist" names two tables that are not there.

- [ ] **Step 3: Write the schema**

**Append** to `server/db/schema/enums.ts`:

```typescript
/** Which side of a campaign an agreement is with: Fynix and the client, or Fynix and the supplier (spec 7.2). */
export const agreementParty = pgEnum("agreement_party", ["client", "supplier"]);
export const agreementStatus = pgEnum("agreement_status", ["current", "superseded"]);
```

**File:** `server/db/schema/agreement.ts`

```typescript
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { campaign } from "./campaign";
import { agreementParty, agreementStatus } from "./enums";
import { member } from "./member";

/**
 * A virtual agreement (spec 7.2): what Fynix has agreed with the client, or with the supplier, for one campaign. Not a legal
 * document; it exists for trust and confidence. Each change is a new version that the other side accepts again.
 *
 * Like `terms_document`, a published version is never edited: Fynix holds UPDATE on `status` only, a new version supersedes
 * the current one in the same transaction (`one current version per campaign and party`), and a trigger refuses a
 * superseded version becoming current again (migration 0022). Versions count per campaign and party, from 1.
 *
 * No tenant role has a grant on this table until phase 1E, which decides who reads which agreement.
 */
export const agreement = pgTable(
  "agreement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "restrict" }),
    party: agreementParty("party").notNull(),
    version: integer("version").notNull(),
    monthlyTarget: integer("monthly_target").notNull(),
    totalTarget: integer("total_target").notNull(),
    /** How long after a meeting the client may dispute it. */
    disputeWindowHours: integer("dispute_window_hours").notNull().default(48),
    /** The no-show and cancellation rules, in words. */
    rules: text("rules").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: agreementStatus("status").notNull().default("current"),
    /** The Fynix admin who published this version. */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => member.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("agreement_campaign_party_version_unique").on(table.campaignId, table.party, table.version),
    uniqueIndex("agreement_one_current").on(table.campaignId, table.party).where(sql`${table.status} = 'current'`),
    index("agreement_campaign_idx").on(table.campaignId),
    check("agreement_version_positive", sql`${table.version} >= 1`),
    check("agreement_targets_not_negative", sql`${table.monthlyTarget} >= 0 AND ${table.totalTarget} >= 0`),
    check("agreement_dispute_window_range", sql`${table.disputeWindowHours} BETWEEN 1 AND 720`),
  ],
);

/**
 * One row per user per version they accepted: when, and from which network address. Never changed or removed (Fynix holds
 * SELECT and INSERT only). In phase 1D a Fynix admin records an acceptance on behalf of the signer; phase 1E adds the tenant side.
 */
export const agreementAcceptance = pgTable(
  "agreement_acceptance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => agreement.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    networkAddress: text("network_address").notNull(),
  },
  (table) => [unique("agreement_acceptance_agreement_user_unique").on(table.agreementId, table.userId), index("agreement_acceptance_user_idx").on(table.userId)],
);
```

**Append** to `server/db/schema/index.ts`:

```typescript
export * from "./agreement";
```

- [ ] **Step 4: Generate the DDL**

```bash
pnpm db:generate --name=agreement_tables
```

Expected: `server/db/migrations/0021_agreement_tables.sql` creates the two enums (`agreement_party`, `agreement_status`), the two tables with their constraints, the foreign keys to `campaign`, `member` and `user`, the unique index `agreement_one_current` and the plain indexes. It touches no existing table. The statements that create a foreign key must come after the `CREATE TABLE` of both tables.

- [ ] **Step 5: Write the grants migration**

```bash
pnpm db:generate --custom --name=agreement_grants
```

**File:** `server/db/migrations/0022_agreement_grants.sql`

```sql
-- Row-level security and grants for agreement and agreement_acceptance. See 0002 for the rules every table follows.
--
-- Fynix reads and inserts agreements and may change `status` (a new version supersedes the old one); no role may change the
-- terms of a published version. Fynix reads and inserts acceptances and may not change or remove one. Nobody else holds
-- any privilege: phase 1E decides which agreement the client reads and which the supplier reads (nobody reads the other's,
-- spec 5.1, D21) and how a client or supplier manager accepts from their own session.
ALTER TABLE "agreement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agreement_acceptance" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "agreement" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("status") ON "agreement" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "agreement_fynix_all" ON "agreement" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT ON "agreement_acceptance" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "agreement_acceptance_fynix_all" ON "agreement_acceptance" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
-- A superseded version is final. The column grant lets Fynix write `status`, which would also let a superseded version become
-- current again whenever no other version is current; this trigger closes that.
CREATE FUNCTION public.agreement_refuse_revival() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'agreement_superseded_is_final: a superseded agreement version cannot become current again' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.agreement_refuse_revival() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER agreement_refuse_revival BEFORE UPDATE OF status ON "agreement"
  FOR EACH ROW EXECUTE FUNCTION public.agreement_refuse_revival();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agreement_audit_required AFTER INSERT OR UPDATE OR DELETE ON "agreement"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agreement_acceptance_audit_required AFTER INSERT OR UPDATE OR DELETE ON "agreement_acceptance"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
```

- [ ] **Step 6: Run the checks**

```bash
pnpm test:integration server/db/setup-tables server/db/structure
pnpm exec vitest run server/db/migration-journal
pnpm db:generate
pnpm typecheck
pnpm lint
```

Expected: the migrator applies `0021` and `0022`; both files pass (the structure suite now also proves RLS on both tables, a policy for `leads_fynix`, the `audit_required` trigger, nothing granted to PUBLIC, and the access matrix); `pnpm db:generate` prints `No schema changes, nothing to migrate`.

- [ ] **Step 7: Commit**

```bash
git add server/db
git commit -m "Add the agreement and agreement acceptance tables, closed to every role but Fynix"
```

---

## Task 5: Campaign shares

**Files:** create `server/db/schema/campaign-share.ts`, `server/db/migrations/0023_campaign_share_table.sql`, `0024_campaign_share_grants.sql`; modify `server/db/schema/index.ts`, `server/db/setup-tables.integration.test.ts`, `server/db/structure.integration.test.ts`.

| Table | `leads_fynix` | other runtime roles |
|---|---|---|
| `campaign_share` | SELECT, INSERT, DELETE; UPDATE `monthly_share`, `updated_at` | none (phase 1E: an agency reads its own share, the supplier reads all of its campaign's shares) |

A share goes to the campaign's supplier or to one of its partner agencies (trigger). A sum of shares above the supplier's monthly target is allowed; the service returns the flag (Task 11).

- [ ] **Step 1: Write the failing tests**

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
  agreement_acceptance: ["leads_fynix"],
};
```

With:

```typescript
  agreement_acceptance: ["leads_fynix"],
  campaign_share: ["leads_fynix"],
};
```

**Edit:** `server/db/setup-tables.integration.test.ts`

Replace:

```typescript
import { agreement, agreementAcceptance, member } from "@/server/db/schema";
```

With:

```typescript
import { agreement, agreementAcceptance, campaignShare, member, organisation } from "@/server/db/schema";
```

**Append** to `server/db/setup-tables.integration.test.ts`:

```typescript

async function newAgency(publicRef: string, parentOrgId: string | null): Promise<string> {
  const rows = await dbs.owner.db.insert(organisation).values({ publicRef, kind: "agency", name: `Agency ${publicRef}`, parentOrgId }).returning({ id: organisation.id });
  return firstOf(rows, "organisation").id;
}

async function newShare(agencyOrgId: string, monthlyShare = 5): Promise<string> {
  const rows = await dbs.owner.db.insert(campaignShare).values({ campaignId: campaignId(), agencyOrgId, monthlyShare }).returning({ id: campaignShare.id });
  return firstOf(rows, "share").id;
}

describe("campaign_share", () => {
  it("is Fynix only: Fynix reads, adds and removes shares and may change the amount; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "campaign_share")).toEqual(["DELETE", "INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "campaign_share")).toEqual(["monthly_share", "updated_at"]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "campaign_share"), role).toEqual([]);
      expect(await updatableColumns(role, "campaign_share"), role).toEqual([]);
    }
  });

  it("accepts the campaign's supplier and a partner agency of that supplier", async () => {
    await newShare(world.brightpath.id);
    await newShare(await newAgency("ORG-3C4D", world.brightpath.id), 7);
  });

  it("refuses another supplier, a partner agency of another supplier and a client", async () => {
    expect(await failure(newShare(world.northgate.id))).toContain("campaign_share_agency_not_in_supplier_tree");
    const strangers = await newAgency("ORG-5E6F", world.northgate.id);
    expect(await failure(newShare(strangers))).toContain("campaign_share_agency_not_in_supplier_tree");
    expect(await failure(newShare(world.kestrel.id))).toMatch(/campaign_share_agency/);
  });

  it("holds one share per campaign and agency, and refuses a negative share", async () => {
    await newShare(world.brightpath.id);
    expect(await failure(newShare(world.brightpath.id))).toContain("campaign_share_campaign_agency_unique");
    const partner = await newAgency("ORG-3C4D", world.brightpath.id);
    expect(await failure(newShare(partner, -1))).toContain("campaign_share_not_negative");
  });

  it("refuses to change the parent of an organisation that holds a share: it would stop being the supplier's partner", async () => {
    const partner = await newAgency("ORG-3C4D", world.brightpath.id);
    await newShare(partner);
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: world.northgate.id }).where(eq(organisation.id, partner)))).toContain("organisation_has_shares");
    expect(await failure(dbs.owner.db.update(organisation).set({ parentOrgId: null }).where(eq(organisation.id, partner)))).toContain("organisation_has_shares");
  });

  it("refuses to point an existing share at an organisation outside the supplier's tree", async () => {
    const id = await newShare(world.brightpath.id);
    expect(await failure(dbs.owner.db.update(campaignShare).set({ agencyOrgId: world.northgate.id }).where(eq(campaignShare.id, id)))).toContain("campaign_share_agency_not_in_supplier_tree");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm test:integration server/db/setup-tables server/db/structure
```

Expected: FAIL: `campaignShare` is not exported.

- [ ] **Step 3: Write the schema**

**File:** `server/db/schema/campaign-share.ts`

```typescript
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { campaign } from "./campaign";
import { organisationKind } from "./enums";
import { organisation } from "./organisation";

/**
 * How much of the supplier's monthly target one agency carries (spec 7.2, "Shares"). The agency is the campaign's supplier
 * itself (a supplier who works alone) or one of its partner agencies: a trigger (migration 0024) refuses any other agency.
 * A sum of shares above the supplier's target is allowed; the service reports it as a flag the screen shows.
 *
 * `agency_org_kind` is a constant, so the composite foreign key makes the database refuse a client. No tenant role has a grant
 * until phase 1E (an agency will read its own share).
 */
export const campaignShare = pgTable(
  "campaign_share",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "restrict" }),
    agencyOrgId: uuid("agency_org_id").notNull(),
    agencyOrgKind: organisationKind("agency_org_kind").notNull().generatedAlwaysAs(sql`'agency'::organisation_kind`),
    monthlyShare: integer("monthly_share").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "campaign_share_agency_fk", columns: [table.agencyOrgId, table.agencyOrgKind], foreignColumns: [organisation.id, organisation.kind] }),
    unique("campaign_share_campaign_agency_unique").on(table.campaignId, table.agencyOrgId),
    index("campaign_share_agency_idx").on(table.agencyOrgId),
    check("campaign_share_not_negative", sql`${table.monthlyShare} >= 0`),
  ],
);
```

**Append** to `server/db/schema/index.ts`:

```typescript
export * from "./campaign-share";
```

- [ ] **Step 4: Generate the DDL**

```bash
pnpm db:generate --name=campaign_share_table
```

Expected: `0023_campaign_share_table.sql` creates `campaign_share` (with `agency_org_kind` as a stored generated column), its two foreign keys, the unique constraint, the index and the check. Nothing else.

- [ ] **Step 5: Write the grants and triggers**

```bash
pnpm db:generate --custom --name=campaign_share_grants
```

**File:** `server/db/migrations/0024_campaign_share_grants.sql`

```sql
-- Row-level security, grants and triggers for campaign_share. See 0002 for the rules every table follows.
--
-- Fynix reads, adds and removes shares and may change the amount. A share is a setting, not a record anyone relied on, so
-- Fynix holds DELETE here (the audit row keeps what was removed): this is one of three configuration tables with that
-- grant (see also host_hours and host_block, 0028). No other role holds anything; phase 1E gives an agency its own share.
ALTER TABLE "campaign_share" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "campaign_share" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("monthly_share", "updated_at") ON "campaign_share" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "campaign_share_fynix_all" ON "campaign_share" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER campaign_share_audit_required AFTER INSERT OR UPDATE OR DELETE ON "campaign_share"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
-- A share goes to the campaign's supplier or to a partner agency of that supplier. Both rows are read FOR SHARE, so a
-- concurrent change of the campaign's supplier or of the agency's parent waits for this statement (and the second
-- trigger below blocks a change of parent once a share exists). If the campaign does not exist the comparison below
-- passes and the foreign key reports it with its own message.
CREATE FUNCTION public.campaign_share_check_agency() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
DECLARE
  supplier uuid;
  agency_parent uuid;
BEGIN
  SELECT c.agency_org_id INTO supplier FROM public.campaign c WHERE c.id = NEW.campaign_id FOR SHARE;
  SELECT o.parent_org_id INTO agency_parent FROM public.organisation o WHERE o.id = NEW.agency_org_id FOR SHARE;
  IF NEW.agency_org_id IS DISTINCT FROM supplier AND agency_parent IS DISTINCT FROM supplier THEN
    RAISE EXCEPTION 'campaign_share_agency_not_in_supplier_tree: a share goes to the campaign''s supplier or one of its partner agencies' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.campaign_share_check_agency() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER campaign_share_check_agency BEFORE INSERT OR UPDATE OF campaign_id, agency_org_id ON "campaign_share"
  FOR EACH ROW EXECUTE FUNCTION public.campaign_share_check_agency();
--> statement-breakpoint
-- The third hierarchy rule (the first two are in 0020): an organisation that holds a share cannot change its parent, because
-- it would stop being a partner of the supplier whose campaign the share is on.
CREATE FUNCTION public.organisation_check_parent_shares() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.campaign_share s WHERE s.agency_org_id = NEW.id) THEN
    RAISE EXCEPTION 'organisation_has_shares: an organisation that holds a campaign share cannot change its parent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.organisation_check_parent_shares() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER organisation_check_parent_shares BEFORE UPDATE OF parent_org_id ON "organisation"
  FOR EACH ROW WHEN (OLD.parent_org_id IS DISTINCT FROM NEW.parent_org_id) EXECUTE FUNCTION public.organisation_check_parent_shares();
```

- [ ] **Step 6: Run the checks**

```bash
pnpm test:integration server/db
pnpm exec vitest run server/db/migration-journal
pnpm db:generate
pnpm typecheck
pnpm lint
```

Expected: `0023` and `0024` apply; every database test passes, including the earlier hierarchy tests (the new organisation trigger does not change them).

- [ ] **Step 7: Commit**

```bash
git add server/db
git commit -m "Add campaign shares, limited to the supplier and its partner agencies"
```

---

## Task 6: Campaign hosts

**Files:** create `server/db/schema/campaign-host.ts`, `server/db/migrations/0025_campaign_host_table.sql`, `0026_campaign_host_grants.sql`; modify `server/db/schema/campaign.ts`, `member.ts`, `index.ts`, `server/db/setup-tables.integration.test.ts`, `server/db/structure.integration.test.ts`.

| Table | `leads_fynix` | other runtime roles |
|---|---|---|
| `campaign_host` | SELECT, INSERT; UPDATE `job_title`, `active` | none (phase 1E: the client reads its own hosts; the supplier and its agencies read the host's name, title and company, spec 5.1) |

"A host is a member of the campaign's client" is two composite foreign keys (decision S8), so it needs two unique constraints on existing tables (`campaign (id, client_org_id)` and `member (id, org_id)`), both additive.

- [ ] **Step 1: Write the failing tests**

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
  campaign_share: ["leads_fynix"],
};
```

With:

```typescript
  campaign_share: ["leads_fynix"],
  campaign_host: ["leads_fynix"],
};
```

**Edit:** `server/db/setup-tables.integration.test.ts`

Replace:

```typescript
import { agreement, agreementAcceptance, campaignShare, member, organisation } from "@/server/db/schema";
```

With:

```typescript
import { agreement, agreementAcceptance, campaignHost, campaignShare, member, organisation } from "@/server/db/schema";
```

**Append** to `server/db/setup-tables.integration.test.ts`:

```typescript

/** The kestrel user's membership: Kestrel is the client of the first campaign. */
const kestrelMember = (): Promise<string> => memberIdOf(userId(1));

async function newHost(overrides: Partial<typeof campaignHost.$inferInsert> = {}): Promise<string> {
  const rows = await dbs.owner.db
    .insert(campaignHost)
    .values({ campaignId: campaignId(), clientOrgId: world.kestrel.id, memberId: await kestrelMember(), jobTitle: "Chief Operating Officer", ...overrides })
    .returning({ id: campaignHost.id });
  return firstOf(rows, "host").id;
}

describe("campaign_host", () => {
  it("is Fynix only: Fynix reads and adds hosts and may change the title and the active flag, never remove one; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "campaign_host")).toEqual(["INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "campaign_host")).toEqual(["job_title", "active"]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "campaign_host"), role).toEqual([]);
      expect(await updatableColumns(role, "campaign_host"), role).toEqual([]);
    }
  });

  it("accepts a member of the campaign's client, active by default", async () => {
    const id = await newHost();
    expect(firstOf(await dbs.owner.db.select({ active: campaignHost.active }).from(campaignHost).where(eq(campaignHost.id, id)), "host").active).toBe(true);
  });

  it("refuses a member of another client and a member of an agency", async () => {
    expect(await failure(newHost({ memberId: await memberIdOf(userId(2)) }))).toContain("campaign_host_member_fk");
    expect(await failure(newHost({ memberId: await memberIdOf(userId(3)) }))).toContain("campaign_host_member_fk");
  });

  it("refuses a client organisation that is not the campaign's, even for that organisation's own member", async () => {
    expect(await failure(newHost({ clientOrgId: world.halden.id, memberId: await memberIdOf(userId(2)) }))).toContain("campaign_host_campaign_fk");
  });

  it("holds one row per campaign and member, and a job title of 1 to 120 characters", async () => {
    await newHost();
    expect(await failure(newHost())).toContain("campaign_host_campaign_member_unique");
    const kestrelsSecond = firstOf(world.campaigns.slice(2), "campaign").id;
    expect(await failure(newHost({ campaignId: kestrelsSecond, jobTitle: "" }))).toContain("campaign_host_job_title_length");
    expect(await failure(newHost({ campaignId: kestrelsSecond, jobTitle: "x".repeat(121) }))).toContain("campaign_host_job_title_length");
  });
});
```

The third campaign (`world.campaigns[2]`) is Kestrel's second campaign (Kestrel and Northgate), so the title checks are the only thing that can fail there.

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm test:integration server/db/setup-tables server/db/structure
```

Expected: FAIL: `campaignHost` is not exported.

- [ ] **Step 3: Write the schema**

**Edit:** `server/db/schema/campaign.ts`

Replace:

```typescript
    unique("campaign_id_orgs_unique").on(table.id, table.clientOrgId, table.agencyOrgId),
```

With:

```typescript
    unique("campaign_id_orgs_unique").on(table.id, table.clientOrgId, table.agencyOrgId),
    // The target of `campaign_host`'s composite foreign key, which pins a host to the campaign's own client (phase 1D).
    unique("campaign_id_client_unique").on(table.id, table.clientOrgId),
```

**Edit:** `server/db/schema/member.ts`

Replace:

```typescript
    unique("member_id_org_kind_unique").on(table.id, table.orgKind),
```

With:

```typescript
    unique("member_id_org_kind_unique").on(table.id, table.orgKind),
    // The target of `campaign_host`'s composite foreign key, which pins a host to a member of the campaign's client (phase 1D).
    unique("member_id_org_unique").on(table.id, table.orgId),
```

**File:** `server/db/schema/campaign-host.ts`

```typescript
import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { campaign } from "./campaign";
import { member } from "./member";

/**
 * The people of the client who take meetings for a campaign (spec 7.3). Both composite foreign keys use `client_org_id`, a
 * copy of the campaign's client that the service fills in: one key proves the campaign belongs to that client, the other that
 * the member belongs to it, so the database refuses a host from any other organisation without a trigger and without a race.
 *
 * A host is never removed: `active` is switched off, which keeps the meetings they took (phase 3). No tenant role has a grant
 * until phase 1E.
 */
export const campaignHost = pgTable(
  "campaign_host",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull(),
    clientOrgId: uuid("client_org_id").notNull(),
    memberId: uuid("member_id").notNull(),
    /** What the supplier and its agencies are told the host does, next to the name and the company. */
    jobTitle: text("job_title").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "campaign_host_campaign_fk", columns: [table.campaignId, table.clientOrgId], foreignColumns: [campaign.id, campaign.clientOrgId] }),
    foreignKey({ name: "campaign_host_member_fk", columns: [table.memberId, table.clientOrgId], foreignColumns: [member.id, member.orgId] }),
    unique("campaign_host_campaign_member_unique").on(table.campaignId, table.memberId),
    index("campaign_host_member_idx").on(table.memberId),
    check("campaign_host_job_title_length", sql`char_length(btrim(${table.jobTitle})) BETWEEN 1 AND 120`),
  ],
);
```

**Append** to `server/db/schema/index.ts`:

```typescript
export * from "./campaign-host";
```

- [ ] **Step 4: Generate the DDL**

```bash
pnpm db:generate --name=campaign_host_table
```

Expected: `0025_campaign_host_table.sql` creates `campaign_host`, adds `campaign_id_client_unique` to `campaign` and `member_id_org_unique` to `member` (`ALTER TABLE ... ADD CONSTRAINT ... UNIQUE`), and the two foreign keys. **Check the order:** each `ADD CONSTRAINT ... UNIQUE` must come before the foreign key that references it. If drizzle-kit wrote them the other way round, move the two `UNIQUE` statements above the `FOREIGN KEY` ones by hand (the file is not applied anywhere yet, so editing it is allowed). The index on an existing table is built while the table is small.

- [ ] **Step 5: Write the grants**

```bash
pnpm db:generate --custom --name=campaign_host_grants
```

**File:** `server/db/migrations/0026_campaign_host_grants.sql`

```sql
-- Row-level security and grants for campaign_host. See 0002 for the rules every table follows.
--
-- Fynix reads and adds hosts, and may change the job title and the active flag. A host is deactivated, never removed.
-- The foreign keys (0025) already pin each host to a member of the campaign's client. No other role holds anything; phase 1E
-- decides what the client, the supplier and its agencies read of a host.
ALTER TABLE "campaign_host" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON "campaign_host" TO leads_fynix;
--> statement-breakpoint
GRANT UPDATE ("job_title", "active") ON "campaign_host" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "campaign_host_fynix_all" ON "campaign_host" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER campaign_host_audit_required AFTER INSERT OR UPDATE OR DELETE ON "campaign_host"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
```

- [ ] **Step 6: Run the checks**

```bash
pnpm test:integration server/db
pnpm exec vitest run server/db/migration-journal
pnpm db:generate
pnpm typecheck
pnpm lint
```

Expected: `0025` and `0026` apply; every database test passes.

- [ ] **Step 7: Commit**

```bash
git add server/db
git commit -m "Add campaign hosts, pinned by foreign keys to the campaign's own client"
```

---

## Task 7: Host hours and blocked times

**Files:** create `server/db/schema/host-availability.ts`, `server/db/migrations/0027_host_availability_tables.sql`, `0028_host_availability_grants.sql`; modify `server/db/schema/index.ts`, `server/db/setup-tables.integration.test.ts`, `server/db/structure.integration.test.ts`.

| Table | `leads_fynix` | other runtime roles |
|---|---|---|
| `host_hours` | SELECT, INSERT, DELETE (the set is replaced, never edited) | none (phase 1E: the host reads and edits their own; the supplier and agencies read free blocks only, spec 5.1) |
| `host_block` | SELECT, INSERT, DELETE | none (as above) |

Both are about a client member (a composite foreign key to `member (id, org_kind)` with a constant kind, like `agency_alias`), not about a campaign: a host's hours are the host's, whichever campaigns they host.

- [ ] **Step 1: Write the failing tests**

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
  campaign_host: ["leads_fynix"],
};
```

With:

```typescript
  campaign_host: ["leads_fynix"],
  host_hours: ["leads_fynix"],
  host_block: ["leads_fynix"],
};
```

**Edit:** `server/db/setup-tables.integration.test.ts`

Replace:

```typescript
import { agreement, agreementAcceptance, campaignHost, campaignShare, member, organisation } from "@/server/db/schema";
```

With:

```typescript
import { agreement, agreementAcceptance, campaignHost, campaignShare, hostBlock, hostHours, member, organisation } from "@/server/db/schema";
```

**Append** to `server/db/setup-tables.integration.test.ts`:

```typescript

async function newHours(overrides: Partial<typeof hostHours.$inferInsert> = {}): Promise<string> {
  const rows = await dbs.owner.db
    .insert(hostHours)
    .values({ memberId: await kestrelMember(), timeZone: "Europe/London", weekday: 1, startMinute: 540, endMinute: 720, ...overrides })
    .returning({ id: hostHours.id });
  return firstOf(rows, "hours").id;
}

describe("host_hours", () => {
  it("is Fynix only: Fynix reads, adds and removes rows and changes none; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "host_hours")).toEqual(["DELETE", "INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "host_hours")).toEqual([]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "host_hours"), role).toEqual([]);
      expect(await updatableColumns(role, "host_hours"), role).toEqual([]);
    }
  });

  it("belongs to a client member, never to an agency member or to Fynix", async () => {
    await newHours();
    expect(await failure(newHours({ memberId: await memberIdOf(userId(3)) }))).toContain("host_hours_member_fk");
    expect(await failure(newHours({ memberId: await memberIdOf(userId(0)) }))).toContain("host_hours_member_fk");
  });

  it.each([
    ["a weekday of 7", { weekday: 7 }, "host_hours_weekday_range"],
    ["a weekday of -1", { weekday: -1 }, "host_hours_weekday_range"],
    ["a start below 0", { startMinute: -1, endMinute: 60 }, "host_hours_minutes_range"],
    ["an end above 1440", { startMinute: 1000, endMinute: 1441 }, "host_hours_minutes_range"],
    ["a window that ends where it starts", { startMinute: 600, endMinute: 600 }, "host_hours_start_before_end"],
    ["a window that ends before it starts", { startMinute: 700, endMinute: 600 }, "host_hours_start_before_end"],
    ["an empty time zone", { timeZone: "" }, "host_hours_time_zone_length"],
  ])("refuses %s", async (_label, overrides, constraint) => {
    expect(await failure(newHours(overrides))).toContain(constraint);
  });

  it("allows several windows on a day, adjacent windows, the same hours on another weekday and the same hours in another time zone", async () => {
    await newHours({ startMinute: 540, endMinute: 720 });
    await newHours({ startMinute: 720, endMinute: 900 });
    await newHours({ startMinute: 1000, endMinute: 1100 });
    await newHours({ weekday: 2, startMinute: 540, endMinute: 720 });
    await newHours({ timeZone: "Asia/Kolkata", startMinute: 540, endMinute: 720 });
  });

  it("refuses a window that overlaps another for the same member, weekday and time zone, on insert and on update", async () => {
    await newHours({ startMinute: 540, endMinute: 720 });
    expect(await failure(newHours({ startMinute: 600, endMinute: 800 }))).toContain("host_hours_overlap");
    expect(await failure(newHours({ startMinute: 500, endMinute: 541 }))).toContain("host_hours_overlap");
    expect(await failure(newHours({ startMinute: 560, endMinute: 580 }))).toContain("host_hours_overlap");
    const other = await newHours({ startMinute: 800, endMinute: 900 });
    expect(await failure(dbs.owner.db.update(hostHours).set({ startMinute: 700 }).where(eq(hostHours.id, other)))).toContain("host_hours_overlap");
  });
});

describe("host_block", () => {
  const block = async (overrides: Partial<typeof hostBlock.$inferInsert> = {}): Promise<string> => {
    const rows = await dbs.owner.db
      .insert(hostBlock)
      .values({ memberId: await kestrelMember(), startsAt: new Date("2027-01-04T09:00:00Z"), endsAt: new Date("2027-01-04T11:00:00Z"), note: "Dentist", ...overrides })
      .returning({ id: hostBlock.id });
    return firstOf(rows, "block").id;
  };

  it("is Fynix only: Fynix reads, adds and removes rows and changes none; no other role holds anything", async () => {
    expect(await tablePrivileges("leads_fynix", "host_block")).toEqual(["DELETE", "INSERT", "SELECT"]);
    expect(await updatableColumns("leads_fynix", "host_block")).toEqual([]);
    for (const role of ["leads_client", "leads_agency", "leads_auth", "leads_public"]) {
      expect(await tablePrivileges(role, "host_block"), role).toEqual([]);
      expect(await updatableColumns(role, "host_block"), role).toEqual([]);
    }
  });

  it("belongs to a client member, and overlapping blocks are allowed", async () => {
    await block();
    await block({ startsAt: new Date("2027-01-04T10:00:00Z"), endsAt: new Date("2027-01-04T12:00:00Z") });
    expect(await failure(block({ memberId: await memberIdOf(userId(3)) }))).toContain("host_block_member_fk");
  });

  it("must end after it starts, and keeps a note of at most 500 characters", async () => {
    expect(await failure(block({ endsAt: new Date("2027-01-04T09:00:00Z") }))).toContain("host_block_ends_after_starts");
    expect(await failure(block({ endsAt: new Date("2027-01-04T08:00:00Z") }))).toContain("host_block_ends_after_starts");
    expect(await failure(block({ note: "x".repeat(501) }))).toContain("host_block_note_length");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm test:integration server/db/setup-tables server/db/structure
```

Expected: FAIL: `hostHours` and `hostBlock` are not exported.

- [ ] **Step 3: Write the schema**

**File:** `server/db/schema/host-availability.ts`

```typescript
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organisationKind } from "./enums";
import { member } from "./member";

/**
 * When a client's person takes meetings (spec 7.3), in their own time zone: weekly windows (`host_hours`) and one-off blocked
 * times (`host_block`). Both belong to a member of a client, pinned by the composite key to `member (id, org_kind)` with a
 * constant kind (the `agency_alias` pattern), so an agency or Fynix member cannot have any. They are about the person, not a
 * campaign: the same hours apply to every campaign the person hosts.
 *
 * `weekday` is 0 (Sunday) to 6 (Saturday); minutes count from midnight, `end_minute` up to 1440. Several windows per day are
 * allowed; a trigger (migration 0028) refuses overlaps for the same member, weekday and time zone. A set of hours is replaced
 * as a whole by the service, so Fynix holds no UPDATE. No tenant role has a grant until phase 1E.
 */
export const hostHours = pgTable(
  "host_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id").notNull(),
    memberOrgKind: organisationKind("member_org_kind").notNull().generatedAlwaysAs(sql`'client'::organisation_kind`),
    timeZone: text("time_zone").notNull(),
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "host_hours_member_fk", columns: [table.memberId, table.memberOrgKind], foreignColumns: [member.id, member.orgKind] }),
    index("host_hours_member_idx").on(table.memberId, table.weekday),
    check("host_hours_weekday_range", sql`${table.weekday} BETWEEN 0 AND 6`),
    check("host_hours_minutes_range", sql`${table.startMinute} >= 0 AND ${table.endMinute} <= 1440`),
    check("host_hours_start_before_end", sql`${table.startMinute} < ${table.endMinute}`),
    check("host_hours_time_zone_length", sql`char_length(btrim(${table.timeZone})) BETWEEN 1 AND 64`),
  ],
);

/** A time the person cannot take meetings, as two instants. Blocks may overlap; the free time is what the weekly hours leave after them. */
export const hostBlock = pgTable(
  "host_block",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id").notNull(),
    memberOrgKind: organisationKind("member_org_kind").notNull().generatedAlwaysAs(sql`'client'::organisation_kind`),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "host_block_member_fk", columns: [table.memberId, table.memberOrgKind], foreignColumns: [member.id, member.orgKind] }),
    index("host_block_member_idx").on(table.memberId, table.startsAt),
    check("host_block_ends_after_starts", sql`${table.endsAt} > ${table.startsAt}`),
    check("host_block_note_length", sql`char_length(${table.note}) <= 500`),
  ],
);
```

**Append** to `server/db/schema/index.ts`:

```typescript
export * from "./host-availability";
```

- [ ] **Step 4: Generate the DDL**

```bash
pnpm db:generate --name=host_availability_tables
```

Expected: `0027_host_availability_tables.sql` creates the two tables, their foreign keys to `member`, the indexes and the checks. Nothing else.

- [ ] **Step 5: Write the grants and the overlap trigger**

```bash
pnpm db:generate --custom --name=host_availability_grants
```

**File:** `server/db/migrations/0028_host_availability_grants.sql`

```sql
-- Row-level security, grants and the overlap trigger for host_hours and host_block. See 0002 for the rules every table follows.
--
-- Fynix reads, adds and removes rows of both and changes none: a host's weekly set is replaced as a whole (delete, then insert),
-- and a block is added or removed. Both are settings, so Fynix holds DELETE here, like on campaign_share (0024); the audit
-- row keeps what was removed. No other role holds anything; phase 1E lets a host read and edit their own, and lets the
-- supplier and its agencies read the free blocks only (spec 5.1).
ALTER TABLE "host_hours" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "host_block" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "host_hours" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "host_hours_fynix_all" ON "host_hours" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "host_block" TO leads_fynix;
--> statement-breakpoint
CREATE POLICY "host_block_fynix_all" ON "host_block" AS PERMISSIVE FOR ALL TO leads_fynix USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER host_hours_audit_required AFTER INSERT OR UPDATE OR DELETE ON "host_hours"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER host_block_audit_required AFTER INSERT OR UPDATE OR DELETE ON "host_block"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.audit_required();
--> statement-breakpoint
-- Two windows overlap when each starts before the other ends. They are compared for the same member, weekday and time zone
-- only (two zones are not on one clock); one that ends where the next starts does not overlap. An exclusion constraint would
-- say the same but needs the btree_gist extension, so a trigger does. It cannot see another transaction's uncommitted row,
-- so the service replaces a host's set under a lock on the member row (server/domain/availability.ts).
CREATE FUNCTION public.host_hours_check_overlap() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.host_hours h
    WHERE h.member_id = NEW.member_id AND h.weekday = NEW.weekday AND h.time_zone = NEW.time_zone AND h.id <> NEW.id
      AND h.start_minute < NEW.end_minute AND NEW.start_minute < h.end_minute
  ) THEN
    RAISE EXCEPTION 'host_hours_overlap: working hours on one day must not overlap' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.host_hours_check_overlap() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER host_hours_check_overlap BEFORE INSERT OR UPDATE ON "host_hours"
  FOR EACH ROW EXECUTE FUNCTION public.host_hours_check_overlap();
```

- [ ] **Step 6: Run the checks**

```bash
pnpm test:integration server/db
pnpm exec vitest run server/db/migration-journal
pnpm db:generate
pnpm typecheck
pnpm lint
```

Expected: `0027` and `0028` apply; every database test passes.

- [ ] **Step 7: Commit**

```bash
git add server/db
git commit -m "Add host working hours and blocked times, with the overlap rule in the database"
```

---

## Task 8: Fynix admin and staff, in the service and in the database

**Files:** create `server/db/fynix-admin.integration.test.ts`, `server/domain/admin-only.integration.test.ts`, `server/db/migrations/0029_fynix_admin_required.sql`; modify `server/domain/errors.ts`, `server/domain/fynix-write.ts`, `server/domain/fynix-write.integration.test.ts`, `server/db/testing/structure.ts`, `server/db/structure.integration.test.ts`.

Where the check lives (decision S1): the service helper `fynixWrite` gives a clear `admin-required` before anything is written, and a statement trigger on every table Fynix can write makes the database refuse the change even for a caller that skips the helper. `fynixWrite` is the one entry point for every existing set-up write, so the 1C functions need no edit of their own; this task proves each of them is refused for staff. The trigger is not on `audit_log` or `email_outbox` (plumbing), so phase 2 staff work on lead tables, written with their own entry point, is not blocked.

The rule in words: the request's user must be an active member of the Fynix organisation with the `manager` role. A manager of a client or supplier is not enough, because the lookup names the Fynix organisation kind.

- [ ] **Step 1: Write the failing tests**

**File:** `server/db/fynix-admin.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, member, organisation } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import { captureErrorText, openTestDatabases, resetDatabase, type TestDatabases } from "@/server/db/testing";
import { seedWorld, type SeedWorld } from "@/server/db/testing/seed";
import { fynixWritableTablesWithoutAdminTrigger } from "@/server/db/testing/structure";

/**
 * The database side of the Fynix admin rule (migration 0029): a change to a table Fynix writes, made as `leads_fynix` by anyone
 * who is not an active manager of the Fynix organisation, is refused, whatever the service did or did not check. The service
 * side (`admin-required`) is tested in server/domain/fynix-write.integration.test.ts and admin-only.integration.test.ts.
 */

let dbs: TestDatabases;
let world: SeedWorld;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});

const REFUSED = "Only a Fynix admin may change organisation";

function person(predicate: (candidate: SeedWorld["users"][number]) => boolean, what: string): string {
  const found = world.users.find(predicate);
  if (found === undefined) throw new Error(`The seed world has no ${what}`);
  return found.id;
}
const admin = (): string => person((candidate) => candidate.organisation.kind === "fynix" && candidate.role === "manager", "Fynix admin");
const staff = (): string => person((candidate) => candidate.organisation.kind === "fynix" && candidate.role === "member", "Fynix staff member");
const clientUser = (): string => person((candidate) => candidate.organisation.kind === "client", "client user");

/** A complete Fynix change with its audit row, so the only thing that can refuse it is the admin rule. */
async function createAs(userId: string): Promise<void> {
  await withScope(dbs.roles.leads_fynix.db, { orgId: null, userId }, async (tx) => {
    await tx.insert(organisation).values({ publicRef: "ORG-3C4D", kind: "agency", name: "Ridgeway Ltd" });
    await tx.insert(auditLog).values({ action: "organisation.create", subjectTable: "organisation", subjectId: userId });
  });
}
const organisationCount = async (): Promise<number> => (await dbs.owner.db.select({ id: organisation.id }).from(organisation)).length;

describe("the Fynix admin trigger", () => {
  it("lets an active manager of the Fynix organisation write", async () => {
    await createAs(admin());
    expect(await organisationCount()).toBe(6);
  });

  it("refuses Fynix staff, and nothing is left behind", async () => {
    expect(await captureErrorText(createAs(staff()))).toContain(REFUSED);
    expect(await organisationCount()).toBe(5);
  });

  it("refuses staff even for a statement that would change no row", async () => {
    const message = await captureErrorText(withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: staff() }, (tx) => tx.update(organisation).set({ name: "x" }).where(eq(organisation.name, "no such name"))));
    expect(message).toContain(REFUSED);
  });

  it("lets staff read", async () => {
    const rows = await withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: staff() }, (tx) => tx.select({ id: organisation.id }).from(organisation));
    expect(rows).toHaveLength(5);
  });

  it("refuses a suspended admin", async () => {
    await dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.userId, admin()));
    expect(await captureErrorText(createAs(admin()))).toContain(REFUSED);
  });

  it("refuses a manager of a client organisation: the role must be held in the Fynix organisation", async () => {
    await dbs.owner.db.update(member).set({ role: "manager" }).where(eq(member.userId, clientUser()));
    expect(await captureErrorText(createAs(clientUser()))).toContain(REFUSED);
  });

  it("refuses a user id that belongs to nobody", async () => {
    expect(await captureErrorText(createAs("99999999-9999-4999-8999-999999999999"))).toContain(REFUSED);
  });

  it("is on every table Fynix can write, apart from the audit log and the outbox", async () => {
    expect(await fynixWritableTablesWithoutAdminTrigger(dbs.owner.db)).toEqual([]);
  });
});
```

**File:** `server/domain/admin-only.integration.test.ts`

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCampaign, updateCampaign } from "@/server/domain/campaigns";
import { issueInvite, resendInvite, revokeInvite } from "@/server/domain/invites";
import { reactivateMember, renameMember, setAgencyAlias, suspendMember } from "@/server/domain/members";
import { createOrganisation, setOrganisationStatus, updateOrganisation } from "@/server/domain/organisations";
import { publishTerms } from "@/server/domain/terms";
import { auditRowsFor, firstCampaign, memberIdFor, refusal, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Every set-up function from phase 1C is refused to Fynix staff. They all go through `fynixWrite`, so one rule covers them,
 * and this file is the proof that none was left out. The phase 1D functions have the same case in their own test files.
 */

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe("Fynix staff cannot change set-up", () => {
  const calls: readonly (readonly [string, () => Promise<unknown>])[] = [
    ["createOrganisation", async () => createOrganisation(rig.deps(), rig.staffActor, { kind: "agency", name: "Ridgeway Media Pvt Ltd" })],
    ["updateOrganisation", async () => updateOrganisation(rig.deps(), rig.staffActor, rig.world().kestrel.id, { name: "Kestrel Group Ltd" })],
    ["setOrganisationStatus", async () => setOrganisationStatus(rig.deps(), rig.staffActor, rig.world().kestrel.id, "archived")],
    [
      "createCampaign",
      async () =>
        createCampaign(rig.deps(), rig.staffActor, { clientOrgId: rig.world().kestrel.id, agencyOrgId: rig.world().northgate.id, name: "Benelux cold chain", startDate: "2027-01-04", endDate: "2027-06-30", monthlyTarget: 12, totalTarget: 72 }),
    ],
    ["updateCampaign", async () => updateCampaign(rig.deps(), rig.staffActor, firstCampaign(rig).id, { name: "Renamed" })],
    ["issueInvite", async () => issueInvite(rig.deps(), rig.staffActor, { organisationId: rig.world().kestrel.id, email: "new.person@example.com", name: "New Person" })],
    ["resendInvite", async () => resendInvite(rig.deps(), rig.staffActor, UNKNOWN)],
    ["revokeInvite", async () => revokeInvite(rig.deps(), rig.staffActor, UNKNOWN)],
    ["publishTerms", async () => publishTerms(rig.deps(), rig.staffActor, { party: "client", title: "Terms for client users", body: "The terms, version one." })],
    ["suspendMember", async () => suspendMember(rig.deps(), rig.staffActor, await memberIdFor(rig, userIn(rig, rig.world().kestrel).id))],
    ["reactivateMember", async () => reactivateMember(rig.deps(), rig.staffActor, await memberIdFor(rig, userIn(rig, rig.world().kestrel).id))],
    ["renameMember", async () => renameMember(rig.deps(), rig.staffActor, await memberIdFor(rig, userIn(rig, rig.world().kestrel).id), "New Name")],
    ["setAgencyAlias", async () => setAgencyAlias(rig.deps(), rig.staffActor, await memberIdFor(rig, userIn(rig, rig.world().brightpath).id), "Rae, Fynix")],
  ];

  it.each(calls)("%s is refused with admin-required", async (_name, call) => {
    expect((await refusal(call())).code).toBe("admin-required");
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});
```

**Append** to `server/domain/fynix-write.integration.test.ts`:

```typescript

describe("the actor must be a Fynix admin", () => {
  const writeAs = (userId: string) =>
    fynixWrite(rig.dbs.roles.leads_fynix.db, { userId }, async ({ tx, audit }) => {
      await tx.insert(organisation).values(NEW);
      await audit({ action: "organisation.create", subject: { table: "organisation", id: userId, ref: NEW.publicRef } });
    });

  it("refuses Fynix staff with admin-required, and writes nothing", async () => {
    const error = await writeAs(rig.staffActor.userId).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("admin-required");
    expect(await auditRows()).toEqual([]);
    expect(await refs()).not.toContain(NEW.publicRef);
  });

  it("refuses an admin whose role has been lowered to staff", async () => {
    await rig.dbs.owner.db.update(member).set({ role: "member" }).where(eq(member.userId, rig.actor.userId));
    const error = await writeAs(rig.actor.userId).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect((error as DomainError).code).toBe("admin-required");
  });

  it("hands the callback the actor's own member id", async () => {
    const id = await fynixWrite(rig.dbs.roles.leads_fynix.db, rig.actor, async ({ actorMemberId }) => actorMemberId);
    expect(id).toBe(await memberIdFor(rig, rig.actor.userId));
  });

  it("lets Fynix staff read through fynixRead", async () => {
    const rows = await fynixRead(rig.dbs.roles.leads_fynix.db, rig.staffActor, (tx) => tx.select({ ref: organisation.publicRef }).from(organisation));
    expect(rows).toHaveLength(5);
  });
});
```

**Edit:** `server/domain/fynix-write.integration.test.ts`

Replace:

```typescript
import { openDomainRig } from "@/server/domain/testing";
```

With:

```typescript
import { memberIdFor } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
  fynixWritableTablesWithoutAuditTrigger,
  grantsToPublic,
```

With:

```typescript
  fynixWritableTablesWithoutAdminTrigger,
  fynixWritableTablesWithoutAuditTrigger,
  grantsToPublic,
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
  it("every table Fynix can write has the audit_required trigger, apart from the audit log and the outbox", async () => {
    expect(await fynixWritableTablesWithoutAuditTrigger(dbs.owner.db)).toEqual([]);
  });
```

With:

```typescript
  it("every table Fynix can write has the audit_required trigger, apart from the audit log and the outbox", async () => {
    expect(await fynixWritableTablesWithoutAuditTrigger(dbs.owner.db)).toEqual([]);
  });

  it("every table Fynix can write has the fynix_admin_required trigger, apart from the audit log and the outbox", async () => {
    expect(await fynixWritableTablesWithoutAdminTrigger(dbs.owner.db)).toEqual([]);
  });
```

**Edit:** `server/db/structure.integration.test.ts`

Replace:

```typescript
    expect(found).toEqual(["broken_not_deferred", "broken_unaudited", "email_outbox"]);
  });
```

With:

```typescript
    expect(found).toEqual(["broken_not_deferred", "broken_unaudited", "email_outbox"]);
  });

  it("a table Fynix can write with no admin trigger, a row level admin trigger, and the two exempt tables", async () => {
    const found = await findInBrokenState(
      dbs.owner,
      [
        "create table public.broken_no_admin (id int)",
        "grant insert on public.broken_no_admin to leads_fynix",
        "create table public.broken_row_admin (id int)",
        "grant update (id) on public.broken_row_admin to leads_fynix",
        "create trigger broken_row_admin_t before insert or update or delete on public.broken_row_admin for each row execute function public.fynix_admin_required()",
        "create table public.fine_admin (id int)",
        "grant insert, update on public.fine_admin to leads_fynix",
        "create trigger fine_admin_t before insert or update or delete on public.fine_admin for each statement execute function public.fynix_admin_required()",
        "create table public.fine_admin_read_only (id int)",
        "grant select on public.fine_admin_read_only to leads_fynix",
      ],
      (executor) => fynixWritableTablesWithoutAdminTrigger(executor, ["audit_log"]),
    );
    expect(found).toEqual(["broken_no_admin", "broken_row_admin", "email_outbox"]);
  });
```

**Edit:** `server/db/testing/structure.ts`

Add the check after `fynixWritableTablesWithoutAuditTrigger`. Replace:

```typescript
/** Quotes a catalog identifier for use in test SQL. */
```

With:

```typescript
/**
 * Tables `leads_fynix` can insert into, update or delete from that have no enabled, non deferred, statement level
 * `fynix_admin_required` trigger on INSERT, UPDATE and DELETE (migration 0029). Without it Fynix staff could change set-up
 * through a statement that skips the service check, so every table Fynix gets a write grant on must add the trigger. The two
 * exempt tables are the audit log and the outbox: neither is set-up, and phase 2 staff work will write its own tables.
 */
export function fynixWritableTablesWithoutAdminTrigger(executor: Executor, exempt: readonly string[] = AUDIT_EXEMPT_TABLES): Promise<string[]> {
  return offenders(
    executor,
    sql`select c.relname::text as offender from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not in (${sql.raw(quoted(exempt.length === 0 ? [""] : exempt))})
          and (has_any_column_privilege('leads_fynix', c.oid, 'INSERT') or has_any_column_privilege('leads_fynix', c.oid, 'UPDATE')
            or has_table_privilege('leads_fynix', c.oid, 'DELETE'))
          and not exists (
            select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
            where t.tgrelid = c.oid and p.proname = 'fynix_admin_required' and t.tgconstraint = 0 and t.tgenabled = 'O'
              and (t.tgtype & 1) = 0 and (t.tgtype & 2) <> 0 and (t.tgtype & 4) <> 0 and (t.tgtype & 8) <> 0 and (t.tgtype & 16) <> 0)
        order by 1`,
  );
}

/** Quotes a catalog identifier for use in test SQL. */
```

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm test:integration server/db/fynix-admin server/db/structure server/domain/admin-only server/domain/fynix-write
```

Expected: FAIL: `admin-required` is not an error code (compile error), `actorMemberId` does not exist on `FynixWrite`, and the trigger tests find no trigger.

- [ ] **Step 3: Add the error codes the phase uses**

**Edit:** `server/domain/errors.ts`

Replace:

```typescript
  | "invite-conflict";
```

With:

```typescript
  | "invite-conflict"
  | "admin-required"
  | "not-a-supplier"
  | "share-not-allowed"
  | "not-a-client-member"
  | "agreement-superseded"
  | "not-an-agreement-signer"
  | "already-accepted";
```

- [ ] **Step 4: Make `fynixWrite` require an admin and hand out the actor's member id**

**File:** `server/domain/fynix-write.ts`

```typescript
import { and, eq } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { member } from "@/server/db/schema";
import { withScope, type ScopedTransaction } from "@/server/db/scope";
import { DomainError } from "@/server/domain/errors";
import { appendAudit, type AuditEntry } from "@/server/domain/audit";

/** The admin the request belongs to: the `user.id` of the signed-in Fynix member. */
export interface FynixActor {
  readonly userId: string;
}

/** What a Fynix write callback gets: the transaction, the actor's own `member.id`, and the way to append to the audit log inside the transaction. */
export interface FynixWrite {
  readonly tx: ScopedTransaction;
  /** The `member.id` of the admin making the change, for columns such as `agreement.created_by`. */
  readonly actorMemberId: string;
  audit(entry: AuditEntry): Promise<void>;
}

/**
 * The one way a Fynix admin changes anything. It opens the Fynix scope transaction (`app.user_id` is the actor, so the
 * audit rows are in the admin's name) and hands the callback an `audit` function that writes into the same transaction,
 * so a change and its audit row commit together or not at all. If the callback changes a domain table and never calls
 * `audit`, the database refuses the commit (`audit_required`, migration 0012): the rule does not depend on anyone
 * remembering.
 *
 * Who may write (phase 1D): an active member of the Fynix organisation whose role is `manager`, a Fynix admin. A member who
 * is not one at all is `not-authorised`; Fynix staff (role `member`) get `admin-required`, which a screen words as "ask an
 * admin". Both are checked first, for a clear error, and again by the database: the audit policy (migration 0018) wants an
 * active Fynix member, and every table Fynix can write has a `fynix_admin_required` trigger (migration 0029) that wants a manager,
 * so a caller that skips this function still cannot change set-up. `db` is the `leads_fynix` database.
 *
 * Every write that exists today is set-up. A later phase in which staff change leads adds its own entry point beside this one,
 * for tables that do not carry the admin trigger.
 *
 * Services never call `withScope` or `withFynixScope` for a write themselves; a source test (server/domain/boundaries.test.ts)
 * fails if one does.
 */
export async function fynixWrite<T>(db: Database, actor: FynixActor, work: (write: FynixWrite) => Promise<T>): Promise<T> {
  return withScope(db, { orgId: null, userId: actor.userId }, async (tx) => {
    const [active] = await tx
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(and(eq(member.userId, actor.userId), eq(member.orgKind, "fynix"), eq(member.status, "active")))
      .limit(1);
    if (active === undefined) throw new DomainError("not-authorised", "The signed-in user is not an active member of Fynix.");
    if (active.role !== "manager") throw new DomainError("admin-required", "Only a Fynix admin can change set-up; Fynix staff can read it.");
    return work({ tx, actorMemberId: active.id, audit: (entry) => appendAudit(tx, entry) });
  });
}

/** A Fynix read: the same scope, no audit, open to staff as well as admins. A change made inside it is refused at commit, like any unaudited Fynix change. */
export async function fynixRead<T>(db: Database, actor: FynixActor, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withScope(db, { orgId: null, userId: actor.userId }, work);
}
```

- [ ] **Step 5: Write the trigger migration**

```bash
pnpm db:generate --custom --name=fynix_admin_required
```

**File:** `server/db/migrations/0029_fynix_admin_required.sql`

```sql
-- Only a Fynix admin changes set-up: the database half of the phase 1D role rule (the service half is fynixWrite).
--
-- A statement level BEFORE trigger on every table leads_fynix can write, except audit_log and email_outbox (plumbing, see
-- AUDIT_EXEMPT_TABLES in server/db/testing/structure.ts). It only looks at leads_fynix: seeds, `pnpm admin:create`, the owner,
-- and the redemption of an invite (leads_auth inserts a member, an alias and an acceptance) are not Fynix set-up. For
-- leads_fynix the request's user (app.user_id) must be an active member of the Fynix organisation with the `manager` role,
-- the role `pnpm admin:create` gives; Fynix staff have `member`. The trigger runs once per statement, before any row changes,
-- and also for a statement that touches no row. It reads `member` as the caller, which leads_fynix may (0016).
-- A structural test (fynixWritableTablesWithoutAdminTrigger) fails for a Fynix writable table that lacks the trigger.
CREATE FUNCTION public.fynix_admin_required() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF current_user = 'leads_fynix' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member m
      WHERE m.user_id = public.app_current_user_id() AND m.org_kind = 'fynix' AND m.role = 'manager' AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Only a Fynix admin may change %', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fynix_admin_required() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER organisation_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "organisation" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER campaign_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "campaign" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER invite_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "invite" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER member_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "member" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER agency_alias_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "agency_alias" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER terms_document_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "terms_document" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER agreement_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "agreement" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER agreement_acceptance_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "agreement_acceptance" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER campaign_share_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "campaign_share" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER campaign_host_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "campaign_host" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER host_hours_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "host_hours" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
--> statement-breakpoint
CREATE TRIGGER host_block_admin_required BEFORE INSERT OR UPDATE OR DELETE ON "host_block" FOR EACH STATEMENT EXECUTE FUNCTION public.fynix_admin_required();
```

- [ ] **Step 6: Run the new tests, then the whole integration suite**

```bash
pnpm test:integration server/db/fynix-admin server/db/structure server/domain/admin-only server/domain/fynix-write
pnpm test:integration
```

Expected: the migrator applies `0029`; the four files pass; then the whole suite passes. If an older test fails with "Only a Fynix admin may change ..." it writes as `leads_fynix` with a user that is not the seeded admin: change it to use `rig.actor` (or `world.users[0]`, the seeded admin). Every existing test that writes as Fynix already uses one of the two, so none is expected to fail, but the full run is the proof, not this sentence.

- [ ] **Step 7: Run the checks and commit**

```bash
pnpm exec vitest run server/db/migration-journal
pnpm db:generate
pnpm typecheck
pnpm lint
git add server
git commit -m "Require a Fynix admin for every set-up write, in the write helper and in the database"
```

Expected: journal test passes; `pnpm db:generate` prints `No schema changes, nothing to migrate`; typecheck and lint are clean.

---

## Task 9: Suppliers, partner agencies and the campaign settings

**Files:** create `server/domain/suppliers.ts`, `server/domain/suppliers.integration.test.ts`; modify `server/domain/audit.ts`, `snapshots.ts`, `inputs.ts`, `inputs.test.ts`, `organisations.ts`, `campaigns.ts`, `campaigns.integration.test.ts`.

The functions: `createSupplier`, `createPartnerAgency`, `listSuppliers`, and the changes to `createCampaign` and `updateCampaign` (supplier check, time zone, meeting length). All writes are Fynix admin writes through `fynixWrite`, so each is audited and refused to staff without any code of its own.

- [ ] **Step 1: Write the failing tests**

**File:** `server/domain/suppliers.integration.test.ts`

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { organisation } from "@/server/db/schema";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { createPartnerAgency, createSupplier, listSuppliers } from "@/server/domain/suppliers";
import { auditRowsFor, refusal } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const organisationCount = async (): Promise<number> => (await rig.dbs.owner.db.select({ id: organisation.id }).from(organisation)).length;
const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe("createSupplier", () => {
  it("creates an agency with no parent and a generated reference, and audits it", async () => {
    const created = await createSupplier(rig.deps(), rig.actor, { name: "  Ridgeway Media Pvt Ltd " });
    expect(created).toMatchObject({ kind: "agency", name: "Ridgeway Media Pvt Ltd", brandName: null, parentOrgId: null, status: "active" });
    expect(created.publicRef).toMatch(/^ORG-[0-9A-HJKMNP-TV-Z]{4}$/);
    const [audit] = await auditRowsFor(rig, "organisation.create");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "organisation", subjectId: created.id, subjectRef: created.publicRef, before: null, after: { kind: "agency", parentOrgId: null } });
  });

  it.each([
    ["an empty name", { name: "   " }],
    ["a missing name", {}],
    ["a brand name", { name: "Ridgeway", brandName: "Ridge" }],
    ["a parent", { name: "Ridgeway", parentOrgId: UNKNOWN }],
  ])("refuses %s, and writes nothing", async (_label, input) => {
    expect((await refusal(createSupplier(rig.deps(), rig.actor, input))).code).toBe("invalid-input");
    expect(await organisationCount()).toBe(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(createSupplier(rig.deps(), rig.staffActor, { name: "Ridgeway Media Pvt Ltd" }))).code).toBe("admin-required");
    expect(await organisationCount()).toBe(5);
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("createPartnerAgency", () => {
  it("creates an agency under a supplier and audits it with the parent in the snapshot", async () => {
    const { brightpath } = rig.world();
    const created = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "Ridgeway Partner Ltd" });
    expect(created).toMatchObject({ kind: "agency", name: "Ridgeway Partner Ltd", parentOrgId: brightpath.id, status: "active" });
    const [audit] = await auditRowsFor(rig, "organisation.create");
    expect(audit).toMatchObject({ subjectId: created.id, before: null, after: { kind: "agency", parentOrgId: brightpath.id } });
  });

  it("refuses an unknown supplier, a client, the Fynix organisation, a partner agency and an archived supplier, and writes nothing", async () => {
    const { brightpath, kestrel, fynix, northgate } = rig.world();
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "Ridgeway Partner Ltd" });
    const before = await organisationCount();
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: UNKNOWN, name: "X Ltd" }))).code).toBe("not-found");
    for (const parent of [kestrel.id, fynix.id, partner.id]) {
      expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: parent, name: "X Ltd" }))).code, parent).toBe("not-a-supplier");
    }
    await setOrganisationStatus(rig.deps(), rig.actor, northgate.id, "archived");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: northgate.id, name: "X Ltd" }))).code).toBe("organisation-archived");
    expect(await organisationCount()).toBe(before);
    expect((await auditRowsFor(rig)).map((row) => row.action)).toEqual(["organisation.create", "organisation.archive"]);
  });

  it("refuses an empty name and a field it does not know", async () => {
    const { brightpath } = rig.world();
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "" }))).code).toBe("invalid-input");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: brightpath.id, name: "X Ltd", kind: "client" }))).code).toBe("invalid-input");
    expect((await refusal(createPartnerAgency(rig.deps(), rig.actor, { supplierId: "not-a-uuid", name: "X Ltd" }))).code).toBe("invalid-input");
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(createPartnerAgency(rig.deps(), rig.staffActor, { supplierId: rig.world().brightpath.id, name: "X Ltd" }))).code).toBe("admin-required");
    expect(await organisationCount()).toBe(5);
  });
});

describe("listSuppliers", () => {
  it("lists every supplier by name with its partner agencies, and no client", async () => {
    const { brightpath, northgate } = rig.world();
    expect((await listSuppliers(rig.deps(), rig.actor)).map((row) => [row.supplier.name, row.agencies.length])).toEqual([
      [brightpath.name, 0],
      [northgate.name, 0],
    ]);
    await createPartnerAgency(rig.deps(), rig.actor, { supplierId: northgate.id, name: "Zed Partner Ltd" });
    await createPartnerAgency(rig.deps(), rig.actor, { supplierId: northgate.id, name: "Alpha Partner Ltd" });
    const listed = await listSuppliers(rig.deps(), rig.actor);
    expect(listed.map((row) => row.supplier.name)).toEqual([brightpath.name, northgate.name]);
    expect(listed[1]?.agencies.map((row) => row.name)).toEqual(["Alpha Partner Ltd", "Zed Partner Ltd"]);
    expect(listed[1]?.agencies.every((row) => row.parentOrgId === northgate.id)).toBe(true);
    expect(JSON.stringify(listed)).not.toContain("Kestrel");
  });

  it("includes an archived supplier with its status, and is open to Fynix staff", async () => {
    const { northgate } = rig.world();
    await setOrganisationStatus(rig.deps(), rig.actor, northgate.id, "archived");
    const listed = await listSuppliers(rig.deps(), rig.staffActor);
    expect(listed.find((row) => row.supplier.id === northgate.id)?.supplier.status).toBe("archived");
  });
});
```

**Edit:** `server/domain/campaigns.integration.test.ts`

Replace:

```typescript
import { createOrganisation, setOrganisationStatus } from "@/server/domain/organisations";
```

With:

```typescript
import { createOrganisation, setOrganisationStatus } from "@/server/domain/organisations";
import { createPartnerAgency } from "@/server/domain/suppliers";
```

**Append** to `server/domain/campaigns.integration.test.ts`:

```typescript

describe("campaign time zone and meeting length", () => {
  it("default to London time and 30 minutes, and the record says so", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, input());
    expect(created).toMatchObject({ timeZone: "Europe/London", meetingMinutes: 30 });
    expect(await row(created.id)).toMatchObject({ timeZone: "Europe/London", meetingMinutes: 30 });
  });

  it("are stored when given, and audited", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, { ...input(), timeZone: "Asia/Kolkata", meetingMinutes: 45 });
    expect(created).toMatchObject({ timeZone: "Asia/Kolkata", meetingMinutes: 45 });
    const [audit] = await auditRowsFor(rig, "campaign.create");
    expect(audit).toMatchObject({ after: { timeZone: "Asia/Kolkata", meetingMinutes: 45 } });
  });

  it.each([
    ["an unknown time zone", { timeZone: "Mars/Olympus" }],
    ["an offset instead of a zone", { timeZone: "+01:00" }],
    ["an empty time zone", { timeZone: "" }],
    ["a meeting of 14 minutes", { meetingMinutes: 14 }],
    ["a meeting of 241 minutes", { meetingMinutes: 241 }],
    ["a fractional meeting length", { meetingMinutes: 30.5 }],
  ])("refuse %s, on create and on update, and write nothing", async (_label, change) => {
    expect((await refusal(createCampaign(rig.deps(), rig.actor, { ...input(), ...change }))).code).toBe("invalid-input");
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, id, change))).code).toBe("invalid-input");
    expect(await row(id)).toMatchObject({ timeZone: "Europe/London", meetingMinutes: 30 });
    expect(await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign)).toHaveLength(5);
  });

  it("change on update, with the before and after in the audit row", async () => {
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    const after = await updateCampaign(rig.deps(), rig.actor, id, { timeZone: "America/New_York", meetingMinutes: 60 });
    expect(after).toMatchObject({ timeZone: "America/New_York", meetingMinutes: 60 });
    const [audit] = await auditRowsFor(rig, "campaign.update");
    expect(audit).toMatchObject({ before: { timeZone: "Europe/London", meetingMinutes: 30 }, after: { timeZone: "America/New_York", meetingMinutes: 60 } });
  });
});

describe("a campaign's agency is its supplier", () => {
  it("refuses a partner agency as the agency of a new campaign, with not-a-supplier, and writes nothing", async () => {
    const partner = await createPartnerAgency(rig.deps(), rig.actor, { supplierId: rig.world().northgate.id, name: "Ridgeway Partner Ltd" });
    expect((await refusal(createCampaign(rig.deps(), rig.actor, { ...input(), agencyOrgId: partner.id }))).code).toBe("not-a-supplier");
    expect(await rig.dbs.owner.db.select({ id: campaign.id }).from(campaign)).toHaveLength(4);
    expect((await auditRowsFor(rig)).map((entry) => entry.action)).toEqual(["organisation.create"]);
  });
});

describe("campaign set-up is for Fynix admins", () => {
  it("refuses Fynix staff on create and on update", async () => {
    const { id } = await createCampaign(rig.deps(), rig.actor, input());
    expect((await refusal(createCampaign(rig.deps(), rig.staffActor, input()))).code).toBe("admin-required");
    expect((await refusal(updateCampaign(rig.deps(), rig.staffActor, id, { meetingMinutes: 60 }))).code).toBe("admin-required");
    expect(await row(id)).toMatchObject({ meetingMinutes: 30 });
  });
});
```

**Append** to `server/domain/inputs.test.ts`:

```typescript

describe("campaign settings input", () => {
  it("accepts an IANA time zone, trims it, and accepts a meeting length from 15 to 240 minutes", () => {
    expect(parseInput(createCampaignSchema, { ...CAMPAIGN, timeZone: " Europe/London ", meetingMinutes: 15 })).toMatchObject({ timeZone: "Europe/London", meetingMinutes: 15 });
    expect(updateCampaignSchema.safeParse({ meetingMinutes: 240 }).success).toBe(true);
  });

  it("names the field and the rule when a setting is wrong, and never the value", () => {
    const message = (input: unknown): string => {
      try {
        parseInput(updateCampaignSchema, input);
      } catch (error) {
        return (error as DomainError).message;
      }
      return "";
    };
    expect(message({ timeZone: "Mars/Olympus" })).toBe("timeZone must be an IANA time zone such as Europe/London");
    expect(message({ meetingMinutes: 5 })).toContain("meetingMinutes");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

```bash
pnpm test:integration server/domain/suppliers server/domain/campaigns
pnpm exec vitest run server/domain/inputs
```

Expected: FAIL: `@/server/domain/suppliers` does not exist, and `timeZone` is not a key of the campaign schemas.

- [ ] **Step 3: The audit actions and subject tables for the whole phase**

**Edit:** `server/domain/audit.ts`

Replace:

```typescript
  "terms.publish",
] as const;
```

With:

```typescript
  "terms.publish",
  "agreement.publish",
  "agreement.accept",
  "campaign_share.set",
  "campaign_share.remove",
  "campaign_host.add",
  "campaign_host.deactivate",
  "host_hours.set",
  "host_block.add",
  "host_block.remove",
] as const;
```

**Edit:** `server/domain/audit.ts`

Replace:

```typescript
export type AuditSubjectTable = "organisation" | "campaign" | "invite" | "member" | "agency_alias" | "terms_document";
```

With:

```typescript
export type AuditSubjectTable =
  | "organisation"
  | "campaign"
  | "invite"
  | "member"
  | "agency_alias"
  | "terms_document"
  | "agreement"
  | "agreement_acceptance"
  | "campaign_share"
  | "campaign_host"
  | "host_hours"
  | "host_block";
```

- [ ] **Step 4: The snapshots**

**Edit:** `server/domain/snapshots.ts`

Replace:

```typescript
export interface OrganisationRow {
  readonly publicRef: string;
  readonly kind: string;
  readonly name: string;
  readonly brandName: string | null;
  readonly status: string;
}

export function snapshotOrganisation(row: OrganisationRow): JsonObject {
  return { ref: row.publicRef, kind: row.kind, name: row.name, brandName: row.brandName, status: row.status };
}
```

With:

```typescript
export interface OrganisationRow {
  readonly publicRef: string;
  readonly kind: string;
  readonly name: string;
  readonly brandName: string | null;
  /** The supplier a partner agency works under, `null` for everyone else. */
  readonly parentOrgId: string | null;
  readonly status: string;
}

export function snapshotOrganisation(row: OrganisationRow): JsonObject {
  return { ref: row.publicRef, kind: row.kind, name: row.name, brandName: row.brandName, parentOrgId: row.parentOrgId, status: row.status };
}
```

**Edit:** `server/domain/snapshots.ts`

Replace:

```typescript
  readonly internalNotes: string | null;
}
```

With:

```typescript
  readonly internalNotes: string | null;
  readonly timeZone: string;
  readonly meetingMinutes: number;
}
```

**Edit:** `server/domain/snapshots.ts`

Replace:

```typescript
    internalNotes: row.internalNotes,
  };
```

With:

```typescript
    internalNotes: row.internalNotes,
    timeZone: row.timeZone,
    meetingMinutes: row.meetingMinutes,
  };
```

- [ ] **Step 5: The input schemas**

**Edit:** `server/domain/inputs.ts`

Replace:

```typescript
import { z } from "zod";
import { CAMPAIGN_STATUSES } from "@/lib/domain/campaign-status";
```

With:

```typescript
import { z } from "zod";
import { CAMPAIGN_STATUSES } from "@/lib/domain/campaign-status";
import { MEETING_MINUTES_MAX, MEETING_MINUTES_MIN, isIanaTimeZone } from "@/lib/domain/campaign-settings";
```

**Edit:** `server/domain/inputs.ts`

Replace:

```typescript
const campaignRequired = {
```

With:

```typescript
/** An IANA zone such as `Europe/London`. Trimmed, then checked against the runtime's time zone database (lib/domain/campaign-settings.ts). */
export const timeZoneSchema = z.string().trim().refine(isIanaTimeZone, "must be an IANA time zone such as Europe/London");
const meetingMinutes = z.number().int().min(MEETING_MINUTES_MIN).max(MEETING_MINUTES_MAX);

const campaignRequired = {
```

**Edit:** `server/domain/inputs.ts`

Replace:

```typescript
  /** Fynix only: no tenant role can read it. */
  internalNotes: optionalText(4000).nullable(),
};
```

With:

```typescript
  /** Fynix only: no tenant role can read it. */
  internalNotes: optionalText(4000).nullable(),
  /** The time zone counting uses, and the default meeting length. The database defaults are Europe/London and 30. */
  timeZone: timeZoneSchema,
  meetingMinutes,
};
```

**Append** to `server/domain/inputs.ts`:

```typescript

export const createSupplierSchema = z.object({ name: name(120) }).strict();
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const createPartnerAgencySchema = z.object({ supplierId: z.uuid(), name: name(120) }).strict();
export type CreatePartnerAgencyInput = z.infer<typeof createPartnerAgencySchema>;
```

- [ ] **Step 6: The organisation service shares its insert, and `OrganisationRecord` gains the parent**

**File:** `server/domain/organisations.ts`

```typescript
import { eq } from "drizzle-orm";
import type { RandomBytes } from "@/lib/domain/public-ref";
import { organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { createOrganisationSchema, updateOrganisationSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { insertWithPublicRef } from "@/server/domain/refs";
import { snapshotOrganisation } from "@/server/domain/snapshots";

/** What a service returns about an organisation: the reference that is safe to show, and the id the admin screens address it by. */
export interface OrganisationRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly kind: "fynix" | "client" | "agency";
  readonly name: string;
  readonly brandName: string | null;
  /** The supplier a partner agency works under. `null` for a client, a supplier and Fynix. */
  readonly parentOrgId: string | null;
  readonly status: "active" | "archived";
}

export const organisationColumns = {
  id: organisation.id,
  publicRef: organisation.publicRef,
  kind: organisation.kind,
  name: organisation.name,
  brandName: organisation.brandName,
  parentOrgId: organisation.parentOrgId,
  status: organisation.status,
};

async function loadEditable(tx: ScopedTransaction, id: string): Promise<OrganisationRecord> {
  const [row] = await tx.select(organisationColumns).from(organisation).where(eq(organisation.id, id)).limit(1).for("update");
  if (row === undefined) throw new DomainError("not-found", "There is no such organisation.");
  // The Fynix organisation is the admin's own. It is created by `pnpm admin:create` and nothing here changes or archives it.
  if (row.kind === "fynix") throw new DomainError("invalid-transition", "The Fynix organisation cannot be changed here.");
  return row;
}

/** Inserts a client or an agency with a generated reference (`ORG-` and four characters), retried when taken. Used by every service that creates an organisation, so they share one way to do it. */
export function insertOrganisation(
  tx: ScopedTransaction,
  randomBytes: RandomBytes,
  values: { readonly kind: "client" | "agency"; readonly name: string; readonly brandName: string | null; readonly parentOrgId: string | null },
): Promise<OrganisationRecord> {
  return insertWithPublicRef(tx, { prefix: "ORG", constraint: "organisation_public_ref_unique", randomBytes }, async (attempt, publicRef) => {
    const [row] = await attempt.insert(organisation).values({ publicRef, ...values }).returning(organisationColumns);
    if (row === undefined) throw new Error("The organisation insert returned no row");
    return row;
  });
}

/** Creates a client or an agency with no parent (an agency with no parent is a supplier). The reference is generated here and retried when it is taken. */
export async function createOrganisation(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createOrganisationSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const created = await insertOrganisation(tx, deps.randomBytes, { kind: parsed.kind, name: parsed.name, brandName: parsed.brandName ?? null, parentOrgId: null });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created) });
    return created;
  });
}

/** Renames an organisation or changes a client's brand name. The brand copy on the client's campaigns follows (migration 0004). */
export async function updateOrganisation(deps: DomainDeps, actor: FynixActor, organisationId: string, input: unknown): Promise<OrganisationRecord> {
  const id = parseInput(uuidSchema, organisationId);
  const parsed = parseInput(updateOrganisationSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadEditable(tx, id);
    if (parsed.brandName !== undefined && before.kind !== "client") throw new DomainError("invalid-input", "Only a client has a brand name.");
    const [after] = await tx
      .update(organisation)
      .set({ ...(parsed.name === undefined ? {} : { name: parsed.name }), ...(parsed.brandName === undefined ? {} : { brandName: parsed.brandName }) })
      .where(eq(organisation.id, id))
      .returning(organisationColumns);
    if (after === undefined) throw new Error("The organisation update returned no row");
    await audit({ action: "organisation.update", subject: { table: "organisation", id, ref: after.publicRef }, before: snapshotOrganisation(before), after: snapshotOrganisation(after) });
    return after;
  });
}

/**
 * Archives or restores an organisation: nothing is deleted (decision D8). An archived organisation takes no new invite and
 * no new campaign. It does not end its members' sessions: Fynix suspends people one by one (server/domain/members.ts).
 */
export async function setOrganisationStatus(deps: DomainDeps, actor: FynixActor, organisationId: string, status: "active" | "archived"): Promise<OrganisationRecord> {
  const id = parseInput(uuidSchema, organisationId);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const before = await loadEditable(tx, id);
    if (before.status === status) throw new DomainError("invalid-transition", `The organisation is already ${status}.`);
    const [after] = await tx.update(organisation).set({ status }).where(eq(organisation.id, id)).returning(organisationColumns);
    if (after === undefined) throw new Error("The organisation update returned no row");
    await audit({
      action: status === "archived" ? "organisation.archive" : "organisation.restore",
      subject: { table: "organisation", id, ref: after.publicRef },
      before: snapshotOrganisation(before),
      after: snapshotOrganisation(after),
    });
    return after;
  });
}
```

**File:** `server/domain/suppliers.ts`

```typescript
import { asc, eq } from "drizzle-orm";
import { organisation } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { createPartnerAgencySchema, createSupplierSchema } from "@/server/domain/inputs";
import { insertOrganisation, organisationColumns, type OrganisationRecord } from "@/server/domain/organisations";
import { parseInput } from "@/server/domain/parse";
import { snapshotOrganisation } from "@/server/domain/snapshots";

/**
 * The supply side (spec 2 and 6): a **supplier** is an agency with no parent, a **partner agency** is an agency whose parent is
 * a supplier, and there are two levels at most. The database enforces all of it (migrations 0019, 0020 and 0024); these
 * functions say it in words first. Both creates are Fynix admin writes and audit as `organisation.create`.
 */

/** A supplier with the partner agencies that work under it. */
export interface SupplierRecord {
  readonly supplier: OrganisationRecord;
  readonly agencies: readonly OrganisationRecord[];
}

/** Creates a supplier: an agency with no parent. A supplier who works alone has no partner agencies and its own users submit the leads. */
export async function createSupplier(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createSupplierSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const created = await insertOrganisation(tx, deps.randomBytes, { kind: "agency", name: parsed.name, brandName: null, parentOrgId: null });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created) });
    return created;
  });
}

/**
 * Creates a partner agency under a supplier. The supplier must exist, be an agency with no parent, and be active. It is read
 * `FOR SHARE`, so a concurrent change that would give it a parent waits (the database repeats the rule, migration 0020).
 */
export async function createPartnerAgency(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<OrganisationRecord> {
  const parsed = parseInput(createPartnerAgencySchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [supplier] = await tx.select(organisationColumns).from(organisation).where(eq(organisation.id, parsed.supplierId)).limit(1).for("share");
    if (supplier === undefined) throw new DomainError("not-found", "There is no such supplier.");
    if (supplier.kind !== "agency" || supplier.parentOrgId !== null) throw new DomainError("not-a-supplier", "A partner agency works under a supplier: an agency with no parent.");
    if (supplier.status !== "active") throw new DomainError("organisation-archived", "The supplier is archived.");
    const created = await insertOrganisation(tx, deps.randomBytes, { kind: "agency", name: parsed.name, brandName: null, parentOrgId: supplier.id });
    await audit({ action: "organisation.create", subject: { table: "organisation", id: created.id, ref: created.publicRef }, before: null, after: snapshotOrganisation(created) });
    return created;
  });
}

/** Every supplier by name, archived ones included (their status says so), each with its partner agencies by name. Open to Fynix staff. */
export async function listSuppliers(deps: DomainDeps, actor: FynixActor): Promise<readonly SupplierRecord[]> {
  const agencies = await fynixRead(deps.fynixDb, actor, (tx) => tx.select(organisationColumns).from(organisation).where(eq(organisation.kind, "agency")).orderBy(asc(organisation.name)));
  const partners = new Map<string, OrganisationRecord[]>();
  for (const row of agencies) {
    if (row.parentOrgId !== null) partners.set(row.parentOrgId, [...(partners.get(row.parentOrgId) ?? []), row]);
  }
  return agencies.filter((row) => row.parentOrgId === null).map((supplier) => ({ supplier, agencies: partners.get(supplier.id) ?? [] }));
}
```

- [ ] **Step 7: The campaign service learns the settings and the supplier rule**

**Edit:** `server/domain/campaigns.ts`

Replace:

```typescript
export interface CampaignRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
}
```

With:

```typescript
export interface CampaignRecord {
  readonly id: string;
  readonly publicRef: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly timeZone: string;
  readonly meetingMinutes: number;
}
```

**Edit:** `server/domain/campaigns.ts`

Replace:

```typescript
  instructions: campaign.instructions,
  internalNotes: campaign.internalNotes,
};
```

With:

```typescript
  instructions: campaign.instructions,
  internalNotes: campaign.internalNotes,
  timeZone: campaign.timeZone,
  meetingMinutes: campaign.meetingMinutes,
};
```

**Edit:** `server/domain/campaigns.ts`

Replace:

```typescript
const record = (row: CampaignRow & { readonly id: string; readonly status: CampaignStatus }): CampaignRecord => ({ id: row.id, publicRef: row.publicRef, name: row.name, status: row.status });

/** The organisation must exist, be of the right kind and be active. A client id that is really an agency is refused here and again by the database (`campaign_client_org_fk`). */
async function requireActiveOrganisation(tx: ScopedTransaction, id: string, kind: "client" | "agency"): Promise<void> {
  const [row] = await tx.select({ kind: organisation.kind, status: organisation.status }).from(organisation).where(eq(organisation.id, id)).limit(1);
  if (row === undefined || row.kind !== kind) throw new DomainError("not-found", `There is no such ${kind}.`);
  if (row.status !== "active") throw new DomainError("organisation-archived", `The ${kind} is archived.`);
}
```

With:

```typescript
const record = (row: CampaignRow & { readonly id: string; readonly status: CampaignStatus }): CampaignRecord => ({
  id: row.id,
  publicRef: row.publicRef,
  name: row.name,
  status: row.status,
  timeZone: row.timeZone,
  meetingMinutes: row.meetingMinutes,
});

/**
 * The organisation must exist, be of the right kind and be active. A client id that is really an agency is refused here and
 * again by the database (`campaign_client_org_fk`). The campaign's agency is its supplier, so an agency that has a parent (a
 * partner agency) is refused with `not-a-supplier`; the database repeats it (`campaign_check_supplier`, migration 0020).
 */
async function requireActiveOrganisation(tx: ScopedTransaction, id: string, kind: "client" | "agency"): Promise<void> {
  const [row] = await tx.select({ kind: organisation.kind, status: organisation.status, parentOrgId: organisation.parentOrgId }).from(organisation).where(eq(organisation.id, id)).limit(1);
  if (row === undefined || row.kind !== kind) throw new DomainError("not-found", `There is no such ${kind}.`);
  if (row.status !== "active") throw new DomainError("organisation-archived", `The ${kind} is archived.`);
  if (kind === "agency" && row.parentOrgId !== null) throw new DomainError("not-a-supplier", "A campaign needs a supplier. That agency is a partner agency of one.");
}
```

- [ ] **Step 8: Run the checks**

```bash
pnpm test:integration server/domain
pnpm exec vitest run server/domain/inputs
pnpm typecheck
pnpm lint
```

Expected: the new and the existing domain tests pass. A type error in a 1C test that builds an `OrganisationRecord` or a `CampaignRecord` by hand would show up in typecheck: add the new field (`parentOrgId: null`, or `timeZone`, `meetingMinutes`); none is expected.

- [ ] **Step 9: Commit**

```bash
git add server
git commit -m "Add suppliers and partner agencies, and give campaigns a time zone, a meeting length and a supplier check"
```

---

## Task 10: Agreements: publish a version, read the history, record an acceptance

**Files:** create `server/domain/agreements.ts`, `server/domain/agreements.integration.test.ts`; modify `server/domain/inputs.ts`, `snapshots.ts`.

`publishAgreement` writes the next version for a campaign and party and supersedes the current one in the same transaction, under a lock on the campaign row so two admins take turns (decision S12). `readAgreements` returns, per party, the current version and the history, newest first, each with its acceptances. `recordAgreementAcceptance` records that a named user accepted the current version, checked against who the agreement is with (decision S11).

- [ ] **Step 1: Write the failing tests**

**File:** `server/domain/agreements.integration.test.ts`

```typescript
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agreement, agreementAcceptance, member } from "@/server/db/schema";
import { publishAgreement, readAgreements, recordAgreementAcceptance } from "@/server/domain/agreements";
import { auditRowsFor, firstCampaign, memberIdFor, refusal, setMemberRole, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const UNKNOWN = "99999999-9999-4999-8999-999999999999";
const base = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({ campaignId: firstCampaign(rig).id, party: "client", monthlyTarget: 20, totalTarget: 120, ...overrides });
const stored = () => rig.dbs.owner.db.select().from(agreement).orderBy(asc(agreement.party), asc(agreement.version), asc(agreement.createdAt));
const acceptances = () => rig.dbs.owner.db.select().from(agreementAcceptance);

describe("publishAgreement", () => {
  it("publishes version 1 as current, in the admin's name, with the defaults, and audits it", async () => {
    const created = await publishAgreement(rig.deps(), rig.actor, base({ rules: "A no-show counts after 10 minutes", notes: "Review each quarter" }));
    expect(created).toMatchObject({ campaignId: firstCampaign(rig).id, party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, disputeWindowHours: 48, rules: "A no-show counts after 10 minutes", notes: "Review each quarter", status: "current", acceptances: [] });
    const [row] = await stored();
    expect(row).toMatchObject({ id: created.id, createdBy: await memberIdFor(rig, rig.actor.userId) });
    const [audit] = await auditRowsFor(rig, "agreement.publish");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "agreement", subjectId: created.id, before: null, after: { party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, disputeWindowHours: 48, status: "current" } });
    expect(audit?.subjectRef).toBe(`${firstCampaign(rig).publicRef} client v1`);
  });

  it("supersedes the current version with the next one, keeps the old row as it was, and audits the before and after", async () => {
    const first = await publishAgreement(rig.deps(), rig.actor, base());
    const second = await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 25, totalTarget: 150, disputeWindowHours: 72 }));
    expect(second).toMatchObject({ version: 2, monthlyTarget: 25, status: "current" });
    expect((await stored()).map((row) => [row.version, row.status, row.monthlyTarget])).toEqual([
      [1, "superseded", 20],
      [2, "current", 25],
    ]);
    const audits = await auditRowsFor(rig, "agreement.publish");
    expect(audits[1]).toMatchObject({ subjectId: second.id, before: { version: 1, status: "current", monthlyTarget: 20 }, after: { version: 2, status: "current", monthlyTarget: 25, disputeWindowHours: 72 } });
    expect(first.id).not.toBe(second.id);
  });

  it("numbers versions per campaign and party: the two parties are independent, and so are two campaigns", async () => {
    await publishAgreement(rig.deps(), rig.actor, base());
    await publishAgreement(rig.deps(), rig.actor, base({ party: "supplier", monthlyTarget: 18 }));
    const other = rig.world().campaigns[1];
    if (other === undefined) throw new Error("no second campaign");
    await publishAgreement(rig.deps(), rig.actor, base({ campaignId: other.id }));
    expect((await stored()).map((row) => [row.campaignId === firstCampaign(rig).id, row.party, row.version, row.status])).toEqual([
      [true, "client", 1, "current"],
      [false, "client", 1, "current"],
      [true, "supplier", 1, "current"],
    ]);
  });

  it.each([
    ["an unknown campaign", { campaignId: UNKNOWN }, "not-found"],
    ["a party that is neither client nor supplier", { party: "agency" }, "invalid-input"],
    ["a negative target", { monthlyTarget: -1 }, "invalid-input"],
    ["a fractional target", { totalTarget: 1.5 }, "invalid-input"],
    ["a dispute window of 0 hours", { disputeWindowHours: 0 }, "invalid-input"],
    ["a dispute window over 720 hours", { disputeWindowHours: 721 }, "invalid-input"],
    ["a field it does not know", { status: "superseded" }, "invalid-input"],
  ])("refuses %s, and writes nothing", async (_label, overrides, code) => {
    await publishAgreement(rig.deps(), rig.actor, base());
    expect((await refusal(publishAgreement(rig.deps(), rig.actor, base(overrides)))).code).toBe(code);
    expect(await stored()).toHaveLength(1);
    expect(await auditRowsFor(rig)).toHaveLength(1);
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(publishAgreement(rig.deps(), rig.staffActor, base()))).code).toBe("admin-required");
    expect(await stored()).toEqual([]);
    expect(await auditRowsFor(rig)).toEqual([]);
  });
});

describe("readAgreements", () => {
  it("returns, for each party, the current version and the superseded ones newest first, with their acceptances", async () => {
    const campaignId = firstCampaign(rig).id;
    const v1 = await publishAgreement(rig.deps(), rig.actor, base());
    await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 22 }));
    const v3 = await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 24 }));
    await publishAgreement(rig.deps(), rig.actor, base({ party: "supplier", monthlyTarget: 18 }));
    const kestrelUser = userIn(rig, rig.world().kestrel);
    await setMemberRole(rig, kestrelUser.id, "manager");
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: v3.id, userId: kestrelUser.id });

    const read = await readAgreements(rig.deps(), rig.actor, campaignId);
    expect(read.client.party).toBe("client");
    expect(read.client.current).toMatchObject({ id: v3.id, version: 3, monthlyTarget: 24, status: "current" });
    expect(read.client.current?.acceptances).toMatchObject([{ userId: kestrelUser.id, networkAddress: "recorded by Fynix" }]);
    expect(read.client.history.map((row) => [row.version, row.monthlyTarget])).toEqual([
      [2, 22],
      [1, 20],
    ]);
    expect(read.client.history.find((row) => row.id === v1.id)?.acceptances).toEqual([]);
    expect(read.supplier.current).toMatchObject({ version: 1, monthlyTarget: 18 });
    expect(read.supplier.history).toEqual([]);
  });

  it("returns no current version and no history for a campaign with no agreements, and refuses an unknown campaign", async () => {
    const read = await readAgreements(rig.deps(), rig.actor, firstCampaign(rig).id);
    expect(read.client).toEqual({ party: "client", current: null, history: [] });
    expect(read.supplier).toEqual({ party: "supplier", current: null, history: [] });
    expect((await refusal(readAgreements(rig.deps(), rig.actor, UNKNOWN))).code).toBe("not-found");
    expect((await refusal(readAgreements(rig.deps(), rig.actor, "not-a-uuid"))).code).toBe("invalid-input");
  });

  it("is open to Fynix staff, who read set-up but do not change it", async () => {
    await publishAgreement(rig.deps(), rig.actor, base());
    const read = await readAgreements(rig.deps(), rig.staffActor, firstCampaign(rig).id);
    expect(read.client.current?.version).toBe(1);
  });
});

describe("recordAgreementAcceptance", () => {
  /** Kestrel is the client of the first campaign and Brightpath its supplier. Their one user each is an ordinary member until a test promotes them. */
  const clientUser = () => userIn(rig, rig.world().kestrel);
  const supplierUser = () => userIn(rig, rig.world().brightpath);

  it("records a client manager's acceptance of the client agreement, from Fynix, with a default network address, and audits it", async () => {
    await setMemberRole(rig, clientUser().id, "manager");
    const published = await publishAgreement(rig.deps(), rig.actor, base());
    const accepted = await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: published.id, userId: clientUser().id });
    expect(accepted).toMatchObject({ agreementId: published.id, userId: clientUser().id, networkAddress: "recorded by Fynix" });
    expect(accepted.acceptedAt).toBeInstanceOf(Date);
    expect(await acceptances()).toHaveLength(1);
    const [audit] = await auditRowsFor(rig, "agreement.accept");
    expect(audit).toMatchObject({ subjectTable: "agreement_acceptance", before: null, after: { agreementId: published.id, userId: clientUser().id, networkAddress: "recorded by Fynix" } });
    expect(audit?.subjectRef).toBe(`${firstCampaign(rig).publicRef} client v1`);
  });

  it("records a supplier manager's acceptance of the supplier agreement, and keeps a network address it is given", async () => {
    await setMemberRole(rig, supplierUser().id, "manager");
    const published = await publishAgreement(rig.deps(), rig.actor, base({ party: "supplier" }));
    const accepted = await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: published.id, userId: supplierUser().id, networkAddress: "203.0.113.7" });
    expect(accepted.networkAddress).toBe("203.0.113.7");
  });

  it("refuses a user who is not an active manager of the organisation the agreement is with, and records nothing", async () => {
    const clientAgreement = await publishAgreement(rig.deps(), rig.actor, base());
    const supplierAgreement = await publishAgreement(rig.deps(), rig.actor, base({ party: "supplier" }));
    const halden = userIn(rig, rig.world().halden);
    await setMemberRole(rig, halden.id, "manager");
    await setMemberRole(rig, supplierUser().id, "manager");
    const asSigner = (agreementId: string, userId: string) => refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId, userId }));
    // The client's user is a plain member; another client's manager; the supplier's manager on the client agreement; the client's manager on the supplier agreement.
    expect((await asSigner(clientAgreement.id, clientUser().id)).code).toBe("not-an-agreement-signer");
    expect((await asSigner(clientAgreement.id, halden.id)).code).toBe("not-an-agreement-signer");
    expect((await asSigner(clientAgreement.id, supplierUser().id)).code).toBe("not-an-agreement-signer");
    await setMemberRole(rig, clientUser().id, "manager");
    expect((await asSigner(supplierAgreement.id, clientUser().id)).code).toBe("not-an-agreement-signer");
    // A suspended manager, and a Fynix user.
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.userId, clientUser().id));
    expect((await asSigner(clientAgreement.id, clientUser().id)).code).toBe("not-an-agreement-signer");
    expect((await asSigner(clientAgreement.id, rig.actor.userId)).code).toBe("not-an-agreement-signer");
    expect(await acceptances()).toEqual([]);
    expect(await auditRowsFor(rig, "agreement.accept")).toEqual([]);
  });

  it("refuses a superseded version, a second acceptance by the same person, an unknown agreement and an unknown user", async () => {
    await setMemberRole(rig, clientUser().id, "manager");
    const first = await publishAgreement(rig.deps(), rig.actor, base());
    const second = await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 25 }));
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: first.id, userId: clientUser().id }))).code).toBe("agreement-superseded");
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: second.id, userId: clientUser().id });
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: second.id, userId: clientUser().id }))).code).toBe("already-accepted");
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: UNKNOWN, userId: clientUser().id }))).code).toBe("not-found");
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: second.id, userId: UNKNOWN }))).code).toBe("not-an-agreement-signer");
    expect(await acceptances()).toHaveLength(1);
  });

  it("asks the next version to be accepted again: an acceptance belongs to the version it was given for", async () => {
    await setMemberRole(rig, clientUser().id, "manager");
    const first = await publishAgreement(rig.deps(), rig.actor, base());
    await recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: first.id, userId: clientUser().id });
    const second = await publishAgreement(rig.deps(), rig.actor, base({ monthlyTarget: 30 }));
    const read = await readAgreements(rig.deps(), rig.actor, firstCampaign(rig).id);
    expect(read.client.current?.id).toBe(second.id);
    expect(read.client.current?.acceptances).toEqual([]);
    expect(read.client.history[0]?.acceptances).toHaveLength(1);
  });

  it("refuses a malformed input and an empty network address, and is refused to Fynix staff", async () => {
    const published = await publishAgreement(rig.deps(), rig.actor, base());
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: "nope", userId: clientUser().id }))).code).toBe("invalid-input");
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.actor, { agreementId: published.id, userId: clientUser().id, networkAddress: "" }))).code).toBe("invalid-input");
    expect((await refusal(recordAgreementAcceptance(rig.deps(), rig.staffActor, { agreementId: published.id, userId: clientUser().id }))).code).toBe("admin-required");
    expect(await acceptances()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm test:integration server/domain/agreements
```

Expected: FAIL: `@/server/domain/agreements` does not exist.

- [ ] **Step 3: The input schemas and snapshots**

**Append** to `server/domain/inputs.ts`:

```typescript

export const publishAgreementSchema = z
  .object({
    campaignId: z.uuid(),
    party: z.enum(["client", "supplier"]),
    monthlyTarget: count,
    totalTarget: count,
    /** How long after a meeting the client may dispute it. */
    disputeWindowHours: z.number().int().min(1).max(720).default(48),
    /** The no-show and cancellation rules, in words. */
    rules: optionalText(4000).default(""),
    notes: optionalText(2000).default(""),
  })
  .strict();
export type PublishAgreementInput = z.input<typeof publishAgreementSchema>;

export const recordAgreementAcceptanceSchema = z
  .object({
    agreementId: z.uuid(),
    userId: z.uuid(),
    /** Where the signer accepted from. A Fynix admin recording it for them says so. */
    networkAddress: name(64).default("recorded by Fynix"),
  })
  .strict();
export type RecordAgreementAcceptanceInput = z.input<typeof recordAgreementAcceptanceSchema>;
```

**Append** to `server/domain/snapshots.ts`:

```typescript

export interface AgreementRow {
  readonly campaignId: string;
  readonly party: string;
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly notes: string;
  readonly status: string;
}

export function snapshotAgreement(row: AgreementRow): JsonObject {
  return {
    campaignId: row.campaignId,
    party: row.party,
    version: row.version,
    monthlyTarget: row.monthlyTarget,
    totalTarget: row.totalTarget,
    disputeWindowHours: row.disputeWindowHours,
    rules: row.rules,
    notes: row.notes,
    status: row.status,
  };
}

export interface AcceptanceRow {
  readonly agreementId: string;
  readonly userId: string;
  readonly networkAddress: string;
}

export function snapshotAcceptance(row: AcceptanceRow): JsonObject {
  return { agreementId: row.agreementId, userId: row.userId, networkAddress: row.networkAddress };
}
```

- [ ] **Step 4: The service**

**File:** `server/domain/agreements.ts`

```typescript
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { agreement, agreementAcceptance, campaign, member } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { publishAgreementSchema, recordAgreementAcceptanceSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotAcceptance, snapshotAgreement } from "@/server/domain/snapshots";

/**
 * The virtual agreements (spec 7.2): what Fynix has agreed with the client, and with the supplier, for one campaign. Each
 * change is a new version; a published version is never edited, only superseded; every version and every acceptance is kept.
 * All three functions are Fynix admin writes except `readAgreements`, which staff may read. No tenant reads any of it until 1E.
 */

export type AgreementParty = "client" | "supplier";

export interface AcceptanceRecord {
  readonly userId: string;
  readonly acceptedAt: Date;
  readonly networkAddress: string;
}

export interface AgreementRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly party: AgreementParty;
  readonly version: number;
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly notes: string;
  readonly status: "current" | "superseded";
  readonly createdAt: Date;
  readonly acceptances: readonly AcceptanceRecord[];
}

/** One party's side of a campaign: the version in force and the ones it replaced, newest first. */
export interface AgreementHistory {
  readonly party: AgreementParty;
  readonly current: AgreementRecord | null;
  readonly history: readonly AgreementRecord[];
}

const agreementColumns = {
  id: agreement.id,
  campaignId: agreement.campaignId,
  party: agreement.party,
  version: agreement.version,
  monthlyTarget: agreement.monthlyTarget,
  totalTarget: agreement.totalTarget,
  disputeWindowHours: agreement.disputeWindowHours,
  rules: agreement.rules,
  notes: agreement.notes,
  status: agreement.status,
  createdAt: agreement.createdAt,
};

/**
 * Publishes the next version of a campaign's agreement with the client or with the supplier, and supersedes the current one
 * in the same transaction. The campaign row is locked first, so two admins publishing at once take turns and the second sees
 * the first's version. The author is the admin's own `member` row.
 */
export async function publishAgreement(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<AgreementRecord> {
  const parsed = parseInput(publishAgreementSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit, actorMemberId }) => {
    const [target] = await tx.select({ id: campaign.id, publicRef: campaign.publicRef }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1).for("update");
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [latest] = await tx
      .select(agreementColumns)
      .from(agreement)
      .where(and(eq(agreement.campaignId, target.id), eq(agreement.party, parsed.party)))
      .orderBy(desc(agreement.version))
      .limit(1);
    // The database allows one current version per campaign and party and does not defer the check, so the old one goes first.
    if (latest?.status === "current") await tx.update(agreement).set({ status: "superseded" }).where(eq(agreement.id, latest.id));
    const [created] = await tx
      .insert(agreement)
      .values({
        campaignId: target.id,
        party: parsed.party,
        version: (latest?.version ?? 0) + 1,
        monthlyTarget: parsed.monthlyTarget,
        totalTarget: parsed.totalTarget,
        disputeWindowHours: parsed.disputeWindowHours,
        rules: parsed.rules,
        notes: parsed.notes,
        createdBy: actorMemberId,
      })
      .returning(agreementColumns);
    if (created === undefined) throw new Error("The agreement insert returned no row");
    await audit({
      action: "agreement.publish",
      subject: { table: "agreement", id: created.id, ref: `${target.publicRef} ${created.party} v${created.version}` },
      before: latest === undefined ? null : snapshotAgreement(latest),
      after: snapshotAgreement(created),
    });
    return { ...created, acceptances: [] };
  });
}

/** Both parties' agreements for a campaign: the current version and the history, each version with who accepted it. Open to Fynix staff. */
export async function readAgreements(deps: DomainDeps, actor: FynixActor, campaignId: string): Promise<{ readonly client: AgreementHistory; readonly supplier: AgreementHistory }> {
  const id = parseInput(uuidSchema, campaignId);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (found === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const rows = await tx.select(agreementColumns).from(agreement).where(eq(agreement.campaignId, id)).orderBy(desc(agreement.version));
    const accepted =
      rows.length === 0
        ? []
        : await tx
            .select({ agreementId: agreementAcceptance.agreementId, userId: agreementAcceptance.userId, acceptedAt: agreementAcceptance.acceptedAt, networkAddress: agreementAcceptance.networkAddress })
            .from(agreementAcceptance)
            .where(inArray(agreementAcceptance.agreementId, rows.map((row) => row.id)))
            .orderBy(asc(agreementAcceptance.acceptedAt));
    const records = rows.map(
      (row): AgreementRecord => ({
        ...row,
        acceptances: accepted.filter((entry) => entry.agreementId === row.id).map(({ userId, acceptedAt, networkAddress }) => ({ userId, acceptedAt, networkAddress })),
      }),
    );
    const side = (party: AgreementParty): AgreementHistory => ({
      party,
      current: records.find((row) => row.party === party && row.status === "current") ?? null,
      history: records.filter((row) => row.party === party && row.status === "superseded"),
    });
    return { client: side("client"), supplier: side("supplier") };
  });
}

/**
 * Records that a user accepted the current version of an agreement. In phase 1D a Fynix admin records it for the signer;
 * phase 1E lets the signer do it from their own session. The signer must be an active manager of the organisation the
 * agreement is with: the campaign's client for a client agreement, the campaign's supplier for a supplier agreement. A
 * superseded version cannot be accepted (the next version asks again), and nobody accepts the same version twice. The
 * agreement row is read `FOR SHARE`, so a version cannot be superseded in the middle of its own acceptance.
 */
export async function recordAgreementAcceptance(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<AcceptanceRecord & { readonly agreementId: string }> {
  const parsed = parseInput(recordAgreementAcceptanceSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [target] = await tx
      .select({ id: agreement.id, party: agreement.party, version: agreement.version, status: agreement.status, clientOrgId: campaign.clientOrgId, supplierOrgId: campaign.agencyOrgId, campaignRef: campaign.publicRef })
      .from(agreement)
      .innerJoin(campaign, eq(campaign.id, agreement.campaignId))
      .where(eq(agreement.id, parsed.agreementId))
      .limit(1)
      .for("share", { of: agreement });
    if (target === undefined) throw new DomainError("not-found", "There is no such agreement.");
    if (target.status !== "current") throw new DomainError("agreement-superseded", "That version has been replaced. The current version is the one to accept.");
    const [signer] = await tx.select({ orgId: member.orgId, role: member.role, status: member.status }).from(member).where(eq(member.userId, parsed.userId)).limit(1);
    const withOrgId = target.party === "client" ? target.clientOrgId : target.supplierOrgId;
    if (signer === undefined || signer.orgId !== withOrgId || signer.role !== "manager" || signer.status !== "active") {
      throw new DomainError("not-an-agreement-signer", "An agreement is accepted by an active manager of the organisation it is with.");
    }
    let rows: { readonly id: string; readonly acceptedAt: Date }[];
    try {
      rows = await tx.insert(agreementAcceptance).values({ agreementId: target.id, userId: parsed.userId, networkAddress: parsed.networkAddress }).returning({ id: agreementAcceptance.id, acceptedAt: agreementAcceptance.acceptedAt });
    } catch (error) {
      if (isUniqueViolation(error, "agreement_acceptance_agreement_user_unique")) throw new DomainError("already-accepted", "That person has accepted this version already.");
      throw error;
    }
    const created = rows[0];
    if (created === undefined) throw new Error("The acceptance insert returned no row");
    await audit({
      action: "agreement.accept",
      subject: { table: "agreement_acceptance", id: created.id, ref: `${target.campaignRef} ${target.party} v${target.version}` },
      before: null,
      after: snapshotAcceptance({ agreementId: target.id, userId: parsed.userId, networkAddress: parsed.networkAddress }),
    });
    return { agreementId: target.id, userId: parsed.userId, acceptedAt: created.acceptedAt, networkAddress: parsed.networkAddress };
  });
}
```

- [ ] **Step 5: Run the checks**

```bash
pnpm test:integration server/domain/agreements
pnpm typecheck
pnpm lint
```

Expected: the file passes (all cases), typecheck and lint are clean.

- [ ] **Step 6: Commit**

```bash
git add server/domain
git commit -m "Add agreements: publish a version, read the history and record an acceptance"
```

---

## Task 11: Campaign shares: set, remove and list, with the over-allocation flag

**Files:** create `server/domain/shares.ts`, `server/domain/shares.integration.test.ts`; modify `server/domain/inputs.ts`, `snapshots.ts`.

A share is the monthly amount of the supplier's target that one agency carries. `setCampaignShare` creates or changes it, `removeCampaignShare` removes it, `listCampaignShares` reads them; the first two return the over-allocation flag (decision S7) that the screen will show. A total above the supplier's target is allowed.

- [ ] **Step 1: Write the failing tests**

**File:** `server/domain/shares.integration.test.ts`

```typescript
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaignShare } from "@/server/db/schema";
import { publishAgreement } from "@/server/domain/agreements";
import { removeCampaignShare, listCampaignShares, setCampaignShare } from "@/server/domain/shares";
import { setOrganisationStatus } from "@/server/domain/organisations";
import { createPartnerAgency } from "@/server/domain/suppliers";
import { auditRowsFor, firstCampaign, refusal } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const UNKNOWN = "99999999-9999-4999-8999-999999999999";
const partnerOf = (supplierId: string, name: string) => createPartnerAgency(rig.deps(), rig.actor, { supplierId, name });
const shareInput = (agencyOrgId: string, monthlyShare: number) => ({ campaignId: firstCampaign(rig).id, agencyOrgId, monthlyShare });
const stored = () => rig.dbs.owner.db.select().from(campaignShare).orderBy(asc(campaignShare.monthlyShare));
const publishSupplierTarget = (monthlyTarget: number) => publishAgreement(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, party: "supplier", monthlyTarget, totalTarget: monthlyTarget * 6 });

describe("setCampaignShare", () => {
  it("gives the supplier itself a share, reports there is no supplier target to compare with, and audits it", async () => {
    const { brightpath } = rig.world();
    const result = await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 5));
    expect(result.share).toEqual({ campaignId: firstCampaign(rig).id, agencyOrgId: brightpath.id, agencyRef: brightpath.publicRef, agencyName: brightpath.name, monthlyShare: 5 });
    expect(result.summary).toEqual({ totalShares: 5, supplierMonthlyTarget: null, overAllocated: false });
    const [audit] = await auditRowsFor(rig, "campaign_share.set");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "campaign_share", before: null, after: { campaignId: firstCampaign(rig).id, agencyOrgId: brightpath.id, monthlyShare: 5 } });
    expect(audit?.subjectRef).toBe(`${firstCampaign(rig).publicRef} ${brightpath.publicRef}`);
  });

  it("gives a partner agency of the supplier a share, and changes it when it is set again, keeping one row", async () => {
    const partner = await partnerOf(rig.world().brightpath.id, "Ridgeway Partner Ltd");
    await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 5));
    const again = await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 8));
    expect(again.share.monthlyShare).toBe(8);
    expect(await stored()).toHaveLength(1);
    const audits = await auditRowsFor(rig, "campaign_share.set");
    expect(audits[1]).toMatchObject({ before: { monthlyShare: 5 }, after: { monthlyShare: 8 } });
  });

  it("flags a total above the supplier agreement's monthly target, and clears the flag when the total comes down; equal is not over", async () => {
    const { brightpath } = rig.world();
    const partner = await partnerOf(brightpath.id, "Ridgeway Partner Ltd");
    await publishSupplierTarget(10);
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 6))).summary).toEqual({ totalShares: 6, supplierMonthlyTarget: 10, overAllocated: false });
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 4))).summary).toMatchObject({ totalShares: 10, overAllocated: false });
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 5))).summary).toEqual({ totalShares: 11, supplierMonthlyTarget: 10, overAllocated: true });
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 1))).summary.overAllocated).toBe(false);
  });

  it("compares with the supplier's agreement and ignores the client's, and follows a new version of it", async () => {
    const { brightpath } = rig.world();
    await publishAgreement(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, party: "client", monthlyTarget: 1000, totalTarget: 6000 });
    await publishSupplierTarget(10);
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 12))).summary).toMatchObject({ supplierMonthlyTarget: 10, overAllocated: true });
    await publishSupplierTarget(15);
    expect((await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 12))).summary).toMatchObject({ supplierMonthlyTarget: 15, overAllocated: false });
  });

  it("refuses another supplier, a partner agency of another supplier, a client and an unknown agency, with the reason, and writes nothing", async () => {
    const { northgate, kestrel } = rig.world();
    const strangers = await partnerOf(northgate.id, "Northgate Partner Ltd");
    for (const agencyOrgId of [northgate.id, strangers.id]) {
      expect((await refusal(setCampaignShare(rig.deps(), rig.actor, shareInput(agencyOrgId, 5)))).code, agencyOrgId).toBe("share-not-allowed");
    }
    for (const agencyOrgId of [kestrel.id, UNKNOWN]) {
      expect((await refusal(setCampaignShare(rig.deps(), rig.actor, shareInput(agencyOrgId, 5)))).code, agencyOrgId).toBe("not-found");
    }
    expect(await stored()).toEqual([]);
    expect(await auditRowsFor(rig, "campaign_share.set")).toEqual([]);
  });

  it("refuses an archived partner agency, an unknown campaign, a negative or fractional share and a field it does not know", async () => {
    const partner = await partnerOf(rig.world().brightpath.id, "Ridgeway Partner Ltd");
    await setOrganisationStatus(rig.deps(), rig.actor, partner.id, "archived");
    expect((await refusal(setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 5)))).code).toBe("organisation-archived");
    const { brightpath } = rig.world();
    expect((await refusal(setCampaignShare(rig.deps(), rig.actor, { ...shareInput(brightpath.id, 5), campaignId: UNKNOWN }))).code).toBe("not-found");
    for (const monthlyShare of [-1, 2.5]) expect((await refusal(setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, monthlyShare)))).code).toBe("invalid-input");
    expect((await refusal(setCampaignShare(rig.deps(), rig.actor, { ...shareInput(brightpath.id, 5), status: "x" }))).code).toBe("invalid-input");
    expect(await stored()).toEqual([]);
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(setCampaignShare(rig.deps(), rig.staffActor, shareInput(rig.world().brightpath.id, 5)))).code).toBe("admin-required");
    expect(await stored()).toEqual([]);
  });
});

describe("removeCampaignShare", () => {
  it("removes a share, returns the new summary and audits what was removed", async () => {
    const { brightpath } = rig.world();
    const partner = await partnerOf(brightpath.id, "Ridgeway Partner Ltd");
    await publishSupplierTarget(10);
    await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 8));
    await setCampaignShare(rig.deps(), rig.actor, shareInput(partner.id, 6));
    const summary = await removeCampaignShare(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, agencyOrgId: partner.id });
    expect(summary).toEqual({ totalShares: 8, supplierMonthlyTarget: 10, overAllocated: false });
    expect((await stored()).map((row) => row.monthlyShare)).toEqual([8]);
    const [audit] = await auditRowsFor(rig, "campaign_share.remove");
    expect(audit).toMatchObject({ subjectTable: "campaign_share", before: { agencyOrgId: partner.id, monthlyShare: 6 }, after: null });
  });

  it("refuses a share that does not exist and a malformed input, and is refused to Fynix staff", async () => {
    const { brightpath } = rig.world();
    expect((await refusal(removeCampaignShare(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, agencyOrgId: brightpath.id }))).code).toBe("not-found");
    expect((await refusal(removeCampaignShare(rig.deps(), rig.actor, { campaignId: UNKNOWN, agencyOrgId: brightpath.id }))).code).toBe("not-found");
    expect((await refusal(removeCampaignShare(rig.deps(), rig.actor, { campaignId: "x", agencyOrgId: brightpath.id }))).code).toBe("invalid-input");
    await setCampaignShare(rig.deps(), rig.actor, shareInput(brightpath.id, 5));
    expect((await refusal(removeCampaignShare(rig.deps(), rig.staffActor, { campaignId: firstCampaign(rig).id, agencyOrgId: brightpath.id }))).code).toBe("admin-required");
    expect(await stored()).toHaveLength(1);
  });
});

describe("listCampaignShares", () => {
  it("lists the shares by agency name with the summary, and is open to Fynix staff", async () => {
    const { brightpath } = rig.world();
    const zed = await partnerOf(brightpath.id, "Zed Partner Ltd");
    const alpha = await partnerOf(brightpath.id, "Alpha Partner Ltd");
    await publishSupplierTarget(10);
    await setCampaignShare(rig.deps(), rig.actor, shareInput(zed.id, 7));
    await setCampaignShare(rig.deps(), rig.actor, shareInput(alpha.id, 5));
    const listed = await listCampaignShares(rig.deps(), rig.staffActor, firstCampaign(rig).id);
    expect(listed.shares.map((row) => [row.agencyName, row.monthlyShare])).toEqual([
      ["Alpha Partner Ltd", 5],
      ["Zed Partner Ltd", 7],
    ]);
    expect(listed.summary).toEqual({ totalShares: 12, supplierMonthlyTarget: 10, overAllocated: true });
  });

  it("returns an empty list for a campaign with no shares, and refuses an unknown campaign", async () => {
    expect(await listCampaignShares(rig.deps(), rig.actor, firstCampaign(rig).id)).toEqual({ shares: [], summary: { totalShares: 0, supplierMonthlyTarget: null, overAllocated: false } });
    expect((await refusal(listCampaignShares(rig.deps(), rig.actor, UNKNOWN))).code).toBe("not-found");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm test:integration server/domain/shares
```

Expected: FAIL: `@/server/domain/shares` does not exist.

- [ ] **Step 3: The input schemas and snapshot**

**Append** to `server/domain/inputs.ts`:

```typescript

export const setCampaignShareSchema = z.object({ campaignId: z.uuid(), agencyOrgId: z.uuid(), monthlyShare: count }).strict();
export type SetCampaignShareInput = z.infer<typeof setCampaignShareSchema>;

export const removeCampaignShareSchema = z.object({ campaignId: z.uuid(), agencyOrgId: z.uuid() }).strict();
export type RemoveCampaignShareInput = z.infer<typeof removeCampaignShareSchema>;
```

**Append** to `server/domain/snapshots.ts`:

```typescript

export interface ShareRow {
  readonly campaignId: string;
  readonly agencyOrgId: string;
  readonly monthlyShare: number;
}

export function snapshotShare(row: ShareRow): JsonObject {
  return { campaignId: row.campaignId, agencyOrgId: row.agencyOrgId, monthlyShare: row.monthlyShare };
}
```

- [ ] **Step 4: The service**

**File:** `server/domain/shares.ts`

```typescript
import { and, asc, eq } from "drizzle-orm";
import { summariseShares, type ShareSummary } from "@/lib/domain/share-allocation";
import { agreement, campaign, campaignShare, organisation } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { removeCampaignShareSchema, setCampaignShareSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotShare } from "@/server/domain/snapshots";

/**
 * The shares of a supplier's monthly target (spec 7.2): the supplier splits its target between itself and its partner
 * agencies. A share goes to the campaign's supplier or one of its partner agencies (the database enforces it, migration
 * 0024). A total above the supplier's target is allowed, and the result says so (`overAllocated`) for the screen to show.
 * `setCampaignShare` and `removeCampaignShare` are Fynix admin writes in phase 1D; in 1E the supplier manager sets them.
 */

export interface ShareRecord {
  readonly campaignId: string;
  readonly agencyOrgId: string;
  readonly agencyRef: string;
  readonly agencyName: string;
  readonly monthlyShare: number;
}

export interface ShareResult {
  readonly share: ShareRecord;
  readonly summary: ShareSummary;
}

/** The total of a campaign's shares against the monthly target of its current supplier agreement (`null` when there is none). */
async function summarise(tx: ScopedTransaction, campaignId: string): Promise<ShareSummary> {
  const [supplierAgreement] = await tx
    .select({ monthlyTarget: agreement.monthlyTarget })
    .from(agreement)
    .where(and(eq(agreement.campaignId, campaignId), eq(agreement.party, "supplier"), eq(agreement.status, "current")))
    .limit(1);
  const shares = await tx.select({ monthlyShare: campaignShare.monthlyShare }).from(campaignShare).where(eq(campaignShare.campaignId, campaignId));
  return summariseShares(supplierAgreement?.monthlyTarget ?? null, shares.map((row) => row.monthlyShare));
}

/**
 * Sets an agency's monthly share of a campaign, creating it or changing it. The agency must be active and be the campaign's
 * supplier or a partner agency of it. The campaign row is locked first, so two admins setting shares for one campaign take
 * turns and each flag includes the other's change.
 */
export async function setCampaignShare(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<ShareResult> {
  const parsed = parseInput(setCampaignShareSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [target] = await tx.select({ id: campaign.id, supplierOrgId: campaign.agencyOrgId, publicRef: campaign.publicRef }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1).for("update");
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [agency] = await tx
      .select({ id: organisation.id, publicRef: organisation.publicRef, name: organisation.name, kind: organisation.kind, status: organisation.status, parentOrgId: organisation.parentOrgId })
      .from(organisation)
      .where(eq(organisation.id, parsed.agencyOrgId))
      .limit(1);
    if (agency === undefined || agency.kind !== "agency") throw new DomainError("not-found", "There is no such agency.");
    if (agency.status !== "active") throw new DomainError("organisation-archived", "The agency is archived.");
    if (agency.id !== target.supplierOrgId && agency.parentOrgId !== target.supplierOrgId) {
      throw new DomainError("share-not-allowed", "A share goes to the campaign's supplier or to one of its partner agencies.");
    }
    const [existing] = await tx
      .select({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare })
      .from(campaignShare)
      .where(and(eq(campaignShare.campaignId, target.id), eq(campaignShare.agencyOrgId, agency.id)))
      .limit(1)
      .for("update");
    const [saved] =
      existing === undefined
        ? await tx.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: agency.id, monthlyShare: parsed.monthlyShare }).returning({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare })
        : await tx.update(campaignShare).set({ monthlyShare: parsed.monthlyShare, updatedAt: deps.now() }).where(eq(campaignShare.id, existing.id)).returning({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare });
    if (saved === undefined) throw new Error("The share write returned no row");
    await audit({
      action: "campaign_share.set",
      subject: { table: "campaign_share", id: saved.id, ref: `${target.publicRef} ${agency.publicRef}` },
      before: existing === undefined ? null : snapshotShare({ campaignId: target.id, agencyOrgId: agency.id, monthlyShare: existing.monthlyShare }),
      after: snapshotShare({ campaignId: target.id, agencyOrgId: agency.id, monthlyShare: saved.monthlyShare }),
    });
    return {
      share: { campaignId: target.id, agencyOrgId: agency.id, agencyRef: agency.publicRef, agencyName: agency.name, monthlyShare: saved.monthlyShare },
      summary: await summarise(tx, target.id),
    };
  });
}

/** Removes an agency's share of a campaign and returns the new summary. A share is a setting, so the row is deleted; the audit row keeps what it was. */
export async function removeCampaignShare(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<ShareSummary> {
  const parsed = parseInput(removeCampaignShareSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [target] = await tx.select({ id: campaign.id, publicRef: campaign.publicRef }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1).for("update");
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [existing] = await tx
      .select({ id: campaignShare.id, monthlyShare: campaignShare.monthlyShare, agencyRef: organisation.publicRef })
      .from(campaignShare)
      .innerJoin(organisation, eq(organisation.id, campaignShare.agencyOrgId))
      .where(and(eq(campaignShare.campaignId, target.id), eq(campaignShare.agencyOrgId, parsed.agencyOrgId)))
      .limit(1)
      .for("update", { of: campaignShare });
    if (existing === undefined) throw new DomainError("not-found", "That agency has no share of the campaign.");
    await tx.delete(campaignShare).where(eq(campaignShare.id, existing.id));
    await audit({
      action: "campaign_share.remove",
      subject: { table: "campaign_share", id: existing.id, ref: `${target.publicRef} ${existing.agencyRef}` },
      before: snapshotShare({ campaignId: target.id, agencyOrgId: parsed.agencyOrgId, monthlyShare: existing.monthlyShare }),
      after: null,
    });
    return summarise(tx, target.id);
  });
}

/** A campaign's shares by agency name, with the summary. Open to Fynix staff. */
export async function listCampaignShares(deps: DomainDeps, actor: FynixActor, campaignId: string): Promise<{ readonly shares: readonly ShareRecord[]; readonly summary: ShareSummary }> {
  const id = parseInput(uuidSchema, campaignId);
  return fynixRead(deps.fynixDb, actor, async (tx) => {
    const [found] = await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, id)).limit(1);
    if (found === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const shares = await tx
      .select({ campaignId: campaignShare.campaignId, agencyOrgId: campaignShare.agencyOrgId, agencyRef: organisation.publicRef, agencyName: organisation.name, monthlyShare: campaignShare.monthlyShare })
      .from(campaignShare)
      .innerJoin(organisation, eq(organisation.id, campaignShare.agencyOrgId))
      .where(eq(campaignShare.campaignId, id))
      .orderBy(asc(organisation.name));
    return { shares, summary: await summarise(tx, id) };
  });
}
```

- [ ] **Step 5: Run the checks**

```bash
pnpm test:integration server/domain/shares
pnpm typecheck
pnpm lint
```

Expected: the file passes; typecheck and lint are clean.

- [ ] **Step 6: Commit**

```bash
git add server/domain
git commit -m "Add campaign shares with the over-allocation flag"
```

---

## Task 12: Campaign hosts: add and deactivate

**Files:** create `server/domain/hosts.ts`, `server/domain/hosts.integration.test.ts`; modify `server/domain/inputs.ts`, `snapshots.ts`.

A host is an active member of the campaign's client who takes meetings for it. `addCampaignHost` adds one (or reactivates one that was deactivated, with a new title); `deactivateCampaignHost` switches one off and keeps the row. The database already refuses a member of another organisation (the composite foreign keys of Task 6); the service says so first, with a specific error.

- [ ] **Step 1: Write the failing tests**

**File:** `server/domain/hosts.integration.test.ts`

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaignHost, member } from "@/server/db/schema";
import { addCampaignHost, deactivateCampaignHost } from "@/server/domain/hosts";
import { auditRowsFor, firstCampaign, memberIdFor, refusal, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const UNKNOWN = "99999999-9999-4999-8999-999999999999";
const stored = () => rig.dbs.owner.db.select().from(campaignHost);
/** Kestrel is the client of the first campaign; its one user is the host in these tests. */
const kestrelMember = () => memberIdFor(rig, userIn(rig, rig.world().kestrel).id);
const hostInput = async (overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> => ({ campaignId: firstCampaign(rig).id, memberId: await kestrelMember(), jobTitle: "Chief Operating Officer", ...overrides });

describe("addCampaignHost", () => {
  it("adds an active member of the campaign's client as a host, with the client copied from the campaign, and audits it", async () => {
    const host = await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    expect(host).toEqual({ campaignId: firstCampaign(rig).id, memberId: await kestrelMember(), displayName: userIn(rig, rig.world().kestrel).name, jobTitle: "Chief Operating Officer", active: true });
    expect(await stored()).toMatchObject([{ campaignId: firstCampaign(rig).id, clientOrgId: rig.world().kestrel.id, jobTitle: "Chief Operating Officer", active: true }]);
    const [audit] = await auditRowsFor(rig, "campaign_host.add");
    expect(audit).toMatchObject({ actorUserId: rig.actor.userId, subjectTable: "campaign_host", before: null, after: { campaignId: firstCampaign(rig).id, memberId: await kestrelMember(), jobTitle: "Chief Operating Officer", active: true } });
    expect(audit?.subjectRef).toBe(firstCampaign(rig).publicRef);
  });

  it("refuses a member of another client, a member of an agency, a Fynix member, a suspended member and an unknown member, with not-a-client-member", async () => {
    const world = rig.world();
    for (const person of [userIn(rig, world.halden), userIn(rig, world.brightpath), { id: rig.actor.userId }]) {
      expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ memberId: await memberIdFor(rig, person.id) })))).code, person.id).toBe("not-a-client-member");
    }
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ memberId: UNKNOWN })))).code).toBe("not-a-client-member");
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.id, await kestrelMember()));
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput()))).code).toBe("not-a-client-member");
    expect(await stored()).toEqual([]);
    expect(await auditRowsFor(rig)).toEqual([]);
  });

  it("refuses a host who is one already, an unknown campaign, a blank job title and a field it does not know", async () => {
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ jobTitle: "Another title" })))).code).toBe("invalid-transition");
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ campaignId: UNKNOWN })))).code).toBe("not-found");
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ jobTitle: "   " })))).code).toBe("invalid-input");
    expect((await refusal(addCampaignHost(rig.deps(), rig.actor, await hostInput({ active: false })))).code).toBe("invalid-input");
    expect(await stored()).toHaveLength(1);
    expect(await auditRowsFor(rig, "campaign_host.add")).toHaveLength(1);
  });

  it("reactivates a deactivated host with the new title, on the same row, and audits the before and after", async () => {
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    await deactivateCampaignHost(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, memberId: await kestrelMember() });
    const again = await addCampaignHost(rig.deps(), rig.actor, await hostInput({ jobTitle: "Head of Operations" }));
    expect(again).toMatchObject({ jobTitle: "Head of Operations", active: true });
    expect(await stored()).toHaveLength(1);
    const audits = await auditRowsFor(rig, "campaign_host.add");
    expect(audits[1]).toMatchObject({ before: { jobTitle: "Chief Operating Officer", active: false }, after: { jobTitle: "Head of Operations", active: true } });
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(addCampaignHost(rig.deps(), rig.staffActor, await hostInput()))).code).toBe("admin-required");
    expect(await stored()).toEqual([]);
  });
});

describe("deactivateCampaignHost", () => {
  it("switches a host off and keeps the row, and audits the before and after", async () => {
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    const host = await deactivateCampaignHost(rig.deps(), rig.actor, { campaignId: firstCampaign(rig).id, memberId: await kestrelMember() });
    expect(host).toMatchObject({ active: false, jobTitle: "Chief Operating Officer" });
    expect(await stored()).toMatchObject([{ active: false }]);
    const [audit] = await auditRowsFor(rig, "campaign_host.deactivate");
    expect(audit).toMatchObject({ before: { active: true }, after: { active: false } });
  });

  it("refuses a member who is not a host, a host who is deactivated already, and a malformed input", async () => {
    const input = { campaignId: firstCampaign(rig).id, memberId: await kestrelMember() };
    expect((await refusal(deactivateCampaignHost(rig.deps(), rig.actor, input))).code).toBe("not-found");
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    await deactivateCampaignHost(rig.deps(), rig.actor, input);
    expect((await refusal(deactivateCampaignHost(rig.deps(), rig.actor, input))).code).toBe("invalid-transition");
    expect((await refusal(deactivateCampaignHost(rig.deps(), rig.actor, { ...input, memberId: "x" }))).code).toBe("invalid-input");
  });

  it("is refused to Fynix staff", async () => {
    await addCampaignHost(rig.deps(), rig.actor, await hostInput());
    const input = { campaignId: firstCampaign(rig).id, memberId: await kestrelMember() };
    expect((await refusal(deactivateCampaignHost(rig.deps(), rig.staffActor, input))).code).toBe("admin-required");
    expect(await stored()).toMatchObject([{ active: true }]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm test:integration server/domain/hosts
```

Expected: FAIL: `@/server/domain/hosts` does not exist.

- [ ] **Step 3: The input schemas and snapshot**

**Append** to `server/domain/inputs.ts`:

```typescript

export const addCampaignHostSchema = z.object({ campaignId: z.uuid(), memberId: z.uuid(), jobTitle: name(120) }).strict();
export type AddCampaignHostInput = z.infer<typeof addCampaignHostSchema>;

export const deactivateCampaignHostSchema = z.object({ campaignId: z.uuid(), memberId: z.uuid() }).strict();
export type DeactivateCampaignHostInput = z.infer<typeof deactivateCampaignHostSchema>;
```

**Append** to `server/domain/snapshots.ts`:

```typescript

export interface HostRow {
  readonly campaignId: string;
  readonly memberId: string;
  readonly jobTitle: string;
  readonly active: boolean;
}

export function snapshotHost(row: HostRow): JsonObject {
  return { campaignId: row.campaignId, memberId: row.memberId, jobTitle: row.jobTitle, active: row.active };
}
```

- [ ] **Step 4: The service**

**File:** `server/domain/hosts.ts`

```typescript
import { and, eq } from "drizzle-orm";
import { campaign, campaignHost, member } from "@/server/db/schema";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError, isUniqueViolation } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { addCampaignHostSchema, deactivateCampaignHostSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotHost } from "@/server/domain/snapshots";

/**
 * The client's people who take meetings for a campaign (spec 7.3). Fynix admins add and deactivate them in phase 1D; in 1E the
 * client's manager does. A host is never removed: deactivating keeps the row for the meetings the host took (phase 3).
 */

export interface HostRecord {
  readonly campaignId: string;
  readonly memberId: string;
  readonly displayName: string;
  readonly jobTitle: string;
  readonly active: boolean;
}

/**
 * Adds an active member of the campaign's client as a host, with the job title the supplier and its agencies are told. A host
 * who was deactivated is switched back on, with the new title, on the same row. The database pins the member to the campaign's
 * client with composite foreign keys (migration 0025); `client_org_id` on the row is copied from the campaign here.
 */
export async function addCampaignHost(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<HostRecord> {
  const parsed = parseInput(addCampaignHostSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [target] = await tx.select({ id: campaign.id, clientOrgId: campaign.clientOrgId, publicRef: campaign.publicRef }).from(campaign).where(eq(campaign.id, parsed.campaignId)).limit(1).for("share");
    if (target === undefined) throw new DomainError("not-found", "There is no such campaign.");
    const [person] = await tx
      .select({ id: member.id, orgId: member.orgId, orgKind: member.orgKind, status: member.status, displayName: member.displayName })
      .from(member)
      .where(eq(member.id, parsed.memberId))
      .limit(1);
    if (person === undefined || person.orgKind !== "client" || person.orgId !== target.clientOrgId || person.status !== "active") {
      throw new DomainError("not-a-client-member", "A host is an active member of the campaign's client.");
    }
    const [existing] = await tx
      .select({ id: campaignHost.id, jobTitle: campaignHost.jobTitle, active: campaignHost.active })
      .from(campaignHost)
      .where(and(eq(campaignHost.campaignId, target.id), eq(campaignHost.memberId, person.id)))
      .limit(1)
      .for("update");
    if (existing?.active === true) throw new DomainError("invalid-transition", "That person is a host of the campaign already.");
    let saved: { readonly id: string; readonly jobTitle: string; readonly active: boolean } | undefined;
    try {
      [saved] =
        existing === undefined
          ? await tx.insert(campaignHost).values({ campaignId: target.id, clientOrgId: target.clientOrgId, memberId: person.id, jobTitle: parsed.jobTitle }).returning({ id: campaignHost.id, jobTitle: campaignHost.jobTitle, active: campaignHost.active })
          : await tx.update(campaignHost).set({ jobTitle: parsed.jobTitle, active: true }).where(eq(campaignHost.id, existing.id)).returning({ id: campaignHost.id, jobTitle: campaignHost.jobTitle, active: campaignHost.active });
    } catch (error) {
      if (isUniqueViolation(error, "campaign_host_campaign_member_unique")) throw new DomainError("invalid-transition", "That person is a host of the campaign already.");
      throw error;
    }
    if (saved === undefined) throw new Error("The host write returned no row");
    await audit({
      action: "campaign_host.add",
      subject: { table: "campaign_host", id: saved.id, ref: target.publicRef },
      before: existing === undefined ? null : snapshotHost({ campaignId: target.id, memberId: person.id, jobTitle: existing.jobTitle, active: existing.active }),
      after: snapshotHost({ campaignId: target.id, memberId: person.id, jobTitle: saved.jobTitle, active: saved.active }),
    });
    return { campaignId: target.id, memberId: person.id, displayName: person.displayName, jobTitle: saved.jobTitle, active: saved.active };
  });
}

/** Switches a host off. The row stays, with its title, for the meetings the host took. A member who is not a host, or is already off, is refused. */
export async function deactivateCampaignHost(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<HostRecord> {
  const parsed = parseInput(deactivateCampaignHostSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [existing] = await tx
      .select({ id: campaignHost.id, jobTitle: campaignHost.jobTitle, active: campaignHost.active, displayName: member.displayName, campaignRef: campaign.publicRef })
      .from(campaignHost)
      .innerJoin(member, eq(member.id, campaignHost.memberId))
      .innerJoin(campaign, eq(campaign.id, campaignHost.campaignId))
      .where(and(eq(campaignHost.campaignId, parsed.campaignId), eq(campaignHost.memberId, parsed.memberId)))
      .limit(1)
      .for("update", { of: campaignHost });
    if (existing === undefined) throw new DomainError("not-found", "That person is not a host of the campaign.");
    if (!existing.active) throw new DomainError("invalid-transition", "That host is deactivated already.");
    await tx.update(campaignHost).set({ active: false }).where(eq(campaignHost.id, existing.id));
    const row = { campaignId: parsed.campaignId, memberId: parsed.memberId, jobTitle: existing.jobTitle };
    await audit({
      action: "campaign_host.deactivate",
      subject: { table: "campaign_host", id: existing.id, ref: existing.campaignRef },
      before: snapshotHost({ ...row, active: true }),
      after: snapshotHost({ ...row, active: false }),
    });
    return { ...row, displayName: existing.displayName, active: false };
  });
}
```

- [ ] **Step 5: Run the checks**

```bash
pnpm test:integration server/domain/hosts
pnpm typecheck
pnpm lint
```

Expected: the file passes; typecheck and lint are clean.

- [ ] **Step 6: Commit**

```bash
git add server/domain
git commit -m "Add campaign hosts: add, reactivate and deactivate"
```

---

## Task 13: Host availability: weekly hours and blocked times

**Files:** create `server/domain/availability.ts`, `server/domain/availability.integration.test.ts`; modify `server/domain/inputs.ts`, `snapshots.ts`.

`setHostHours` replaces a host's whole weekly set in one transaction (an empty set clears it), `addHostBlock` blocks a time and `removeHostBlock` removes one. They are about the person, not a campaign, so the only thing they need is an active member of a client. Overlaps and bounds are checked in the domain (`findHoursProblem`) first, and again by the database (constraints and the overlap trigger of Task 7). The member row is locked while the set is replaced, so two admins editing one host's hours take turns; the overlap trigger cannot see another transaction's uncommitted rows, and the lock is what closes that gap.

- [ ] **Step 1: Write the failing tests**

**File:** `server/domain/availability.integration.test.ts`

```typescript
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hostBlock, hostHours } from "@/server/db/schema";
import { addHostBlock, removeHostBlock, setHostHours } from "@/server/domain/availability";
import { auditRowsFor, memberIdFor, refusal, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const UNKNOWN = "99999999-9999-4999-8999-999999999999";
const hostMember = () => memberIdFor(rig, userIn(rig, rig.world().kestrel).id);
const win = (weekday: number, startMinute: number, endMinute: number) => ({ weekday, startMinute, endMinute });
const hoursInput = async (hours: readonly ReturnType<typeof win>[], overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> => ({ memberId: await hostMember(), timeZone: "Europe/London", hours, ...overrides });
const hourRows = () => rig.dbs.owner.db.select().from(hostHours).orderBy(asc(hostHours.weekday), asc(hostHours.startMinute));
const blockRows = () => rig.dbs.owner.db.select().from(hostBlock).orderBy(asc(hostBlock.startsAt));

describe("setHostHours", () => {
  it("stores a weekly set in the host's time zone, sorted, and audits the before and after", async () => {
    const result = await setHostHours(rig.deps(), rig.actor, await hoursInput([win(2, 540, 1020), win(1, 780, 1020), win(1, 540, 720)]));
    expect(result).toEqual({ memberId: await hostMember(), timeZone: "Europe/London", hours: [win(1, 540, 720), win(1, 780, 1020), win(2, 540, 1020)] });
    expect((await hourRows()).map((row) => [row.weekday, row.startMinute, row.endMinute, row.timeZone])).toEqual([
      [1, 540, 720, "Europe/London"],
      [1, 780, 1020, "Europe/London"],
      [2, 540, 1020, "Europe/London"],
    ]);
    const [audit] = await auditRowsFor(rig, "host_hours.set");
    expect(audit).toMatchObject({
      actorUserId: rig.actor.userId,
      subjectTable: "host_hours",
      subjectId: await hostMember(),
      before: { timeZone: null, windows: [] },
      after: { timeZone: "Europe/London", windows: [win(1, 540, 720), win(1, 780, 1020), win(2, 540, 1020)] },
    });
  });

  it("replaces the whole set, so the old windows and the old time zone are gone, and the audit row holds the old set", async () => {
    await setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 1020), win(3, 540, 1020)]));
    await setHostHours(rig.deps(), rig.actor, await hoursInput([win(5, 600, 900)], { timeZone: "Asia/Kolkata" }));
    expect((await hourRows()).map((row) => [row.weekday, row.timeZone])).toEqual([[5, "Asia/Kolkata"]]);
    const audits = await auditRowsFor(rig, "host_hours.set");
    expect(audits[1]).toMatchObject({ before: { timeZone: "Europe/London", windows: [win(1, 540, 1020), win(3, 540, 1020)] }, after: { timeZone: "Asia/Kolkata", windows: [win(5, 600, 900)] } });
  });

  it("clears the set when it is given none, and accepts adjacent windows and a full day", async () => {
    await setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 720), win(1, 720, 1020), win(0, 0, 1440)]));
    expect(await hourRows()).toHaveLength(3);
    expect(await setHostHours(rig.deps(), rig.actor, await hoursInput([]))).toMatchObject({ hours: [] });
    expect(await hourRows()).toEqual([]);
  });

  it.each([
    ["two windows that overlap", [win(1, 540, 720), win(1, 700, 800)]],
    ["a window inside another", [win(1, 540, 1020), win(1, 600, 660)]],
    ["a window that ends where it starts", [win(1, 600, 600)]],
    ["a window that ends before it starts", [win(1, 700, 600)]],
    ["a weekday of 7", [win(7, 540, 600)]],
    ["an end after midnight", [win(1, 540, 1441)]],
    ["a negative start", [win(1, -5, 600)]],
    ["a fractional minute", [win(1, 540.5, 600)]],
  ])("refuses %s, and keeps the set it had", async (_label, hours) => {
    await setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 1020)]));
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput(hours)))).code).toBe("invalid-input");
    expect((await hourRows()).map((row) => [row.weekday, row.startMinute, row.endMinute])).toEqual([[1, 540, 1020]]);
    expect(await auditRowsFor(rig, "host_hours.set")).toHaveLength(1);
  });

  it("refuses an unknown time zone, an offset, more than 70 windows and a field it does not know", async () => {
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { timeZone: "Mars/Olympus" })))).code).toBe("invalid-input");
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { timeZone: "+01:00" })))).code).toBe("invalid-input");
    const tooMany = Array.from({ length: 71 }, (_, index) => win(index % 7, 0, 1));
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput(tooMany)))).code).toBe("invalid-input");
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { campaignId: UNKNOWN })))).code).toBe("invalid-input");
    expect(await hourRows()).toEqual([]);
  });

  it("refuses a member who is not an active member of a client, with not-a-client-member", async () => {
    const world = rig.world();
    for (const userId of [userIn(rig, world.brightpath).id, rig.actor.userId]) {
      expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { memberId: await memberIdFor(rig, userId) })))).code, userId).toBe("not-a-client-member");
    }
    expect((await refusal(setHostHours(rig.deps(), rig.actor, await hoursInput([win(1, 540, 600)], { memberId: UNKNOWN })))).code).toBe("not-a-client-member");
    expect(await hourRows()).toEqual([]);
  });

  it("is refused to Fynix staff", async () => {
    expect((await refusal(setHostHours(rig.deps(), rig.staffActor, await hoursInput([win(1, 540, 600)])))).code).toBe("admin-required");
    expect(await hourRows()).toEqual([]);
  });
});

describe("addHostBlock", () => {
  const blockInput = async (overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> => ({ memberId: await hostMember(), startsAt: "2027-01-04T09:00:00Z", endsAt: "2027-01-04T11:00:00Z", note: "Dentist", ...overrides });

  it("blocks a time, accepts an offset, and audits it", async () => {
    const block = await addHostBlock(rig.deps(), rig.actor, await blockInput({ startsAt: "2027-01-04T10:00:00+01:00" }));
    expect(block).toMatchObject({ memberId: await hostMember(), note: "Dentist" });
    expect(block.startsAt.toISOString()).toBe("2027-01-04T09:00:00.000Z");
    expect(block.endsAt.toISOString()).toBe("2027-01-04T11:00:00.000Z");
    expect(await blockRows()).toHaveLength(1);
    const [audit] = await auditRowsFor(rig, "host_block.add");
    expect(audit).toMatchObject({ subjectTable: "host_block", subjectId: block.id, before: null, after: { memberId: await hostMember(), startsAt: "2027-01-04T09:00:00.000Z", endsAt: "2027-01-04T11:00:00.000Z", note: "Dentist" } });
  });

  it("allows overlapping blocks and an empty note", async () => {
    await addHostBlock(rig.deps(), rig.actor, await blockInput());
    await addHostBlock(rig.deps(), rig.actor, await blockInput({ startsAt: "2027-01-04T10:00:00Z", endsAt: "2027-01-04T12:00:00Z", note: "" }));
    expect(await blockRows()).toHaveLength(2);
  });

  it.each([
    ["a block that ends where it starts", { endsAt: "2027-01-04T09:00:00Z" }],
    ["a block that ends before it starts", { endsAt: "2027-01-04T08:00:00Z" }],
    ["a time with no offset", { startsAt: "2027-01-04T09:00:00" }],
    ["a date that is not a time", { startsAt: "next Tuesday" }],
    ["a note over 500 characters", { note: "x".repeat(501) }],
  ])("refuses %s, and writes nothing", async (_label, overrides) => {
    expect((await refusal(addHostBlock(rig.deps(), rig.actor, await blockInput(overrides)))).code).toBe("invalid-input");
    expect(await blockRows()).toEqual([]);
  });

  it("refuses a member who is not an active member of a client, and is refused to Fynix staff", async () => {
    expect((await refusal(addHostBlock(rig.deps(), rig.actor, await blockInput({ memberId: await memberIdFor(rig, userIn(rig, rig.world().brightpath).id) })))).code).toBe("not-a-client-member");
    expect((await refusal(addHostBlock(rig.deps(), rig.staffActor, await blockInput()))).code).toBe("admin-required");
    expect(await blockRows()).toEqual([]);
  });
});

describe("removeHostBlock", () => {
  it("removes a block and audits what it was", async () => {
    const block = await addHostBlock(rig.deps(), rig.actor, { memberId: await hostMember(), startsAt: "2027-01-04T09:00:00Z", endsAt: "2027-01-04T11:00:00Z", note: "Dentist" });
    await removeHostBlock(rig.deps(), rig.actor, block.id);
    expect(await blockRows()).toEqual([]);
    const [audit] = await auditRowsFor(rig, "host_block.remove");
    expect(audit).toMatchObject({ subjectId: block.id, before: { note: "Dentist", startsAt: "2027-01-04T09:00:00.000Z" }, after: null });
  });

  it("refuses an unknown block and a malformed id, and is refused to Fynix staff", async () => {
    const block = await addHostBlock(rig.deps(), rig.actor, { memberId: await hostMember(), startsAt: "2027-01-04T09:00:00Z", endsAt: "2027-01-04T11:00:00Z" });
    expect((await refusal(removeHostBlock(rig.deps(), rig.actor, UNKNOWN))).code).toBe("not-found");
    expect((await refusal(removeHostBlock(rig.deps(), rig.actor, "x"))).code).toBe("invalid-input");
    expect((await refusal(removeHostBlock(rig.deps(), rig.staffActor, block.id))).code).toBe("admin-required");
    expect(await blockRows()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
pnpm test:integration server/domain/availability
```

Expected: FAIL: `@/server/domain/availability` does not exist.

- [ ] **Step 3: The input schemas and snapshots**

**Append** to `server/domain/inputs.ts`:

```typescript

const hoursWindow = z.object({ weekday: z.number().int(), startMinute: z.number().int(), endMinute: z.number().int() }).strict();
/** A whole weekly set, replacing the old one. Ranges and overlaps are checked by `findHoursProblem` (lib/domain/weekly-hours.ts) so the message names the rule. */
export const setHostHoursSchema = z.object({ memberId: z.uuid(), timeZone: timeZoneSchema, hours: z.array(hoursWindow).max(70, "must have at most 70 windows") }).strict();
export type SetHostHoursInput = z.input<typeof setHostHoursSchema>;

/** An instant with an offset or Z, such as `2027-01-04T09:00:00Z` or `2027-01-04T10:00:00+01:00`: a time with no offset is ambiguous, so it is refused. */
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
export const addHostBlockSchema = z
  .object({ memberId: z.uuid(), startsAt: instant, endsAt: instant, note: optionalText(500).default("") })
  .strict()
  .refine((input) => input.endsAt.getTime() > input.startsAt.getTime(), { path: ["endsAt"], message: "must be after the start" });
export type AddHostBlockInput = z.input<typeof addHostBlockSchema>;
```

**Append** to `server/domain/snapshots.ts`:

```typescript

/** A host's whole weekly set: the time zone (`null` when there is none) and the windows, as stored. */
export function snapshotHours(timeZone: string | null, windows: readonly { readonly weekday: number; readonly startMinute: number; readonly endMinute: number }[]): JsonObject {
  return { timeZone, windows: windows.map((slot) => ({ weekday: slot.weekday, startMinute: slot.startMinute, endMinute: slot.endMinute })) };
}

export interface BlockRow {
  readonly memberId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly note: string;
}

export function snapshotBlock(row: BlockRow): JsonObject {
  return { memberId: row.memberId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), note: row.note };
}
```

- [ ] **Step 4: The service**

**File:** `server/domain/availability.ts`

```typescript
import { asc, eq } from "drizzle-orm";
import { findHoursProblem, sortWindows, type HoursWindow } from "@/lib/domain/weekly-hours";
import { hostBlock, hostHours, member } from "@/server/db/schema";
import type { ScopedTransaction } from "@/server/db/scope";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixWrite, type FynixActor } from "@/server/domain/fynix-write";
import { addHostBlockSchema, setHostHoursSchema, uuidSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";
import { snapshotBlock, snapshotHours } from "@/server/domain/snapshots";

/**
 * When a client's person takes meetings (spec 7.3): weekly working hours in their own time zone, and blocked times. They
 * belong to the person, not to a campaign. Fynix admins set them in phase 1D; in 1E the host does. Agencies will see the free
 * blocks only (spec 5.1), computed in a later phase from these two tables.
 */

export interface HostHoursRecord {
  readonly memberId: string;
  readonly timeZone: string;
  readonly hours: readonly HoursWindow[];
}

export interface HostBlockRecord {
  readonly id: string;
  readonly memberId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly note: string;
}

/** The member must exist, be active and belong to a client. The row is locked, so one host's hours are edited by one admin at a time. */
async function requireClientMember(tx: ScopedTransaction, memberId: string): Promise<{ readonly id: string }> {
  const [person] = await tx.select({ id: member.id, orgKind: member.orgKind, status: member.status }).from(member).where(eq(member.id, memberId)).limit(1).for("update");
  if (person === undefined || person.orgKind !== "client" || person.status !== "active") {
    throw new DomainError("not-a-client-member", "Working hours belong to an active member of a client.");
  }
  return person;
}

/**
 * Replaces a host's whole weekly set with the given windows, all in one time zone, in one transaction: delete, then insert. An
 * empty set clears it. A window must be whole minutes inside one day, start before it ends, and not overlap another on its
 * day (`findHoursProblem`); the database repeats each rule. Hours are settings, so the old rows are deleted; the audit row
 * holds the old set and the new one.
 */
export async function setHostHours(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<HostHoursRecord> {
  const parsed = parseInput(setHostHoursSchema, input);
  const problem = findHoursProblem(parsed.hours);
  if (problem !== null) throw new DomainError("invalid-input", `hours ${problem}`);
  const windows = sortWindows(parsed.hours);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const person = await requireClientMember(tx, parsed.memberId);
    const before = await tx
      .select({ timeZone: hostHours.timeZone, weekday: hostHours.weekday, startMinute: hostHours.startMinute, endMinute: hostHours.endMinute })
      .from(hostHours)
      .where(eq(hostHours.memberId, person.id))
      .orderBy(asc(hostHours.weekday), asc(hostHours.startMinute));
    await tx.delete(hostHours).where(eq(hostHours.memberId, person.id));
    if (windows.length > 0) {
      await tx.insert(hostHours).values(windows.map((slot) => ({ memberId: person.id, timeZone: parsed.timeZone, weekday: slot.weekday, startMinute: slot.startMinute, endMinute: slot.endMinute })));
    }
    await audit({
      action: "host_hours.set",
      subject: { table: "host_hours", id: person.id },
      before: snapshotHours(before[0]?.timeZone ?? null, before),
      after: snapshotHours(parsed.timeZone, windows),
    });
    return { memberId: person.id, timeZone: parsed.timeZone, hours: windows };
  });
}

/** Blocks a time for a host: two instants with an offset, the end after the start. Blocks may overlap. */
export async function addHostBlock(deps: DomainDeps, actor: FynixActor, input: unknown): Promise<HostBlockRecord> {
  const parsed = parseInput(addHostBlockSchema, input);
  return fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const person = await requireClientMember(tx, parsed.memberId);
    const [created] = await tx
      .insert(hostBlock)
      .values({ memberId: person.id, startsAt: parsed.startsAt, endsAt: parsed.endsAt, note: parsed.note })
      .returning({ id: hostBlock.id, memberId: hostBlock.memberId, startsAt: hostBlock.startsAt, endsAt: hostBlock.endsAt, note: hostBlock.note });
    if (created === undefined) throw new Error("The block insert returned no row");
    await audit({ action: "host_block.add", subject: { table: "host_block", id: created.id }, before: null, after: snapshotBlock(created) });
    return created;
  });
}

/** Removes a blocked time. It is a setting, so the row is deleted and the audit row keeps what it was. */
export async function removeHostBlock(deps: DomainDeps, actor: FynixActor, blockId: string): Promise<void> {
  const id = parseInput(uuidSchema, blockId);
  await fynixWrite(deps.fynixDb, actor, async ({ tx, audit }) => {
    const [existing] = await tx
      .select({ id: hostBlock.id, memberId: hostBlock.memberId, startsAt: hostBlock.startsAt, endsAt: hostBlock.endsAt, note: hostBlock.note })
      .from(hostBlock)
      .where(eq(hostBlock.id, id))
      .limit(1);
    if (existing === undefined) throw new DomainError("not-found", "There is no such blocked time.");
    await tx.delete(hostBlock).where(eq(hostBlock.id, id));
    await audit({ action: "host_block.remove", subject: { table: "host_block", id }, before: snapshotBlock(existing), after: null });
  });
}
```

- [ ] **Step 5: Run the checks**

```bash
pnpm test:integration server/domain/availability
pnpm typecheck
pnpm lint
```

Expected: the file passes; typecheck and lint are clean.

- [ ] **Step 6: Commit**

```bash
git add server/domain
git commit -m "Add host weekly hours and blocked times"
```

---

## Task 14: The seed, the structure tests and the leak matrix cover everything new

**Files:** modify `server/db/testing/seed.ts`, `server/db/testing/leak-matrix.ts`, `server/db/leak-matrix.integration.test.ts`, `server/db/structure.integration.test.ts`.

The structure suite already proves, for every table that exists, row-level security, a policy per granted role, no grant to PUBLIC, the audit trigger and (Task 8) the admin trigger, and the access matrix has been extended in Tasks 4 to 7. This task adds what only the leak matrix and a targeted structure test can say: for each tenant role, every new column and table is denied, whatever shape the statement takes, and no error message or result carries a value from the new tables.

The seed gets an **opt in** set of phase 1D rows (`withSetup: true`): a partner agency under Brightpath, a client and a supplier agreement for the first campaign with an acceptance, a share for the partner, a host with weekly hours and a blocked time. It is opt in because adding an organisation would change the counts in older tests; only the leak matrix turns it on. Every string in it is distinctive plain text, so the matrix can search for it.

- [ ] **Step 1: Seed the phase 1D rows**

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
import { account, agencyAlias, auditLog, campaign, emailOutbox, invite, member, organisation, session, termsAcceptance, termsDocument, user, verification } from "@/server/db/schema";
```

With:

```typescript
import {
  account,
  agencyAlias,
  agreement,
  agreementAcceptance,
  auditLog,
  campaign,
  campaignHost,
  campaignShare,
  emailOutbox,
  hostBlock,
  hostHours,
  invite,
  member,
  organisation,
  session,
  termsAcceptance,
  termsDocument,
  user,
  verification,
} from "@/server/db/schema";
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  readonly outboxRecipient: string;
  readonly outboxLink: string;
}
```

With:

```typescript
  readonly outboxRecipient: string;
  readonly outboxLink: string;
}

/**
 * The phase 1D rows, seeded on request (`withSetup`): a partner agency under Brightpath, a client agreement and a supplier
 * agreement for the first campaign, one acceptance, a share for the partner, a host (the Kestrel user) with weekly hours in
 * another time zone and a blocked time. `markers` is every distinctive string stored in the new tables, so the leak matrix can
 * search for them; no tenant may find any of them until phase 1E grants the rows that are its own.
 */
export interface SeededSetup {
  readonly partner: SeededOrganisation;
  readonly markers: readonly string[];
}
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  /** The phase 1C rows. Empty (`null`) when the world was seeded without users. */
  readonly domain: SeededDomain | null;
```

With:

```typescript
  /** The phase 1C rows. Empty (`null`) when the world was seeded without users. */
  readonly domain: SeededDomain | null;
  /** The phase 1D rows. `null` unless the world was seeded with `withSetup: true`. */
  readonly setup: SeededSetup | null;
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
/**
 * Writes through the owner connection, which bypasses row-level security. Test and dev databases only. Users are seeded
```

With:

```typescript
const SETUP_MARKERS = {
  clientRules: "SETUP-RULES-CLIENT a no-show counts after ten minutes",
  clientNotes: "SETUP-NOTES-CLIENT review every quarter",
  supplierRules: "SETUP-RULES-SUPPLIER cancellations need two days notice",
  supplierNotes: "SETUP-NOTES-SUPPLIER paid on delivered meetings",
  acceptanceAddress: "198.51.100.77",
  hostTitle: "SETUP-HOST-TITLE Chief Operating Officer",
  hostZone: "Pacific/Auckland",
  blockNote: "SETUP-BLOCK-NOTE dentist appointment",
} as const;

async function seedSetup(
  owner: DatabaseHandle,
  world: { readonly kestrel: SeededOrganisation; readonly brightpath: SeededOrganisation; readonly campaigns: readonly SeededCampaign[] },
  seeded: { readonly users: readonly SeededUser[]; readonly memberIds: ReadonlyMap<string, string> },
): Promise<SeededSetup> {
  const { db } = owner;
  const memberOf = (person: SeededUser): string => {
    const id = seeded.memberIds.get(person.id);
    if (id === undefined) throw new Error(`No member was seeded for ${person.email}`);
    return id;
  };
  const admin = firstRow(seeded.users.filter((person) => person.organisation.kind === "fynix" && person.role === "manager"), "the Fynix admin");
  const kestrelUser = firstRow(seeded.users.filter((person) => person.organisation.id === world.kestrel.id), "the Kestrel user");
  const target = firstRow(world.campaigns, "campaign");

  const partnerRef = "ORG-6P3S";
  const partnerName = "Ridgeway Partner Media Ltd";
  const partnerRow = firstRow(await db.insert(organisation).values({ publicRef: partnerRef, kind: "agency", name: partnerName, parentOrgId: world.brightpath.id }).returning({ id: organisation.id }), "partner agency");
  const partner: SeededOrganisation = { id: partnerRow.id, publicRef: partnerRef, name: partnerName, brandName: null, kind: "agency" };

  const clientAgreement = firstRow(
    await db
      .insert(agreement)
      .values({ campaignId: target.id, party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, rules: SETUP_MARKERS.clientRules, notes: SETUP_MARKERS.clientNotes, createdBy: memberOf(admin) })
      .returning({ id: agreement.id }),
    "client agreement",
  );
  await db.insert(agreement).values({ campaignId: target.id, party: "supplier", version: 1, monthlyTarget: 18, totalTarget: 108, rules: SETUP_MARKERS.supplierRules, notes: SETUP_MARKERS.supplierNotes, createdBy: memberOf(admin) });
  await db.insert(agreementAcceptance).values({ agreementId: clientAgreement.id, userId: kestrelUser.id, networkAddress: SETUP_MARKERS.acceptanceAddress });
  await db.insert(campaignShare).values({ campaignId: target.id, agencyOrgId: partner.id, monthlyShare: 7 });
  await db.insert(campaignHost).values({ campaignId: target.id, clientOrgId: world.kestrel.id, memberId: memberOf(kestrelUser), jobTitle: SETUP_MARKERS.hostTitle });
  await db.insert(hostHours).values({ memberId: memberOf(kestrelUser), timeZone: SETUP_MARKERS.hostZone, weekday: 1, startMinute: 540, endMinute: 1020 });
  await db.insert(hostBlock).values({ memberId: memberOf(kestrelUser), startsAt: new Date("2027-01-04T09:00:00Z"), endsAt: new Date("2027-01-04T11:00:00Z"), note: SETUP_MARKERS.blockNote });
  return { partner, markers: Object.values(SETUP_MARKERS) };
}

/**
 * Writes through the owner connection, which bypasses row-level security. Test and dev databases only. Users are seeded
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
export async function seedWorld(owner: DatabaseHandle, options: { readonly withUsers?: boolean; readonly withDomain?: boolean } = {}): Promise<SeedWorld> {
```

With:

```typescript
export async function seedWorld(owner: DatabaseHandle, options: { readonly withUsers?: boolean; readonly withDomain?: boolean; readonly withSetup?: boolean } = {}): Promise<SeedWorld> {
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
  const domain = seeded === null || options.withDomain === false ? null : await seedDomain(owner, { fynix, kestrel, northgate }, seeded);
  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate], users: seeded?.users ?? [], domain };
```

With:

```typescript
  const domain = seeded === null || options.withDomain === false ? null : await seedDomain(owner, { fynix, kestrel, northgate }, seeded);
  if (options.withSetup === true && seeded === null) throw new Error("withSetup needs the users: the agreements, the acceptance and the host belong to people.");
  const setup = options.withSetup === true && seeded !== null ? await seedSetup(owner, { kestrel, brightpath, campaigns }, seeded) : null;
  return { fynix, kestrel, halden, brightpath, northgate, campaigns, clients: [kestrel, halden], agencies: [brightpath, northgate], users: seeded?.users ?? [], domain, setup };
```

**Edit:** `server/db/testing/seed.ts`

Replace:

```typescript
 * database has no use for a fake audit row or a queued email.
```

With:

```typescript
 * database has no use for a fake audit row or a queued email. The phase 1D rows (`setup`) are seeded only with `withSetup: true`,
 * which the leak matrix uses: a partner agency would change the organisation counts that older tests rely on.
```

- [ ] **Step 2: Teach the matrix what is forbidden and what must be denied**

**Edit:** `server/db/testing/leak-matrix.ts`

Replace:

```typescript
  return [...new Set(tokens)];
}
```

With:

```typescript
  // Phase 1D: no tenant role reads a partner agency, an agreement, an acceptance, a share, a host, working hours or a blocked
  // time. Phase 1E gives each tenant the rows that are its own and narrows this to the other side's.
  const { setup } = world;
  if (setup !== null) tokens.push(setup.partner.id, setup.partner.publicRef, setup.partner.name, ...setup.markers);
  return [...new Set(tokens)];
}
```

**Edit:** `server/db/testing/leak-matrix.ts`

Replace:

```typescript
  { name: "campaign: probe by a requirement in WHERE", statement: "select id from campaign where icp <> ''", expectedError: DENIED_TABLE },
];
```

With:

```typescript
  { name: "campaign: probe by a requirement in WHERE", statement: "select id from campaign where icp <> ''", expectedError: DENIED_TABLE },
  // Phase 1D: the organisation hierarchy, the campaign settings and the six set-up tables. Nothing here is granted to a tenant until 1E.
  { name: "organisation: the supplier a partner agency works under", statement: "select parent_org_id from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: the kind of the parent", statement: "select parent_org_kind from organisation", expectedError: DENIED_TABLE },
  { name: "organisation: probe the hierarchy by WHERE", statement: "select name from organisation where parent_org_id is not null", expectedError: DENIED_TABLE },
  { name: "organisation: join an organisation to its parent", statement: "select c.name from organisation c join organisation p on p.id = c.parent_org_id", expectedError: DENIED_TABLE },
  { name: "write: give an organisation a parent", statement: "update organisation set parent_org_id = null", expectedError: DENIED_TABLE },
  { name: "campaign: the time zone", statement: "select time_zone from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: the meeting length", statement: "select meeting_minutes from campaign", expectedError: DENIED_TABLE },
  { name: "campaign: probe by the time zone in WHERE", statement: "select id from campaign where time_zone = 'Europe/London'", expectedError: DENIED_TABLE },
  { name: "write: change the time zone of a campaign", statement: "update campaign set time_zone = 'UTC', meeting_minutes = 15", expectedError: DENIED_TABLE },
  { name: "agreements: every agreement", statement: "select * from agreement", expectedError: DENIED_TABLE },
  { name: "agreements: the targets", statement: "select monthly_target, total_target from agreement", expectedError: DENIED_TABLE },
  { name: "agreements: the rules, the notes and the dispute window", statement: "select rules, notes, dispute_window_hours from agreement", expectedError: DENIED_TABLE },
  { name: "agreements: join a campaign to its agreements", statement: "select c.name, a.monthly_target from campaign c join agreement a on a.campaign_id = c.id", expectedError: DENIED_TABLE },
  { name: "agreements: probe by the party in WHERE", statement: "select id from agreement where party = 'supplier'", expectedError: DENIED_TABLE },
  { name: "agreements: every acceptance", statement: "select * from agreement_acceptance", expectedError: DENIED_TABLE },
  { name: "agreements: who accepted, and from where", statement: "select user_id, network_address from agreement_acceptance", expectedError: DENIED_TABLE },
  { name: "write: publish an agreement", statement: "insert into agreement (campaign_id, party, version, monthly_target, total_target, created_by) values (gen_random_uuid(), 'client', 1, 1, 1, gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "write: supersede an agreement", statement: "update agreement set status = 'superseded'", expectedError: DENIED_TABLE },
  { name: "write: accept an agreement as someone else", statement: "insert into agreement_acceptance (agreement_id, user_id, network_address) values (gen_random_uuid(), gen_random_uuid(), 'x')", expectedError: DENIED_TABLE },
  { name: "shares: every share", statement: "select * from campaign_share", expectedError: DENIED_TABLE },
  { name: "shares: how much each agency carries", statement: "select agency_org_id, monthly_share from campaign_share", expectedError: DENIED_TABLE },
  { name: "shares: join a campaign to its shares", statement: "select c.name, s.monthly_share from campaign c join campaign_share s on s.campaign_id = c.id", expectedError: DENIED_TABLE },
  { name: "write: set a share", statement: "insert into campaign_share (campaign_id, agency_org_id, monthly_share) values (gen_random_uuid(), gen_random_uuid(), 1)", expectedError: DENIED_TABLE },
  { name: "write: change a share", statement: "update campaign_share set monthly_share = 0", expectedError: DENIED_TABLE },
  { name: "write: remove a share", statement: "delete from campaign_share", expectedError: DENIED_TABLE },
  { name: "hosts: every host", statement: "select * from campaign_host", expectedError: DENIED_TABLE },
  { name: "hosts: who they are and what they do", statement: "select member_id, job_title, active from campaign_host", expectedError: DENIED_TABLE },
  { name: "hosts: the client organisation behind a campaign", statement: "select client_org_id from campaign_host", expectedError: DENIED_TABLE },
  { name: "write: add a host", statement: "insert into campaign_host (campaign_id, client_org_id, member_id, job_title) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x')", expectedError: DENIED_TABLE },
  { name: "write: deactivate a host", statement: "update campaign_host set active = false", expectedError: DENIED_TABLE },
  { name: "write: remove a host", statement: "delete from campaign_host", expectedError: DENIED_TABLE },
  { name: "hours: every window", statement: "select * from host_hours", expectedError: DENIED_TABLE },
  { name: "hours: the time zone and the weekdays", statement: "select member_id, time_zone, weekday, start_minute, end_minute from host_hours", expectedError: DENIED_TABLE },
  { name: "write: set hours", statement: "insert into host_hours (member_id, time_zone, weekday, start_minute, end_minute) values (gen_random_uuid(), 'UTC', 1, 0, 60)", expectedError: DENIED_TABLE },
  { name: "write: clear hours", statement: "delete from host_hours", expectedError: DENIED_TABLE },
  { name: "blocks: every blocked time", statement: "select * from host_block", expectedError: DENIED_TABLE },
  { name: "blocks: when and why", statement: "select starts_at, ends_at, note from host_block", expectedError: DENIED_TABLE },
  { name: "write: block a time", statement: "insert into host_block (member_id, starts_at, ends_at) values (gen_random_uuid(), now(), now() + interval '1 hour')", expectedError: DENIED_TABLE },
  { name: "write: remove a blocked time", statement: "delete from host_block", expectedError: DENIED_TABLE },
];
```

- [ ] **Step 3: Turn the setup rows on in the leak matrix and prove it can fail**

**Edit:** `server/db/leak-matrix.integration.test.ts`

Replace:

```typescript
import { agencyAlias, auditLog, campaign, emailOutbox, invite, termsAcceptance } from "@/server/db/schema";
```

With:

```typescript
import { agencyAlias, agreement, agreementAcceptance, auditLog, campaign, campaignHost, campaignShare, emailOutbox, hostBlock, hostHours, invite, organisation, termsAcceptance } from "@/server/db/schema";
```

**Edit:** `server/db/leak-matrix.integration.test.ts`

Replace:

```typescript
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner);
});
```

With:

```typescript
beforeEach(async () => {
  await resetDatabase(dbs.owner);
  world = await seedWorld(dbs.owner, { withSetup: true });
});
```

**Append** to `server/db/leak-matrix.integration.test.ts`:

```typescript

describe("the matrix itself, phase 1D", () => {
  it("detects a leak of the set-up tables: what Fynix may read of agreements, acceptances, shares, hosts, hours, blocks and the hierarchy trips both forbidden lists", async () => {
    const asFynix = <T>(work: Parameters<typeof withScope<T>>[2]) => withScope(dbs.roles.leads_fynix.db, { orgId: null, userId: world.users[0]?.id ?? USER }, work);
    const everything = JSON.stringify([
      await asFynix((tx) => tx.select({ rules: agreement.rules, notes: agreement.notes }).from(agreement)),
      await asFynix((tx) => tx.select({ address: agreementAcceptance.networkAddress }).from(agreementAcceptance)),
      await asFynix((tx) => tx.select({ agency: campaignShare.agencyOrgId }).from(campaignShare)),
      await asFynix((tx) => tx.select({ title: campaignHost.jobTitle }).from(campaignHost)),
      await asFynix((tx) => tx.select({ zone: hostHours.timeZone }).from(hostHours)),
      await asFynix((tx) => tx.select({ note: hostBlock.note }).from(hostBlock)),
      await asFynix((tx) => tx.select({ id: organisation.id, ref: organisation.publicRef, name: organisation.name, parent: organisation.parentOrgId }).from(organisation)),
    ]);
    const setup = world.setup;
    if (setup === null) throw new Error("The seed world has no phase 1D rows");
    for (const viewer of [{ role: "leads_client", organisation: world.kestrel }, { role: "leads_agency", organisation: world.brightpath }] as const) {
      const leaks = findLeaks(everything, forbiddenTokens(viewer, world));
      for (const expected of [...setup.markers, setup.partner.name, setup.partner.publicRef, setup.partner.id]) expect(leaks, expected).toContain(expected);
    }
  });

  it("the seed holds a partner agency under Brightpath, and the set-up rows belong to the first campaign", async () => {
    const setup = world.setup;
    if (setup === null) throw new Error("The seed world has no phase 1D rows");
    const [row] = await dbs.owner.db.select({ parent: organisation.parentOrgId }).from(organisation).where(eq(organisation.id, setup.partner.id));
    expect(row?.parent).toBe(world.brightpath.id);
    expect(await dbs.owner.db.select({ id: agreement.id }).from(agreement)).toHaveLength(2);
    expect(await dbs.owner.db.select({ id: campaignShare.id }).from(campaignShare)).toHaveLength(1);
  });
});
```

**Edit:** `server/db/leak-matrix.integration.test.ts` (the second test above uses `eq`)

Replace:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";
```

With:

```typescript
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";
```

- [ ] **Step 4: A structure test that names every new column and table**

**Append** to `server/db/structure.integration.test.ts`:

```typescript

describe("phase 1D: nothing new is visible to a tenant role", () => {
  const NEW_TABLES = ["agreement", "agreement_acceptance", "campaign_share", "campaign_host", "host_hours", "host_block"] as const;

  it.each(TENANT_ROLES)("%s holds no privilege of any kind on the six set-up tables", async (role) => {
    for (const table of NEW_TABLES) {
      expect(await grantedColumns(dbs.owner.db, role, table), `${role} reads ${table}`).toEqual([]);
      const writes = await dbs.owner.db.execute<{ allowed: boolean }>(
        sql.raw(`select has_any_column_privilege('${role}', 'public.${table}', 'INSERT') or has_any_column_privilege('${role}', 'public.${table}', 'UPDATE') or has_table_privilege('${role}', 'public.${table}', 'DELETE') as allowed`),
      );
      expect(writes.rows, `${role} writes ${table}`).toEqual([{ allowed: false }]);
    }
  });

  it.each(TENANT_ROLES)("%s still reads exactly the phase 1A columns of organisation and campaign: the parent and the settings are hidden", async (role) => {
    expect(await grantedColumns(dbs.owner.db, role, "organisation")).toEqual(["public_ref", "kind", "name", "brand_name"]);
    const campaignColumns = await grantedColumns(dbs.owner.db, role, "campaign");
    expect(campaignColumns).toEqual(["id", "public_ref", "name", "client_brand_name", "status", "start_date", "end_date", "monthly_target", "total_target"]);
    for (const hidden of ["time_zone", "meeting_minutes"]) expect(campaignColumns).not.toContain(hidden);
  });

  it("the Fynix role may write the new columns of organisation and campaign, which it holds table level grants on", async () => {
    for (const [table, column] of [["organisation", "parent_org_id"], ["campaign", "time_zone"], ["campaign", "meeting_minutes"]] as const) {
      const allowed = await dbs.owner.db.execute<{ allowed: boolean }>(sql.raw(`select has_column_privilege('leads_fynix', 'public.${table}', '${column}', 'UPDATE') as allowed`));
      expect(allowed.rows, `${table}.${column}`).toEqual([{ allowed: true }]);
    }
  });

  it("every phase 1D table is in the access matrix with Fynix as its only role", () => {
    for (const table of NEW_TABLES) expect(EXPECTED_ACCESS[table], table).toEqual(["leads_fynix"]);
  });
});
```

- [ ] **Step 5: Run it**

```bash
pnpm test:integration server/db
pnpm typecheck
pnpm lint
```

Expected: every database test passes. The new probes run for both tenant roles and both organisations of each kind (about 90 new cases) and are denied with a plain permission error that names no value; the "matrix itself" tests prove the forbidden list would catch a leak of each new table. The probes cannot be seen failing before the grants exist (a missing table is a different error, and every table is already migrated), so the proof that they can fail is the "matrix itself" tests above: they run the same search over what Fynix is allowed to read and find every marker.

- [ ] **Step 6: Commit**

```bash
git add server/db
git commit -m "Cover the organisation hierarchy, the campaign settings and the six set-up tables in the structure and leak tests"
```

---

## Task 15: Boundaries, documentation and the final checks

**Files:** modify `server/domain/boundaries.test.ts`, `CLAUDE.md`.

- [ ] **Step 1: The boundary test names the new services**

**Edit:** `server/domain/boundaries.test.ts`

Replace:

```typescript
    for (const path of ["organisations", "campaigns", "invites", "members", "terms"]) expect(read(`server/domain/${path}.ts`), path).toContain("fynixWrite(");
```

With:

```typescript
    for (const path of ["organisations", "campaigns", "invites", "members", "terms", "suppliers", "agreements", "shares", "hosts", "availability"]) expect(read(`server/domain/${path}.ts`), path).toContain("fynixWrite(");
```

- [ ] **Step 2: Write the rules down in `CLAUDE.md`**

**Edit:** `CLAUDE.md`

Replace:

```
and the domain behind the admin screens (1C, `server/domain/`, `server/mail/`).
```

With:

```
the domain behind the admin screens (1C, `server/domain/`, `server/mail/`) and the Fynix set-up of suppliers, agreements, shares, hosts and their hours (1D, `server/domain/`).
```

**Edit:** `CLAUDE.md`

Replace:

```
- **Nothing is deleted.** Organisations and campaigns are archived by status, invites are revoked, terms are superseded, members are suspended.
```

With:

```
- **Only a Fynix admin changes set-up** (rules in `docs/superpowers/plans/2026-11-13-phase-1d-fynix-setup.md`). Admin is `member.role = 'manager'` in the Fynix organisation, staff is `member`. `fynixWrite` refuses staff with `admin-required`, and a statement trigger (`fynix_admin_required`, migration 0029) on every table Fynix can write, except `audit_log` and `email_outbox`, refuses them in the database too; a structural test fails for a new Fynix writable table without it. `fynixRead` is open to staff. Staff work on leads (phase 2) needs its own entry point and tables without the trigger.
- **Hierarchy and set-up tables (1D):** a supplier is an agency with no parent (`organisation.parent_org_id` null), a partner agency is an agency whose parent is a supplier, two levels at most, all enforced by constraints and triggers. `campaign.agency_org_id` is the supplier, and the database refuses a partner agency there. `campaign_share` goes to the supplier or one of its partner agencies; `campaign_host` is a member of the campaign's client, pinned by composite foreign keys; `agreement` versions are never edited, only superseded (the first agreement is per campaign and party). None of `agreement`, `agreement_acceptance`, `campaign_share`, `campaign_host`, `host_hours`, `host_block` or the new `organisation` and `campaign` columns has a tenant grant until phase 1E; each is in the access matrix and the leak matrix.
- **Nothing is deleted,** with three exceptions that are settings, not records: `campaign_share`, `host_hours` and `host_block` rows are removed when a share, a weekly set of hours or a blocked time is removed, and the audit row keeps what they were. Organisations and campaigns are archived by status, invites are revoked, terms and agreements are superseded, hosts are deactivated, members are suspended.
```

Keep the rest of that bullet (the sentence about audit snapshots) as it is: the Edit above replaces only the first sentence's text, and the second sentence ("Audit snapshots (`server/domain/snapshots.ts`) never hold a token, a hash, a link or a password.") stays on the same line after it. Check the result reads as one bullet per rule and that `CLAUDE.md` still has no em or en dash.

- [ ] **Step 3: Check that nothing this phase wrote uses an em or en dash**

```bash
git diff --name-only d5a8cca -- lib server CLAUDE.md | xargs perl -CSD -ne 'print "$ARGV:$.: $_" if /[\x{2013}\x{2014}]/'
echo "scan finished"
```

Expected: only `scan finished` is printed. A listed line is one this phase wrote or touched: reword it with a colon, a comma or a full stop. (`d5a8cca` is the commit this plan was written on; if the branch has moved, use the commit before the Task 1 commit.)

- [ ] **Step 4: The full set of checks**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm db:generate
git status --short
```

Expected: lint prints nothing; typecheck is clean; `pnpm test` passes (the 1C unit tests plus the three new `lib/domain` files and the extended `inputs` and `boundaries` tests); `pnpm test:integration` migrates `fynix_leads_test` to `0029` and passes every file; `pnpm build` succeeds (this phase adds no route, so the build output is unchanged); `pnpm db:generate` prints `No schema changes, nothing to migrate`; `git status` lists only this task's two files.

- [ ] **Step 5: Commit**

```bash
git add server/domain/boundaries.test.ts CLAUDE.md
git commit -m "Name the phase 1D services in the boundary test and write the set-up rules down"
```

- [ ] **Step 6: Report the checks**

When reporting the phase done, state the results in the form the owner's standing rule asks for, for example: `lint ✓ · typecheck ✓ · tests ✓ · integration ✓ · build ✓`, and say that `pnpm db:migrate` (which applies `0019` to `0029` to the development database) has not been run unless the owner asked for it.

---

## Self-review

| Scope item | Where it is proved |
|---|---|
| Hierarchy: nullable `parent_org_id`, supplier and partner agency, two levels, never self, only an agency, parent an agency with no parent, composite foreign key plus trigger, including an update that would give a parent to an organisation that has children or is a campaign's supplier | Task 3 (`organisation-hierarchy.integration.test.ts`), Task 5 (shares block a change of parent), Task 9 (`createSupplier`, `createPartnerAgency`, `listSuppliers`) |
| Fynix roles: admin is `manager`, staff is `member`; every set-up write needs an admin; a specific `DomainError` for staff; applied to the 1C functions and their tests; database side guarantee kept | Task 2 (seed), Task 8 (`fynixWrite`, trigger `fynix_admin_required`, `admin-only.integration.test.ts` for every 1C function, `fynix-admin.integration.test.ts`), and a staff case in every new service test (Tasks 9 to 13) |
| Campaign: `agency_org_id` means the supplier (trigger); `time_zone` validated as an IANA zone by the domain; `meeting_minutes` 15 to 240; additive | Task 1 (`isIanaTimeZone`), Task 3 (columns, checks, trigger), Task 9 (service and inputs) |
| `agreement` and `agreement_acceptance`: party enum, versions from 1, targets, dispute window default 48, rules, notes, one current per campaign and party, created by a member, never edited | Task 4 (schema, grants, revival trigger), Task 10 (service) |
| `campaign_share`: supplier or partner (trigger), `monthly_share >= 0`, unique, over-allocation allowed and flagged | Task 5, Task 11 |
| `campaign_host`: a member of the campaign's client (enforced), job title, active, unique | Task 6, Task 12 |
| `host_hours`: client member, time zone, weekday 0 to 6, start and end minutes, several per day, no overlap | Task 7 (constraints and trigger), Task 13 (`findHoursProblem`, replace the set) |
| `host_block`: client member, instants with end after start, note | Task 7, Task 13 |
| Every new table: RLS on, Fynix grants following the patterns, no tenant grants, said so in comments | Tasks 4 to 7 (grants migrations 0022, 0024, 0026, 0028), access matrix entries, Task 14 structure test |
| Domain functions, each audited like 1C: create supplier, create partner, list suppliers; create and update campaign; publish agreement and read current plus history; record an acceptance; set and remove a share (flag); add and deactivate a host; set hours (replace); add and remove a block; role-shaped reads only | Tasks 9 to 13 |
| Structure and leak-matrix coverage of every new table and column | Tasks 4 to 8 (matrix, grants, audit and admin triggers by catalog check), Task 14 (probes, forbidden tokens, seed rows, "matrix itself" tests, tenant column test) |
| Out of scope respected: no UI, no route, no supplier specific terms, no tenant grants, no alias identities, no leads, meetings, messaging, no `agency_alias` change | Nothing in the file map touches `app/`, `components/`, terms, `agency_alias` or a tenant grant |

Placeholders: none. Every code block above is complete and was written against the code as it stands on `development` (`server/domain/*`, `server/db/*` as of commit `d5a8cca`). The commands that run the database tests need the dev machine's `.env.local` and the six roles from 1A, as in 1C.

## Open questions for the owner

1. **Should Fynix staff be able to read everything set-up, or only some of it?** The plan lets staff read (`fynixRead`, `listSuppliers`, `readAgreements`, `listCampaignShares`), including agreement targets and rules, since they work leads, meetings and disputes against them. If staff must not see the targets, those reads need an admin check too.
2. **Who accepts an agreement in 1D?** The plan lets a Fynix admin record the acceptance for a named client or supplier manager (S11), with `recorded by Fynix` as the address. If you would rather there be no way to record an acceptance until the signer can do it themselves in 1E, drop `recordAgreementAcceptance` and keep the table.
3. **Can Fynix invite users into a partner agency?** Spec 6 says the supplier manager invites partner agencies and their users, and 1E builds that. `issueInvite` from 1C is unchanged and still accepts any active agency organisation, including a partner agency. Say if Fynix should be refused for partner agencies until 1E.
4. **Over-allocation compares with the supplier agreement, not with `campaign.monthly_target`.** With no supplier agreement yet the flag is off (S7). If you want the flag to fall back to the campaign's own monthly target, say so.
5. **Weekday numbering** is 0 = Sunday (S9). If the screens and the spec's examples will use Monday first, the numbers do not change, only the labels, but decide before the host hours screen is drawn.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-11-13-phase-1d-fynix-setup.md`. Two ways to run it:

1. **Subagent-driven (recommended):** a fresh subagent per task, review between tasks. Tasks 3 to 8 change the database and must run in order; Tasks 9 to 13 depend on Task 8 and on each other only through the schema (suppliers first, because the share and campaign tests create partner agencies; agreements before shares, because the over-allocation test publishes a supplier agreement).
2. **Inline execution:** run the tasks in this session in order with a check after each commit.

Either way: a failing test that was meant to pass is a stop, not a reason to change the test.
