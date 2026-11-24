import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/fynix/notices", useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
vi.mock("@/server/domain/notice-actions", () => ({ markNoticeReadAction: async () => undefined, markAllNoticesReadAction: async () => undefined }));

const { NoticesView, parseNoticesTab } = await import("./notices-view");

const now = new Date("2026-11-25T12:00:00Z");
const notices = [
  { id: "a", kind: "lead_submitted", title: "Lead LEAD-AAAA is waiting for a time", body: "Pick a time.", link: "/fynix/leads/LEAD-AAAA", read: false, createdAt: "2026-11-25T11:00:00Z" },
  { id: "b", kind: "message_received", title: "New message from Asha", body: "Hello", link: "/fynix/inbox?conv=1", read: true, createdAt: "2026-11-24T11:00:00Z" },
];

describe("NoticesView", () => {
  it("has All and Unread tabs, the unread count and the list", () => {
    const html = renderToStaticMarkup(<NoticesView basePath="/fynix/notices" tab="all" notices={notices} unreadTotal={1} now={now} />);
    expect(html).toContain("Notices");
    expect(html).toContain('href="/fynix/notices"');
    expect(html).toContain('href="/fynix/notices?show=unread"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain("1 unread.");
    expect(html).toContain("Mark all read");
    expect(html).toContain('href="/fynix/inbox?conv=1"');
  });

  it("explains an empty Unread tab and offers no Mark all read", () => {
    const html = renderToStaticMarkup(<NoticesView basePath="/fynix/notices" tab="unread" notices={[]} unreadTotal={0} now={now} />);
    expect(html).toContain("No unread notices.");
    expect(html).toContain("Everything is read.");
    expect(html).not.toContain("Mark all read");
  });
});

describe("parseNoticesTab", () => {
  it("reads unread and falls back to all", () => {
    expect(parseNoticesTab("unread")).toBe("unread");
    expect(parseNoticesTab("x")).toBe("all");
    expect(parseNoticesTab(undefined)).toBe("all");
  });
});
