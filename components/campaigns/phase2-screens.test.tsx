import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TenantAgreementCard } from "@/server/domain/agreement-cards";
import type { TenantAgreementVersion } from "@/server/domain/agreements-tenant";
import type { TenantCampaign } from "@/server/domain/campaigns-tenant";

// Forms and buttons call server actions, which need a running app. The screens only need their buttons to render.
vi.mock("@/server/domain/agreement-actions", () => ({ acceptAgreementAction: async () => ({ status: "idle" as const }) }));
vi.mock("@/server/domain/share-actions", () => ({ assignShareAction: async () => ({ status: "success" as const }), unassignShareAction: async () => ({ status: "success" as const }) }));
vi.mock("@/server/domain/alias-actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { createAliasAction: action, verifyAliasAction: action, updateAliasAction: action, retireAliasAction: action };
});
vi.mock("@/server/domain/lead-actions", () => ({ submitLeadAction: async () => ({ status: "idle" as const }), IDLE_TENANT_ACTION: { status: "idle" as const } }));
vi.mock("@/server/domain/team-actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { addClientHostAction: action, pauseClientHostAction: action, setOwnHoursAction: action, addOwnBlockAction: action, removeOwnBlockAction: action };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

const { AgreementsView } = await import("@/components/agreements/agreements-view");
const { CampaignsView } = await import("@/components/campaigns/campaigns-view");
const { HostsView } = await import("@/components/hosts/hosts-view");
const { AliasesView } = await import("@/components/aliases/aliases-view");
const { SubmitLeadForm } = await import("@/components/leads/submit-lead-form");
const { CampaignFilter } = await import("@/components/kit/campaign-filter");
const { FynixLeadsView } = await import("@/components/leads/fynix-leads-view");
const { MeetingsTable } = await import("@/components/meetings/meetings-table");

const version = (over: Partial<TenantAgreementVersion>): TenantAgreementVersion => ({
  id: "a1",
  version: 1,
  status: "current",
  monthlyTarget: 12,
  totalTarget: 72,
  disputeWindowHours: 48,
  rules: "A meeting counts when it is held.",
  publishedAt: new Date("2026-11-03T12:00:00Z"),
  ownSide: null,
  otherSideAcceptedAt: null,
  inForce: false,
  ...over,
});
const card = (over: Partial<TenantAgreementCard>): TenantAgreementCard => ({ campaignId: "c1", campaignName: "UK finance teams", clientName: "Kestrel", closed: false, inForce: null, pending: null, history: [], ...over });

describe("Agreement page", () => {
  it("shows the version in force, a newer one waiting with Accept, and the history", () => {
    const inForce = version({ id: "a2", version: 2, inForce: true, status: "superseded", ownSide: { by: "Priya Nair", at: new Date("2026-11-04T12:00:00Z") }, otherSideAcceptedAt: new Date("2026-11-05T12:00:00Z") });
    const html = renderToStaticMarkup(
      <AgreementsView cards={[card({ inForce, pending: version({ id: "a3", version: 3, monthlyTarget: 15 }), history: [version({ id: "a1", version: 1, status: "superseded" })] })]} canAccept emptyText="none" otherLabel="The coordinator" />,
    );
    expect(html).toContain("In force: version 2");
    expect(html).toContain("Newer version 3");
    expect(html).toContain("Version 2 stays in force until both sides accept this one.");
    expect(html).toContain("Accept this version");
    expect(html).toContain("Your side: waiting");
    expect(html).toContain("The coordinator: waiting");
    expect(html).toContain("History");
    expect(html).toContain("Version 1: 12 a month, 72 in total");
  });

  it("offers no Accept to a person who is not a manager, to a side that has accepted, or on a closed campaign", () => {
    const pending = version({ id: "a3", version: 3 });
    expect(renderToStaticMarkup(<AgreementsView cards={[card({ pending })]} canAccept={false} emptyText="" otherLabel="The client" />)).toContain("A manager of your organisation accepts agreements.");
    const accepted = renderToStaticMarkup(<AgreementsView cards={[card({ pending: version({ ownSide: { by: "Priya Nair", at: new Date("2026-11-04T12:00:00Z") } }) })]} canAccept emptyText="" otherLabel="The client" />);
    expect(accepted).not.toContain("Accept this version");
    expect(accepted).toContain("Your side has accepted");
    const closed = renderToStaticMarkup(<AgreementsView cards={[card({ pending, closed: true })]} canAccept emptyText="" otherLabel="The client" />);
    expect(closed).not.toContain("Accept this version");
    expect(closed).toContain("Closed, read only");
  });

  it("says when no agreement is published", () => {
    expect(renderToStaticMarkup(<AgreementsView cards={[]} canAccept emptyText="Fynix publishes it." otherLabel="x" />)).toContain("Fynix publishes it.");
  });
});

const campaign = (over: Partial<TenantCampaign>): TenantCampaign => ({
  id: "c1",
  publicRef: "CMP-7Q2X",
  name: "UK finance teams",
  clientName: "Kestrel",
  status: "active",
  startDate: "2026-12-01",
  endDate: "2027-05-31",
  monthlyTarget: 12,
  totalTarget: 72,
  delivered: 3,
  inProgress: 2,
  share: 12,
  agencies: [{ agencyOrgId: "ag1", name: "Calder Bay", monthlyShare: 4, delivered: 1 }],
  brief: { geography: "UK", industries: [], companySize: "", icp: "", jobTitles: [], seniority: "", technologies: [], bantBudget: "", bantAuthority: "", bantNeed: "", bantTimeline: "", instructions: "", pitchIntroduction: "", pitchServices: "", pitchDifferentiator: "", pitchCollaterals: "", pitchCaseStudies: "", qualifyingQuestions: "", firstEmail: "", secondEmail: "" },
  ...over,
});
const assign = { ownOrgId: "o1", agencies: [{ id: "ag1", name: "Calder Bay" }], canManage: true };

describe("Campaign cards", () => {
  const campaigns = [campaign({}), campaign({ id: "c2", name: "Old campaign", status: "completed" }), campaign({ id: "c3", name: "New campaign", status: "draft" })];

  it("open on Active with counts on the tabs, and hide closed and setting up campaigns", () => {
    const html = renderToStaticMarkup(<CampaignsView campaigns={campaigns} portal="coordinator" basePath="/coordinator/campaigns" submitHref="/coordinator/leads/new" assign={assign} />);
    for (const label of ["Active", "Setting up", "Closed", "All"]) expect(html).toContain(label);
    expect(html).toContain("UK finance teams");
    expect(html).not.toContain("Old campaign");
    expect(html).toContain("/coordinator/campaigns?status=closed");
  });

  it("shows a closed campaign read only: no assign, no take back, no submit", () => {
    const active = renderToStaticMarkup(<CampaignsView campaigns={campaigns} portal="coordinator" basePath="/coordinator/campaigns" submitHref="/coordinator/leads/new" assign={assign} />);
    expect(active).toContain("Assign to an agency");
    expect(active).toContain("Submit a lead");
    const closed = renderToStaticMarkup(<CampaignsView campaigns={[campaign({ status: "completed" })]} tab="closed" portal="coordinator" basePath="/coordinator/campaigns" submitHref="/coordinator/leads/new" assign={assign} />);
    expect(closed).toContain("Closed");
    expect(closed).toContain("read only");
    expect(closed).not.toContain("Assign to an agency");
    expect(closed).not.toContain("Take the campaign back");
    expect(closed).not.toContain("Submit a lead");
  });

  it("says what the other tabs hold when the open tab is empty", () => {
    const html = renderToStaticMarkup(<CampaignsView campaigns={[campaign({ status: "completed" })]} portal="client" basePath="/client/campaigns" />);
    expect(html).toContain("No active campaigns");
    expect(html).toContain("0 active, 0 being set up, 1 closed");
  });
});

describe("Working hours", () => {
  const host = (over: object = {}) => ({
    memberId: "m1",
    name: "Priya Nair",
    jobTitle: "Head of Ops",
    own: false,
    windows: [],
    week: [{ day: "Monday", ranges: ["09:00 to 17:00"] }],
    timeZone: "Europe/London",
    blocks: [{ id: "b1", startsAt: "2026-12-01T09:00:00Z", endsAt: "2026-12-01T17:00:00Z", note: null }],
    ...over,
  });
  it("lists the people of the client and offers no way to add or pause anyone", () => {
    const html = renderToStaticMarkup(<HostsView hosts={[host()]} basePath="/client/hours" />);
    expect(html).toContain("Priya Nair");
    expect(html).not.toContain("Add host");
    expect(html).not.toContain("Pause");
    expect(html).not.toContain("UK finance teams");
  });

  it("says what a person with no hours counts as", () => {
    const own = renderToStaticMarkup(<HostsView hosts={[host({ own: true, week: [{ day: "Monday", ranges: [] }] })]} basePath="/client/hours" />);
    expect(own).toContain("Until you set your hours, you count as free Monday to Friday, 09:00 to 17:00.");
    const other = renderToStaticMarkup(<HostsView hosts={[host({ week: [{ day: "Monday", ranges: [] }] })]} basePath="/client/hours" />);
    expect(other).toContain("Until they set their hours, they count as free Monday to Friday, 09:00 to 17:00.");
  });

  it("gives a person their own hours and blocked times, and nobody else's", () => {
    const own = renderToStaticMarkup(<HostsView hosts={[host({ own: true })]} basePath="/client/hours" />);
    expect(own).toContain("Edit my hours");
    expect(own).toContain("Block a time");
    expect(own).toContain("Remove");
    expect(own).not.toContain("Add host");
    const other = renderToStaticMarkup(<HostsView hosts={[host()]} basePath="/client/hours" />);
    expect(other).not.toContain("Edit my hours");
    expect(other).not.toContain("Block a time");
  });
});

describe("Aliases", () => {
  const clients = [{ id: "k1", name: "Kestrel" }];
  const alias = { publicRef: "ALI-AAAA", displayName: "Maya Hart", jobTitle: "Sales lead", clientName: "Kestrel", aliasEmail: "maya@x.example", verified: true, clientOrgId: "k1", retired: false };

  it("says the client is not set on an alias that never picked one", () => {
    const html = renderToStaticMarkup(<AliasesView aliases={[{ ...alias, clientName: "", clientOrgId: null }]} clients={clients} canWrite />);
    expect(html).toContain("Sales lead, client not set");
  });

  it("offers Edit and Retire on an active alias, and neither on a retired one", () => {
    const active = renderToStaticMarkup(<AliasesView aliases={[alias]} clients={clients} canWrite />);
    expect(active).toContain("Edit");
    expect(active).toContain("Retire");
    const retired = renderToStaticMarkup(<AliasesView aliases={[{ ...alias, retired: true }]} clients={clients} canWrite />);
    expect(retired).toContain("Retired");
    expect(retired).not.toContain("Retire Maya");
  });
});

describe("Submit a lead", () => {
  it("names why each campaign is not live instead of saying nothing is assigned", () => {
    const html = renderToStaticMarkup(
      <SubmitLeadForm campaigns={[]} aliases={[]} hosts={[]} leadsHref="/agency/leads" notLive={[{ campaignId: "c1", name: "UK finance teams", reason: "The client has not accepted the agreement yet." }]} />,
    );
    expect(html).toContain("Not live yet: The client has not accepted the agreement yet.");
    expect(html).toContain("UK finance teams");
  });
});

describe("Campaign filter", () => {
  it("lists active campaigns first and the closed ones in their own group", () => {
    const html = renderToStaticMarkup(
      <CampaignFilter
        campaigns={[{ id: "a", name: "Old", status: "completed" }, { id: "b", name: "Live", status: "active" }]}
        selected="b"
        allHref="/x"
        hrefs={{ a: "/x?campaign=a", b: "/x?campaign=b" }}
      />,
    );
    expect(html.indexOf('label="Active"')).toBeLessThan(html.indexOf('label="Closed"'));
    expect(html).toContain("All campaigns");
  });
});

describe("Closed tag on rows", () => {
  const lead = { id: "l1", publicRef: "LD-1", campaignId: "c2", campaignName: "Old campaign", clientName: "Kestrel", prospectName: "Dana", prospectCompany: "Acme Ltd", prospectDomain: "acme.example", stage: "delivered", scheduledMeetingTime: null, submittedAt: new Date("2026-11-01T10:00:00Z"), overShare: false };

  it("tags a lead whose campaign is closed, and shows the campaign column", () => {
    const campaigns = [{ id: "c2", name: "Old campaign", status: "completed" as const }];
    const html = renderToStaticMarkup(<FynixLeadsView leads={[lead]} basePath="/fynix/leads" group={null} q="" page={1} campaigns={campaigns} emptyText="none" />);
    expect(html).toContain("Closed");
    expect(html).toContain("Old campaign");
    expect(html).toContain("All campaigns");
  });

  it("drops the campaign column and filter inside one campaign", () => {
    const html = renderToStaticMarkup(<FynixLeadsView leads={[lead]} basePath="/fynix/campaigns/CMP-1/leads" group={null} q="" page={1} emptyText="none" />);
    expect(html).not.toContain("All campaigns");
  });

  it("tags a meeting whose campaign is closed", () => {
    const meeting = { id: "mt1", publicRef: "MTG-1", campaignId: "c2", campaignName: "Old campaign", prospectName: "Dana", prospectCompany: "Acme Ltd", googleMeetUrl: null, scheduledStartTime: new Date("2026-11-01T10:00:00Z"), durationMinutes: 30, outcome: "held", leadRef: "LD-1" };
    expect(renderToStaticMarkup(<MeetingsTable meetings={[meeting]} canWrite={false} now={new Date("2026-11-20T10:00:00Z")} closedCampaigns={new Set(["c2"])} />)).toContain("Closed");
    expect(renderToStaticMarkup(<MeetingsTable meetings={[meeting]} canWrite={false} now={new Date("2026-11-20T10:00:00Z")} />)).not.toContain("Closed");
  });
});
