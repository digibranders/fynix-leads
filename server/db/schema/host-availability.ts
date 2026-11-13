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
