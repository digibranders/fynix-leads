import { describe, expect, it } from "vitest";
import { breadcrumb, currentItem, flatItems, moreGroups, PORTALS, tabItems } from "./nav";

describe("phone tab bar", () => {
  it("puts four real items of the portal on the bar, home first", () => {
    for (const portal of Object.values(PORTALS)) {
      const tabs = tabItems(portal);
      expect(tabs.map((tab) => tab.href), portal.kind).toEqual(portal.mobileTabs);
      expect(tabs, portal.kind).toHaveLength(4);
      expect(tabs[0]?.href, portal.kind).toBe(portal.homeHref);
    }
  });

  it("orders the client bar as home, availability, meetings, messages", () => {
    expect(tabItems(PORTALS.client).map((tab) => tab.label)).toEqual(["Overview", "Availability", "Meetings", "Messages"]);
  });

  it("lists every other item in the More sheet, once, and no empty group", () => {
    for (const portal of Object.values(PORTALS)) {
      const listed = moreGroups(portal).flatMap((group) => group.items.map((item) => item.href));
      const onBar = new Set(portal.mobileTabs);
      expect(new Set(listed).size, portal.kind).toBe(listed.length);
      expect(listed.every((href) => !onBar.has(href)), portal.kind).toBe(true);
      expect(listed.length + onBar.size, portal.kind).toBe(flatItems(portal).length);
      expect(moreGroups(portal).every((group) => group.items.length > 0), portal.kind).toBe(true);
    }
  });

  it("keeps Team in the More sheet of the client, coordinator and agency, never on the bar", () => {
    for (const kind of ["client", "supplier", "agency"] as const) {
      const portal = PORTALS[kind];
      expect(moreGroups(portal).flatMap((group) => group.items.map((item) => item.href)), kind).toContain(`${portal.homeHref}/team`);
      expect(portal.mobileTabs, kind).not.toContain(`${portal.homeHref}/team`);
    }
  });

  it("keeps the client's exclusion list in the More sheet, never on the bar", () => {
    expect(moreGroups(PORTALS.client).flatMap((group) => group.items.map((item) => item.href))).toContain("/client/exclusions");
    expect(PORTALS.client.mobileTabs).not.toContain("/client/exclusions");
  });

  it("keeps leads in the client's More sheet", () => {
    expect(moreGroups(PORTALS.client).flatMap((group) => group.items.map((item) => item.label))).toContain("Leads");
  });
});

describe("portal navigation", () => {
  it("gives every item a unique href inside its own portal", () => {
    for (const portal of Object.values(PORTALS)) {
      const hrefs = flatItems(portal).map((item) => item.href);
      expect(new Set(hrefs).size, portal.kind).toBe(hrefs.length);
      for (const href of hrefs) expect(href.startsWith(portal.homeHref), href).toBe(true);
    }
  });

  it("has the home page as the first item of each portal", () => {
    for (const portal of Object.values(PORTALS)) expect(flatItems(portal)[0]?.href).toBe(portal.homeHref);
  });

  it("lights Overview on its own path only", () => {
    const client = PORTALS.client;
    expect(currentItem(client, "/client")?.label).toBe("Overview");
    expect(currentItem(client, "/client/leads")?.label).toBe("Leads");
  });

  it("keeps the section lit on a record below it, choosing the longest match", () => {
    expect(currentItem(PORTALS.fynix, "/fynix/campaigns/CMP-4821/hosts")?.label).toBe("Campaigns");
    expect(currentItem(PORTALS.client, "/client/review")?.label).toBe("Availability");
  });

  it("matches nothing for a path outside the portal or no path", () => {
    expect(currentItem(PORTALS.client, "/supplier/leads")).toBeNull();
    expect(currentItem(PORTALS.client, null)).toBeNull();
  });

  it("does not light a section for a path that only starts with the same letters", () => {
    expect(currentItem(PORTALS.client, "/client/leadsarchive")).toBeNull();
  });
});

describe("breadcrumb", () => {
  it("shows just the section on a list page", () => {
    expect(breadcrumb(PORTALS.client, "/client/leads")).toEqual(["Leads"]);
  });

  it("adds the record below a section", () => {
    expect(breadcrumb(PORTALS.fynix, "/fynix/campaigns/CMP-4821")).toEqual(["Campaigns", "CMP-4821"]);
    expect(breadcrumb(PORTALS.agency, "/agency/leads/new")).toEqual(["Leads", "New"]);
  });

  it("names the profile page", () => {
    expect(breadcrumb(PORTALS.supplier, "/supplier/profile")).toEqual(["Profile"]);
  });

  it("falls back to the portal name outside any section", () => {
    expect(breadcrumb(PORTALS.client, "/elsewhere")).toEqual(["Client portal"]);
  });
});

describe("messages badge and notices page", () => {
  it("counts unread conversations on the Messages item of every portal, and the Fynix Inbox", () => {
    for (const portal of Object.values(PORTALS)) {
      const item = flatItems(portal).find((entry) => entry.label === "Messages" || entry.label === "Inbox");
      expect(item?.countKey, portal.kind).toBe("messages");
      expect(item?.countKind, portal.kind).toBe("unread");
    }
  });

  it("titles the Notices page of each portal", () => {
    for (const portal of Object.values(PORTALS)) expect(breadcrumb(portal, `${portal.homeHref}/notices`), portal.kind).toEqual(["Notices"]);
  });
});
