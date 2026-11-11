import { describe, expect, it } from "vitest";
import type { ApprovalStatus, MeetingStatus } from "@/lib/domain/status";
import type { Lead } from "@/lib/domain/types";
import { SAMPLE_LEADS, SAMPLE_NOW } from "@/lib/sample/data";
import { campaignStats } from "./stats";

const NOW = new Date("2026-11-11T10:00:00Z");

type Opts = {
  meetings?: { status: MeetingStatus; startsAt: string }[];
  replacesRef?: string;
  thread?: Lead["thread"];
};

function lead(ref: string, approval: ApprovalStatus, submittedAt: string, opts: Opts = {}): Lead {
  return {
    ref,
    campaignRef: "CMP-TEST",
    approval,
    submittedAt,
    replacesRef: opts.replacesRef,
    prospect: { name: "n", title: "t", company: "c", companyDomain: "d.test", email: "e@d.test", phone: "+44", linkedinUrl: "u", zone: "UTC" },
    bant: { budget: "b", authority: "a", need: "n", timeline: "t" },
    meetings: (opts.meetings ?? []).map((m, i) => ({ id: `MT-${ref}-${i}`, durationMinutes: 30, repName: "Rep", ...m })),
    activity: [],
    thread: opts.thread ?? [],
  };
}

const msg = (id: string, at: string, side: "client" | "fynix") => ({ id, at, author: side, side, body: "x" });

describe("campaignStats", () => {
  it("counts delivered this month and to date by the counting month", () => {
    const leads = [
      lead("LD-0001", "approved", "2026-11-01T09:00:00Z", { meetings: [{ status: "completed", startsAt: "2026-11-05T10:00:00Z" }] }),
      lead("LD-0002", "approved", "2026-10-01T09:00:00Z", { meetings: [{ status: "completed", startsAt: "2026-10-20T10:00:00Z" }] }),
    ];
    const s = campaignStats(leads, NOW);
    expect(s.deliveredThisMonth).toBe(1);
    expect(s.deliveredToDate).toBe(2);
  });

  it("does not count an approved lead whose meeting is only scheduled", () => {
    const s = campaignStats([lead("LD-0001", "approved", "2026-11-01T09:00:00Z", { meetings: [{ status: "scheduled", startsAt: "2026-11-15T10:00:00Z" }] })], NOW);
    expect([s.deliveredThisMonth, s.deliveredToDate]).toEqual([0, 0]);
  });

  it("counts pending leads as awaiting the client, and those over 24 hours as overdue", () => {
    const leads = [
      lead("LD-0001", "pending", "2026-11-11T07:00:00Z"),
      lead("LD-0002", "pending", "2026-11-10T09:00:00Z"),
      lead("LD-0003", "pending", "2026-11-09T04:00:00Z"),
      lead("LD-0004", "approved", "2026-11-09T04:00:00Z"),
    ];
    const s = campaignStats(leads, NOW);
    expect(s.awaitingClientDecision).toBe(3);
    expect(s.overdueAwaitingDecision).toBe(2);
  });

  it("counts a clarification only when the last message is from the client", () => {
    const leads = [
      lead("LD-0001", "needs_clarification", "2026-11-09T09:00:00Z", { thread: [msg("1", "2026-11-10T09:00:00Z", "client")] }),
      lead("LD-0002", "needs_clarification", "2026-11-09T09:00:00Z", {
        thread: [msg("1", "2026-11-10T09:00:00Z", "client"), msg("2", "2026-11-10T11:00:00Z", "fynix")],
      }),
      lead("LD-0003", "needs_clarification", "2026-11-09T09:00:00Z", {
        thread: [msg("1", "2026-11-10T09:00:00Z", "client"), msg("2", "2026-11-10T11:00:00Z", "fynix"), msg("3", "2026-11-10T13:00:00Z", "client")],
      }),
      lead("LD-0004", "needs_clarification", "2026-11-09T09:00:00Z"),
      lead("LD-0005", "pending", "2026-11-09T09:00:00Z", { thread: [msg("1", "2026-11-10T09:00:00Z", "client")] }),
    ];
    expect(campaignStats(leads, NOW).clarificationsToAnswer).toBe(2);
  });

  it("owes a replacement only for a rejected lead that no other lead replaces", () => {
    const leads = [
      lead("LD-0001", "rejected", "2026-10-01T09:00:00Z"),
      lead("LD-0002", "rejected", "2026-10-02T09:00:00Z"),
      lead("LD-0003", "pending", "2026-11-10T09:00:00Z", { replacesRef: "LD-0001" }),
    ];
    expect(campaignStats(leads, NOW).replacementsOwed).toBe(1);
  });

  it("gives zeros for no leads", () => {
    expect(campaignStats([], NOW)).toEqual({
      deliveredThisMonth: 0,
      deliveredToDate: 0,
      awaitingClientDecision: 0,
      overdueAwaitingDecision: 0,
      clarificationsToAnswer: 0,
      replacementsOwed: 0,
    });
  });

  it("matches the sample data story", () => {
    expect(campaignStats(SAMPLE_LEADS, SAMPLE_NOW)).toEqual({
      deliveredThisMonth: 3,
      deliveredToDate: 3,
      awaitingClientDecision: 6,
      overdueAwaitingDecision: 2,
      clarificationsToAnswer: 1,
      replacementsOwed: 1,
    });
  });
});
