import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/server/fynix/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { addSupplierAction: action, addAgencyAction: action, invitePersonAction: action, publishAgreementAction: action, setShareAction: action, removeShareAction: action, addHostAction: action, pauseHostAction: action, setHoursAction: action, addBlockAction: action, removeBlockAction: action };
});

const { AddAgencyForm, AddSupplierForm, InvitePersonForm } = await import("@/components/fynix/forms/supplier-forms");
const { AddHostForm, NewAgreementForm, ShareForm } = await import("@/components/fynix/forms/campaign-forms");
const { BlockForm, HoursForm } = await import("@/components/fynix/forms/availability-forms");

describe("the forms render", () => {
  it("Add supplier and Add agency have a name and the primary button", () => {
    const supplier = renderToStaticMarkup(<AddSupplierForm />);
    expect(supplier).toContain('name="name"');
    expect(supplier).toContain("Add supplier");
    const agency = renderToStaticMarkup(<AddAgencyForm supplierId="s1" />);
    expect(agency).toContain('name="supplierId" value="s1"');
  });

  it("Invite a person hides the organisation for a supplier alone and offers a choice when it has agencies", () => {
    const alone = renderToStaticMarkup(<InvitePersonForm organisations={[{ id: "s1", name: "Northgate" }]} />);
    expect(alone).toContain('name="organisationId" value="s1"');
    expect(alone).toContain('name="alias"');
    const many = renderToStaticMarkup(<InvitePersonForm organisations={[{ id: "s1", name: "Northgate" }, { id: "a1", name: "Calder Bay" }]} />);
    expect(many).toContain("<select");
    expect(many).toContain("Calder Bay");
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
    expect(html).toContain("Imogen Price");
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
    expect(html).toContain('type="date"');
  });
});
