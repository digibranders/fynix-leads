# Free time data layer: implementation plan (calendar step C)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans to work through this plan task by task, in this session. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use parallel subagents or a worktree: the machine rules allow one worker at a time.

**Goal:** Everything the calendar needs to know about when people are free, with no screen yet: one tested function that says whether a slot is free, a table for invitations, and one read that gives every audience each person's name, working hours and busy time, and nothing else.

**Architecture:** A pure function in `lib/calendar/` decides if a slot is free from a person's hours, their busy time and the minimum notice. A new table `meeting_attendee` holds invitations. Two `SECURITY DEFINER` functions (`app_team_people`, `app_team_busy`) hand back names and bare start and end times for the people of one client, to the client itself, to an agency that serves it and to Fynix. A domain read assembles them with each person's hours.

**Tech stack:** TypeScript strict, PostgreSQL 16 with Drizzle and hand-written SQL migrations, zod, Vitest. Spec: `docs/superpowers/specs/2026-11-26-calendar-and-meetings-design.md`, sections 5.1, 6, 9 and 13. Step B (the client team) is already built and committed.

---

## Read this first

**What this step delivers.** Data and rules only. No page, no booking, no email. Nothing writes an invitation yet: step E does. The tests insert rows as the database owner.

**What is in the busy time.** For each person of the client, as plain start and end times, with no sign of what they are:

1. blocked times the person typed (`host_block`)
2. meetings that are scheduled and have that person as the chosen person (`meeting.host_member_id`)
3. invitations that are open: the person was invited, has not answered and the reply deadline has not passed
4. invitations the person accepted

Synced Google and Outlook time is added in step F, by replacing the function (`CREATE OR REPLACE`). Another agency's meeting, a typed block and an open invitation all look the same to every reader, so nobody can tell them apart.

**Left for later steps.**

| Item | Step |
|---|---|
| The calendar pages and the lists of meetings by date range, which show meeting details | D |
| Writing invitations, the first-accept rule, the `awaiting_reply` stage, nullable `meeting.host_member_id` | E |
| Synced calendar time (`member_busy`, `calendar_connection`) | F |
| Tenant grants on `meeting_attendee` and on the two new meeting columns | E, when a screen reads them |

**Repo rules that override the usual plan habits.**

- **No commit per task.** One commit at the end, on the owner's word. Do not commit this plan either.
- **Checks stay small.** Lint, typecheck and the tests of the files a task changed, on one worker. Unit: `pnpm exec vitest run --maxWorkers=1 <path>`. Integration: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 <path>`. Do **not** use `pnpm test:integration -- <path>`: it ignores the path and runs everything. One `pnpm build` at the very end.
- **Migrations are additive.** Nothing is dropped or renamed.
- **A new table is four changes:** the schema, a hand-written grants migration with row-level security, the leak matrix, and the access list in `server/db/structure.integration.test.ts`.
- **Tenant reads name their columns.** No `select()` with no columns.
- **Words:** sentence case, no dashes other than a hyphen, "client team member" and never "host" in anything a person reads.
- **Dev server:** `pnpm dev` serves http://localhost:3020. Reuse a running one. Never stop a server.

## File map

| File | What happens |
|---|---|
| `lib/calendar/free-time.ts`, `lib/calendar/free-time.test.ts` (new) | The free-slot rules, pure and tested |
| `server/db/schema/meeting-attendee.ts` (new), `server/db/schema/meeting.ts`, `server/db/schema/index.ts` | The invitation table and two nullable meeting columns |
| `server/db/migrations/0097_*.sql` (generated), `0098_meeting_attendee_grants.sql` (new, hand-written) | Table, columns, row-level security, the three functions |
| `server/db/structure.integration.test.ts` | Access list entry for the new table |
| `server/db/testing/leak-matrix.ts`, `server/db/leak-matrix.integration.test.ts` | Probes, two read paths, an allowed-names rule for those paths |
| `server/domain/inputs.ts` | `teamTimeSchema` |
| `server/domain/team-availability.ts`, `server/domain/team-availability.integration.test.ts` (new) | The read for tenants and for Fynix |
| `docs/superpowers/specs/2026-11-26-calendar-and-meetings-design.md`, `CLAUDE.md` | Notes |

---

### Task 1: The free-slot rules

**Files:**
- Create: `lib/calendar/free-time.ts`
- Test: `lib/calendar/free-time.test.ts`

The rules are the ones in section 6 of the spec. A slot is free for a person when it starts at least 48 hours from now, both its first and its last minute fall inside the person's working hours, it does not overlap a blocked time and it does not overlap any busy time. Working hours, the zone and the default week come from `withDefaultHours` in `lib/leads/host-hours.ts`.

- [ ] **Step 1: Write the failing tests.** Create `lib/calendar/free-time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { withDefaultHours } from "@/lib/leads/host-hours";
import { assertRange, freePeopleAt, freeSlotStarts, isSlotFree, mergeIntervals, type Interval, type PersonTime } from "./free-time";

const at = (iso: string): Date => new Date(iso);
const slot = (from: string, to: string): Interval => ({ start: at(from), end: at(to) });
const standardWeek = withDefaultHours({ timeZone: null, hours: [], blocks: [] }, "Europe/London");
const person = (over: Partial<PersonTime> = {}): PersonTime => ({ availability: standardWeek, busy: [], ...over });
// A Tuesday. The earliest bookable moment is 48 hours later: Thursday 2026-12-03 at 09:00 UTC. London is on UTC in December.
const NOW = at("2026-12-01T09:00:00Z");

describe("mergeIntervals", () => {
  it("sorts, joins overlapping and touching intervals and drops empty ones", () => {
    const merged = mergeIntervals([slot("2026-12-03T11:00:00Z", "2026-12-03T12:00:00Z"), slot("2026-12-03T09:00:00Z", "2026-12-03T10:00:00Z"), slot("2026-12-03T09:30:00Z", "2026-12-03T10:30:00Z"), slot("2026-12-03T10:30:00Z", "2026-12-03T10:45:00Z"), slot("2026-12-03T13:00:00Z", "2026-12-03T13:00:00Z")]);
    expect(merged.map((item) => [item.start.toISOString(), item.end.toISOString()])).toEqual([
      ["2026-12-03T09:00:00.000Z", "2026-12-03T10:45:00.000Z"],
      ["2026-12-03T11:00:00.000Z", "2026-12-03T12:00:00.000Z"],
    ]);
  });
});

describe("assertRange", () => {
  it("accepts up to 62 days and refuses more, an empty range and a backwards one", () => {
    expect(() => assertRange(slot("2026-12-01T00:00:00Z", "2027-02-01T00:00:00Z"))).not.toThrow();
    expect(() => assertRange(slot("2026-12-01T00:00:00Z", "2027-02-02T00:00:00Z"))).toThrow(RangeError);
    expect(() => assertRange(slot("2026-12-01T00:00:00Z", "2026-12-01T00:00:00Z"))).toThrow(RangeError);
    expect(() => assertRange(slot("2026-12-02T00:00:00Z", "2026-12-01T00:00:00Z"))).toThrow(RangeError);
  });
});

describe("isSlotFree", () => {
  it("is free inside working hours once the notice has passed", () => {
    expect(isSlotFree(slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z"), person(), NOW)).toBe(true);
  });

  it("is not free sooner than 48 hours from now", () => {
    expect(isSlotFree(slot("2026-12-02T10:00:00Z", "2026-12-02T10:30:00Z"), person(), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T09:00:00Z", "2026-12-03T09:30:00Z"), person(), NOW)).toBe(true);
  });

  it("is not free when it starts before the hours begin or runs past the hours end", () => {
    expect(isSlotFree(slot("2026-12-03T08:30:00Z", "2026-12-03T09:00:00Z"), person(), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T16:45:00Z", "2026-12-03T17:15:00Z"), person(), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T16:30:00Z", "2026-12-03T17:00:00Z"), person(), NOW)).toBe(true);
  });

  it("is not free on a day off", () => {
    expect(isSlotFree(slot("2026-12-05T10:00:00Z", "2026-12-05T10:30:00Z"), person(), NOW)).toBe(false);
  });

  it("is not free when it overlaps busy time, but touching it is fine", () => {
    const busy = [slot("2026-12-03T10:15:00Z", "2026-12-03T10:45:00Z")];
    expect(isSlotFree(slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z"), person({ busy }), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T10:30:00Z", "2026-12-03T11:00:00Z"), person({ busy }), NOW)).toBe(false);
    expect(isSlotFree(slot("2026-12-03T10:45:00Z", "2026-12-03T11:15:00Z"), person({ busy }), NOW)).toBe(true);
    expect(isSlotFree(slot("2026-12-03T09:30:00Z", "2026-12-03T10:15:00Z"), person({ busy }), NOW)).toBe(true);
  });

  it("is not free when a blocked time falls in the middle of it", () => {
    const blocked = { ...standardWeek, blocks: [{ startsAt: at("2026-12-03T10:10:00Z"), endsAt: at("2026-12-03T10:20:00Z") }] };
    expect(isSlotFree(slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z"), person({ availability: blocked }), NOW)).toBe(false);
  });

  it("reads the hours in the person's zone across the day the clocks change", () => {
    const now = at("2027-03-20T00:00:00Z");
    // London moves to summer time on 2027-03-28, so on Monday the 29th 09:00 local is 08:00 UTC.
    expect(isSlotFree(slot("2027-03-29T08:00:00Z", "2027-03-29T08:30:00Z"), person(), now)).toBe(true);
    expect(isSlotFree(slot("2027-03-29T07:30:00Z", "2027-03-29T08:00:00Z"), person(), now)).toBe(false);
    expect(isSlotFree(slot("2027-03-29T15:30:00Z", "2027-03-29T16:00:00Z"), person(), now)).toBe(true);
    expect(isSlotFree(slot("2027-03-29T16:00:00Z", "2027-03-29T16:30:00Z"), person(), now)).toBe(false);
  });
});

describe("freeSlotStarts", () => {
  const thursday = slot("2026-12-03T00:00:00Z", "2026-12-04T00:00:00Z");

  it("lists every half hour of a working day, from 09:00 to 16:30", () => {
    const starts = freeSlotStarts(thursday, 30, person(), NOW);
    expect(starts).toHaveLength(16);
    expect(starts[0]?.toISOString()).toBe("2026-12-03T09:00:00.000Z");
    expect(starts[15]?.toISOString()).toBe("2026-12-03T16:30:00.000Z");
  });

  it("leaves out the half hours that touch busy time", () => {
    const starts = freeSlotStarts(thursday, 30, person({ busy: [slot("2026-12-03T12:00:00Z", "2026-12-03T13:00:00Z")] }), NOW);
    expect(starts).toHaveLength(14);
    expect(starts.map((start) => start.toISOString())).not.toContain("2026-12-03T12:00:00.000Z");
    expect(starts.map((start) => start.toISOString())).not.toContain("2026-12-03T12:30:00.000Z");
    expect(starts.map((start) => start.toISOString())).toContain("2026-12-03T13:00:00.000Z");
  });

  it("starts at the notice limit when the range begins sooner", () => {
    const friday = slot("2026-12-04T00:00:00Z", "2026-12-05T00:00:00Z");
    const starts = freeSlotStarts(friday, 30, person(), at("2026-12-02T12:00:00Z"));
    expect(starts[0]?.toISOString()).toBe("2026-12-04T12:00:00.000Z");
  });

  it("refuses a range over 62 days", () => {
    expect(() => freeSlotStarts(slot("2026-12-01T00:00:00Z", "2027-02-02T00:00:00Z"), 30, person(), NOW)).toThrow(RangeError);
  });
});

describe("freePeopleAt", () => {
  it("returns the people who are free then", () => {
    const people = [
      { memberId: "a", ...person({ busy: [slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z")] }) },
      { memberId: "b", ...person() },
    ];
    expect(freePeopleAt(slot("2026-12-03T10:00:00Z", "2026-12-03T10:30:00Z"), people, NOW)).toEqual(["b"]);
    expect(freePeopleAt(slot("2026-12-03T11:00:00Z", "2026-12-03T11:30:00Z"), people, NOW)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `pnpm exec vitest run --maxWorkers=1 lib/calendar/free-time.test.ts`
Expected: FAIL, the module `./free-time` cannot be found.

- [ ] **Step 3: Write the code.** Create `lib/calendar/free-time.ts`:

```ts
import { isOutsideHostHours, type HostAvailability } from "@/lib/leads/host-hours";

/** A stretch of time. The end is not part of it, so two intervals that touch do not overlap. */
export interface Interval {
  readonly start: Date;
  readonly end: Date;
}

/** A booking must start at least this long from now, so an invited person always has a full day to accept (owner decision, 2026-11-26). */
export const MIN_NOTICE_HOURS = 48;
/** The most a calendar read covers. */
export const MAX_RANGE_DAYS = 62;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** One person's time: their working hours (run through `withDefaultHours` first) and everything else that makes them busy, with no reason attached. */
export interface PersonTime {
  readonly availability: HostAvailability;
  readonly busy: readonly Interval[];
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Sorts, drops empty intervals and joins those that overlap or touch. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((item) => item.end > item.start).map((item) => ({ start: item.start, end: item.end })).sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last === undefined || item.start > last.end) merged.push(item);
    else if (item.end > last.end) merged[merged.length - 1] = { start: last.start, end: item.end };
  }
  return merged;
}

/** Throws a `RangeError` for an empty or backwards range, or one longer than 62 days. */
export function assertRange(range: Interval): void {
  if (!(range.end > range.start)) throw new RangeError("The end of a range must be after its start.");
  if (range.end.getTime() - range.start.getTime() > MAX_RANGE_DAYS * DAY) throw new RangeError(`A range covers at most ${MAX_RANGE_DAYS} days.`);
}

/** The earliest moment a meeting can start. */
export function earliestBookable(now: Date): Date {
  return new Date(now.getTime() + MIN_NOTICE_HOURS * HOUR);
}

/**
 * Whether one person is free for a slot: it starts after the notice, it lies inside their working hours, no blocked time or busy time overlaps it.
 * shortcut: only the first and the last minute are checked against the hours, so a slot longer than the gap in a split day would pass. Meetings are 30 to 60
 * minutes. Revisit if a campaign allows a longer meeting.
 */
export function isSlotFree(slot: Interval, person: PersonTime, now: Date): boolean {
  if (slot.start < earliestBookable(now)) return false;
  const lastMinute = new Date(slot.end.getTime() - MINUTE);
  if (isOutsideHostHours(slot.start, person.availability) || isOutsideHostHours(lastMinute, person.availability)) return false;
  if (person.availability.blocks.some((block) => overlaps(slot, { start: block.startsAt, end: block.endsAt }))) return false;
  return !person.busy.some((busy) => overlaps(slot, busy));
}

/**
 * The start of every free slot in a range, on the half hour by default. Slots line up on whole half hours of UTC.
 * shortcut: a zone that is 45 minutes off UTC (Nepal) sees its slots at :15 and :45 local, which is still correct but odd. Revisit if such a client appears.
 */
export function freeSlotStarts(range: Interval, durationMinutes: number, person: PersonTime, now: Date, stepMinutes = 30): Date[] {
  assertRange(range);
  const step = stepMinutes * MINUTE;
  const length = durationMinutes * MINUTE;
  const starts: Date[] = [];
  for (let at = Math.ceil(range.start.getTime() / step) * step; at + length <= range.end.getTime(); at += step) {
    const candidate = { start: new Date(at), end: new Date(at + length) };
    if (isSlotFree(candidate, person, now)) starts.push(candidate.start);
  }
  return starts;
}

/** The ids of the people who are free for a slot, in the order given. */
export function freePeopleAt(slot: Interval, people: readonly (PersonTime & { readonly memberId: string })[], now: Date): string[] {
  return people.filter((person) => isSlotFree(slot, person, now)).map((person) => person.memberId);
}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `pnpm exec vitest run --maxWorkers=1 lib/calendar/free-time.test.ts`
Expected: PASS, 12 tests.

If the daylight saving test fails, check that `isOutsideHostHours` reads the minute in the person's zone (it does today, `localParts` in `lib/leads/host-hours.ts`). Do not change that file to make a test pass: fix the test's expected time instead if the dates are wrong.

---

### Task 2: The invitation table and two meeting columns

**Files:**
- Create: `server/db/schema/meeting-attendee.ts`
- Modify: `server/db/schema/meeting.ts`, `server/db/schema/index.ts`
- Create (generated): `server/db/migrations/0097_*.sql`

- [ ] **Step 1: Write the table.** Create `server/db/schema/meeting-attendee.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organisationKind } from "./enums";
import { meeting } from "./meeting";
import { member } from "./member";

export const MEETING_REPLIES = ["invited", "accepted", "declined", "released"] as const;
export type MeetingReply = (typeof MEETING_REPLIES)[number];

/**
 * A client person invited to a meeting (calendar spec of 2026-11-26). `invited` holds their time until they answer or the meeting's `reply_due_at` passes,
 * `accepted` and `declined` are their answers, `released` means someone else accepted first and they no longer need to reply. Pinned to a member of a client by
 * the same composite key the hours tables use. Nothing writes it until booking is built (step E), and no runtime role reads it: the database functions that
 * report busy time are the only way in.
 */
export const meetingAttendee = pgTable(
  "meeting_attendee",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id").notNull(),
    memberId: uuid("member_id").notNull(),
    memberOrgKind: organisationKind("member_org_kind").notNull().generatedAlwaysAs(sql`'client'::organisation_kind`),
    reply: text("reply").notNull().default("invited"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    /** SHA-256 of the one reply link in the invitation email. Only the hash is kept. Used from step E. */
    replyTokenHash: text("reply_token_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "meeting_attendee_meeting_fk", columns: [table.meetingId], foreignColumns: [meeting.id] }).onDelete("cascade"),
    foreignKey({ name: "meeting_attendee_member_fk", columns: [table.memberId, table.memberOrgKind], foreignColumns: [member.id, member.orgKind] }),
    unique("meeting_attendee_meeting_member_unique").on(table.meetingId, table.memberId),
    unique("meeting_attendee_token_unique").on(table.replyTokenHash),
    index("meeting_attendee_member_idx").on(table.memberId, table.meetingId),
    check("meeting_attendee_reply_check", sql`${table.reply} IN ('invited', 'accepted', 'declined', 'released')`),
    check("meeting_attendee_replied_check", sql`(${table.reply} = 'invited' AND ${table.repliedAt} IS NULL) OR (${table.reply} <> 'invited' AND ${table.repliedAt} IS NOT NULL)`),
  ],
);
```

- [ ] **Step 2: Add the two meeting columns.** In `server/db/schema/meeting.ts`, after the `joinImportedAt` column, add:

```ts
    // When the first invited person accepted, and the time by which someone must (24 hours before the meeting). Both stay empty until booking is built (step E).
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    replyDueAt: timestamp("reply_due_at", { withTimezone: true }),
```

In `server/db/schema/index.ts`, after the line `export * from "./meeting-join";`, add:

```ts
export * from "./meeting-attendee";
```

- [ ] **Step 3: Generate the migration.**

Run: `pnpm db:generate --name=meeting_attendee`
Expected: a new `server/db/migrations/0097_meeting_attendee.sql` that creates `meeting_attendee` and adds `confirmed_at` and `reply_due_at` to `meeting`, plus an updated journal and a snapshot.

Open the SQL and check it contains only those changes. If it contains anything else, stop and find out why before going on.

- [ ] **Step 4: Typecheck.**

Run: `pnpm typecheck`
Expected: no errors.

---

### Task 3: Row-level security and the three functions

**Files:**
- Create: `server/db/migrations/0098_meeting_attendee_grants.sql` (hand-written)
- Modify: `server/db/structure.integration.test.ts`, `server/db/testing/leak-matrix.ts`

- [ ] **Step 1: Write the failing probes and the access entry first.**

In `server/db/structure.integration.test.ts`, in the access list, directly after the `meeting_join` line, add:

```ts
  // Calendar step C: invitations to a meeting. No runtime role touches the table; the SECURITY DEFINER functions of 0098 are the only way in and out.
  meeting_attendee: [],
```

In `server/db/testing/leak-matrix.ts`, directly after the two probes for `app_agency_serves_member` that step B added, add:

```ts
  { name: "invitations to meetings, every column", statement: "select * from meeting_attendee", expectedError: DENIED_TABLE },
  { name: "invitations: who was invited", statement: "select member_id from meeting_attendee", expectedError: DENIED_TABLE },
  { name: "invitations: the reply link hash", statement: "select reply_token_hash from meeting_attendee", expectedError: DENIED_TABLE },
  { name: "write: invite someone to a meeting", statement: "insert into meeting_attendee (meeting_id, member_id) values (gen_random_uuid(), gen_random_uuid())", expectedError: DENIED_TABLE },
  { name: "write: change a reply", statement: "update meeting_attendee set reply = 'accepted'", expectedError: DENIED_TABLE },
  { name: "meeting: when someone must reply", statement: "select reply_due_at from meeting", expectedError: DENIED_TABLE },
  { name: "meeting: when it was confirmed", statement: "select confirmed_at from meeting", expectedError: DENIED_TABLE },
  { name: "who may read a client's team, as nobody in particular", statement: "select app_may_read_team(gen_random_uuid())", expectedError: /permission denied for function app_may_read_team/ },
```

The last probe has no `roles` field, so it runs as both tenant roles. Both are refused: `app_may_read_team` is granted to nobody but the other two functions use it from inside.

- [ ] **Step 2: Run them and see them fail.**

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/db/structure.integration.test.ts`
Expected: FAIL. The table has no row-level security yet.

- [ ] **Step 3: Create the migration file.**

Run: `pnpm db:generate --custom --name=meeting_attendee_grants`
Expected: an empty `server/db/migrations/0098_meeting_attendee_grants.sql`.

- [ ] **Step 4: Write the SQL.** Replace its content with:

```sql
-- Calendar step C: invitations to a meeting and the reads of who is free. Additive.

-- 1. The table. No runtime role holds a grant: the functions below (owned by the owner role, which has the one policy) are the only way in and out.
ALTER TABLE "meeting_attendee" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "meeting_attendee" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "meeting_attendee" TO leads_owner;
--> statement-breakpoint
CREATE POLICY "meeting_attendee_owner_all" ON "meeting_attendee" AS PERMISSIVE FOR ALL TO leads_owner USING (true) WITH CHECK (true);
--> statement-breakpoint

-- 2. Who may read the team of a client: the client itself, an agency that has a campaign with it (as coordinator or by a share), and Fynix.
-- Fynix connects as leads_fynix, so the login role tells it apart. Not granted to any runtime role: only the two functions below call it.
CREATE FUNCTION public.app_may_read_team(p_client uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT COALESCE(session_user::text = 'leads_fynix', false)
      OR COALESCE(public.app_current_org_id() = p_client, false)
      OR COALESCE(public.app_agency_sees_client(p_client), false)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_may_read_team(uuid) FROM PUBLIC;
--> statement-breakpoint

-- 3. The people of a client: a name and the client's time zone. Never a job title, an email or a phone. Empty for a client the caller may not read.
CREATE FUNCTION public.app_team_people(p_client uuid) RETURNS TABLE (member_id uuid, display_name text, time_zone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  SELECT m.id, m.display_name, o.time_zone
    FROM public.member m
    JOIN public.organisation o ON o.id = m.org_id
   WHERE m.org_id = p_client AND m.org_kind = 'client' AND m.status = 'active'
     AND public.app_may_read_team(p_client)
   ORDER BY m.display_name, m.id
$$;
--> statement-breakpoint

-- 4. When each person of a client is busy between two moments, as bare start and end times with nothing to say why. A blocked time, a meeting and an invitation
-- all look the same. The range is at most 62 days. Step F adds time synced from Google and Outlook by replacing this function.
CREATE FUNCTION public.app_team_busy(p_client uuid, p_from timestamp with time zone, p_to timestamp with time zone)
  RETURNS TABLE (member_id uuid, display_name text, starts_at timestamp with time zone, ends_at timestamp with time zone)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
#variable_conflict use_column
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '62 days' THEN
    RAISE EXCEPTION 'domain:invalid-input' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH people AS (
    SELECT m.id AS pid, m.display_name AS pname
      FROM public.member m
     WHERE m.org_id = p_client AND m.org_kind = 'client' AND m.status = 'active'
       AND public.app_may_read_team(p_client)
  ), spans AS (
    SELECT b.member_id AS pid, b.starts_at AS s, b.ends_at AS e
      FROM public.host_block b
    UNION ALL
    SELECT t.host_member_id, t.scheduled_start_time, t.scheduled_start_time + make_interval(mins => t.duration_minutes)
      FROM public.meeting t
     WHERE t.outcome = 'scheduled'
    UNION ALL
    SELECT a.member_id, t.scheduled_start_time, t.scheduled_start_time + make_interval(mins => t.duration_minutes)
      FROM public.meeting_attendee a
      JOIN public.meeting t ON t.id = a.meeting_id
     WHERE t.outcome = 'scheduled'
       AND (a.reply = 'accepted' OR (a.reply = 'invited' AND (t.reply_due_at IS NULL OR t.reply_due_at > now())))
  )
  SELECT DISTINCT p.pid, p.pname, x.s, x.e
    FROM people p
    JOIN spans x ON x.pid = p.pid
   WHERE x.s < p_to AND x.e > p_from
   ORDER BY p.pname, p.pid, x.s, x.e;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_team_people(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_team_busy(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_team_people(uuid) TO leads_client, leads_agency, leads_fynix;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_team_busy(uuid, timestamp with time zone, timestamp with time zone) TO leads_client, leads_agency, leads_fynix;
```

- [ ] **Step 5: Apply it and run the database tests.**

Run: `pnpm db:migrate`
Expected: "Migrations applied to the dev database."

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/db/structure.integration.test.ts`
Expected: PASS. The structure test migrates its own database: if it complains the test database is behind, run `pnpm db:migrate:test` once first and run it again.

If the structure test fails for another reason, read what it names. It checks that every table has row-level security, an owner policy and no stray grants, and that every `SECURITY DEFINER` function has `search_path` set and no public execute.

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/db/leak-matrix.integration.test.ts`
Expected: PASS, the new probes included (about two minutes).

---

### Task 4: The domain read

**Files:**
- Modify: `server/domain/inputs.ts`
- Create: `server/domain/team-availability.ts`
- Test: `server/domain/team-availability.integration.test.ts`

- [ ] **Step 1: Write the failing test.** Create `server/domain/team-availability.integration.test.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_HOURS } from "@/lib/leads/host-hours";
import { campaign, campaignShare, hostBlock, lead, meeting, meetingAttendee, member, organisation, user } from "@/server/db/schema";
import { withScope } from "@/server/db/scope";
import type { SeededCampaign, SeededOrganisation } from "@/server/db/testing/seed";
import type { TenantActor } from "@/server/domain/alias-identity";
import { readTeamTimeForFynix, readTeamTimeForTenant, type TeamMemberTime } from "@/server/domain/team-availability";
import { memberIdFor, refusal, userIn } from "@/server/domain/test-helpers";
import { openDomainRig } from "@/server/domain/testing";

/**
 * Calendar step C: who is on a client's team and when each person is busy, for the client itself, an agency that serves it and Fynix. Names, hours and bare
 * start and end times, and never what a busy time is.
 */
const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});

const DAY = 86_400_000;
const at = (days: number, hour: number, minute = 0): Date => {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
};
const iso = (date: Date): string => date.toISOString();
const window = () => ({ from: iso(at(1, 0)), to: iso(at(12, 0)) });
const actorIn = (org: SeededOrganisation, kind: "client" | "agency"): TenantActor => ({ userId: userIn(rig, org).id, orgId: org.id, orgKind: kind, role: "member" });

interface Cast {
  readonly served: SeededCampaign;
  readonly other: SeededCampaign;
  readonly agency: TenantActor;
  readonly client: TenantActor;
  readonly otherClient: TenantActor;
  readonly clientMember: string;
  readonly colleague: string;
}
let cast: Cast;
let counter = 0;

beforeEach(async () => {
  const world = await rig.reset();
  counter = 0;
  const owner = rig.dbs.owner.db;
  // Brightpath serves Kestrel and nobody else: Halden's campaign with it moves to Northgate. Shares are cleared so access can only come from the campaign itself.
  await owner.delete(campaignShare);
  const served = world.campaigns.find((row) => row.client.id === world.kestrel.id && row.agency.id === world.brightpath.id);
  const moved = world.campaigns.find((row) => row.client.id === world.halden.id && row.agency.id === world.brightpath.id);
  if (served === undefined || moved === undefined) throw new Error("The seed is missing a Brightpath campaign");
  await owner.update(campaign).set({ agencyOrgId: world.northgate.id }).where(eq(campaign.id, moved.id));
  const [colleagueUser] = await owner.insert(user).values({ email: "colleague@kestrel-calendar.example", name: "Colleague Calendar" }).returning({ id: user.id });
  const [colleague] = await owner.insert(member).values({ userId: colleagueUser?.id ?? "", orgId: world.kestrel.id, orgKind: "client", role: "member", displayName: "Colleague Calendar" }).returning({ id: member.id });
  cast = {
    served,
    other: { ...moved, agency: world.northgate },
    agency: actorIn(world.brightpath, "agency"),
    client: actorIn(world.kestrel, "client"),
    otherClient: actorIn(world.halden, "client"),
    clientMember: await memberIdFor(rig, userIn(rig, world.kestrel).id),
    colleague: colleague?.id ?? "",
  };
});

const agencyDb = () => rig.dbs.roles.leads_agency.db;
const clientDb = () => rig.dbs.roles.leads_client.db;
const read = (clientOrgId: string) => readTeamTimeForTenant(agencyDb(), cast.agency, { clientOrgId, ...window() });
const busyOf = (rows: readonly TeamMemberTime[], memberId: string): string[][] => (rows.find((row) => row.memberId === memberId)?.busy ?? []).map((span) => [iso(span.start), iso(span.end)]);

/** A scheduled meeting of the served campaign, written as the owner. The lead is unreleased so nothing but the owner reads it. */
async function bookMeeting(start: Date, over: { readonly outcome?: string; readonly replyDueAt?: Date | null } = {}): Promise<string> {
  counter += 1;
  const owner = rig.dbs.owner.db;
  const [row] = await owner
    .insert(lead)
    .values({
      campaignId: cast.served.id,
      sourceOrgId: cast.served.agency.id,
      submittedByUserId: userIn(rig, cast.served.agency).id,
      hostMemberId: cast.clientMember,
      released: false,
      publicRef: `LD-C${counter}XX`,
      prospectName: "Hidden Prospect",
      prospectTitle: "Head of Finance",
      prospectCompany: `Hidden Company ${counter}`,
      prospectDomain: `hidden${counter}.example`,
      prospectLinkedinUrl: `https://www.linkedin.com/in/hidden${counter}`,
      prospectEmail: `hidden${counter}@hidden.example`,
      bantBudget: "b",
      bantAuthority: "a",
      bantNeed: "n",
      bantTimeline: "t",
      submittedAt: new Date(),
      stage: "awaiting_client",
    })
    .returning({ id: lead.id });
  const [booked] = await owner
    .insert(meeting)
    .values({ publicRef: `MTG-C${counter}XX`, leadId: row?.id ?? "", campaignId: cast.served.id, hostMemberId: cast.clientMember, scheduledStartTime: start, outcome: over.outcome ?? "scheduled", replyDueAt: over.replyDueAt ?? null })
    .returning({ id: meeting.id });
  return booked?.id ?? "";
}

describe("the people and their hours", () => {
  it("gives an agency that serves the client every active person by name, with the default week when none has set hours", async () => {
    const rows = await read(cast.served.client.id);
    expect(rows.map((row) => row.displayName).sort()).toEqual(["Colleague Calendar", userIn(rig, cast.served.client).name].sort());
    const [org] = await rig.dbs.owner.db.select({ timeZone: organisation.timeZone }).from(organisation).where(eq(organisation.id, cast.served.client.id));
    for (const row of rows) {
      expect(row.availability.hours).toEqual(DEFAULT_HOURS);
      expect(row.availability.timeZone).toBe(org?.timeZone ?? "Europe/London");
      expect(row.busy).toEqual([]);
    }
  });

  it("leaves out a suspended person", async () => {
    await rig.dbs.owner.db.update(member).set({ status: "suspended" }).where(eq(member.id, cast.colleague));
    expect((await read(cast.served.client.id)).map((row) => row.memberId)).not.toContain(cast.colleague);
  });
});

describe("what makes a person busy", () => {
  it("counts a blocked time, a scheduled meeting and an open invitation, all as bare start and end times", async () => {
    await rig.dbs.owner.db.insert(hostBlock).values({ memberId: cast.colleague, startsAt: at(2, 9), endsAt: at(2, 10), note: "Dentist, private note" });
    await bookMeeting(at(3, 14));
    const invited = await bookMeeting(at(4, 11), { replyDueAt: at(9, 0) });
    await rig.dbs.owner.db.insert(meetingAttendee).values({ meetingId: invited, memberId: cast.colleague });
    const rows = await read(cast.served.client.id);
    expect(busyOf(rows, cast.colleague)).toEqual([[iso(at(2, 9)), iso(at(2, 10))], [iso(at(4, 11)), iso(at(4, 11, 30))]]);
    expect(busyOf(rows, cast.clientMember)).toEqual([[iso(at(3, 14)), iso(at(3, 14, 30))], [iso(at(4, 11)), iso(at(4, 11, 30))]]);
  });

  it.each([
    ["an invitation still waiting, before its deadline", "invited", 9, true],
    ["an invitation whose deadline has passed", "invited", -1, false],
    ["an accepted invitation, even after the deadline", "accepted", -1, true],
    ["a declined invitation", "declined", 9, false],
    ["a released invitation", "released", 9, false],
  ] as const)("%s", async (_label, reply, dueInDays, busy) => {
    const meetingId = await bookMeeting(at(5, 10), { replyDueAt: at(dueInDays, 0) });
    await rig.dbs.owner.db.insert(meetingAttendee).values({ meetingId, memberId: cast.colleague, reply, repliedAt: reply === "invited" ? null : new Date() });
    const rows = await read(cast.served.client.id);
    expect(busyOf(rows, cast.colleague)).toEqual(busy ? [[iso(at(5, 10)), iso(at(5, 10, 30))]] : []);
  });

  it("does not count a meeting that was cancelled, held or moved", async () => {
    for (const outcome of ["cancelled", "held", "rescheduled"]) {
      const meetingId = await bookMeeting(at(6, 10), { outcome });
      await rig.dbs.owner.db.insert(meetingAttendee).values({ meetingId, memberId: cast.colleague, reply: "accepted", repliedAt: new Date() });
    }
    const rows = await read(cast.served.client.id);
    expect(busyOf(rows, cast.colleague)).toEqual([]);
    expect(busyOf(rows, cast.clientMember)).toEqual([]);
  });

  it("only reports time inside the range asked for", async () => {
    await bookMeeting(at(20, 10));
    expect(busyOf(await read(cast.served.client.id), cast.clientMember)).toEqual([]);
  });

  it("tells nothing about what the busy time is", async () => {
    await rig.dbs.owner.db.insert(hostBlock).values({ memberId: cast.colleague, startsAt: at(2, 9), endsAt: at(2, 10), note: "Dentist, private note" });
    await bookMeeting(at(3, 14));
    const text = JSON.stringify(await read(cast.served.client.id));
    for (const forbidden of ["Dentist", "private note", "hidden1@hidden.example", "Hidden Company 1", "Hidden Prospect", "LD-C1XX", "MTG-C1XX", cast.served.name, rig.world().brightpath.name, rig.world().northgate.name]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });
});

describe("who may read which team", () => {
  it("gives an agency nothing for a client it has no campaign with", async () => {
    expect(await read(cast.other.client.id)).toEqual([]);
  });

  it("gives a client its own team and nothing of another client's", async () => {
    await rig.dbs.owner.db.insert(hostBlock).values({ memberId: cast.colleague, startsAt: at(2, 9), endsAt: at(2, 10), note: "x" });
    const own = await readTeamTimeForTenant(clientDb(), cast.client, { clientOrgId: cast.served.client.id, ...window() });
    expect(busyOf(own, cast.colleague)).toEqual([[iso(at(2, 9)), iso(at(2, 10))]]);
    expect(await readTeamTimeForTenant(clientDb(), cast.otherClient, { clientOrgId: cast.served.client.id, ...window() })).toEqual([]);
  });

  it("gives Fynix any client, staff included", async () => {
    const kestrel = await readTeamTimeForFynix(rig.deps(), rig.staffActor, { clientOrgId: cast.served.client.id, ...window() });
    const halden = await readTeamTimeForFynix(rig.deps(), rig.staffActor, { clientOrgId: cast.other.client.id, ...window() });
    expect(kestrel.length).toBeGreaterThan(0);
    expect(halden.length).toBeGreaterThan(0);
  });
});

describe("the range", () => {
  it("refuses more than 62 days, an empty range, a backwards range and a malformed one, all as invalid input", async () => {
    const id = cast.served.client.id;
    const over = { clientOrgId: id, from: iso(at(1, 0)), to: iso(at(64, 0)) };
    const empty = { clientOrgId: id, from: iso(at(1, 0)), to: iso(at(1, 0)) };
    const backwards = { clientOrgId: id, from: iso(at(3, 0)), to: iso(at(1, 0)) };
    for (const input of [over, empty, backwards, { clientOrgId: id, from: "tomorrow", to: "later" }, { clientOrgId: "nope", ...window() }]) {
      expect((await refusal(readTeamTimeForTenant(agencyDb(), cast.agency, input))).code).toBe("invalid-input");
    }
  });

  it("is refused by the database too, so a caller that skips the domain cannot read a longer range", async () => {
    const asFynix = withScope(rig.dbs.roles.leads_fynix.db, { orgId: null, userId: rig.actor.userId }, (tx) =>
      tx.execute(sql`select * from public.app_team_busy(${cast.served.client.id}::uuid, now(), now() + interval '63 days')`),
    );
    await expect(asFynix).rejects.toSatisfy((error: unknown) => {
      for (let current: unknown = error; current instanceof Error; current = current.cause) if (current.message.includes("domain:invalid-input")) return true;
      return false;
    });
  });
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/team-availability.integration.test.ts`
Expected: FAIL, the module `@/server/domain/team-availability` cannot be found.

- [ ] **Step 3: Add the input schema.** At the end of `server/domain/inputs.ts` add:

```ts
/** A calendar read: one client's team between two moments. The length of the range is checked by `assertRange` and again by the database. */
export const teamTimeSchema = z.object({ clientOrgId: z.uuid(), from: instant, to: instant }).strict();
export type TeamTimeInput = z.input<typeof teamTimeSchema>;
```

- [ ] **Step 4: Write the domain read.** Create `server/domain/team-availability.ts`:

```ts
import { asc, inArray, sql } from "drizzle-orm";
import { assertRange, mergeIntervals, type Interval } from "@/lib/calendar/free-time";
import { withDefaultHours, type HostAvailability } from "@/lib/leads/host-hours";
import type { Database } from "@/server/db/pool";
import { hostHours } from "@/server/db/schema";
import { withTenantScope, type ScopedTransaction } from "@/server/db/scope";
import type { TenantActor } from "@/server/domain/alias-identity";
import { databaseRefusal } from "@/server/domain/db-refusal";
import type { DomainDeps } from "@/server/domain/deps";
import { DomainError } from "@/server/domain/errors";
import { fynixRead, type FynixActor } from "@/server/domain/fynix-write";
import { teamTimeSchema } from "@/server/domain/inputs";
import { parseInput } from "@/server/domain/parse";

/**
 * One person of a client, as every calendar reads them: a name, their working hours (the default week when they have set none) and their busy time as bare
 * start and end times, joined where they touch. Nothing says why a person is busy, and an agency learns nothing else about them: no job title, email or phone.
 */
export interface TeamMemberTime {
  readonly memberId: string;
  readonly displayName: string;
  /** Hours and zone. `blocks` is empty here: typed blocked times arrive in `busy` with everything else. */
  readonly availability: HostAvailability;
  readonly busy: readonly Interval[];
}

interface PersonRow {
  readonly member_id: string;
  readonly display_name: string;
  readonly time_zone: string | null;
}

interface BusyRow {
  readonly member_id: string;
  readonly starts_at: Date | string;
  readonly ends_at: Date | string;
}

function checkedRange(from: Date, to: Date): Interval {
  const range = { start: from, end: to };
  try {
    assertRange(range);
  } catch {
    throw new DomainError("invalid-input", "A calendar read covers at least a moment and at most 62 days.");
  }
  return range;
}

async function assemble(tx: ScopedTransaction, clientOrgId: string, range: Interval): Promise<readonly TeamMemberTime[]> {
  const people = await tx.execute<PersonRow>(sql`select member_id, display_name, time_zone from public.app_team_people(${clientOrgId}::uuid)`);
  if (people.rows.length === 0) return [];
  const ids = people.rows.map((row) => row.member_id);
  const hours = await tx
    .select({ memberId: hostHours.memberId, timeZone: hostHours.timeZone, weekday: hostHours.weekday, startMinute: hostHours.startMinute, endMinute: hostHours.endMinute })
    .from(hostHours)
    .where(inArray(hostHours.memberId, ids))
    .orderBy(asc(hostHours.weekday), asc(hostHours.startMinute));
  const busy = await tx.execute<BusyRow>(
    sql`select member_id, starts_at, ends_at from public.app_team_busy(${clientOrgId}::uuid, ${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz)`,
  );
  return people.rows.map((person): TeamMemberTime => {
    const own = hours.filter((row) => row.memberId === person.member_id);
    const availability = withDefaultHours(
      { timeZone: own[0]?.timeZone ?? null, hours: own.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })), blocks: [] },
      person.time_zone,
    );
    const spans = busy.rows.filter((row) => row.member_id === person.member_id).map((row) => ({ start: new Date(row.starts_at), end: new Date(row.ends_at) }));
    return { memberId: person.member_id, displayName: person.display_name, availability, busy: mergeIntervals(spans) };
  });
}

const REFUSALS: ReadonlySet<"invalid-input"> = new Set(["invalid-input"]);

function refused(error: unknown): never {
  throw databaseRefusal(error, REFUSALS, "A calendar read covers at least a moment and at most 62 days.") ?? error;
}

/** A client reads its own team, and an agency reads the team of a client it serves. Anyone else gets an empty list: the database answers for no one it may not read. */
export async function readTeamTimeForTenant(db: Database, actor: TenantActor, input: unknown): Promise<readonly TeamMemberTime[]> {
  const parsed = parseInput(teamTimeSchema, input);
  const range = checkedRange(parsed.from, parsed.to);
  try {
    return await withTenantScope(db, { orgId: actor.orgId, userId: actor.userId }, (tx) => assemble(tx, parsed.clientOrgId, range));
  } catch (error) {
    return refused(error);
  }
}

/** Fynix reads any client's team. Open to staff. */
export async function readTeamTimeForFynix(deps: Pick<DomainDeps, "fynixDb">, actor: FynixActor, input: unknown): Promise<readonly TeamMemberTime[]> {
  const parsed = parseInput(teamTimeSchema, input);
  const range = checkedRange(parsed.from, parsed.to);
  try {
    return await fynixRead(deps.fynixDb, actor, (tx) => assemble(tx, parsed.clientOrgId, range));
  } catch (error) {
    return refused(error);
  }
}
```

- [ ] **Step 5: Run it and see it pass.**

Run: `pnpm typecheck`
Expected: no errors.

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/domain/team-availability.integration.test.ts`
Expected: PASS.

Likely first-run problems, and what to do:

- The lead insert is refused by a check: read the constraint name in the error and add the column it wants (the other integration tests that insert leads as the owner show the full set, for example `server/domain/agencies.integration.test.ts`).
- `rows` is not on the result of `tx.execute`: the other domain files read `.rows` from it, so a different drizzle version is not the cause. Check that the test imports and the `Executor` type are the same as in `server/domain/host-availability.ts`.
- A timestamp comes back as a string: the code already wraps it in `new Date(...)`.

---

### Task 5: The leak matrix reads the two functions

**Files:**
- Modify: `server/db/testing/leak-matrix.ts`, `server/db/leak-matrix.integration.test.ts`

The matrix proves a read gives a viewer what it should and none of what it should not. An agency now reads the names of the people of a client it serves, so those names have to be allowed for these two reads, and for these two only.

- [ ] **Step 1: Let a read path name the tokens it may show.** In `server/db/testing/leak-matrix.ts`, in the `ReadPath` interface, after `mustContain`, add:

```ts
  /** Strings this one path may show, such as the names of the people of a client an agency serves. Each is removed from the result before it is searched for forbidden tokens. */
  readonly allowedTokens?: (viewer: Viewer, world: SeedWorld) => readonly string[];
```

In `server/db/leak-matrix.integration.test.ts`, in the read path test, replace

```ts
      expect(findLeaks(text, forbiddenTokens(viewer, world)), `${label(viewer)} saw something it must not`).toEqual([]);
```

with

```ts
      // Strings a path may show (the names of a client's people, which embed the seeded organisation reference) are taken out first, so a reference that appears anywhere else is still caught.
      const shown = (path.allowedTokens?.(viewer, world) ?? []).reduce((rest, token) => rest.split(token).join(""), text);
      expect(findLeaks(shown, forbiddenTokens(viewer, world)), `${label(viewer)} saw something it must not`).toEqual([]);
```

- [ ] **Step 2: Add the two read paths.** In `server/db/testing/leak-matrix.ts`, add `sql` to the drizzle import if it is not there, and add these helpers just above `export const READ_PATHS`:

```ts
/** The clients whose team a viewer may read: its own organisation for a client, the clients of its campaigns for an agency. */
function teamClientIds(viewer: Viewer, world: SeedWorld): string[] {
  return viewer.role === "leads_client" ? [viewer.organisation.id] : [...new Set(ownCampaigns(viewer, world).map((row) => row.client.id))];
}

function teamNames(viewer: Viewer, world: SeedWorld): string[] {
  const ids = teamClientIds(viewer, world);
  return world.users.filter((person) => ids.includes(person.organisation.id)).map((person) => person.name);
}
```

and add these two entries at the end of the `READ_PATHS` array:

```ts
  {
    // Calendar step C: the people of a client, by name and time zone, for the client itself and the agencies that serve it. A name and nothing else.
    name: "the team of a client, names only",
    run: async (tx, viewer, world) => {
      const rows: unknown[] = [];
      for (const id of teamClientIds(viewer, world)) rows.push((await tx.execute(sql`select * from public.app_team_people(${id}::uuid)`)).rows);
      return rows;
    },
    mustContain: (viewer, world) => teamNames(viewer, world),
    allowedTokens: (viewer, world) => [...teamNames(viewer, world), ...teamZones(viewer, world)],
  },
  {
    // The busy time of those people over the next ten days. The seeded world has no busy time, so the result is empty and the path only proves that nothing
    // but names, ids and times can come out of it, and that a client it does not serve is empty.
    name: "the busy time of a client's team",
    run: async (tx, viewer, world) => {
      const rows: unknown[] = [];
      for (const org of [...world.clients]) {
        rows.push((await tx.execute(sql`select * from public.app_team_busy(${org.id}::uuid, now(), now() + interval '10 days')`)).rows);
      }
      return rows;
    },
    mustContain: () => [],
  },
```

- [ ] **Step 3: Run the matrix.**

Run: `pnpm typecheck`
Expected: no errors.

Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/db/leak-matrix.integration.test.ts`
Expected: PASS for both tenant roles, both new read paths included.

If the first path fails with a name the viewer "must not see", the allowed list is wrong for that viewer: the allowed names are those of users of the clients in `teamClientIds`, and the path must call the function only for those clients. If it fails with an id, a job title or a phone, the function is returning more than it should: fix the function, never the matrix.

---

### Task 6: Notes and the checks

**Files:**
- Modify: `docs/superpowers/specs/2026-11-26-calendar-and-meetings-design.md`, `CLAUDE.md`

- [ ] **Step 1: Say in the spec what moved.** In the build order table of the spec, change the row for step C to:

```
| C | Data layer: the free-time rules (`lib/calendar/free-time.ts`), the invitation table, and one read of each person's name, hours and busy time for the client, its agencies and Fynix. Lists of meetings by date range, which carry meeting details, move to D. Plan: `docs/superpowers/plans/2026-11-26-calendar-step-c-free-time-data.md` | B |
```


- [ ] **Step 2: Add the note to `CLAUDE.md`.** Directly after the paragraph that begins `**Client team, not hosts`, add:

```markdown
**Free time (calendar step C, migrations 0097 and 0098):** whether a slot is free is decided in one place, `lib/calendar/free-time.ts` (`isSlotFree`, `freeSlotStarts`, `freePeopleAt`: 48 hours of notice, working hours with the default week, typed blocks, busy time, at most 62 days). The table `meeting_attendee` holds invitations (`invited`, `accepted`, `declined`, `released`) and no runtime role touches it; `meeting.reply_due_at` and `meeting.confirmed_at` are empty until booking is built. Busy time reaches a screen only through `app_team_people` and `app_team_busy` (names, time zone, and bare start and end times: a blocked time, a scheduled meeting, an open invitation before its deadline and an accepted one all look the same), read by `readTeamTimeForTenant` and `readTeamTimeForFynix` in `server/domain/team-availability.ts`. Step F adds synced Google and Outlook time by replacing `app_team_busy`. Plan: `docs/superpowers/plans/2026-11-26-calendar-step-c-free-time-data.md`.
```

- [ ] **Step 3: The checks, once.**

Run: `pnpm lint`
Run: `pnpm typecheck`
Run: `pnpm exec vitest run --maxWorkers=1 lib/calendar lib/leads`
Run: `pnpm exec vitest run --config vitest.integration.config.mts --maxWorkers=1 server/db/leak-matrix.integration.test.ts server/db/structure.integration.test.ts server/domain/team-availability.integration.test.ts server/domain/client-team.integration.test.ts`
Run: `pnpm build`
Expected: all pass. Report exactly which ran. Do not claim a full test run.

- [ ] **Step 4: Refresh the graph.**

Run: `cd "/Users/a12345/Desktop/AI/Fynix Digital" && graphify update .`

- [ ] **Step 5: Stop.** Do not commit. Tell the owner what changed, which checks ran and what they showed, and wait for the word to commit on `development`.

---

## What changed while building

- **Migration 0099 was added.** The plan said the two new `meeting` columns need no grant. That was wrong: the app inserts a meeting as the client or agency role, Drizzle lists every column of the table in that insert, and Postgres refuses it when the role has no insert privilege on a listed column. Every booking failed until `0099_meeting_new_columns_insert.sql` granted insert, and no select, on the two columns, as migration 0075 did for the room columns. The meeting tests of the other phases caught it; the new tests did not.
- **Allowed names and zones in the leak matrix.** A read path strips its allowed strings from the result before the forbidden tokens are searched, and for the team read the allowed strings are the people's names and the client's time zone. An agency reading that zone is the same kind of fact as the zone of a person's own hours, which it already reads, and the zone is what the default week is worked out in.

## What ships to the live site with this step

Three migrations, 0097, 0098 and 0099: a new table with no grants, two empty nullable columns on `meeting`, and three new functions. Nothing existing changes, so the process running during a deploy keeps working.

## Left for later steps

| Item | Step |
|---|---|
| Month, week and day pages, and the lists of meetings by date range | D |
| One-slot booking, invitations written, the first-accept rule, `awaiting_reply`, nullable `meeting.host_member_id`, the reply page | E |
| Synced Google and Outlook time | F |
