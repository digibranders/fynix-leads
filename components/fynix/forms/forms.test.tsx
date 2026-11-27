import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/server/fynix/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { addCoordinatorAction: action, addAgencyAction: action, invitePersonAction: action, publishAgreementAction: action, publishTermsAction: action, setShareAction: action, removeShareAction: action, addHostAction: action, pauseHostAction: action, setHoursAction: action, addBlockAction: action, removeBlockAction: action, createCampaignAction: action, updateCampaignAction: action, addClientAction: action, updateOrganisationAction: action, updateContactAction: action, updatePersonAction: action };
});

const { AddAgencyForm, AddCoordinatorForm, EditOrganisationForm, FYNIX_ROLES, InvitePersonForm } = await import("@/components/fynix/forms/coordinator-forms");
const { AddClientForm } = await import("@/components/fynix/forms/client-forms");
const { EditContactForm } = await import("@/components/fynix/forms/contact-forms");
const { EditPersonForm } = await import("@/components/fynix/forms/people-forms");
const { NewAgreementForm, ShareForm } = await import("@/components/fynix/forms/campaign-forms");
const { CreateCampaignWizard, EditCampaignEditor } = await import("@/components/fynix/forms/campaign-wizard");
const { BlockForm, HoursForm } = await import("@/components/fynix/forms/availability-forms");
const { PublishTermsForm } = await import("@/components/fynix/forms/settings-forms");
const { DEFAULT_COUNTING_RULES } = await import("@/lib/fynix/campaign-terms");

describe("the forms render", () => {
  it("Add client asks for the name, the website and contact people added one at a time, and has no brand field", () => {
    const html = renderToStaticMarkup(<AddClientForm />);
    for (const name of ["name", "website"]) expect(html).toContain(`name="${name}"`);
    for (const name of ["timeZone", "address", "notes", "introduction", "services", "differentiator", "caseStudies", "collateralTitle", "collateralUrl"]) expect(html).not.toContain(`name="${name}"`);
    expect(html).toContain("Contact people");
    expect(html).toContain("Add contact person");
    // The boxes for the person being typed are not posted by themselves: a person posts only once added.
    expect(html).not.toContain('name="contact0Name"');
    expect(html.toLowerCase()).not.toContain("brand");
    // The duplicate-name tick box appears only after the server has refused a duplicate.
    expect(html).not.toContain('name="confirmDuplicate"');
  });

  it("Add agency opened from the Agencies page asks for the coordinator, and inside a coordinator keeps it hidden", () => {
    const open = renderToStaticMarkup(<AddAgencyForm coordinators={[{ id: "s1", name: "Northgate Outreach" }]} />);
    expect(open).toContain('name="coordinatorId"');
    expect(open).not.toContain('type="hidden" name="coordinatorId"');
    expect(open).toContain("Coordinator");
    expect(renderToStaticMarkup(<AddAgencyForm coordinatorId="s1" />)).toContain('type="hidden" name="coordinatorId" value="s1"');
  });

  it("Edit contact starts from the saved details", () => {
    const html = renderToStaticMarkup(<EditContactForm organisationId="s1" contact={{ contactName: "Asha Rao", contactEmail: "asha@x.example", contactPhone: null, website: "https://x.example", address: "1 Mill Lane", notes: "Prefers email." }} />);
    expect(html).toContain('name="organisationId" value="s1"');
    for (const text of ["Asha Rao", "asha@x.example", "https://x.example", "1 Mill Lane", "Prefers email."]) expect(html).toContain(text);
    expect(html).toContain("Save contact");
  });

  it("Edit organisation and Edit person start from what is saved", () => {
    expect(renderToStaticMarkup(<EditOrganisationForm organisationId="s1" name="Northgate" timeZone="Europe/London" label="Coordinator" />)).toContain('value="Europe/London"');
    const person = renderToStaticMarkup(<EditPersonForm memberId="m1" name="Imogen Price" phone="+44 20 7946 0000" />);
    expect(person).not.toContain('name="jobTitle"');
    expect(person).toContain('value="+44 20 7946 0000"');
  });

  it("Invite a person for Fynix has no alias and offers admin and staff; the alias is optional where it shows", () => {
    const fynix = renderToStaticMarkup(<InvitePersonForm organisations={[{ id: "f1", name: "Fynix" }]} roles={FYNIX_ROLES} showAlias={false} />);
    expect(fynix).not.toContain('name="alias"');
    expect(fynix).not.toContain('name="jobTitle"');
    expect(fynix).not.toContain("Start from a contact person");
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

  it("Add coordinator asks only for one person's name, email and phone", () => {
    const coordinator = renderToStaticMarkup(<AddCoordinatorForm />);
    for (const name of ["name", "email", "phone"]) expect(coordinator).toContain(`name="${name}"`);
    for (const name of ["timeZone", "contactName", "website", "address", "notes", "firstName", "firstJobTitle", "firstEmail", "firstRole"]) expect(coordinator).not.toContain(`name="${name}"`);
    expect(coordinator).toContain("Add coordinator");
    expect(coordinator).toContain('type="email"');
    expect(coordinator).toContain("The invite to sign in goes here");
    // The duplicate-name tick box appears only after the server has refused a duplicate.
    expect(coordinator).not.toContain('name="confirmDuplicate"');
  });

  it("Add agency asks only for one person's name, email and phone, under the coordinator", () => {
    const agency = renderToStaticMarkup(<AddAgencyForm coordinatorId="s1" />);
    expect(agency).toContain('name="coordinatorId" value="s1"');
    for (const name of ["name", "email", "phone"]) expect(agency).toContain(`name="${name}"`);
    for (const name of ["timeZone", "contactName", "website", "address", "notes", "firstName", "firstEmail", "firstRole"]) expect(agency).not.toContain(`name="${name}"`);
    expect(agency).toContain('type="email"');
    expect(agency).toContain("The invite to sign in goes here");
    expect(agency).not.toContain('name="confirmDuplicate"');
  });

  it("the time zone is a dropdown with a search box, starts from the stored zone and still posts as timeZone", () => {
    const html = renderToStaticMarkup(<EditOrganisationForm organisationId="s1" name="Northgate" timeZone="Asia/Kolkata" label="Client" />);
    expect(html).toContain('name="timeZone"');
    expect(html).toContain('value="Asia/Kolkata"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).not.toContain("<datalist");
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

  it("New version starts from the version in force, and the first version from the campaign's numbers and the standard rules", () => {
    const next = renderToStaticMarkup(<NewAgreementForm campaignId="c1" defaults={{ monthlyTarget: 12, totalTarget: 72, rules: "Counted when held.", notes: "" }} />);
    expect(next).toContain('value="72"');
    expect(next).toContain("Counted when held.");
    // The window is fixed by the app (48 hours), so the form no longer asks for one.
    expect(next).not.toContain('name="disputeWindowHours"');
    const first = renderToStaticMarkup(<NewAgreementForm campaignId="c1" defaults={{ monthlyTarget: 10, totalTarget: 20, rules: DEFAULT_COUNTING_RULES, notes: "" }} />);
    expect(first).toContain('value="10"');
    expect(first).toContain("accepted automatically");
    expect(first).toContain("48 hours");
  });

  it("Add share offers the agencies, and Edit share fixes the agency and starts from its number", () => {
    expect(renderToStaticMarkup(<ShareForm campaignId="c1" options={[{ id: "a1", name: "Calder Bay" }]} />)).toContain("Choose an agency");
    const edit = renderToStaticMarkup(<ShareForm campaignId="c1" options={[]} agency={{ id: "a1", name: "Calder Bay", monthlyShare: 6 }} />);
    expect(edit).toContain('name="agencyOrgId" value="a1"');
    expect(edit).toContain('value="6"');
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

  it("New campaign starts with the details in the sheet's order and keeps the terms for the review step", () => {
    const html = renderToStaticMarkup(<CreateCampaignWizard choices={{ clients: [{ id: "c1", name: "Halden Foods" }], coordinators: [{ id: "s1", name: "Brightpath" }], contacts: [{ id: "p1", clientOrgId: "c1", name: "Maya Rao", jobTitle: null }] }} cancelHref="/fynix/campaigns" />);
    for (const name of ["name", "agencyOrgId", "startDate", "endDate", "monthlyTarget", "totalTarget", "timeZone", "pitchIntroduction", "pitchServices", "pitchDifferentiator", "pitchCollaterals", "pitchCaseStudies", "jobTitles", "industries", "geography", "qualifyingItems", "qualifyingQuestions"]) {
      expect(html, name).toContain(`name="${name}"`);
    }
    for (const text of ["Contact person", "Brand and service information", "Qualification criteria", "Critical qualifying questions", "Qualifying questions", "Summary", "Continue"]) expect(html).toContain(text);
    // The agreement is asked about before the campaign is made, so it is not forgotten: its own tab, published now by default, with the standard rules.
    for (const name of ["publishAgreement", "agreementRules"]) expect(html, name).toContain(`name="${name}"`);
    expect(html).toContain("Agreement");
    expect(html).toContain("A meeting counts once the client accepts it");
    // The terms and the Create button belong to step 2.
    expect(html).not.toContain("Meeting terms and conditions");
    expect(html).not.toContain("Create campaign");
    // The emails are not asked for any more.
    for (const name of ["firstEmail", "secondEmail"]) expect(html).not.toContain(`name="${name}"`);
  });

  it("Edit campaign starts from what is stored, fixes the client and offers only the moves a status may make", () => {
    const campaign = {
      id: "k1", publicRef: "CMP-4M6R", name: "Retail grocery buyers", status: "draft" as const, clientOrgId: "c1", clientName: "Halden", clientRef: "ORG-HAL1", coordinatorOrgId: "s1", coordinatorName: "Brightpath", timeZone: "Europe/London", meetingMinutes: 30, clientContacts: [], activeHostCount: 0, closedAt: null, goLive: null,
      brief: { startDate: "2026-12-01", endDate: "2027-05-31", monthlyTarget: 20, totalTarget: 120, geography: "United Kingdom", industries: ["Retail", "Food"], companySize: "", icp: "", jobTitles: [], seniority: "", technologies: [], bantBudget: "", bantAuthority: "", bantNeed: "", bantTimeline: "", instructions: "", pitchIntroduction: "We sell grocery software.", pitchServices: "", pitchDifferentiator: "", pitchCollaterals: "", pitchCaseStudies: "", qualifyingQuestions: "", qualifyingItems: [], firstEmail: "", secondEmail: "", primaryContactId: null, internalNotes: "Careful" },
    };
    const html = renderToStaticMarkup(<EditCampaignEditor campaign={campaign} cancelHref="/fynix/campaigns/CMP-4M6R" />);
    expect(html).toContain('name="campaignId" value="k1"');
    expect(html).toContain("Retail grocery buyers");
    expect(html).toContain("Retail, Food");
    expect(html).toContain("Careful");
    expect(html).toContain("We sell grocery software.");
    expect(html).not.toContain('name="clientOrgId"');
    expect(html).toContain("Continue");
    expect(html).not.toContain('name="firstEmail"');
  });
});
