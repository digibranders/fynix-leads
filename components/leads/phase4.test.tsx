import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LeadActionContext } from "@/components/leads/lead-action-bar";
import type { LeadRecord } from "@/server/domain/lead-record";

// The forms call server actions, which need a running app. The screens only need their buttons and fields to render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
const action = async () => ({ status: "idle" as const });
vi.mock("@/server/domain/lead-flow-actions", () => ({ pickTimeAction: action, proposeTimesAction: action, rejectLeadAction: action, decideLeadAction: action, recordOutcomeAction: action, withdrawLeadAction: action, proposePostponementAction: action, pickPostponementAction: action, contestOutcomeAction: action, requestRejectionReviewAction: action }));
vi.mock("@/server/fynix/actions", () => ({ overturnRejectionAction: action, fynixRecordOutcomeAction: action }));
vi.mock("@/server/fynix/lead-actions", () => ({ decideContestAction: action, markRejectionReviewedAction: action, correctLeadAction: action, answerForClientAction: action, markLostAction: action, clearOverShareAction: action }));
vi.mock("@/server/domain/draft-actions", () => ({ saveDraftAction: action, discardDraftAction: action }));
vi.mock("@/server/domain/lead-actions", () => ({ submitLeadAction: action }));
vi.mock("@/server/domain/exclusion-actions", () => ({ addExclusionAction: action, removeExclusionAction: action }));

const { LeadActionBar } = await import("@/components/leads/lead-action-bar");
const { LeadRecordView } = await import("@/components/leads/lead-record-view");
const { AnswerForClientForm, ClearOverShareForm, CorrectLeadForm, DecideContestForm, MarkLostForm, MarkReviewedForm } = await import("@/components/leads/fynix-lead-forms");
const { AskReviewForm, ContestOutcomeForm, PickNewTimeForm, PostponeForm, WithdrawLeadForm } = await import("@/components/leads/phase4-forms");
const { DraftsTable } = await import("@/components/leads/drafts-table");
const { SubmitLeadForm } = await import("@/components/leads/submit-lead-form");
const { HostTimesField } = await import("@/components/leads/host-times");
const { SourceLeadsView } = await import("@/components/leads/source-leads-view");
const { ContestsTable } = await import("@/components/fynix/rejections/contests-table");
const { RejectionsTable } = await import("@/components/fynix/rejections/rejections-table");
const { PipelineHealthCards } = await import("@/components/fynix/pipeline-health");
const { ExclusionList } = await import("@/components/exclusions/exclusion-list");
const { MeetingsTable } = await import("@/components/meetings/meetings-table");
const { SortHead } = await import("@/components/kit/sort-head");
const { ExportButton, exportHref } = await import("@/components/kit/export-button");

const now = new Date("2026-11-24T12:00:00Z");
const past = new Date("2026-11-24T09:00:00Z");
const future = new Date("2026-11-26T09:00:00Z");

type BarProps = Parameters<typeof LeadActionBar>[0];
const bar = (over: Partial<BarProps> & { context?: LeadActionContext }) =>
  renderToStaticMarkup(<LeadActionBar viewer="client" stage="scheduled" leadId="l1" prospectName="Priya Nair" meetingId="m1" meetingTime={future} now={now} {...over} />);

describe("the action bar after phase 4: the client", () => {
  it("offers new times on a booked meeting and a pick when the supply side proposed", () => {
    const html = bar({});
    expect(html).toContain("Propose new times");
    expect(html).toContain("Reject lead");
    expect(html).not.toContain("Pick a new time");
    const picked = bar({ context: { openProposalBy: "supply", proposal: { id: "r1", times: ["2026-11-27T09:00:00Z"] } } });
    expect(picked).toContain("Pick a new time");
  });
  it("does not offer a pick for the client's own proposal, nor a withdrawal, nor Fynix's buttons", () => {
    const html = bar({ context: { openProposalBy: "client", isSource: true, isCoordinator: true } });
    expect(html).not.toContain("Pick a new time");
    for (const label of ["Withdraw lead", "Correct details", "Answer for the client", "Mark lost", "Ask Fynix to review", "Mark reviewed"]) expect(html, label).not.toContain(label);
  });
  it("offers Contest outcome only inside its window", () => {
    expect(bar({ stage: "awaiting_decision", meetingTime: past, context: { canContest: true, timeLeft: "30h left" } })).toContain("Contest outcome");
    expect(bar({ stage: "awaiting_decision", meetingTime: past, context: { canContest: false } })).not.toContain("Contest outcome");
  });
});

describe("the action bar after phase 4: the supply side", () => {
  it("lets the source withdraw before the meeting and propose new times, and nobody else withdraw", () => {
    const own = bar({ viewer: "supply", context: { isSource: true } });
    expect(own).toContain("Withdraw lead");
    expect(own).toContain("Propose new times");
    expect(bar({ viewer: "supply", context: { isSource: false } })).not.toContain("Withdraw lead");
    expect(bar({ viewer: "supply", stage: "awaiting_client", meetingTime: null, context: { isSource: true } })).toContain("Withdraw lead");
    expect(bar({ viewer: "supply", stage: "scheduled", meetingTime: past, context: { isSource: true } })).not.toContain("Withdraw lead");
  });
  it("offers a pick when the client proposed new times", () => {
    expect(bar({ viewer: "supply", context: { openProposalBy: "client", proposal: { id: "r1", times: ["2026-11-27T09:00:00Z"] } } })).toContain("Pick a new time");
  });
  it("offers Ask Fynix to review to the coordinator on a rejection, inside its window only", () => {
    const rejected = { viewer: "supply", stage: "rejected", meetingTime: past } as const;
    expect(bar({ ...rejected, context: { isCoordinator: true, canAskReview: true, timeLeft: "20h left" } })).toContain("Ask Fynix to review");
    expect(bar({ ...rejected, context: { isCoordinator: false, canAskReview: true } })).toBe("");
    expect(bar({ ...rejected, context: { isCoordinator: true, canAskReview: false } })).toBe("");
  });
  it("lets the supply side contest an outcome the client recorded", () => {
    expect(bar({ viewer: "supply", stage: "client_no_show", meetingTime: past, context: { canContest: true, timeLeft: "40h left" } })).toContain("Contest outcome");
  });
});

describe("the action bar after phase 4: Fynix", () => {
  const details = { prospectName: "Priya Nair", prospectTitle: "CFO", prospectCompany: "Harbour Freight", prospectDomain: "harbour.example", prospectLinkedinUrl: "https://linkedin.com/in/x", prospectEmail: "p@harbour.example", prospectPhone: null, prospectNotes: null, bantBudget: "b", bantAuthority: "a", bantNeed: "n", bantTimeline: "t" };
  it("offers every way of stepping in on an open lead, and no client or supply button", () => {
    const html = bar({ viewer: "fynix", stage: "awaiting_decision", meetingTime: past, context: { details, overShare: true } });
    for (const label of ["Correct details", "Answer for the client", "Mark lost", "Clear over-share flag"]) expect(html, label).toContain(label);
    for (const label of ["Accept lead", "Withdraw lead", "Contest outcome", "Propose new times"]) expect(html, label).not.toContain(label);
  });
  it("offers the contest decision on a contested lead and the review on a rejection", () => {
    expect(bar({ viewer: "fynix", stage: "outcome_contested", meetingTime: past, context: { details } })).toContain("Decide the contest");
    const rejected = bar({ viewer: "fynix", stage: "rejected", meetingTime: past, context: { details } });
    expect(rejected).toContain("Mark reviewed");
    expect(rejected).toContain("Change to accepted");
    expect(bar({ viewer: "fynix", stage: "rejected", meetingTime: past, context: { details, reviewed: true } })).not.toContain("Mark reviewed");
  });
  it("hides the flag button when nothing is flagged and offers nothing on a draft", () => {
    expect(bar({ viewer: "fynix", stage: "scheduled", context: { details } })).not.toContain("Clear over-share flag");
    expect(bar({ viewer: "fynix", stage: "draft", meetingTime: null, context: { details, overShare: true } })).toBe("");
  });
});

describe("the new forms", () => {
  const html = (node: React.ReactElement) => renderToStaticMarkup(node);
  it("each tenant form carries its target and, where the note is required, a note field", () => {
    expect(html(<WithdrawLeadForm leadId="l1" booked />)).toContain('name="leadId" value="l1"');
    expect(html(<WithdrawLeadForm leadId="l1" booked />)).toContain("booked meeting is cancelled");
    expect(html(<PostponeForm meetingId="m1" />)).toContain('name="meetingId" value="m1"');
    expect(html(<PostponeForm meetingId="m1" />)).toContain('name="proposedTimes"');
    const pick = html(<PickNewTimeForm rescheduleId="r1" times={["2026-11-27T09:00:00.000Z", "2026-11-28T09:00:00.000Z"]} />);
    expect(pick).toContain('name="rescheduleId" value="r1"');
    expect(pick.match(/name="pickedTime"/g)).toHaveLength(2);
    expect(pick).toContain('value="2026-11-27T09:00:00.000Z"');
    const contest = html(<ContestOutcomeForm meetingId="m1" timeLeft="30h left" />);
    expect(contest).toContain('name="note"');
    expect(contest).toContain("30h left");
    const review = html(<AskReviewForm leadId="l1" timeLeft="12h left" />);
    expect(review).toContain('name="note"');
    expect(review).toContain("12h left");
  });
  it("each Fynix form asks for a note and says what it does", () => {
    expect(html(<DecideContestForm leadId="l1" contestedOutcome="client_no_show" />)).toContain('name="outcome"');
    expect(html(<DecideContestForm leadId="l1" contestedOutcome="client_no_show" />)).toContain('name="note"');
    expect(html(<MarkReviewedForm leadId="l1" />)).toContain("Optional");
    expect(html(<MarkLostForm leadId="l1" />)).toContain("cannot be undone");
    expect(html(<ClearOverShareForm leadId="l1" />)).toContain('name="note"');
    const answer = html(<AnswerForClientForm leadId="l1" stage="awaiting_client" proposedTimes={["2026-11-27T09:00:00.000Z"]} />);
    expect(answer).toContain('name="answer"');
    expect(answer).toContain('name="selectedMeetingTime" value="2026-11-27T09:00:00.000Z"');
    expect(html(<AnswerForClientForm leadId="l1" stage="awaiting_decision" proposedTimes={[]} />)).toContain('name="note"');
    expect(html(<AnswerForClientForm leadId="l1" stage="awaiting_decision" proposedTimes={[]} />)).not.toContain('name="selectedMeetingTime"');
  });
  it("the correction form starts from the saved values and remembers each one for the change check", () => {
    const form = html(<CorrectLeadForm leadId="l1" lead={{ prospectName: "Priya Nair", prospectTitle: "CFO", prospectCompany: "Harbour", prospectDomain: "h.example", prospectLinkedinUrl: "https://l.example", prospectEmail: "p@h.example", prospectPhone: "+44 20 7946 0000", prospectNotes: "Met at a fair", bantBudget: "50k", bantAuthority: "Signs", bantNeed: "Audit", bantTimeline: "Q1" }} />);
    expect(form).toContain('value="Priya Nair"');
    expect(form).toContain('name="was_prospectName" value="Priya Nair"');
    expect(form).toContain('value="+44 20 7946 0000"');
    expect(form).toContain("Met at a fair");
    expect(form).toContain('name="note"');
  });
});

const record = (over: Partial<LeadRecord> = {}): LeadRecord => ({
  id: "l1",
  publicRef: "LD-5P2R",
  stage: "scheduled",
  campaignId: "c1",
  campaignName: "UK mid-market finance teams",
  campaignStatus: "active",
  prospect: { name: "Priya Nair", title: "CFO", company: "Harbour Freight", domain: "harbour.example", linkedinUrl: "https://linkedin.com/in/priya", email: "priya@harbour.example", phone: null, notes: null },
  bant: { budget: "50k", authority: "Signs", need: "Audit", timeline: "Q1" },
  proposedTimes: [],
  scheduledMeetingTime: future,
  host: { name: "Daniel Okafor", jobTitle: "Head of Sales" },
  hostTimeZone: "Europe/London",
  alias: null,
  meeting: { id: "m1", publicRef: "MT-1", scheduledStartTime: future, durationMinutes: 30, googleMeetUrl: null, outcome: "scheduled", recordedAt: null, recordedByRole: null, contestedAt: null, contestNote: null, contestedByRole: null },
  decision: null,
  counted: false,
  submittedAt: new Date("2026-11-20T10:00:00Z"),
  outcomeRecordedAt: null,
  closedAt: null,
  overShare: false,
  reviewed: false,
  reschedules: [],
  reviewRequest: null,
  history: [],
  ...over,
});

const proposal = { id: "r1", proposedBySide: "supply" as const, proposedTimes: ["2026-11-27T09:00:00.000Z"], status: "open", pickedTime: null, createdAt: past, resolvedAt: null };

describe("the lead record after phase 4", () => {
  it("tells the client 'New times proposed' without naming who, and offers the pick", () => {
    const page = renderToStaticMarkup(<LeadRecordView record={record({ reschedules: [proposal] })} viewer="client" backHref="/client/leads" now={now} />);
    expect(page).toContain("New times proposed");
    expect(page).toContain("Pick a new time");
    for (const word of ["coordinator", "Coordinator", "agency", "Agency", "supplier"]) expect(page, word).not.toContain(word);
  });
  it("tells the side that proposed it is waiting", () => {
    const page = renderToStaticMarkup(<LeadRecordView record={record({ reschedules: [{ ...proposal, proposedBySide: "client" }] })} viewer="client" backHref="/client/leads" now={now} />);
    expect(page).toContain("You proposed new times");
    expect(page).not.toContain("Pick a new time");
  });
  it("shows Who joined after the meeting starts: 'Not available yet' before the import, the people after it, and nothing before the meeting", () => {
    const started = record({ meeting: { ...record().meeting!, scheduledStartTime: past, outcome: "held" } });
    const before = renderToStaticMarkup(<LeadRecordView record={started} viewer="client" backHref="/client/leads" now={now} />);
    expect(before).toContain("Who joined");
    expect(before).toContain("Not available yet");
    const after = renderToStaticMarkup(<LeadRecordView record={started} joins={[{ meetingId: "m1", displayName: "Priya Nair", joinedAt: past, leftAt: null, durationSeconds: 600 }]} viewer="supply" backHref="/agency/leads" now={now} />);
    expect(after).toContain("stayed 10 minutes");
    expect(after).not.toContain("Not available yet");
    expect(renderToStaticMarkup(<LeadRecordView record={record()} viewer="client" backHref="/client/leads" now={now} />)).not.toContain("Who joined");
  });
  it("lists answered proposals as reschedule history", () => {
    const page = renderToStaticMarkup(<LeadRecordView record={record({ reschedules: [{ ...proposal, status: "accepted", pickedTime: new Date("2026-11-27T09:00:00Z") }] })} viewer="supply" backHref="/agency/leads" now={now} />);
    expect(page).toContain("Reschedule history");
    expect(page).toContain("A time was picked");
  });
  it("shows the contest window with time left and the contest note once contested, never naming the supply role to the client", () => {
    const base = record({
      stage: "awaiting_decision",
      meeting: { id: "m1", publicRef: "MT-1", scheduledStartTime: past, durationMinutes: 30, googleMeetUrl: null, outcome: "held", recordedAt: new Date("2026-11-24T02:00:00Z"), recordedByRole: "agency", contestedAt: null, contestNote: null, contestedByRole: null },
    });
    const open = renderToStaticMarkup(<LeadRecordView record={base} viewer="client" backHref="/client/leads" now={now} />);
    expect(open).toContain("Contest outcome: 38h left");
    const contested = renderToStaticMarkup(
      <LeadRecordView record={{ ...base, stage: "outcome_contested", meeting: { ...base.meeting!, contestedAt: now, contestNote: "We did meet.", contestedByRole: "coordinator" } }} viewer="client" backHref="/client/leads" now={now} />,
    );
    expect(contested).toContain("Outcome contested by the Fynix team");
    expect(contested).toContain("We did meet.");
    expect(contested).not.toContain("oordinator");
  });
  it("shows the coordinator the review window, and Fynix the request with its badge, and a client neither", () => {
    const rejected = record({ stage: "rejected", decision: { note: "Wrong person", at: new Date("2026-11-24T00:00:00Z"), source: "client", byName: null } });
    expect(renderToStaticMarkup(<LeadRecordView record={rejected} viewer="supply" isCoordinator backHref="/supplier/leads" now={now} />)).toContain("You can ask Fynix to review this rejection: 36h left");
    expect(renderToStaticMarkup(<LeadRecordView record={rejected} viewer="supply" backHref="/agency/leads" now={now} />)).not.toContain("ask Fynix to review");
    const asked = { ...rejected, reviewRequest: { note: "He is the buyer", requestedAt: now, status: "open" } };
    const fynix = renderToStaticMarkup(<LeadRecordView record={asked} viewer="fynix" backHref="/fynix/leads" now={now} />);
    expect(fynix).toContain("Review requested");
    expect(fynix).toContain("He is the buyer");
    const client = renderToStaticMarkup(<LeadRecordView record={{ ...asked, reviewRequest: null }} viewer="client" backHref="/client/leads" now={now} />);
    expect(client).not.toContain("Review requested");
  });
  it("shows a draft to its source with Continue and Discard, and the over-share flag to Fynix only", () => {
    const draft = renderToStaticMarkup(<LeadRecordView record={record({ stage: "draft", scheduledMeetingTime: null, meeting: null })} viewer="supply" backHref="/agency/leads" draftHref="/agency/leads/new?draft=LD-5P2R" now={now} />);
    expect(draft).toContain("This is a draft");
    expect(draft).toContain('href="/agency/leads/new?draft=LD-5P2R"');
    expect(draft).toContain("Discard draft");
    expect(renderToStaticMarkup(<LeadRecordView record={record({ overShare: true })} viewer="fynix" backHref="/fynix/leads" now={now} />)).toContain("Over share");
    expect(renderToStaticMarkup(<LeadRecordView record={record({ overShare: true })} viewer="client" backHref="/client/leads" now={now} />)).not.toContain("Over share");
  });
});

describe("drafts and the lead form", () => {
  const draft = { id: "d1", publicRef: "LD-DRFT", campaignId: "c1", prospectName: "Priya Nair", prospectCompany: "Harbour Freight", updatedAt: now };
  it("lists a draft with Continue, which opens the form filled in, and Discard", () => {
    const html = renderToStaticMarkup(<DraftsTable drafts={[draft]} newHref="/agency/leads/new" campaigns={{ c1: { name: "UK mid-market" } }} />);
    expect(html).toContain('href="/agency/leads/new?draft=LD-DRFT"');
    expect(html).toContain("Continue");
    expect(html).toContain("Discard");
    expect(renderToStaticMarkup(<DraftsTable drafts={[]} newHref="/agency/leads/new" campaigns={{}} />)).toContain("No drafts");
  });
  it("the source view opens a Drafts tab and links its count", () => {
    const view = (props: Partial<Parameters<typeof SourceLeadsView>[0]>) =>
      renderToStaticMarkup(<SourceLeadsView leads={[]} basePath="/agency/leads" submitHref="/agency/leads/new" emptyText="x" group={null} q="" page={1} ownOrgId="o1" campaigns={{ c1: { name: "UK", clientName: "Kestrel" } }} campaignChoices={[]} campaign={null} aliasNames={{}} {...props} />);
    const tabs = view({ drafts: [draft] });
    expect(tabs).toContain("Drafts");
    expect(tabs).toContain("?show=drafts");
    expect(view({ drafts: [draft], showDrafts: true })).toContain("Continue");
    expect(view({})).not.toContain("?show=drafts");
  });
  it("the lead form has Save draft beside Submit, and a draft starts it filled in with the campaign locked", () => {
    const base = { campaigns: [{ id: "c1", name: "UK", clientOrgId: "k1", clientName: "Kestrel" }], aliases: [], hosts: [{ id: "h1", campaignId: "c1", name: "Daniel Okafor", jobTitle: "Head of Sales" }], leadsHref: "/agency/leads" };
    const fresh = renderToStaticMarkup(<SubmitLeadForm {...base} />);
    expect(fresh).toContain("Save draft");
    expect(fresh).toContain("Submit lead");
    expect(fresh).toContain('name="draftId" value=""');
    const prefill = { id: "d1", campaignId: "c1", aliasIdentityId: null, hostMemberId: "h1", prospectName: "Priya Nair", prospectTitle: "", prospectCompany: "Harbour Freight", prospectDomain: "", prospectLinkedinUrl: "", prospectEmail: "", prospectPhone: null, prospectNotes: "Call back", bantBudget: "", bantAuthority: "", bantNeed: "", bantTimeline: "", proposedTimes: ["2026-11-27T09:00:00.000Z"] };
    const filled = renderToStaticMarkup(<SubmitLeadForm {...base} draft={prefill} />);
    expect(filled).toContain('name="draftId" value="d1"');
    expect(filled).toContain('value="Priya Nair"');
    expect(filled).toContain("Call back");
    expect(filled).toContain('name="proposedTimes" value="2026-11-27T09:00:00.000Z"');
  });
});

describe("the time list follows the host", () => {
  const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 }));
  it("shows the host's weekly hours and zone, and asks for a host first when there is none", () => {
    const html = renderToStaticMarkup(<HostTimesField availability={{ timeZone: "Europe/London", hours: week, blocks: [] }} hostName="Daniel Okafor" />);
    expect(html).toContain("Daniel Okafor&#x27;s hours");
    expect(html).toContain("Mon to Fri 9:00 am to 5:00 pm");
    expect(html).toContain("Europe/London");
    expect(html).toContain("Pick a day");
    expect(renderToStaticMarkup(<HostTimesField availability={null} hostName={null} />)).toContain("Choose a host");
  });
  it("warns, without blocking, for a saved time outside the hours and for a host with no hours", () => {
    const outside = renderToStaticMarkup(<HostTimesField availability={{ timeZone: "Europe/London", hours: week, blocks: [] }} hostName="D" initialTimes={["2026-11-28T09:00:00.000Z"]} />);
    expect(outside).toContain("outside the host&#x27;s working hours");
    expect(outside).toContain("You can still send the lead");
    const none = renderToStaticMarkup(<HostTimesField availability={{ timeZone: null, hours: [], blocks: [] }} hostName="D" initialTimes={["2026-11-27T09:00:00.000Z"]} />);
    expect(none).toContain("has not set working hours");
    expect(renderToStaticMarkup(<HostTimesField availability={{ timeZone: "Europe/London", hours: week, blocks: [] }} hostName="D" initialTimes={["2026-11-27T10:00:00.000Z"]} />)).not.toContain("You can still send the lead");
  });
  it("shows the same moment in the host's zone and in the viewer's", () => {
    const html = renderToStaticMarkup(<HostTimesField availability={{ timeZone: "Asia/Kolkata", hours: week, blocks: [] }} hostName="D" initialTimes={["2026-11-27T09:00:00.000Z"]} />);
    expect(html).toContain("Host: Fri 27 Nov, 2:30 pm IST");
    expect(html).toContain("For you:");
  });
});

describe("Fynix: contests, review requests and the overview", () => {
  const contest = { leadId: "l1", leadRef: "LD-3K7M", meetingId: "m1", campaignName: "UK mid-market", clientName: "Kestrel Ledger", agencyName: "Calder Bay Media", prospectName: "Priya Nair", prospectCompany: "Harbour", outcome: "client_no_show", recordedByRole: "agency", recordedAt: past, contestedByRole: "client", contestNote: "We were there at nine.", contestedAt: past, meetingNotes: null };
  it("lists a contest with who recorded, who contested, the note and a Decide form", () => {
    const html = renderToStaticMarkup(<ContestsTable rows={[contest]} now={now} />);
    expect(html).toContain("Recorded as client no-show by the agency, contested by the client");
    expect(html).toContain("We were there at nine.");
    expect(html).toContain("Decide");
    expect(html).toContain('href="/fynix/leads/LD-3K7M"');
    expect(renderToStaticMarkup(<ContestsTable rows={[]} now={now} />)).toContain("No contests");
  });
  it("marks a rejection with a review request and offers Mark reviewed", () => {
    const row = { leadId: "l1", leadRef: "LD-3K7M", campaignId: "c1", campaignName: "UK", clientName: "Kestrel", agencyName: "Calder", prospectName: "Priya", prospectCompany: "Harbour", note: "Wrong person", rejectedAt: past, rejectedByName: null, meetingTime: past, reviewedAt: null };
    const review = { reviewId: "v1", leadId: "l1", leadRef: "LD-3K7M", campaignName: "UK", clientName: "Kestrel", agencyName: "Calder", prospectName: "Priya", prospectCompany: "Harbour", rejectionNote: "Wrong person", rejectedAt: past, requestNote: "He is the buyer", requestedAt: now, requestedByName: "Imogen", status: "open" as const, resolvedAt: null };
    const html = renderToStaticMarkup(<RejectionsTable rows={[row]} now={now} reviews={{ l1: review }} />);
    expect(html).toContain("Review requested");
    expect(html).toContain("He is the buyer");
    expect(html).toContain("Mark reviewed");
    expect(renderToStaticMarkup(<RejectionsTable rows={[row]} now={now} />)).not.toContain("Review requested");
  });
  it("the overview cards show delivered against target by agency, the oldest wait and the overdue outcomes, each linking to its table", () => {
    const html = renderToStaticMarkup(
      <PipelineHealthCards
        health={{
          campaigns: [{ campaignId: "c1", campaignName: "UK mid-market", clientName: "Kestrel", month: "2026-11", target: 20, delivered: 9, byAgency: [{ agencyOrgId: "a1", agencyName: "Calder Bay", share: 12, delivered: 6 }, { agencyOrgId: "a2", agencyName: "Northgate", share: 0, delivered: 3 }] }],
          oldestWaiting: { leadId: "l1", leadRef: "LD-AAAA", campaignName: "UK mid-market", waitingHours: 60 },
          overdueOutcomes: [{ leadId: "l2", leadRef: "LD-BBBB", campaignName: "UK mid-market", meetingTime: past, overdueHours: 5 }],
        }}
      />,
    );
    expect(html).toContain("9 of 20");
    expect(html).toContain("Calder Bay 6 of 12");
    expect(html).toContain("Northgate 3");
    expect(html).toContain("2d");
    expect(html).toContain('href="/fynix/leads?stage=awaiting&amp;sort=submitted"');
    expect(html).toContain('href="/fynix/meetings?show=due&amp;sort=meeting"');
    expect(html).toContain('href="/fynix/leads?campaign=c1"');
  });
});

describe("the exclusion list", () => {
  const entry = { id: "e1", clientOrgId: "o1", kind: "domain" as const, value: "rival.example", reason: "Competitor", createdAt: now };
  it("lets a manager add and remove", () => {
    const html = renderToStaticMarkup(<ExclusionList entries={[entry]} clientOrgId="o1" canWrite />);
    expect(html).toContain("rival.example");
    expect(html).toContain("Competitor");
    expect(html).toContain("Add an exclusion");
    expect(html).toContain("Remove");
  });
  it("is read-only for anyone else", () => {
    const html = renderToStaticMarkup(<ExclusionList entries={[entry]} clientOrgId="o1" canWrite={false} />);
    expect(html).toContain("rival.example");
    expect(html).not.toContain("Add an exclusion");
    expect(html).not.toContain("Remove");
    expect(renderToStaticMarkup(<ExclusionList entries={[]} clientOrgId="o1" canWrite={false} />)).toContain("Nothing is excluded");
  });
});

describe("meetings table after phase 4", () => {
  const meeting = (over: Record<string, unknown> = {}): Parameters<typeof MeetingsTable>[0]["meetings"][number] => ({ id: "m1", publicRef: "MT-1", leadRef: "LD-1", campaignId: "c1", campaignName: "UK", prospectName: "Priya Nair", prospectCompany: "Harbour", googleMeetUrl: null, scheduledStartTime: future, durationMinutes: 30, outcome: "scheduled", leadStage: "scheduled", ...over });
  const table = (rows: Parameters<typeof MeetingsTable>[0]["meetings"][number][], props: Partial<Parameters<typeof MeetingsTable>[0]> = {}) => renderToStaticMarkup(<MeetingsTable meetings={rows} canWrite now={now} leadsPath="/client/leads" {...props} />);
  it("says New times proposed to the side that must pick, with a link to pick, and a waiting line to the side that proposed", () => {
    const html = table([meeting({ openProposalBy: "supply" })], { viewer: "client" });
    expect(html).toContain("New times proposed");
    expect(html).toContain("Pick a time");
    expect(html).toContain('href="/client/leads/LD-1"');
    const waiting = table([meeting({ openProposalBy: "client" })], { viewer: "client" });
    expect(waiting).toContain("Times proposed, waiting");
    expect(waiting).not.toContain("Pick a time");
  });
  it("offers Contest outcome with the time left to the other side, and marks a contested outcome", () => {
    const held = meeting({ outcome: "held", leadStage: "awaiting_decision", scheduledStartTime: past, recordedAt: new Date("2026-11-24T02:00:00Z"), recordedByRole: "agency" });
    expect(table([held], { viewer: "client" })).toContain("Contest outcome");
    expect(table([held], { viewer: "client" })).toContain("38h left");
    expect(table([held], { viewer: "supply" })).not.toContain("Contest outcome");
    expect(table([{ ...held, contestedAt: now, leadStage: "outcome_contested" }], { viewer: "client" })).toContain("Outcome contested");
  });
  it("shows the host column and sortable headers only when asked", () => {
    const plain = table([meeting({ hostName: "Daniel Okafor" })], {});
    expect(plain).not.toContain("Daniel Okafor");
    const full = table([meeting({ hostName: "Daniel Okafor" })], { showHost: true, sortHref: (value) => `/client/meetings?sort=${value}` });
    expect(full).toContain("Daniel Okafor");
    expect(full).toContain('href="/client/meetings?sort=prospect"');
    expect(full).toContain('href="/client/meetings?sort=meeting"');
  });
});

describe("sorting and exports", () => {
  it("a sortable header links to the next order and says which way it is sorted", () => {
    const head = (sort: Parameters<typeof SortHead>[0]["sort"]) =>
      renderToStaticMarkup(
        <table>
          <thead>
            <tr>
              <SortHead label="Prospect" sortKey="prospect" sort={sort} hrefFor={(value) => `/x?sort=${value}`} />
            </tr>
          </thead>
        </table>,
      );
    expect(head(null)).toContain('href="/x?sort=prospect"');
    expect(head({ key: "prospect", dir: "asc" })).toContain('href="/x?sort=-prospect"');
    expect(head({ key: "prospect", dir: "asc" })).toContain('aria-sort="ascending"');
    expect(head({ key: "stage", dir: "asc" })).toContain('aria-sort="none"');
  });
  it("the export link points at the file route, with the campaign when one is chosen", () => {
    expect(exportHref("leads", null)).toBe("/api/export/leads");
    expect(exportHref("meetings", "c 1")).toBe("/api/export/meetings?campaign=c%201");
    expect(renderToStaticMarkup(<ExportButton href="/api/export/leads" />)).toContain("download");
  });
});
