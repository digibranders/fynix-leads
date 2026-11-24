import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RejectionRow } from "@/server/domain/rejection-overview";
import type { DecisionItem } from "@/server/domain/client-queue";

// The forms call server actions, which need a running app. The screens only need their buttons to render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
vi.mock("@/server/domain/lead-flow-actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { pickTimeAction: action, proposeTimesAction: action, rejectLeadAction: action, decideLeadAction: action, recordOutcomeAction: action, withdrawLeadAction: action, proposePostponementAction: action, pickPostponementAction: action, contestOutcomeAction: action, requestRejectionReviewAction: action };
});
vi.mock("@/server/fynix/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { overturnRejectionAction: action, fynixRecordOutcomeAction: action };
});
vi.mock("@/server/fynix/lead-actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { decideContestAction: action, markRejectionReviewedAction: action, correctLeadAction: action, answerForClientAction: action, markLostAction: action, clearOverShareAction: action };
});

const { LeadActionBar } = await import("@/components/leads/lead-action-bar");
const { DecisionQueue } = await import("@/components/leads/decision-queue");
const { RejectionsTable } = await import("@/components/fynix/rejections/rejections-table");

const now = new Date("2026-11-24T12:00:00Z");
const past = new Date("2026-11-24T09:00:00Z");
const future = new Date("2026-11-26T09:00:00Z");

type Props = Parameters<typeof LeadActionBar>[0];
const bar = (over: Partial<Props>) =>
  renderToStaticMarkup(<LeadActionBar viewer="client" stage="awaiting_client" leadId="l1" prospectName="Priya Nair" meetingId="m1" meetingTime={null} now={now} availabilityHref="/client/review?lead=l1" {...over} />);

describe("lead action bar", () => {
  it("offers the client a time, other times and a rejection while it waits for a time", () => {
    const html = bar({});
    expect(html).toContain("Pick a time");
    expect(html).toContain("Propose other times");
    expect(html).toContain("Reject lead");
    expect(html).not.toContain("Accept lead");
    expect(html).not.toContain("Record outcome");
  });

  it("offers only a rejection on a booked meeting that has not happened, and the outcome once it has", () => {
    const booked = bar({ stage: "scheduled", meetingTime: future });
    expect(booked).toContain("Reject lead");
    expect(booked).not.toContain("Record outcome");
    expect(bar({ stage: "scheduled", meetingTime: past })).toContain("Record outcome");
  });

  it("offers accept and reject after the meeting was held", () => {
    const html = bar({ stage: "awaiting_decision", meetingTime: past });
    expect(html).toContain("Accept lead");
    expect(html).toContain("Reject lead");
    expect(html).not.toContain("Pick a time");
  });

  it("offers the supply side the outcome after the meeting time and nothing else", () => {
    expect(bar({ viewer: "supply", stage: "scheduled", meetingTime: past })).toContain("Record outcome");
    expect(bar({ viewer: "supply", stage: "awaiting_client" })).toBe("");
    expect(bar({ viewer: "supply", stage: "awaiting_decision", meetingTime: past })).toBe("");
  });

  it("offers Fynix the outcome and the overturn, and no client buttons", () => {
    expect(bar({ viewer: "fynix", stage: "rejected", meetingTime: past })).toContain("Change to accepted");
    const outcome = bar({ viewer: "fynix", stage: "outcome_due", meetingTime: past });
    expect(outcome).toContain("Record outcome");
    expect(outcome).not.toContain("Reject lead");
  });

  it("renders nothing on a counted or closed lead", () => {
    for (const stage of ["accepted", "declined", "prospect_no_show", "client_no_show"]) expect(bar({ stage, meetingTime: past }), stage).toBe("");
  });
});

const decision = (over: Partial<DecisionItem> = {}): DecisionItem => ({
  id: "l1",
  publicRef: "LD-5P2R",
  prospectName: "Priya Nair",
  prospectCompany: "Harbour Freight",
  campaignName: "UK mid-market finance teams",
  campaignStatus: "active",
  meetingTime: past,
  outcomeRecordedAt: new Date("2026-11-23T05:00:00Z"),
  ...over,
});

describe("decision queue", () => {
  it("shows the time left to automatic acceptance and both answers", () => {
    const html = renderToStaticMarkup(<DecisionQueue items={[decision()]} now={now} />);
    expect(html).toContain("Accepted automatically in 17h");
    expect(html).toContain("Accept");
    expect(html).toContain("Reject");
    expect(html).toContain('href="/client/leads/LD-5P2R"');
  });

  it("tags a closed campaign and says when nothing waits", () => {
    expect(renderToStaticMarkup(<DecisionQueue items={[decision({ campaignStatus: "completed" })]} now={now} />)).toContain("Closed");
    expect(renderToStaticMarkup(<DecisionQueue items={[]} now={now} />)).toContain("No lead is waiting for your answer");
  });
});

const rejection: RejectionRow = {
  leadId: "l1",
  leadRef: "LD-3K7M",
  campaignId: "c1",
  campaignName: "UK mid-market finance teams",
  clientName: "Kestrel Ledger",
  agencyName: "Calder Bay Media",
  prospectName: "Priya Nair",
  prospectCompany: "Harbour Freight",
  note: "The contact had left the company.",
  rejectedAt: new Date("2026-11-22T12:00:00Z"),
  rejectedByName: "Daniel Okafor",
  meetingTime: past,
  reviewedAt: null,
};

describe("rejections page", () => {
  it("lists each rejection with the client's note, client, campaign, agency, age and a link to the lead", () => {
    const html = renderToStaticMarkup(<RejectionsTable rows={[rejection]} now={now} />);
    expect(html).toContain("Rejected after the meeting");
    expect(html).toContain("The contact had left the company.");
    expect(html).toContain("Kestrel Ledger");
    expect(html).toContain("Calder Bay Media");
    expect(html).toContain("2d ago");
    expect(html).toContain('href="/fynix/leads/LD-3K7M"');
  });

  it("says when there is none", () => {
    expect(renderToStaticMarkup(<RejectionsTable rows={[]} now={now} />)).toContain("No rejections");
  });
});
