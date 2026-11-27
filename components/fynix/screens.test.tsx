import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgreementsPage, CampaignHeader, CampaignRow, HostView } from "@/server/domain/campaign-overview";
import type { AgencyDetail, AgencyRow } from "@/server/domain/agency-overview";
import type { ClientDetail, ClientRow } from "@/server/domain/client-overview";
import type { OrganisationContact } from "@/server/domain/organisations";
import type { PersonRow } from "@/server/domain/people-overview";
import type { CoordinatorDetail, CoordinatorRow } from "@/server/domain/coordinator-overview";

// The forms call server actions, which need a running app. The screens only need their buttons to render.
vi.mock("@/server/fynix/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { addCoordinatorAction: action, addAgencyAction: action, invitePersonAction: action, publishAgreementAction: action, setShareAction: action, removeShareAction: action, closeCampaignAction: action, makeCampaignActiveAction: action, reopenCampaignAction: action, addHostAction: action, pauseHostAction: action, setHoursAction: action, addBlockAction: action, removeBlockAction: action, setOrganisationStatusAction: action, updateOrganisationAction: action, updateContactAction: action, addClientAction: action, updatePersonAction: action, suspendPersonAction: action, reactivatePersonAction: action, resendInviteAction: action, revokeInviteAction: action };
});

const { CoordinatorsTable } = await import("@/components/fynix/coordinators/coordinators-table");
const { CoordinatorOverview } = await import("@/components/fynix/coordinators/coordinator-overview");
const { CoordinatorTitle } = await import("@/components/fynix/coordinators/coordinator-title");
const { AgenciesPanel } = await import("@/components/fynix/coordinators/agencies-panel");
const { AgenciesTable } = await import("@/components/fynix/agencies/agencies-table");
const { AgencyOverview } = await import("@/components/fynix/agencies/agency-overview");
const { AgencyTitle } = await import("@/components/fynix/agencies/agency-title");
const { AgencyCampaignsPanel } = await import("@/components/fynix/agencies/agency-campaigns-panel");
const { ContactPanel } = await import("@/components/fynix/records/contact-panel");
const { PeopleTable } = await import("@/components/fynix/people/people-table");
const { ClientOverview } = await import("@/components/fynix/clients/client-overview");
const { ClientTitle } = await import("@/components/fynix/clients/client-title");
const { SetupChecklist } = await import("@/components/fynix/setup-checklist");
const { ActivityPanel, CampaignsPanel } = await import("@/components/fynix/records/record-panels");
const { CampaignsTable } = await import("@/components/fynix/campaigns/campaigns-table");
const { AgreementCard } = await import("@/components/fynix/campaigns/agreement-card");
const { SharesCard } = await import("@/components/fynix/campaigns/shares-card");
const { HostsTable } = await import("@/components/fynix/campaigns/hosts-table");
const { HostPanel } = await import("@/components/fynix/campaigns/host-panel");
const { BriefView } = await import("@/components/fynix/campaigns/brief-view");
const { ClientsTable } = await import("@/components/fynix/clients/clients-table");
const { CampaignTitle } = await import("@/components/fynix/campaigns/campaign-header");

vi.mock("next/navigation", () => ({ useSelectedLayoutSegment: () => "hosts", useRouter: () => ({ push: () => undefined }) }));

const NO_CONTACT: OrganisationContact = { contactName: null, contactEmail: null, contactPhone: null, website: null, address: null, notes: null };
const FULL_CONTACT: OrganisationContact = { contactName: "Asha Rao", contactEmail: "asha@northgate.example", contactPhone: "+44 20 7946 0958", website: "https://northgate.example", address: "12 Mill Lane\nLeeds LS1 4AB", notes: "Prefers email." };
const day = (text: string) => new Date(`${text}T12:00:00Z`);
const coordinatorRow = (over: Partial<CoordinatorRow> = {}): CoordinatorRow => ({ id: "s1", publicRef: "ORG-N7GT", name: "Northgate Outreach", status: "active", createdAt: day("2026-10-02"), contactEmail: null, agencyCount: 2, agencyNames: ["Calder Bay Media"], peopleCount: 7, campaignCount: 2, inviteWaiting: false, campaignCounts: { setup: 0, active: 1, closed: 1 }, ...over });
const detail: CoordinatorDetail = {
  id: "s1",
  publicRef: "ORG-N7GT",
  name: "Northgate Outreach",
  status: "active",
  createdAt: day("2026-10-02"),
  agencies: [{ id: "a1", publicRef: "ORG-AAAA", name: "Calder Bay Media", status: "active", peopleCount: 2, campaignCount: 1 }],
  people: [
    { name: "Nikhil Oberoi", email: "nikhil@northgate.example", role: "manager", state: "active" },
    { name: "Aditi Rao", email: "aditi@northgate.example", role: "member", state: "invited" },
  ],
  peopleTotal: 7,
  campaigns: [{ id: "c1", publicRef: "CMP-7Q2X", name: "UK mid-market finance teams", status: "active", clientName: "Kestrel Ledger" }],
  campaignCounts: { setup: 0, active: 1, closed: 0 },
  timeZone: "Europe/London",
  contact: NO_CONTACT,
  everyone: [
    { kind: "member", id: "m1", userId: "u1", orgId: "s1", orgName: "Northgate Outreach", name: "Nikhil Oberoi", jobTitle: "Director", email: "nikhil@northgate.example", phone: "+44 20 7946 0000", role: "manager", state: "active" },
    { kind: "member", id: "m2", userId: "u2", orgId: "a1", orgName: "Calder Bay Media", name: "Ines Caetano", jobTitle: "Caller", email: "ines@calder.example", phone: null, role: "member", state: "suspended" },
    { kind: "invite", id: "i1", userId: null, orgId: "s1", orgName: "Northgate Outreach", name: "Aditi Rao", jobTitle: "Caller", email: "aditi@northgate.example", phone: null, role: "member", state: "invited" },
  ],
  activity: [],
};

describe("Coordinators", () => {
  it("renders the table with the filter, the selection and a row per coordinator", () => {
    const html = renderToStaticMarkup(<CoordinatorsTable rows={[coordinatorRow(), coordinatorRow({ id: "s2", publicRef: "ORG-S2MD", name: "Saltmarsh Demand", agencyCount: 0, peopleCount: 0, campaignCount: 0, inviteWaiting: true }), coordinatorRow({ id: "s3", name: "Old One", status: "archived" })]} filter="active" query="" canWrite />);
    expect(html).toContain("All coordinators");
    expect(html).toContain("Northgate Outreach");
    expect(html).toContain("Invite sent, not accepted yet");
    expect(html).toContain("/fynix/coordinators/ORG-N7GT");
    expect(html).toContain("1 active, 1 closed");
    expect(html).not.toContain("Old One");
  });

  it("says there are no coordinators, with the action for an admin and a plain line for staff", () => {
    expect(renderToStaticMarkup(<CoordinatorsTable rows={[]} filter="active" query="" canWrite />)).toContain("Add coordinator");
    const staff = renderToStaticMarkup(<CoordinatorsTable rows={[]} filter="active" query="" canWrite={false} />);
    expect(staff).toContain("No coordinators yet");
    expect(staff).not.toContain("Add coordinator");
  });

  it("says nothing matches a search", () => {
    expect(renderToStaticMarkup(<CoordinatorsTable rows={[coordinatorRow()]} filter="active" query="zzz" canWrite />)).toContain("No coordinator matches");
  });

  it("shows the overview with the counts, and the title's Edit and Archive only for an admin", () => {
    expect(renderToStaticMarkup(<CoordinatorOverview coordinator={detail} />)).toContain("1 active");
    const admin = renderToStaticMarkup(<CoordinatorTitle coordinator={detail} canWrite />);
    expect(admin).toContain("Edit");
    expect(admin).toContain("Archive");
    expect(admin).toContain("/fynix/coordinators/ORG-N7GT/people");
    const staff = renderToStaticMarkup(<CoordinatorTitle coordinator={detail} canWrite={false} />);
    expect(staff).not.toContain("Archive");
    expect(renderToStaticMarkup(<CoordinatorTitle coordinator={{ ...detail, status: "archived" }} canWrite />)).toContain("Restore");
  });

  it("lists the partner agencies, and Add agency only for an admin of an active coordinator", () => {
    expect(renderToStaticMarkup(<AgenciesPanel coordinator={detail} canWrite />)).toContain("Add agency");
    expect(renderToStaticMarkup(<AgenciesPanel coordinator={detail} canWrite={false} />)).not.toContain("Add agency");
    expect(renderToStaticMarkup(<AgenciesPanel coordinator={{ ...detail, status: "archived" }} canWrite />)).not.toContain("Add agency");
  });
});

const person = (over: Partial<PersonRow> = {}): PersonRow => ({ kind: "member", id: "m1", userId: "u1", orgId: "k1", orgName: "Kestrel Ledger", name: "Imogen Price", jobTitle: "Head of Sales", email: "imogen@kestrel.example", phone: null, role: "manager", state: "active", ...over });

describe("People", () => {
  it("shows name, job title, email, phone, role and status, with row actions for an admin", () => {
    const html = renderToStaticMarkup(<PeopleTable people={[person(), person({ id: "m2", userId: "u2", name: "Tom Hale", state: "suspended", phone: "+44 7700 900123" }), person({ kind: "invite", id: "i1", userId: null, name: "Aditi Rao", state: "invited" })]} canWrite selfUserId="u1" />);
    expect(html).toContain("Head of Sales");
    expect(html).toContain("imogen@kestrel.example");
    expect(html).toContain("+44 7700 900123");
    expect(html).toContain("Reactivate Tom Hale");
    expect(html).toContain("Resend the invite to Aditi Rao");
    expect(html).toContain("Revoke the invite to Aditi Rao");
    expect(html).not.toContain("Suspend Imogen Price");
  });

  it("offers suspend on another active person and nothing at all to staff", () => {
    expect(renderToStaticMarkup(<PeopleTable people={[person({ userId: "u9" })]} canWrite selfUserId="u1" />)).toContain("Suspend Imogen Price");
    const staff = renderToStaticMarkup(<PeopleTable people={[person()]} canWrite={false} selfUserId="u1" />);
    expect(staff).not.toContain("Suspend");
    expect(staff).not.toContain("Edit");
  });

  it("adds the Agency column for a coordinator and says when nobody is here", () => {
    expect(renderToStaticMarkup(<PeopleTable people={[person()]} canWrite={false} selfUserId="u1" showOrganisation />)).toContain("Agency");
    expect(renderToStaticMarkup(<PeopleTable people={[]} canWrite selfUserId="u1" />)).toContain("Nobody here yet");
  });
});

const clientDetail: ClientDetail = {
  id: "k1",
  publicRef: "ORG-K1AA",
  name: "Kestrel Ledger",
  timeZone: "Europe/London",
  contact: NO_CONTACT,
  status: "active",
  createdAt: day("2026-10-02"),
  profile: { clientOrgId: "k1", introduction: "Accounts software for finance teams.", services: "Ledger and close tooling.", differentiator: "Closes the books in a day.", caseStudies: null },
  contacts: [],
  collateral: [{ id: "x1", clientOrgId: "k1", kind: "link", title: "Company brochure", url: "https://kestrel.example/brochure", createdAt: day("2026-10-03") }],
  people: [person()],
  campaigns: [],
  campaignCounts: { setup: 0, active: 0, closed: 0 },
  activity: [],
};

describe("Client record", () => {
  it("shows an earlier profile and earlier collateral read only, with no way to add or edit them", () => {
    const html = renderToStaticMarkup(<ClientOverview client={clientDetail} canWrite />);
    expect(html).toContain("Earlier profile");
    expect(html).toContain("Accounts software for finance teams.");
    expect(html).toContain("Closes the books in a day.");
    expect(html).toContain("Earlier collateral");
    expect(html).toContain("https://kestrel.example/brochure");
    expect(html).not.toContain("Remove Company brochure");
    expect(html).not.toContain("Edit profile");
    expect(html).not.toContain("Add link");
    // Saved contacts can be invited, and no new one is added from here.
    expect(html).toContain("Saved contacts");
    expect(html).not.toContain("Add contact");
  });

  it("shows no profile or collateral panel when a client has none", () => {
    const html = renderToStaticMarkup(<ClientOverview client={{ ...clientDetail, profile: null, collateral: [] }} canWrite />);
    expect(html).not.toContain("Earlier profile");
    expect(html).not.toContain("Earlier collateral");
  });

  it("is read only for staff", () => {
    const html = renderToStaticMarkup(<ClientOverview client={clientDetail} canWrite={false} />);
    expect(html).toContain("Company brochure");
    expect(html).not.toContain("Remove");
    expect(html).not.toContain("Edit profile");
    expect(html).not.toContain("Add link");
  });

  it("has four tabs, an Archived badge and Restore for an archived client", () => {
    const html = renderToStaticMarkup(<ClientTitle client={{ ...clientDetail, status: "archived" }} canWrite />);
    for (const label of ["Overview", "People", "Campaigns", "Activity"]) expect(html).toContain(label);
    expect(html).toContain("Archived");
    expect(html).toContain("Restore");
    expect(renderToStaticMarkup(<ClientTitle client={clientDetail} canWrite={false} />)).not.toContain("Archive");
  });

  it("lists campaigns with their status and the recorded changes", () => {
    expect(renderToStaticMarkup(<CampaignsPanel rows={[{ id: "c1", publicRef: "CMP-7Q2X", name: "UK finance", status: "draft", other: "Served by Northgate" }]} />)).toContain("/fynix/campaigns/CMP-7Q2X");
    expect(renderToStaticMarkup(<ActivityPanel rows={[]} />)).toContain("Nothing recorded yet");
    expect(renderToStaticMarkup(<ActivityPanel rows={[{ id: "a1", at: day("2026-11-20"), action: "organisation.archive", by: "Gaurav" }]} />)).toContain("Archived");
  });
});

describe("Set-up checklist", () => {
  it("lists each item as a link, and collapses to one line when empty", () => {
    const html = renderToStaticMarkup(<SetupChecklist items={[{ key: "a", label: "Kestrel Ledger has no manager yet", href: "/fynix/clients/ORG-K1AA/people" }]} />);
    expect(html).toContain('href="/fynix/clients/ORG-K1AA/people"');
    expect(renderToStaticMarkup(<SetupChecklist items={[]} />)).toContain("Everything is set up");
  });
});

const campaignRow: CampaignRow = { id: "c1", publicRef: "CMP-7Q2X", name: "UK mid-market finance teams", status: "active", clientName: "Kestrel Ledger", coordinatorName: "Northgate Outreach" };
const header: CampaignHeader = {
  id: "c1",
  publicRef: "CMP-7Q2X",
  name: "UK mid-market finance teams",
  status: "active",
  clientOrgId: "k",
  clientName: "Kestrel Ledger",
  clientRef: "ORG-K1AA",
  coordinatorOrgId: "s1",
  coordinatorName: "Northgate Outreach",
  timeZone: "Europe/London",
  meetingMinutes: 30,
  clientContacts: [],
  activeHostCount: 3,
  closedAt: null,
  brief: { startDate: "2026-12-01", endDate: "2027-05-31", monthlyTarget: 12, totalTarget: 72, geography: "", industries: [], companySize: "", icp: "", jobTitles: [], seniority: "", technologies: [], bantBudget: "", bantAuthority: "", bantNeed: "", bantTimeline: "", instructions: "", pitchIntroduction: "", pitchServices: "", pitchDifferentiator: "", pitchCollaterals: "", pitchCaseStudies: "", qualifyingQuestions: "", firstEmail: "", secondEmail: "", primaryContactId: null, internalNotes: null },
};

describe("Campaigns", () => {
  it("lists campaigns with a link to each, and says when there are none", () => {
    expect(renderToStaticMarkup(<CampaignsTable rows={[campaignRow]} />)).toContain("/fynix/campaigns/CMP-7Q2X");
    expect(renderToStaticMarkup(<CampaignsTable rows={[]} />)).toContain("No campaigns yet");
  });

  it("shows the brief read only, with Not set for what is empty", () => {
    const html = renderToStaticMarkup(<BriefView campaign={header} />);
    expect(html).toContain("2026-12-01 to 2027-05-31");
    expect(html).toContain("Not set");
  });
});

const agreements: AgreementsPage = {
  agreement: { inForceVersion: null, current: { version: 2, monthlyTarget: 12, totalTarget: 72, disputeWindowHours: 48, rules: "A meeting counts when it is held.", notes: "", createdAt: day("2026-11-03"), accepted: [{ name: "Daniel Okafor", at: day("2026-11-04"), side: "client" }] }, previous: { version: 1, createdAt: day("2026-10-02"), supersededAt: day("2026-11-03") }, history: [{ version: 1, monthlyTarget: 10, totalTarget: 60, createdAt: day("2026-10-02"), acceptedByBoth: true }] },
  shares: [
    { agencyOrgId: "s1", agencyName: "Northgate Outreach", ownBookings: true, monthlyShare: 4, countedByMonth: { "2026-11": 3 }, updatedAt: day("2026-11-02"), changedBy: "Meera Sethi" },
    { agencyOrgId: "a1", agencyName: "Ridgeline Partners", ownBookings: false, monthlyShare: 11, countedByMonth: {}, updatedAt: day("2026-11-05"), changedBy: null },
  ],
  summary: { totalShares: 15, campaignMonthlyTarget: 14, overAllocated: true },
  options: [{ id: "a2", name: "Calder Bay Media", ownBookings: false }],
};

describe("Agreements and shares", () => {
  it("shows the one agreement, who accepted it and the history line, and offers a new version only to an admin", () => {
    const admin = renderToStaticMarkup(<AgreementCard side={agreements.agreement} withName="Kestrel Ledger and Northgate Outreach" campaignId="c1" timeZone="Europe/London" canWrite suggested={{ monthlyTarget: 12, totalTarget: 72 }} />);
    expect(admin).toContain("Client: accepted by Daniel Okafor on Wed 4 Nov");
    expect(admin).toContain("Coordinator: waiting");
    expect(admin).toContain("Version 1: 10 a month, 60 in total");
    expect(admin).toContain("over 6 months");
    expect(admin).toContain("Version 1 published 2 Oct, superseded 3 Nov");
    expect(admin).toContain("New version");
    const staff = renderToStaticMarkup(<AgreementCard side={{ ...agreements.agreement, previous: null, history: [], current: agreements.agreement.current === null ? null : { ...agreements.agreement.current, accepted: [] } }} withName="Kestrel Ledger and Northgate Outreach" campaignId="c1" timeZone="Europe/London" canWrite={false} suggested={{ monthlyTarget: 12, totalTarget: 72 }} />);
    expect(staff).toContain("Waiting");
    expect(staff).toContain("Client: waiting");
    expect(staff).toContain("No earlier versions");
    expect(staff).not.toContain("New version");
  });

  it("offers a first version when there is no agreement", () => {
    expect(renderToStaticMarkup(<AgreementCard side={{ current: null, inForceVersion: null, previous: null, history: [] }} withName="Kestrel Ledger" campaignId="c1" timeZone="Europe/London" canWrite suggested={{ monthlyTarget: 12, totalTarget: 72 }} />)).toContain("First version");
  });

  it("shows the shares, the total against the target and the over-allocation notice", () => {
    const html = renderToStaticMarkup(<SharesCard page={agreements} campaignId="c1" coordinatorName="Northgate Outreach" timeZone="Europe/London" now={day("2026-11-13")} campaignMonthly={14} canWrite />);
    expect(html).toContain("15 of 14");
    expect(html).toContain("Shares add up to 15 a month, 1 more than the campaign&#x27;s target of 14.");
    expect(html).toContain("Accepted in November");
    expect(html).not.toContain("Not counted yet");
    expect(html).toContain("Meera Sethi, Fynix, 2 Nov");
    expect(html).toContain("Own bookings");
    expect(html).toContain("Add share");
  });

  it("hides every write control from staff and says when there are no shares", () => {
    const staff = renderToStaticMarkup(<SharesCard page={agreements} campaignId="c1" coordinatorName="Northgate Outreach" timeZone="Europe/London" now={day("2026-11-13")} campaignMonthly={14} canWrite={false} />);
    expect(staff).not.toContain("Add share");
    expect(staff).not.toContain("Edit the share");
    const empty = renderToStaticMarkup(<SharesCard page={{ ...agreements, shares: [], summary: { totalShares: 0, campaignMonthlyTarget: null, overAllocated: false } }} campaignId="c1" coordinatorName="Northgate Outreach" timeZone="Europe/London" now={day("2026-11-13")} campaignMonthly={14} canWrite />);
    expect(empty).toContain("No shares yet");
  });
});

const imogen: HostView = {
  memberId: "m2",
  displayName: "Imogen Price",
  jobTitle: "Head of FP&A",
  timeZone: "Europe/London",
  hours: [1, 2, 4].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 })).concat([{ weekday: 3, startMinute: 540, endMinute: 720 }, { weekday: 3, startMinute: 840, endMinute: 1020 }, { weekday: 5, startMinute: 540, endMinute: 780 }]),
  blocks: [{ id: "b1", startsAt: new Date("2026-11-23T00:00:00Z"), endsAt: new Date("2026-11-24T00:00:00Z"), note: "Board meeting" }],
};
const theo: HostView = { memberId: "m3", displayName: "Theo Lindqvist", jobTitle: "CFO", timeZone: null, hours: [], blocks: [] };

describe("Client team", () => {
  it("shows the weekly hours summary and the next block of each person, and what a person with no hours counts as", () => {
    const html = renderToStaticMarkup(<HostsTable hosts={[imogen, theo]} reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" selectedId={undefined} canWrite inviteHref="/fynix/clients/ORG-K1AA/people/new" />);
    expect(html).toContain("Mon to Fri");
    expect(html).toContain("Split on Wednesdays");
    expect(html).toContain("Mon 23 Nov");
    expect(html).toContain("All day");
    expect(html).toContain("Counts as Mon to Fri, 09:00 to 17:00");
    expect(html).toContain("/fynix/campaigns/CMP-7Q2X/team?person=m2");
    expect(html).not.toContain("Add host");
    expect(html).not.toContain("Paused");
    expect(html).not.toMatch(/\bhosts?\b/i);
  });

  it("says nobody has joined yet, and offers the invite page to an admin only", () => {
    const admin = renderToStaticMarkup(<HostsTable hosts={[]} reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" selectedId={undefined} canWrite inviteHref="/fynix/clients/ORG-K1AA/people/new" />);
    expect(admin).toContain("No team members yet");
    expect(admin).toContain("Invite a person");
    expect(admin).toContain("/fynix/clients/ORG-K1AA/people/new");
    const staff = renderToStaticMarkup(<HostsTable hosts={[]} reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" selectedId={undefined} canWrite={false} inviteHref="/fynix/clients/ORG-K1AA/people/new" />);
    expect(staff).toContain("No team members yet");
    expect(staff).not.toContain("Invite a person");
    expect(staff).not.toContain("/fynix/clients/ORG-K1AA/people/new");
  });

  it("renders the panel with the week day by day, a split day in two ranges, the blocks and the admin's actions", () => {
    const html = renderToStaticMarkup(<HostPanel host={imogen} reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" now={day("2026-11-13")} canWrite />);
    expect(html).toContain("Hours in London time (GMT)");
    expect(html).toContain("9:00 am to 12:00 pm, 2:00 to 5:00 pm");
    expect(html).toContain("Not available");
    expect(html).toContain("Board meeting");
    expect(html).toContain("Block a time");
    expect(html).not.toContain("Pause host");
    expect(html).not.toContain("Reactivate host");
    const unset = renderToStaticMarkup(<HostPanel host={theo} reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" now={day("2026-11-13")} canWrite />);
    expect(unset).toContain("they count as free Monday to Friday, 09:00 to 17:00");
    const staff = renderToStaticMarkup(<HostPanel host={imogen} reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" now={day("2026-11-13")} canWrite={false} />);
    expect(staff).not.toContain("Block a time");
    expect(staff).not.toContain("Remove the block");
    expect(staff).not.toContain(">Edit");
  });
});

const clientRow = (over: Partial<ClientRow> = {}): ClientRow => ({ id: "k1", publicRef: "ORG-K1AA", name: "Kestrel Ledger", status: "active", peopleCount: 3, campaignCount: 3, campaignCounts: { setup: 1, active: 2, closed: 0 }, timeZone: null, contactEmail: null, ...over }) as ClientRow;

describe("Clients", () => {
  it("lists active clients with a link to each record and split campaign counts, and the Archived tab holds the rest", () => {
    const rows = [clientRow(), clientRow({ id: "k2", publicRef: "ORG-K2BB", name: "Old Client", status: "archived" })];
    const html = renderToStaticMarkup(<ClientsTable rows={rows} query="" canWrite />);
    expect(html).toContain("All clients");
    expect(html).toContain("/fynix/clients/ORG-K1AA");
    expect(html).toContain("2 active, 1 setting up");
    expect(html).not.toContain("Old Client");
    expect(renderToStaticMarkup(<ClientsTable rows={rows} query="" canWrite filter="archived" />)).toContain("Old Client");
    expect(renderToStaticMarkup(<ClientsTable rows={[clientRow()]} query="zzz" canWrite />)).toContain("No client matches");
  });

  it("offers the first client to an admin and a plain line to staff", () => {
    expect(renderToStaticMarkup(<ClientsTable rows={[]} query="" canWrite />)).toContain("Add client");
    const staff = renderToStaticMarkup(<ClientsTable rows={[]} query="" canWrite={false} />);
    expect(staff).toContain("A Fynix admin adds clients.");
    expect(staff).not.toContain("Add client");
  });
});

describe("Campaign header", () => {
  it("shows the status, the parties, the zone and the four sub-pages, and Edit only for an admin", () => {
    const admin = renderToStaticMarkup(<CampaignTitle campaign={header} canWrite />);
    expect(admin).toContain("Active");
    expect(admin).toContain("Kestrel Ledger, served by Northgate Outreach");
    expect(admin).toContain("London time, 30 minute meetings");
    for (const label of ["Brief", "Client team", "Agreements and shares", "Activity"]) expect(admin).toContain(label);
    expect(admin).toContain("/fynix/campaigns/CMP-7Q2X/team");
    expect(admin).toContain("Edit campaign");
    expect(renderToStaticMarkup(<CampaignTitle campaign={header} />)).not.toContain("Edit campaign");
    for (const label of ["Leads", "Meetings"]) expect(admin).toContain(label);
    expect(admin).toContain("Close campaign");
    expect(admin).not.toContain("Reopen");
    expect(admin).not.toContain("Make active");
  });

  it("offers Make active while a campaign is being set up", () => {
    expect(renderToStaticMarkup(<CampaignTitle campaign={{ ...header, status: "draft" }} canWrite />)).toContain("Make active");
  });

  it("says when a campaign was closed, offers Reopen and switches Edit off", () => {
    const html = renderToStaticMarkup(<CampaignTitle campaign={{ ...header, status: "completed", closedAt: day("2026-11-20") }} canWrite />);
    expect(html).toContain("Closed on 20 Nov 2026");
    expect(html).toContain("Reopen");
    expect(html).not.toContain("Close campaign");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^]*?Edit campaign/);
  });
});

describe("Campaign list tabs", () => {
  const rows: CampaignRow[] = [campaignRow, { ...campaignRow, id: "c2", publicRef: "CMP-8R3Y", name: "Old one", status: "completed" }, { ...campaignRow, id: "c3", publicRef: "CMP-9S4Z", name: "New one", status: "draft" }];

  it("opens on Active with counts on every tab, and hides the rest", () => {
    const html = renderToStaticMarkup(<CampaignsTable rows={rows} />);
    for (const label of ["Active", "Setting up", "Closed", "All"]) expect(html).toContain(label);
    expect(html).toContain("UK mid-market finance teams");
    expect(html).not.toContain("Old one");
    expect(html).not.toContain("New one");
  });

  it("shows the closed ones on the Closed tab and says what the others hold when a tab is empty", () => {
    expect(renderToStaticMarkup(<CampaignsTable rows={rows} tab="closed" />)).toContain("Old one");
    const empty = renderToStaticMarkup(<CampaignsTable rows={[rows[1]!]} />);
    expect(empty).toContain("No active campaigns");
    expect(empty).toContain("0 active, 0 being set up, 1 closed");
  });
});

describe("copy", () => {
  it("has no em or en dashes in anything rendered", () => {
    const html = [
      renderToStaticMarkup(<CoordinatorsTable rows={[coordinatorRow()]} filter="active" query="" canWrite />),
      renderToStaticMarkup(<CoordinatorTitle coordinator={detail} canWrite />),
      renderToStaticMarkup(<CoordinatorOverview coordinator={detail} />),
      renderToStaticMarkup(<PeopleTable people={[person()]} canWrite selfUserId="u9" />),
      renderToStaticMarkup(<ClientOverview client={clientDetail} canWrite />),
      renderToStaticMarkup(<CampaignsTable rows={[campaignRow]} />),
      renderToStaticMarkup(<BriefView campaign={header} />),
      renderToStaticMarkup(<HostPanel host={imogen} reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" now={day("2026-11-13")} canWrite />),
    ].join("");
    expect(html).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("Contact panel", () => {
  it("shows every contact detail, the email as a mailto link and the website as a link, for staff with no edit button", () => {
    const html = renderToStaticMarkup(<ContactPanel organisationId="s1" contact={FULL_CONTACT} canWrite={false} />);
    expect(html).toContain("Asha Rao");
    expect(html).toContain('href="mailto:asha@northgate.example"');
    expect(html).toContain("+44 20 7946 0958");
    expect(html).toContain('href="https://northgate.example"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain("12 Mill Lane");
    expect(html).toContain("Prefers email.");
    expect(html).toContain("internal, Fynix only");
    expect(html).not.toContain("Edit contact");
  });

  it("gives an admin the Edit contact sheet and says Not set for what is empty", () => {
    const html = renderToStaticMarkup(<ContactPanel organisationId="s1" contact={NO_CONTACT} canWrite />);
    expect(html).toContain("Edit contact");
    expect(html.match(/Not set/g)).toHaveLength(6);
    expect(html).not.toContain("mailto:");
  });

  it("is on the client and coordinator overviews", () => {
    expect(renderToStaticMarkup(<ClientOverview client={{ ...clientDetail, contact: FULL_CONTACT }} canWrite={false} />)).toContain("mailto:asha@northgate.example");
    expect(renderToStaticMarkup(<CoordinatorOverview coordinator={{ ...detail, contact: FULL_CONTACT }} canWrite />)).toContain("Edit contact");
  });
});

describe("Contact email in the lists", () => {
  it("sits under the company name in the Coordinators and Clients tables", () => {
    expect(renderToStaticMarkup(<CoordinatorsTable rows={[coordinatorRow({ contactEmail: "asha@northgate.example" })]} filter="active" query="" canWrite />)).toContain("asha@northgate.example");
    expect(renderToStaticMarkup(<ClientsTable rows={[clientRow({ contactEmail: "imogen@kestrel.example" })]} query="" canWrite />)).toContain("imogen@kestrel.example");
    expect(renderToStaticMarkup(<ClientsTable rows={[clientRow()]} query="" canWrite />)).not.toContain("max-md:hidden\">null");
  });

  it("links a partner agency on the coordinator's Agencies tab to its page", () => {
    expect(renderToStaticMarkup(<AgenciesPanel coordinator={detail} canWrite />)).toContain('href="/fynix/agencies/ORG-AAAA"');
  });
});

const agencyRow = (over: Partial<AgencyRow> = {}): AgencyRow => ({
  id: "a1",
  publicRef: "ORG-AAAA",
  name: "Calder Bay Media",
  contactEmail: "hello@calder.example",
  status: "active",
  createdAt: day("2026-10-02"),
  coordinator: { id: "s1", publicRef: "ORG-N7GT", name: "Northgate Outreach", status: "active" },
  peopleCount: 2,
  inviteWaiting: false,
  campaignCounts: { setup: 0, active: 1, closed: 1 },
  campaignCount: 2,
  submittedThisMonth: 9,
  acceptedThisMonth: 4,
  ...over,
});

const agencyDetail: AgencyDetail = {
  id: "a1",
  publicRef: "ORG-AAAA",
  name: "Calder Bay Media",
  status: "active",
  createdAt: day("2026-10-02"),
  timeZone: "Europe/London",
  contact: FULL_CONTACT,
  coordinator: { id: "s1", publicRef: "ORG-N7GT", name: "Northgate Outreach", status: "active" },
  people: [person({ orgId: "a1", orgName: "Calder Bay Media" })],
  campaigns: [{ id: "c1", publicRef: "CMP-7Q2X", name: "UK mid-market finance teams", status: "active", clientName: "Kestrel Ledger", monthlyShare: 5, delivered: 11 }],
  campaignCounts: { setup: 0, active: 1, closed: 0 },
  shares: { campaigns: 1, monthlyTotal: 5 },
  tally: { submittedThisMonth: 9, acceptedThisMonth: 4, delivered: 11 },
  activity: [],
};

describe("Agencies", () => {
  it("renders a row per agency with its coordinator link, contact email, counts and status", () => {
    const html = renderToStaticMarkup(<AgenciesTable rows={[agencyRow(), agencyRow({ id: "a2", name: "Old Agency", status: "archived" })]} filter="active" query="" canWrite coordinators={[{ id: "s1", name: "Northgate Outreach" }]} />);
    expect(html).toContain("All agencies");
    expect(html).toContain("/fynix/agencies/ORG-AAAA");
    expect(html).toContain("hello@calder.example");
    expect(html).toContain('href="/fynix/coordinators/ORG-N7GT"');
    expect(html).toContain("1 active, 1 closed");
    expect(html).toContain("Sent this month");
    expect(html).toContain("Accepted this month");
    expect(html).toContain("Active");
    expect(html).toContain("Archived");
    expect(html).not.toContain("Old Agency");
    expect(renderToStaticMarkup(<AgenciesTable rows={[agencyRow({ name: "Old Agency", status: "archived" })]} filter="archived" query="" canWrite={false} coordinators={[]} />)).toContain("Old Agency");
  });

  it("shows Add agency to an admin only, and says what to do when there is nothing", () => {
    expect(renderToStaticMarkup(<AgenciesTable rows={[]} filter="active" query="" canWrite coordinators={[{ id: "s1", name: "Northgate Outreach" }]} />)).toContain("Add agency");
    const staff = renderToStaticMarkup(<AgenciesTable rows={[]} filter="active" query="" canWrite={false} coordinators={[]} />);
    expect(staff).toContain("No agencies yet");
    expect(staff).not.toContain("Add agency");
    expect(renderToStaticMarkup(<AgenciesTable rows={[]} filter="active" query="" canWrite coordinators={[]} />)).toContain("Add a coordinator first");
    expect(renderToStaticMarkup(<AgenciesTable rows={[agencyRow()]} filter="active" query="zzz" canWrite coordinators={[]} />)).toContain("No agency matches");
  });

  it("shows the title with its tabs, Edit and Archive for an admin only, and the Overview with the coordinator and contact", () => {
    const admin = renderToStaticMarkup(<AgencyTitle agency={agencyDetail} canWrite />);
    expect(admin).toContain("Archive");
    expect(admin).toContain("/fynix/agencies/ORG-AAAA/leads");
    expect(admin).toContain("/fynix/agencies/ORG-AAAA/people");
    expect(renderToStaticMarkup(<AgencyTitle agency={agencyDetail} canWrite={false} />)).not.toContain("Archive");
    expect(renderToStaticMarkup(<AgencyTitle agency={{ ...agencyDetail, status: "archived" }} canWrite />)).toContain("Restore");
    const overview = renderToStaticMarkup(<AgencyOverview agency={agencyDetail} canWrite />);
    expect(overview).toContain('href="/fynix/coordinators/ORG-N7GT"');
    expect(overview).toContain("5 a month across 1 campaign");
    expect(overview).toContain("9 sent, 4 accepted");
    expect(overview).toContain("Edit contact");
    expect(overview).toContain("mailto:asha@northgate.example");
  });

  it("lists the campaigns an agency has a share in, with the share and what was delivered", () => {
    const html = renderToStaticMarkup(<AgencyCampaignsPanel rows={agencyDetail.campaigns} />);
    expect(html).toContain("/fynix/campaigns/CMP-7Q2X");
    expect(html).toContain("Kestrel Ledger");
    expect(html).toContain(">5<");
    expect(html).toContain(">11<");
    expect(renderToStaticMarkup(<AgencyCampaignsPanel rows={[]} />)).toContain("No campaigns yet");
  });
});
