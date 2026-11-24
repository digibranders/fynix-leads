import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgreementsPage, CampaignHeader, CampaignRow, HostView } from "@/server/domain/campaign-overview";
import type { ClientRow } from "@/server/domain/client-overview";
import type { DisputeRow } from "@/server/domain/dispute-overview";
import type { SupplierDetail, SupplierRow } from "@/server/domain/supplier-overview";

// The forms call server actions, which need a running app. The screens only need their buttons to render.
vi.mock("@/server/fynix/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { addSupplierAction: action, addAgencyAction: action, invitePersonAction: action, publishAgreementAction: action, setShareAction: action, removeShareAction: action, addHostAction: action, pauseHostAction: action, setHoursAction: action, addBlockAction: action, removeBlockAction: action };
});

const { SuppliersTable } = await import("@/components/fynix/suppliers/suppliers-table");
const { SupplierPanel } = await import("@/components/fynix/suppliers/supplier-panel");
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
const supplierRow = (over: Partial<SupplierRow> = {}): SupplierRow => ({ id: "s1", publicRef: "ORG-N7GT", name: "Northgate Outreach", status: "active", createdAt: day("2026-10-02"), agencyCount: 2, agencyNames: ["Calder Bay Media"], peopleCount: 7, campaignCount: 2, inviteWaiting: false, ...over });
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
};

describe("Suppliers", () => {
  it("renders the table with the filter, the selection and a row per supplier", () => {
    const html = renderToStaticMarkup(<SuppliersTable rows={[supplierRow(), supplierRow({ id: "s2", publicRef: "ORG-S2MD", name: "Saltmarsh Demand", agencyCount: 0, peopleCount: 0, campaignCount: 0, inviteWaiting: true }), supplierRow({ id: "s3", name: "Old One", status: "archived" })]} filter="active" query="" selectedRef="ORG-N7GT" canWrite />);
    expect(html).toContain("All suppliers");
    expect(html).toContain("Northgate Outreach");
    expect(html).toContain('data-state="selected"');
    expect(html).toContain("Invite sent, not accepted yet");
    expect(html).toContain("/fynix/suppliers?supplier=ORG-N7GT");
    expect(html).not.toContain("Old One");
  });

  it("says there are no suppliers, with the action for an admin and a plain line for staff", () => {
    expect(renderToStaticMarkup(<SuppliersTable rows={[]} filter="active" query="" selectedRef={undefined} canWrite />)).toContain("Add supplier");
    const staff = renderToStaticMarkup(<SuppliersTable rows={[]} filter="active" query="" selectedRef={undefined} canWrite={false} />);
    expect(staff).toContain("No suppliers yet");
    expect(staff).not.toContain("Add supplier");
  });

  it("says nothing matches a search", () => {
    expect(renderToStaticMarkup(<SuppliersTable rows={[supplierRow()]} filter="active" query="zzz" selectedRef={undefined} canWrite />)).toContain("No supplier matches");
  });

  it("renders the panel with its three sections, and the actions only for an admin", () => {
    const admin = renderToStaticMarkup(<SupplierPanel detail={detail} filter="active" query="" canWrite />);
    expect(admin).toContain("Partner agencies");
    expect(admin).toContain("nikhil@northgate.example");
    expect(admin).toContain("2 of 7 shown");
    expect(admin).toContain("Invite a person");
    expect(admin).toContain("Add agency");
    const staff = renderToStaticMarkup(<SupplierPanel detail={detail} filter="active" query="" canWrite={false} />);
    expect(staff).not.toContain("Invite a person");
    expect(staff).not.toContain("Add agency");
    const archived = renderToStaticMarkup(<SupplierPanel detail={{ ...detail, status: "archived" }} filter="archived" query="" canWrite />);
    expect(archived).not.toContain("Invite a person");
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
  it("shows an accepted client agreement, a waiting supplier agreement and the history line", () => {
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
    expect(html).toContain("Shares add up to 15 a month, 1 more than the supplier&#x27;s target of 14.");
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

const clientRow = (over: Partial<ClientRow> = {}): ClientRow => ({ id: "k1", publicRef: "ORG-K1AA", name: "Kestrel Ledger", brandName: "Kestrel", status: "active", peopleCount: 3, campaignCount: 1, ...over }) as ClientRow;

describe("Clients", () => {
  it("lists clients with their brand, counts and archived marker, and filters by search", () => {
    const html = renderToStaticMarkup(<ClientsTable rows={[clientRow(), clientRow({ id: "k2", name: "Old Client", brandName: "Old", status: "archived" })]} query="" canWrite />);
    expect(html).toContain("All clients");
    expect(html).toContain("Kestrel Ledger");
    expect(html).toContain("Archived");
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
      renderToStaticMarkup(<SuppliersTable rows={[supplierRow()]} filter="active" query="" selectedRef="ORG-N7GT" canWrite />),
      renderToStaticMarkup(<SupplierPanel detail={detail} filter="active" query="" canWrite />),
      renderToStaticMarkup(<CampaignsTable rows={[campaignRow]} />),
      renderToStaticMarkup(<BriefView campaign={header} />),
      renderToStaticMarkup(<DisputesTable rows={[dispute]} canWrite />),
      renderToStaticMarkup(<HostPanel host={imogen} reference="CMP-7Q2X" campaignId="c1" clientName="Kestrel Ledger" campaignZone="Europe/London" now={day("2026-11-13")} canWrite />),
    ].join("");
    expect(html).not.toMatch(/[\u2013\u2014]/);
  });
});
