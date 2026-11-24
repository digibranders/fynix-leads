import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgreementsPage, CampaignHeader, CampaignRow, HostView } from "@/server/domain/campaign-overview";
import type { ClientDetail, ClientRow } from "@/server/domain/client-overview";
import type { PersonRow } from "@/server/domain/people-overview";
import type { DisputeRow } from "@/server/domain/dispute-overview";
import type { SupplierDetail, SupplierRow } from "@/server/domain/supplier-overview";

// The forms call server actions, which need a running app. The screens only need their buttons to render.
vi.mock("@/server/fynix/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { addSupplierAction: action, addAgencyAction: action, invitePersonAction: action, publishAgreementAction: action, setShareAction: action, removeShareAction: action, addHostAction: action, pauseHostAction: action, setHoursAction: action, addBlockAction: action, removeBlockAction: action, setOrganisationStatusAction: action, updateOrganisationAction: action, removeCollateralAction: action, updateProfileAction: action, addCollateralAction: action, addClientAction: action, updatePersonAction: action, suspendPersonAction: action, reactivatePersonAction: action, resendInviteAction: action, revokeInviteAction: action };
});

const { SuppliersTable } = await import("@/components/fynix/suppliers/suppliers-table");
const { SupplierOverview } = await import("@/components/fynix/suppliers/supplier-overview");
const { SupplierTitle } = await import("@/components/fynix/suppliers/supplier-title");
const { AgenciesPanel } = await import("@/components/fynix/suppliers/agencies-panel");
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
const { DisputesTable } = await import("@/components/fynix/disputes/disputes-table");
const { CampaignTitle } = await import("@/components/fynix/campaigns/campaign-header");

vi.mock("next/navigation", () => ({ useSelectedLayoutSegment: () => "hosts", useRouter: () => ({ push: () => undefined }) }));

const day = (text: string) => new Date(`${text}T12:00:00Z`);
const supplierRow = (over: Partial<SupplierRow> = {}): SupplierRow => ({ id: "s1", publicRef: "ORG-N7GT", name: "Northgate Outreach", status: "active", createdAt: day("2026-10-02"), agencyCount: 2, agencyNames: ["Calder Bay Media"], peopleCount: 7, campaignCount: 2, inviteWaiting: false, campaignCounts: { setup: 0, active: 1, closed: 1 }, ...over });
const detail: SupplierDetail = {
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
  everyone: [
    { kind: "member", id: "m1", userId: "u1", orgId: "s1", orgName: "Northgate Outreach", name: "Nikhil Oberoi", jobTitle: "Director", email: "nikhil@northgate.example", phone: "+44 20 7946 0000", role: "manager", state: "active" },
    { kind: "member", id: "m2", userId: "u2", orgId: "a1", orgName: "Calder Bay Media", name: "Ines Caetano", jobTitle: "Caller", email: "ines@calder.example", phone: null, role: "member", state: "suspended" },
    { kind: "invite", id: "i1", userId: null, orgId: "s1", orgName: "Northgate Outreach", name: "Aditi Rao", jobTitle: "Caller", email: "aditi@northgate.example", phone: null, role: "member", state: "invited" },
  ],
  activity: [],
};

describe("Coordinators", () => {
  it("renders the table with the filter, the selection and a row per coordinator", () => {
    const html = renderToStaticMarkup(<SuppliersTable rows={[supplierRow(), supplierRow({ id: "s2", publicRef: "ORG-S2MD", name: "Saltmarsh Demand", agencyCount: 0, peopleCount: 0, campaignCount: 0, inviteWaiting: true }), supplierRow({ id: "s3", name: "Old One", status: "archived" })]} filter="active" query="" canWrite />);
    expect(html).toContain("All coordinators");
    expect(html).toContain("Northgate Outreach");
    expect(html).toContain("Invite sent, not accepted yet");
    expect(html).toContain("/fynix/suppliers/ORG-N7GT");
    expect(html).toContain("1 active, 1 closed");
    expect(html).not.toContain("Old One");
  });

  it("says there are no coordinators, with the action for an admin and a plain line for staff", () => {
    expect(renderToStaticMarkup(<SuppliersTable rows={[]} filter="active" query="" canWrite />)).toContain("Add coordinator");
    const staff = renderToStaticMarkup(<SuppliersTable rows={[]} filter="active" query="" canWrite={false} />);
    expect(staff).toContain("No coordinators yet");
    expect(staff).not.toContain("Add coordinator");
  });

  it("says nothing matches a search", () => {
    expect(renderToStaticMarkup(<SuppliersTable rows={[supplierRow()]} filter="active" query="zzz" canWrite />)).toContain("No coordinator matches");
  });

  it("shows the overview with the counts, and the title's Edit and Archive only for an admin", () => {
    expect(renderToStaticMarkup(<SupplierOverview supplier={detail} />)).toContain("1 active");
    const admin = renderToStaticMarkup(<SupplierTitle supplier={detail} canWrite />);
    expect(admin).toContain("Edit");
    expect(admin).toContain("Archive");
    expect(admin).toContain("/fynix/suppliers/ORG-N7GT/people");
    const staff = renderToStaticMarkup(<SupplierTitle supplier={detail} canWrite={false} />);
    expect(staff).not.toContain("Archive");
    expect(renderToStaticMarkup(<SupplierTitle supplier={{ ...detail, status: "archived" }} canWrite />)).toContain("Restore");
  });

  it("lists the partner agencies, and Add agency only for an admin of an active coordinator", () => {
    expect(renderToStaticMarkup(<AgenciesPanel supplier={detail} canWrite />)).toContain("Add agency");
    expect(renderToStaticMarkup(<AgenciesPanel supplier={detail} canWrite={false} />)).not.toContain("Add agency");
    expect(renderToStaticMarkup(<AgenciesPanel supplier={{ ...detail, status: "archived" }} canWrite />)).not.toContain("Add agency");
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
  status: "active",
  createdAt: day("2026-10-02"),
  profile: { clientOrgId: "k1", introduction: "Accounts software for finance teams.", services: "Ledger and close tooling.", differentiator: "Closes the books in a day.", caseStudies: null },
  collateral: [{ id: "x1", clientOrgId: "k1", kind: "link", title: "Company brochure", url: "https://kestrel.example/brochure", createdAt: day("2026-10-03") }],
  people: [person()],
  campaigns: [],
  campaignCounts: { setup: 0, active: 0, closed: 0 },
  activity: [],
};

describe("Client record", () => {
  it("shows the profile and collateral with add and remove for an admin", () => {
    const html = renderToStaticMarkup(<ClientOverview client={clientDetail} canWrite />);
    expect(html).toContain("Accounts software for finance teams.");
    expect(html).toContain("Closes the books in a day.");
    expect(html).toContain("https://kestrel.example/brochure");
    expect(html).toContain("Remove Company brochure");
    expect(html).toContain("Edit profile");
    expect(html).toContain("Add link");
    expect(html).toContain("Not set");
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

const campaignRow: CampaignRow = { id: "c1", publicRef: "CMP-7Q2X", name: "UK mid-market finance teams", status: "active", clientName: "Kestrel Ledger", supplierName: "Northgate Outreach" };
const header: CampaignHeader = {
  id: "c1",
  publicRef: "CMP-7Q2X",
  name: "UK mid-market finance teams",
  status: "active",
  clientOrgId: "k",
  clientName: "Kestrel Ledger",
  supplierOrgId: "s1",
  supplierName: "Northgate Outreach",
  timeZone: "Europe/London",
  meetingMinutes: 30,
  activeHostCount: 3,
  brief: { startDate: "2026-12-01", endDate: "2027-05-31", monthlyTarget: 12, totalTarget: 72, geography: "", industries: [], companySize: "", icp: "", jobTitles: [], seniority: "", technologies: [], bantBudget: "", bantAuthority: "", bantNeed: "", bantTimeline: "", instructions: "", internalNotes: null },
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
  client: { party: "client", current: { version: 2, monthlyTarget: 12, totalTarget: 72, disputeWindowHours: 48, rules: "A meeting counts when it is held.", notes: "", createdAt: day("2026-11-03"), accepted: [{ name: "Daniel Okafor", at: day("2026-11-04") }] }, previous: { version: 1, createdAt: day("2026-10-02"), supersededAt: day("2026-11-03") } },
  supplier: { party: "supplier", current: { version: 1, monthlyTarget: 14, totalTarget: 84, disputeWindowHours: 48, rules: "", notes: "", createdAt: day("2026-11-02"), accepted: [] }, previous: null },
  shares: [
    { agencyOrgId: "s1", agencyName: "Northgate Outreach", ownBookings: true, monthlyShare: 4, updatedAt: day("2026-11-02"), changedBy: "Meera Sethi" },
    { agencyOrgId: "a1", agencyName: "Ridgeline Partners", ownBookings: false, monthlyShare: 11, updatedAt: day("2026-11-05"), changedBy: null },
  ],
  summary: { totalShares: 15, supplierMonthlyTarget: 14, overAllocated: true },
  options: [{ id: "a2", name: "Calder Bay Media", ownBookings: false }],
};

describe("Agreements and shares", () => {
  it("shows an accepted client agreement, a waiting coordinator agreement and the history line", () => {
    const client = renderToStaticMarkup(<AgreementCard side={agreements.client} withName="Kestrel Ledger" campaignId="c1" timeZone="Europe/London" canWrite />);
    expect(client).toContain("Accepted by Daniel Okafor on Wed 4 Nov");
    expect(client).toContain("over 6 months");
    expect(client).toContain("Version 1 published 2 Oct, superseded 3 Nov");
    expect(client).toContain("New version");
    const supplier = renderToStaticMarkup(<AgreementCard side={agreements.supplier} withName="Northgate Outreach" campaignId="c1" timeZone="Europe/London" canWrite={false} />);
    expect(supplier).toContain("Waiting");
    expect(supplier).toContain("Sent on Mon 2 Nov, not accepted yet.");
    expect(supplier).toContain("No earlier versions");
    expect(supplier).not.toContain("New version");
  });

  it("offers a first version when there is no agreement", () => {
    expect(renderToStaticMarkup(<AgreementCard side={{ party: "client", current: null, previous: null }} withName="Kestrel Ledger" campaignId="c1" timeZone="Europe/London" canWrite />)).toContain("First version");
  });

  it("shows the shares, the total against the target and the over-allocation notice", () => {
    const html = renderToStaticMarkup(<SharesCard page={agreements} campaignId="c1" supplierName="Northgate Outreach" timeZone="Europe/London" now={day("2026-11-13")} canWrite />);
    expect(html).toContain("15 of 14");
    expect(html).toContain("Shares add up to 15 a month, 1 more than the coordinator&#x27;s target of 14.");
    expect(html).toContain("Delivered in November");
    expect(html).toContain("Meera Sethi, Fynix, 2 Nov");
    expect(html).toContain("Own bookings");
    expect(html).toContain("Add share");
  });

  it("hides every write control from staff and says when there are no shares", () => {
    const staff = renderToStaticMarkup(<SharesCard page={agreements} campaignId="c1" supplierName="Northgate Outreach" timeZone="Europe/London" now={day("2026-11-13")} canWrite={false} />);
    expect(staff).not.toContain("Add share");
    expect(staff).not.toContain("Edit the share");
    const empty = renderToStaticMarkup(<SharesCard page={{ ...agreements, shares: [], summary: { totalShares: 0, supplierMonthlyTarget: null, overAllocated: false } }} campaignId="c1" supplierName="Northgate Outreach" timeZone="Europe/London" now={day("2026-11-13")} canWrite />);
    expect(empty).toContain("No shares yet");
  });
});

const imogen: HostView = {
  memberId: "m2",
  displayName: "Imogen Price",
  jobTitle: "Head of FP&A",
  active: true,
  timeZone: "Europe/London",
  hours: [1, 2, 4].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 })).concat([{ weekday: 3, startMinute: 540, endMinute: 720 }, { weekday: 3, startMinute: 840, endMinute: 1020 }, { weekday: 5, startMinute: 540, endMinute: 780 }]),
  blocks: [{ id: "b1", startsAt: new Date("2026-11-23T00:00:00Z"), endsAt: new Date("2026-11-24T00:00:00Z"), note: "Board meeting" }],
};
const theo: HostView = { memberId: "m3", displayName: "Theo Lindqvist", jobTitle: "CFO", active: false, timeZone: null, hours: [], blocks: [] };

describe("Hosts", () => {
  it("shows the weekly hours summary, the next block and the status of each host", () => {
    const html = renderToStaticMarkup(<HostsTable hosts={[imogen, theo]} candidates={[{ memberId: "m4", displayName: "Another Person" }]} campaignId="c1" reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" selectedId="m2" canWrite />);
    expect(html).toContain("Mon to Fri");
    expect(html).toContain("Split on Wednesdays");
    expect(html).toContain("Mon 23 Nov");
    expect(html).toContain("All day");
    expect(html).toContain("Taking meetings");
    expect(html).toContain("No hours set");
    expect(html).toContain("Paused");
    expect(html).toContain("Add host");
    expect(html).toContain("/fynix/campaigns/CMP-7Q2X/hosts?host=m2");
  });

  it("says there are no hosts, and whether anyone could be one", () => {
    expect(renderToStaticMarkup(<HostsTable hosts={[]} candidates={[{ memberId: "m4", displayName: "A" }]} campaignId="c1" reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" selectedId={undefined} canWrite />)).toContain("Add the people at Kestrel Ledger");
    expect(renderToStaticMarkup(<HostsTable hosts={[]} candidates={[]} campaignId="c1" reference="CMP-7Q2X" clientName="Kestrel Ledger" campaignZone="Europe/London" selectedId={undefined} canWrite />)).toContain("Nobody at Kestrel Ledger can be a host yet");
  });

  it("renders the panel with the week day by day, a split day in two ranges, the blocks and the admin's actions", () => {
    const html = renderToStaticMarkup(<HostPanel host={imogen} reference="CMP-7Q2X" campaignId="c1" clientName="Kestrel Ledger" campaignZone="Europe/London" now={day("2026-11-13")} canWrite />);
    expect(html).toContain("Hours in London time (GMT)");
    expect(html).toContain("9:00 am to 12:00 pm, 2:00 to 5:00 pm");
    expect(html).toContain("Not available");
    expect(html).toContain("Board meeting");
    expect(html).toContain("Block a time");
    expect(html).toContain("Pause host");
    const paused = renderToStaticMarkup(<HostPanel host={theo} reference="CMP-7Q2X" campaignId="c1" clientName="Kestrel Ledger" campaignZone="Europe/London" now={day("2026-11-13")} canWrite />);
    expect(paused).toContain("Reactivate host");
    const staff = renderToStaticMarkup(<HostPanel host={imogen} reference="CMP-7Q2X" campaignId="c1" clientName="Kestrel Ledger" campaignZone="Europe/London" now={day("2026-11-13")} canWrite={false} />);
    expect(staff).not.toContain("Block a time");
    expect(staff).not.toContain("Pause host");
    expect(staff).not.toContain("Remove the block");
    expect(staff).not.toContain(">Edit");
  });
});

const clientRow = (over: Partial<ClientRow> = {}): ClientRow => ({ id: "k1", publicRef: "ORG-K1AA", name: "Kestrel Ledger", brandName: "Kestrel", status: "active", peopleCount: 3, campaignCount: 3, campaignCounts: { setup: 1, active: 2, closed: 0 }, timeZone: null, ...over }) as ClientRow;

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

const dispute: DisputeRow = { leadId: "l1", leadRef: "LD-3K7M", campaignName: "UK mid-market finance teams", clientBrandName: "Kestrel", prospectName: "Priya Nair", prospectCompany: "Harbour Freight", reason: "The contact had left the company.", disputedAt: day("2026-11-20") };

describe("Disputes", () => {
  it("shows each dispute with its lead, campaign, reason and a labelled action for an admin", () => {
    const html = renderToStaticMarkup(<DisputesTable rows={[dispute, { ...dispute, leadId: "l2", leadRef: "LD-9ZZZ", reason: "" }]} canWrite />);
    expect(html).toContain("Open disputes");
    expect(html).toContain("Priya Nair");
    expect(html).toContain("LD-3K7M");
    expect(html).toContain("The contact had left the company.");
    expect(html).toContain("No reason given");
    expect(html).toContain("Decide dispute");
  });

  it("hides the decision from staff and says when nothing is open", () => {
    expect(renderToStaticMarkup(<DisputesTable rows={[dispute]} canWrite={false} />)).not.toContain("Decide dispute");
    expect(renderToStaticMarkup(<DisputesTable rows={[]} canWrite />)).toContain("No open disputes");
  });
});

describe("Campaign header", () => {
  it("shows the status, the parties, the zone and the four sub-pages, and Edit only for an admin", () => {
    const admin = renderToStaticMarkup(<CampaignTitle campaign={header} canWrite />);
    expect(admin).toContain("Active");
    expect(admin).toContain("Kestrel Ledger, served by Northgate Outreach");
    expect(admin).toContain("London time, 30 minute meetings");
    for (const label of ["Brief", "Hosts", "Agreements and shares", "Activity"]) expect(admin).toContain(label);
    expect(admin).toContain("/fynix/campaigns/CMP-7Q2X/hosts");
    expect(admin).toContain("Edit campaign");
    expect(renderToStaticMarkup(<CampaignTitle campaign={header} />)).not.toContain("Edit campaign");
  });
});

describe("copy", () => {
  it("has no em or en dashes in anything rendered", () => {
    const html = [
      renderToStaticMarkup(<SuppliersTable rows={[supplierRow()]} filter="active" query="" canWrite />),
      renderToStaticMarkup(<SupplierTitle supplier={detail} canWrite />),
      renderToStaticMarkup(<SupplierOverview supplier={detail} />),
      renderToStaticMarkup(<PeopleTable people={[person()]} canWrite selfUserId="u9" />),
      renderToStaticMarkup(<ClientOverview client={clientDetail} canWrite />),
      renderToStaticMarkup(<CampaignsTable rows={[campaignRow]} />),
      renderToStaticMarkup(<BriefView campaign={header} />),
      renderToStaticMarkup(<DisputesTable rows={[dispute]} canWrite />),
      renderToStaticMarkup(<HostPanel host={imogen} reference="CMP-7Q2X" campaignId="c1" clientName="Kestrel Ledger" campaignZone="Europe/London" now={day("2026-11-13")} canWrite />),
    ].join("");
    expect(html).not.toMatch(/[\u2013\u2014]/);
  });
});
