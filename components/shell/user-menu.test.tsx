import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/actions", () => ({ signOutAction: async () => undefined }));

const { UserMenu } = await import("./user-menu");

describe("UserMenu", () => {
  it("links to the profile page of the portal and keeps sign-out", () => {
    const html = renderToStaticMarkup(<UserMenu name="Priya Nair" roleLabel="Client manager" profileHref="/client/profile" />);
    expect(html).toMatch(/href="\/client\/profile"[^>]*aria-label="Profile"|aria-label="Profile"[^>]*href="\/client\/profile"/);
    expect(html).toContain("Sign out");
    expect(html).toContain("Client manager");
  });
});
