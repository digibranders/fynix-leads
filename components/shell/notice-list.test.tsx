import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { NoticeView } from "@/lib/leads/notice-display";

vi.mock("next/navigation", () => ({ usePathname: () => "/client", useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
vi.mock("@/server/domain/notice-actions", () => ({
  loadNoticesAction: async () => [],
  markNoticeReadAction: async () => undefined,
  markAllNoticesReadAction: async () => undefined,
  searchEverythingAction: async () => ({ leads: [], people: [], companies: [] }),
}));

const { NoticeItem, NoticeList } = await import("./notice-list");
const { NoticeBell } = await import("./notice-bell");

const now = new Date("2026-11-25T12:00:00Z");
const notice = (over: Partial<NoticeView>): NoticeView => ({
  id: "n1",
  kind: "lead_accepted",
  title: "Lead LEAD-7K2M was accepted",
  body: "The lead counts as one.",
  link: "/client/leads/LEAD-7K2M",
  read: false,
  createdAt: "2026-11-25T09:00:00Z",
  ...over,
});

describe("NoticeItem", () => {
  it("links to the page, shows the title, the text and how long ago", () => {
    const html = renderToStaticMarkup(
      <ul>
        <NoticeItem notice={notice({})} now={now} />
      </ul>,
    );
    expect(html).toContain('href="/client/leads/LEAD-7K2M"');
    expect(html).toContain("Lead LEAD-7K2M was accepted");
    expect(html).toContain("The lead counts as one.");
    expect(html).toContain("3 h ago");
  });

  it("marks an unread notice with a dot and leaves a read one without", () => {
    const wrap = (n: NoticeView) =>
      renderToStaticMarkup(
        <ul>
          <NoticeItem notice={n} now={now} />
        </ul>,
      );
    expect(wrap(notice({ read: false }))).toContain('aria-label="Unread"');
    expect(wrap(notice({ read: true }))).not.toContain("Unread");
  });

  it("links a message notice to its thread", () => {
    const html = renderToStaticMarkup(
      <ul>
        <NoticeItem notice={notice({ kind: "message_received", title: "New message from Asha", link: "/client/messages?conv=3b0c" })} now={now} />
      </ul>,
    );
    expect(html).toContain('href="/client/messages?conv=3b0c"');
  });

  it("never follows a link that leaves the app", () => {
    const html = renderToStaticMarkup(
      <ul>
        <NoticeItem notice={notice({ link: "//evil.example/x" })} now={now} />
      </ul>,
    );
    expect(html).not.toContain("evil.example");
  });
});

describe("NoticeList", () => {
  it("says so when there is nothing", () => {
    expect(renderToStaticMarkup(<NoticeList notices={[]} now={now} />)).toContain("No notices yet.");
  });
  it("lists every notice in order", () => {
    const html = renderToStaticMarkup(<NoticeList notices={[notice({ id: "a", title: "First" }), notice({ id: "b", title: "Second" })]} now={now} />);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
  });
});

describe("NoticeBell", () => {
  it("shows the unread count on the bell, once for each breakpoint", () => {
    const html = renderToStaticMarkup(<NoticeBell seeAllHref="/client/notices" unread={3} />);
    expect(html.match(/aria-label="Notices, 3 unread"/g)).toHaveLength(2);
    expect(html).toContain(">3<");
  });
  it("shows 99+ above 99 and no badge at zero", () => {
    expect(renderToStaticMarkup(<NoticeBell seeAllHref="/client/notices" unread={240} />)).toContain(">99+<");
    const none = renderToStaticMarkup(<NoticeBell seeAllHref="/client/notices" unread={0} />);
    expect(none).toContain('aria-label="Notices"');
    expect(none).not.toContain("unread");
  });
});
