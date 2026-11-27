import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TeamRow } from "@/server/domain/team";

// The forms call server actions, which need a running app. The screens only need their buttons and switches to render.
vi.mock("@/server/domain/team-actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { inviteTeamPersonAction: action, editTeamPersonAction: action, setMeetingEmailsAction: action, addPartnerAgencyAction: action, updateProfileAction: action };
});
vi.mock("@/server/fynix/actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { invitePersonAction: action, updatePersonAction: action, suspendPersonAction: action, reactivatePersonAction: action, resendInviteAction: action, revokeInviteAction: action };
});
vi.mock("@/server/auth/actions", () => ({ changePasswordAction: async () => ({ status: "idle" as const }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const { TeamPanel } = await import("./team-panel");
const { AddAgencyButton } = await import("./add-agency-button");
const { MeetingEmailsSwitch } = await import("./meeting-emails-switch");
const { ProfileView } = await import("@/components/profile/profile-view");

const row = (over: Partial<TeamRow> = {}): TeamRow => ({
  kind: "member",
  id: "m1",
  orgId: null,
  orgName: "Kestrel Logistics Ltd",
  name: "Priya Nair",
  jobTitle: "Head of Ops",
  email: "priya@kestrel.example",
  phone: "+44 20 7946 0001",
  role: "manager",
  state: "active",
  meetingEmails: true,
  ...over,
});
const own = { id: "o1", name: "Kestrel Logistics Ltd" };
const people = [row(), row({ id: "m2", name: "Tom Ellis", email: "tom@kestrel.example", role: "member", meetingEmails: false }), row({ kind: "invite", id: "i1", name: "Colleen Ray", email: "colleen@kestrel.example", state: "invited", role: "member" })];
const base = { people, own, inviteInto: [own], inviteDescription: "They join Kestrel.", emptyHint: "Invite a colleague to start." };

describe("TeamPanel for a client manager", () => {
  const html = renderToStaticMarkup(<TeamPanel {...base} canWrite isClient />);

  it("lists name, email, phone, role and status of everyone, invites included", () => {
    for (const text of ["Priya Nair", "priya@kestrel.example", "+44 20 7946 0001", "Manager", "Colleen Ray", "Invited"]) expect(html).toContain(text);
  });

  it("offers Invite person, an Edit button per person and a meeting emails switch per person, not per invite", () => {
    expect(html).toContain("Invite person");
    expect(html).toContain("details of Priya Nair");
    expect(html).not.toContain("details of Colleen Ray");
    expect(html).toContain("Gets meeting emails");
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-label="Tom Ellis gets meeting emails"[^>]*|aria-checked="false"/);
  });

  it("does not use the Fynix admin actions (suspend, resend, revoke)", () => {
    for (const text of ["Suspend", "Resend", "Revoke"]) expect(html).not.toContain(text);
  });
});

describe("TeamPanel for a client member", () => {
  const html = renderToStaticMarkup(<TeamPanel {...base} canWrite={false} isClient />);

  it("reads the list and the switch state as words, and shows nothing to press", () => {
    expect(html).toContain("Priya Nair");
    expect(html).not.toContain("Invite person");
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("Edit");
    expect(html).toContain("Yes");
    expect(html).toContain("No");
  });
});

describe("TeamPanel for a coordinator", () => {
  const partner = row({ id: "m3", orgId: "a1", orgName: "Calder Bay Media", name: "Ines Caetano", email: "ines@calder.example", role: "member" });
  const html = renderToStaticMarkup(<TeamPanel {...base} people={[row({ orgName: "Northgate Outreach" }), partner]} inviteInto={[{ id: "o1", name: "Northgate Outreach" }, { id: "a1", name: "Calder Bay Media" }]} canWrite isClient={false} showOrganisation />);

  it("shows the Agency column and the invite button, and no client-only controls", () => {
    expect(html).toContain("Agency");
    expect(html).toContain("Calder Bay Media");
    expect(html).toContain("Invite person");
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("Gets meeting emails");
    expect(html).not.toContain("details of");
  });
});

describe("TeamPanel for a member of an agency with nobody else", () => {
  it("says how the list fills", () => {
    expect(renderToStaticMarkup(<TeamPanel {...base} people={[]} canWrite={false} isClient={false} emptyHint="A manager invites colleagues." />)).toContain("A manager invites colleagues.");
  });
});

describe("MeetingEmailsSwitch", () => {
  it("posts the opposite value and says whether it is on", () => {
    const on = renderToStaticMarkup(<MeetingEmailsSwitch action={async () => ({ status: "idle" })} memberId="m1" name="Priya Nair" enabled />);
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('name="enabled" value="false"');
    const off = renderToStaticMarkup(<MeetingEmailsSwitch action={async () => ({ status: "idle" })} memberId="m1" name="Priya Nair" enabled={false} />);
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('name="enabled" value="true"');
  });
});

describe("AddAgencyButton", () => {
  it("is the Add agency button", () => {
    expect(renderToStaticMarkup(<AddAgencyButton />)).toContain("Add agency");
  });
});

describe("ProfileView", () => {
  const html = renderToStaticMarkup(<ProfileView email="priya@client.example" name="Priya Nair" phone={null} />);

  it("has the details form filled with the person's own values, and the password form with its rule", () => {
    expect(html).toContain('value="Priya Nair"');
    expect(html).toContain("Save details");
    expect(html).toContain("Current password");
    expect(html).toContain("New password");
    expect(html).toContain("Change password");
    expect(html).toContain("at least 8 characters");
  });

  it("shows the sign-in email as plain text, not as a field to edit", () => {
    expect(html).toContain("priya@client.example");
    expect(html).not.toContain('value="priya@client.example"');
  });

  it("never prefills a password and says other devices are signed out", () => {
    expect(html).not.toMatch(/type="password"[^>]*value=/);
    expect(html).toContain("signs you out of every other device");
  });
});
