import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/client",
  useRouter: () => ({ refresh: () => undefined }),
}));

import { CampaignsView } from "./campaigns-view";
import { TenantShell } from "./app-shell";
import { AcceptLeadTimeButton } from "./lead-review-actions";
import {
  DownloadIcsButton,
  JoinMeetButton,
  RecordMeetingOutcomeModal,
} from "./meeting-actions";
import { TenantKpiCard, TenantKpiGrid } from "./metric-cards";
import { MessagingView } from "./messaging-view";
import { CLIENT_NAV, SUPPLIER_NAV, AGENCY_NAV } from "./nav-config";
import { SubmitLeadForm } from "./submit-lead-form";

describe("TenantShell", () => {
  it("renders Client portal rail and content", () => {
    const html = renderToStaticMarkup(
      <TenantShell
        userName="Simarpreet Singh"
        roleLabel="Client manager"
        portalLabel="Client"
        homeHref="/client"
        navItems={CLIENT_NAV}
      >
        <div>Client Content</div>
      </TenantShell>,
    );

    expect(html).toContain("Fynix Leads");
    expect(html).toContain("Client");
    expect(html).toContain("Simarpreet Singh");
    expect(html).toContain("Client manager");
    expect(html).toContain("Hosts &amp; hours");
    expect(html).toContain("Agreement");
    expect(html).toContain("Client Content");
  });

  it("renders Supplier portal rail and content", () => {
    const html = renderToStaticMarkup(
      <TenantShell
        userName="Nikhil Oberoi"
        roleLabel="Supplier manager"
        portalLabel="Supplier"
        homeHref="/supplier"
        navItems={SUPPLIER_NAV}
      >
        <div>Supplier Content</div>
      </TenantShell>,
    );

    expect(html).toContain("Supplier");
    expect(html).toContain("Partner agencies");
    expect(html).toContain("Aliases");
    expect(html).toContain("Agreement");
    expect(html).toContain("Supplier Content");
  });

  it("renders Partner Agency portal rail and content", () => {
    const html = renderToStaticMarkup(
      <TenantShell
        userName="Pooja Patel"
        roleLabel="Agency member"
        portalLabel="Partner Agency"
        homeHref="/agency"
        navItems={AGENCY_NAV}
      >
        <div>Agency Content</div>
      </TenantShell>,
    );

    expect(html).toContain("Partner Agency");
    expect(html).toContain("Leads");
    expect(html).toContain("My Aliases");
    expect(html).toContain("Agency Content");
  });

  it("renders AcceptLeadTimeButton", () => {
    const html = renderToStaticMarkup(
      <AcceptLeadTimeButton
        leadId="11111111-1111-4111-8111-111111111111"
        meetingTimeIso="2026-12-05T10:00:00.000Z"
        displayTime="05 Dec 2026, 10:00"
      />,
    );
    expect(html).toContain("Accept 05 Dec 2026, 10:00");
    expect(html).toContain("11111111-1111-4111-8111-111111111111");
  });

  it("renders SubmitLeadForm", () => {
    const html = renderToStaticMarkup(
      <SubmitLeadForm
        campaigns={[{ id: "c1", name: "UK Tech", clientBrandName: "Kestrel" }]}
        aliases={[{ id: "a1", displayName: "Alex Vance", clientBrandName: "Kestrel", aliasEmail: "alex@kestrel.com" }]}
        hosts={[{ id: "h1", campaignId: "c1", name: "Host (VP Sales)", jobTitle: "VP Sales" }]}
      />,
    );
    // The campaign list opens on demand; the closed dropdown posts under its own name.
    expect(html).toContain('name="campaignId"');
    expect(html).toContain("Select campaign");
    expect(html).toContain('name="aliasIdentityId"');
    expect(html).toContain('name="hostMemberId"');
    expect(html).toContain("Submit Qualified Lead");
  });

  it("renders TenantKpiCard and TenantKpiGrid", () => {
    const html = renderToStaticMarkup(
      <TenantKpiGrid>
        <TenantKpiCard
          title="Target vs Delivered"
          value="14 / 30"
          subtitle="47% delivered"
          tone="emerald"
        />
        <TenantKpiCard
          title="Awaiting Response"
          value={3}
          subtitle="3 prospects waiting"
          tone="amber"
        />
      </TenantKpiGrid>,
    );

    expect(html).toContain("Target vs Delivered");
    expect(html).toContain("14 / 30");
    expect(html).toContain("47% delivered");
    expect(html).toContain("Awaiting Response");
    expect(html).toContain("3 prospects waiting");
  });

  it("links Meetings to appropriate tenant routes", () => {
    const clientMeetings = CLIENT_NAV.find((item) => item.label === "Meetings");
    expect(clientMeetings?.href).toBe("/client/meetings");

    const supplierMeetings = SUPPLIER_NAV.find((item) => item.label === "Meetings");
    expect(supplierMeetings?.href).toBe("/supplier/meetings");

    const agencyMeetings = AGENCY_NAV.find((item) => item.label === "Meetings");
    expect(agencyMeetings?.href).toBe("/agency/meetings");
  });

  it("renders DownloadIcsButton and JoinMeetButton", () => {
    const meetingData = {
      id: "m1",
      publicRef: "MTG-7Q2X",
      campaignName: "UK Tech",
      prospectName: "Alex Vance",
      prospectCompany: "Black Mesa",
      googleMeetUrl: "https://meet.google.com/abc-defg-hij",
      scheduledStartTime: new Date("2026-12-10T14:00:00Z"),
      durationMinutes: 30,
      outcome: "scheduled",
    };

    const icsHtml = renderToStaticMarkup(<DownloadIcsButton meeting={meetingData} />);
    expect(icsHtml).toContain(".ics");
    expect(icsHtml).toContain("MTG-7Q2X.ics");

    const meetHtml = renderToStaticMarkup(<JoinMeetButton url={meetingData.googleMeetUrl} />);
    expect(meetHtml).toContain("Join Meet");
    expect(meetHtml).toContain("https://meet.google.com/abc-defg-hij");

    const modalHtml = renderToStaticMarkup(<RecordMeetingOutcomeModal meetingId={meetingData.id} />);
    expect(modalHtml).toContain("Record outcome");
  });

  it("links Messages to appropriate tenant routes", () => {
    const clientMessages = CLIENT_NAV.find((item) => item.label === "Messages");
    expect(clientMessages?.href).toBe("/client/messages");

    const supplierMessages = SUPPLIER_NAV.find((item) => item.label === "Messages");
    expect(supplierMessages?.href).toBe("/supplier/messages");

    const agencyMessages = AGENCY_NAV.find((item) => item.label === "Messages");
    expect(agencyMessages?.href).toBe("/agency/messages");
  });

  it("renders MessagingView with threads and message stream", () => {
    const convs = [
      {
        id: "c1",
        publicRef: "MSG-7Q2X",
        campaignId: "cmp1",
        leadId: "l1",
        side: "client_fynix" as const,
        subject: "Meeting details",
        counterpartyName: "Kestrel Ledger",
        leadRef: "LD-5N7W",
        leadProspectName: "Jack Strachan",
        leadCompany: "Dunmore Retail",
        lastMessageSnippet: "Before I accept a time...",
        lastMessageAt: "2026-11-15T10:00:00Z",
        unreadCount: 1,
      },
    ];

    const messages = [
      {
        id: "m1",
        conversationId: "c1",
        senderUserId: "u1",
        senderRole: "client" as const,
        senderName: "Daniel Okafor",
        body: "Does he sign off spend himself?",
        forwardOfMessageId: null,
        scrubbedCount: 0,
        createdAt: "2026-11-15T10:00:00Z",
      },
    ];

    const html = renderToStaticMarkup(
      <MessagingView
        role="client"
        currentUserId="u1"
        conversations={convs}
        initialConversationId="c1"
        initialMessages={messages}
        seenAt="2026-11-15T10:05:00Z"
      />,
    );

    expect(html).toContain("Threads");
    expect(html).toContain("Kestrel Ledger");
    expect(html).toContain("LD-5N7W");
    expect(html).toContain("Jack Strachan");
    expect(html).toContain("Does he sign off spend himself?");
    // Your own message carries a tick, and it is the "Seen" one because the other side opened the thread after it was sent.
    expect(html).toContain('aria-label="Seen"');
    // The actions that appear on hover are in the markup for keyboard and touch users.
    expect(html).toContain('aria-label="Copy text"');
    expect(html).toContain('aria-label="Send message"');
  });
});

describe("CampaignsView", () => {
  const row = { id: "c1", publicRef: "CMP-4M6R", name: "Retail grocery buyers", clientBrandName: "Halden", status: "active" as const, startDate: "2026-12-01", endDate: "2027-05-31", monthlyTarget: 20, totalTarget: 120, delivered: 12, inProgress: 3, share: 8, agencies: [{ agencyOrgId: "a1", name: "Ridgeway Media", monthlyShare: 6, delivered: 2 }], brief: null };

  it("says what an empty portal waits for, per portal", () => {
    expect(renderToStaticMarkup(<CampaignsView campaigns={[]} portal="agency" />)).toContain("Fynix has not assigned you a campaign yet");
    expect(renderToStaticMarkup(<CampaignsView campaigns={[]} portal="client" />)).toContain("Fynix sets your campaigns up with you");
  });

  it("shows progress to a client and the agency shares to a supplier, and a submit link only on an active campaign", () => {
    const client = renderToStaticMarkup(<CampaignsView campaigns={[row]} portal="client" />);
    expect(client).toContain("Retail grocery buyers");
    expect(client).toContain("10%");
    expect(client).not.toContain("Ridgeway Media");

    const brief = { geography: "United Kingdom", industries: ["Retail"], companySize: "", icp: "", jobTitles: [], seniority: "", technologies: [], bantBudget: "", bantAuthority: "", bantNeed: "", bantTimeline: "", instructions: "" };
    const supplier = renderToStaticMarkup(<CampaignsView campaigns={[{ ...row, brief }]} portal="supplier" submitHref="/supplier/leads/new" />);
    expect(supplier).toContain("Ridgeway Media");
    expect(supplier).toContain("View brief");
    expect(client).not.toContain("View brief");
    expect(supplier).toContain("/supplier/leads/new");

    const paused = renderToStaticMarkup(<CampaignsView campaigns={[{ ...row, status: "paused" }]} portal="agency" submitHref="/agency/leads/new" />);
    expect(paused).not.toContain("/agency/leads/new");
    expect(paused).toContain("Your monthly share");
  });
});
