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
