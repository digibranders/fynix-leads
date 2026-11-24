import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/client/review" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: () => undefined }) }));

import { PORTALS } from "./nav";
import { SidebarContent } from "./sidebar";

const render = (portal: keyof typeof PORTALS, counts: Record<string, number> = {}) =>
  renderToStaticMarkup(<SidebarContent portal={PORTALS[portal]} counts={counts} footer={<span>Signed in footer</span>} />);

describe("SidebarContent", () => {
  it("names the product and the portal, lists grouped labelled links and renders the footer", () => {
    const html = render("client");
    expect(html).toContain("Fynix Leads");
    expect(html).toContain("Client portal");
    for (const label of ["Work", "Campaign", "Overview", "Availability", "Leads", "Meetings", "Messages", "Hosts &amp; hours", "Agreement"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Signed in footer");
  });

  it("marks only the current page", () => {
    const html = render("client");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/client\/review"|href="\/client\/review"[^>]*aria-current="page"/);
  });

  it("shows a live count only when it is above zero", () => {
    expect(render("client", { respond: 2 })).toContain("2 waiting");
    expect(render("client", { respond: 0 })).not.toContain("waiting");
    expect(render("client")).not.toContain("waiting");
  });

  it("builds the other portals from the same list", () => {
    pathname.value = "/fynix/campaigns/CMP-4821";
    const html = render("fynix", { rejections: 3 });
    expect(html).toContain("Fynix team");
    expect(html).toContain("Rejections");
    expect(html).toContain("3 waiting");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(render("agency")).toContain("My aliases");
    expect(render("supplier")).toContain("Partner agencies");
  });
});
