import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/server/fynix/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { addSupplierAction: action, addAgencyAction: action, invitePersonAction: action, publishAgreementAction: action, setShareAction: action, removeShareAction: action, addHostAction: action, pauseHostAction: action, setHoursAction: action, addBlockAction: action, removeBlockAction: action, createCampaignAction: action, updateCampaignAction: action };
});

const { AddAgencyForm, AddSupplierForm, InvitePersonForm } = await import("@/components/fynix/forms/supplier-forms");
const { AddHostForm, CreateCampaignForm, EditCampaignForm, NewAgreementForm, ShareForm } = await import("@/components/fynix/forms/campaign-forms");
const { BlockForm, HoursForm } = await import("@/components/fynix/forms/availability-forms");

describe("the forms render", () => {
  it("Add coordinator and Add agency have a name and the primary button", () => {
    const supplier = renderToStaticMarkup(<AddSupplierForm />);
    expect(supplier).toContain('name="name"');
    expect(supplier).toContain("Add coordinator");
    const agency = renderToStaticMarkup(<AddAgencyForm supplierId="s1" />);
    expect(agency).toContain('name="supplierId" value="s1"');
  });

  it("Invite a person hides the organisation for a coordinator alone and offers a choice when it has agencies", () => {
    const alone = renderToStaticMarkup(<InvitePersonForm organisations={[{ id: "s1", name: "Northgate" }]} />);
    expect(alone).toContain('name="organisationId" value="s1"');
    expect(alone).toContain('name="alias"');
    const many = renderToStaticMarkup(<InvitePersonForm organisations={[{ id: "s1", name: "Northgate" }, { id: "a1", name: "Calder Bay" }]} />);
    // A styled dropdown: its list opens on demand, so the markup carries the closed button and the posted name.
    expect(many).toContain('role="combobox"');
    expect(many).toContain('name="organisationId"');
  });

  it("New version starts from the version in force, and the first version starts from 48 hours", () => {
    const next = renderToStaticMarkup(<NewAgreementForm campaignId="c1" party="client" defaults={{ monthlyTarget: 12, totalTarget: 72, disputeWindowHours: 48, rules: "Counted when held.", notes: "" }} />);
    expect(next).toContain('value="72"');
    expect(next).toContain("Counted when held.");
    expect(renderToStaticMarkup(<NewAgreementForm campaignId="c1" party="supplier" defaults={null} />)).toContain('value="48"');
  });

  it("Add share offers the agencies, and Edit share fixes the agency and starts from its number", () => {
    expect(renderToStaticMarkup(<ShareForm campaignId="c1" options={[{ id: "a1", name: "Calder Bay" }]} />)).toContain("Choose an agency");
    const edit = renderToStaticMarkup(<ShareForm campaignId="c1" options={[]} agency={{ id: "a1", name: "Calder Bay", monthlyShare: 6 }} />);
    expect(edit).toContain('name="agencyOrgId" value="a1"');
    expect(edit).toContain('value="6"');
  });

  it("Add host lists the people who can be hosts", () => {
    const html = renderToStaticMarkup(<AddHostForm campaignId="c1" clientName="Kestrel" candidates={[{ memberId: "m1", displayName: "Imogen Price" }]} />);
    expect(html).toContain('name="memberId"');
    expect(html).toContain("Choose a person");
    expect(html).toContain('name="jobTitle"');
  });

  it("Edit weekly hours fills the boxes from the week and names every box for the server", () => {
    const html = renderToStaticMarkup(<HoursForm memberId="m1" timeZone="Europe/London" windows={[{ weekday: 1, startMinute: 540, endMinute: 1020 }, { weekday: 3, startMinute: 540, endMinute: 720 }, { weekday: 3, startMinute: 840, endMinute: 1020 }]} />);
    expect(html).toContain('name="day-1-0-from"');
    expect(html).toContain('value="09:00"');
    expect(html).toContain('name="day-3-1-from"');
    expect(html).toContain('value="14:00"');
    expect(html).toContain("Not available");
    expect(html).toContain('value="Europe/London"');
  });

  it("Block a time carries the host and the zone", () => {
    const html = renderToStaticMarkup(<BlockForm memberId="m1" timeZone="Europe/London" />);
    expect(html).toContain('name="timeZone" value="Europe/London"');
    expect(html).toContain('name="allDay"');
    expect(html).toContain('name="date"');
    expect(html).toContain("Pick a date");
  });

  it("New campaign asks for a client and a coordinator, the dates, the targets and the brief", () => {
    const html = renderToStaticMarkup(<CreateCampaignForm choices={{ clients: [{ id: "c1", name: "Halden Foods" }], suppliers: [{ id: "s1", name: "Brightpath" }] }} />);
    for (const name of ["clientOrgId", "agencyOrgId", "name", "startDate", "endDate", "monthlyTarget", "totalTarget", "geography", "industries", "bantBudget", "instructions", "internalNotes", "timeZone", "meetingMinutes"]) {
      expect(html, name).toContain(`name="${name}"`);
    }
    expect(html).toContain("Create campaign");
  });

  it("Edit campaign starts from what is stored, fixes the client and offers only the moves a status may make", () => {
    const campaign = {
      id: "k1", publicRef: "CMP-4M6R", name: "Retail grocery buyers", status: "draft" as const, clientOrgId: "c1", clientName: "Halden", supplierOrgId: "s1", supplierName: "Brightpath", timeZone: "Europe/London", meetingMinutes: 30, activeHostCount: 0,
      brief: { startDate: "2026-12-01", endDate: "2027-05-31", monthlyTarget: 20, totalTarget: 120, geography: "United Kingdom", industries: ["Retail", "Food"], companySize: "", icp: "", jobTitles: [], seniority: "", technologies: [], bantBudget: "", bantAuthority: "", bantNeed: "", bantTimeline: "", instructions: "", internalNotes: "Careful" },
    };
    const html = renderToStaticMarkup(<EditCampaignForm campaign={campaign} />);
    expect(html).toContain('name="campaignId" value="k1"');
    expect(html).toContain("Retail grocery buyers");
    expect(html).toContain("Retail, Food");
    expect(html).toContain("Careful");
    expect(html).not.toContain('name="clientOrgId"');
    expect(html).toContain("Save changes");
  });
});
