import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/server/fynix/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { addSupplierAction: action, addAgencyAction: action, invitePersonAction: action, publishAgreementAction: action, publishTermsAction: action, setShareAction: action, removeShareAction: action, addHostAction: action, pauseHostAction: action, setHoursAction: action, addBlockAction: action, removeBlockAction: action, createCampaignAction: action, updateCampaignAction: action, addClientAction: action, updateProfileAction: action, addCollateralAction: action, updateOrganisationAction: action, updateContactAction: action, updatePersonAction: action };
});

const { AddAgencyForm, AddSupplierForm, EditOrganisationForm, FYNIX_ROLES, InvitePersonForm } = await import("@/components/fynix/forms/supplier-forms");
const { AddClientForm, EditProfileForm } = await import("@/components/fynix/forms/client-forms");
const { EditContactForm } = await import("@/components/fynix/forms/contact-forms");
const { EditPersonForm } = await import("@/components/fynix/forms/people-forms");
const { AddHostForm, CreateCampaignForm, EditCampaignForm, NewAgreementForm, ShareForm } = await import("@/components/fynix/forms/campaign-forms");
const { BlockForm, HoursForm } = await import("@/components/fynix/forms/availability-forms");
const { PublishTermsForm } = await import("@/components/fynix/forms/settings-forms");

describe("the forms render", () => {
  it("Add client asks for the name, time zone, the four profile fields and an optional link, and has no brand field", () => {
    const html = renderToStaticMarkup(<AddClientForm />);
    for (const name of ["name", "timeZone", "introduction", "services", "differentiator", "caseStudies", "collateralTitle", "collateralUrl"]) expect(html).toContain(`name="${name}"`);
    expect(html.toLowerCase()).not.toContain("brand");
    // The duplicate-name tick box appears only after the server has refused a duplicate.
    expect(html).not.toContain('name="confirmDuplicate"');
  });

  it("Add client, Add coordinator and Add agency carry the optional Contact group with the six fields and the internal notes line", () => {
    const names = ["contactName", "contactEmail", "contactPhone", "website", "address", "notes"];
    for (const html of [renderToStaticMarkup(<AddClientForm />), renderToStaticMarkup(<AddSupplierForm />), renderToStaticMarkup(<AddAgencyForm supplierId="s1" />)]) {
      expect(html).toContain("Contact (optional)");
      for (const name of names) expect(html).toContain(`name="${name}"`);
      expect(html).toContain("Only the Fynix team reads these");
      expect(html).toContain('type="email"');
    }
  });

  it("Add agency opened from the Agencies page asks for the coordinator, and inside a coordinator keeps it hidden", () => {
    const open = renderToStaticMarkup(<AddAgencyForm coordinators={[{ id: "s1", name: "Northgate Outreach" }]} />);
    expect(open).toContain('name="supplierId"');
    expect(open).not.toContain('type="hidden" name="supplierId"');
    expect(open).toContain("Coordinator");
    expect(renderToStaticMarkup(<AddAgencyForm supplierId="s1" />)).toContain('type="hidden" name="supplierId" value="s1"');
  });

  it("Edit contact starts from the saved details", () => {
    const html = renderToStaticMarkup(<EditContactForm organisationId="s1" contact={{ contactName: "Asha Rao", contactEmail: "asha@x.example", contactPhone: null, website: "https://x.example", address: "1 Mill Lane", notes: "Prefers email." }} />);
    expect(html).toContain('name="organisationId" value="s1"');
    for (const text of ["Asha Rao", "asha@x.example", "https://x.example", "1 Mill Lane", "Prefers email."]) expect(html).toContain(text);
    expect(html).toContain("Save contact");
  });

  it("Edit profile starts from the saved profile", () => {
    const html = renderToStaticMarkup(<EditProfileForm clientOrgId="k1" profile={{ clientOrgId: "k1", introduction: "Intro text", services: "S", differentiator: "D", caseStudies: null }} />);
    expect(html).toContain('name="clientOrgId" value="k1"');
    expect(html).toContain("Intro text");
  });

  it("Edit organisation and Edit person start from what is saved", () => {
    expect(renderToStaticMarkup(<EditOrganisationForm organisationId="s1" name="Northgate" timeZone="Europe/London" label="Coordinator" />)).toContain('value="Europe/London"');
    const person = renderToStaticMarkup(<EditPersonForm memberId="m1" name="Imogen Price" jobTitle="Head of Sales" phone="+44 20 7946 0000" />);
    expect(person).toContain('value="Head of Sales"');
    expect(person).toContain('value="+44 20 7946 0000"');
  });

  it("Invite a person for Fynix has no alias and offers admin and staff; the alias is optional where it shows", () => {
    const fynix = renderToStaticMarkup(<InvitePersonForm organisations={[{ id: "f1", name: "Fynix" }]} roles={FYNIX_ROLES} showAlias={false} />);
    expect(fynix).not.toContain('name="alias"');
    expect(fynix).toContain('name="jobTitle"');
    const agency = renderToStaticMarkup(<InvitePersonForm organisations={[{ id: "s1", name: "Northgate" }]} />);
    expect(agency).toContain("optional");
    expect(agency).not.toContain("Fynix name");
  });

  it("Publish terms asks who the terms are for, a title and the text", () => {
    const markup = renderToStaticMarkup(<PublishTermsForm />);
    expect(markup).toContain('name="party"');
    expect(markup).toContain('name="title"');
    expect(markup).toContain('name="body"');
    expect(markup).toContain("Publish terms");
  });

  it("Add coordinator asks for the name, a time zone with suggestions, and an optional first person, and explains each", () => {
    const supplier = renderToStaticMarkup(<AddSupplierForm />);
    for (const name of ["name", "timeZone", "firstName", "firstJobTitle", "firstEmail", "firstPhone", "firstRole"]) expect(supplier).toContain(`name="${name}"`);
    expect(supplier).toContain("Add coordinator");
    expect(supplier).toContain("First person (optional)");
    expect(supplier).toContain("works with Fynix directly");
    expect(supplier).toContain("invite their own people and partner agencies");
    expect(supplier).toContain('<datalist id="');
    expect(supplier).toContain('value="Europe/London"');
    // The role defaults to Manager.
    expect(supplier).toContain("Manager");
    // The duplicate-name tick box appears only after the server has refused a duplicate.
    expect(supplier).not.toContain('name="confirmDuplicate"');
  });

  it("Add agency has the same fields and says what a partner agency is", () => {
    const agency = renderToStaticMarkup(<AddAgencyForm supplierId="s1" />);
    expect(agency).toContain('name="supplierId" value="s1"');
    for (const name of ["name", "timeZone", "firstName", "firstEmail", "firstRole"]) expect(agency).toContain(`name="${name}"`);
    expect(agency).toContain("A partner agency works under this coordinator.");
    expect(agency).not.toContain('name="confirmDuplicate"');
  });

  it("the time zone box on the client and the edit forms suggests zones and still posts as timeZone", () => {
    for (const html of [renderToStaticMarkup(<AddClientForm />), renderToStaticMarkup(<EditOrganisationForm organisationId="s1" name="Northgate" timeZone={null} label="Client" />)]) {
      expect(html).toContain('name="timeZone"');
      expect(html).toContain("<datalist");
      expect(html).toContain('value="Asia/Kolkata"');
    }
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
    const next = renderToStaticMarkup(<NewAgreementForm campaignId="c1" defaults={{ monthlyTarget: 12, totalTarget: 72, disputeWindowHours: 48, rules: "Counted when held.", notes: "" }} />);
    expect(next).toContain('value="72"');
    expect(next).toContain("Counted when held.");
    expect(renderToStaticMarkup(<NewAgreementForm campaignId="c1" defaults={null} />)).toContain('value="48"');
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
    const html = renderToStaticMarkup(<HoursForm action={async () => ({ status: "idle" as const })} memberId="m1" timeZone="Europe/London" windows={[{ weekday: 1, startMinute: 540, endMinute: 1020 }, { weekday: 3, startMinute: 540, endMinute: 720 }, { weekday: 3, startMinute: 840, endMinute: 1020 }]} />);
    expect(html).toContain('name="day-1-0-from"');
    expect(html).toContain('value="09:00"');
    expect(html).toContain('name="day-3-1-from"');
    expect(html).toContain('value="14:00"');
    expect(html).toContain("Not available");
    expect(html).toContain('value="Europe/London"');
  });

  it("Block a time carries the host and the zone", () => {
    const html = renderToStaticMarkup(<BlockForm action={async () => ({ status: "idle" as const })} memberId="m1" timeZone="Europe/London" />);
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
      id: "k1", publicRef: "CMP-4M6R", name: "Retail grocery buyers", status: "draft" as const, clientOrgId: "c1", clientName: "Halden", supplierOrgId: "s1", supplierName: "Brightpath", timeZone: "Europe/London", meetingMinutes: 30, activeHostCount: 0, closedAt: null,
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
