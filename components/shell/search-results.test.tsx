import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Command, CommandList } from "@/components/ui/command";
import { resultGroups } from "@/lib/shell/palette";
import { SearchResultGroups } from "./search-results";

const render = (groups: ReturnType<typeof resultGroups>) =>
  renderToStaticMarkup(
    <Command shouldFilter={false}>
      <CommandList>
        <SearchResultGroups groups={groups} onOpen={() => undefined} />
      </CommandList>
    </Command>,
  );

describe("SearchResultGroups", () => {
  it("shows Leads, People and Companies in that order with a second line each", () => {
    const html = render(
      resultGroups({
        leads: [{ label: "Priya Raman", detail: "Northwind Foods, LEAD-7K2M", href: "/fynix/leads/LEAD-7K2M" }],
        people: [{ label: "Tomas Eklund", detail: "Head of sales, Kestrel", href: "/fynix/clients/CLI-1/people" }],
        companies: [{ label: "Kestrel", detail: "Client", href: "/fynix/clients/CLI-1" }],
      }),
    );
    expect(html.indexOf("Leads")).toBeLessThan(html.indexOf("People"));
    expect(html.indexOf("People")).toBeLessThan(html.indexOf("Companies"));
    expect(html).toContain("Northwind Foods, LEAD-7K2M");
    expect(html).toContain("Head of sales, Kestrel");
  });

  it("leaves out a group with no hits", () => {
    const html = render(resultGroups({ leads: [], people: [{ label: "Asha", detail: null, href: "/client/team" }], companies: [] }));
    expect(html).toContain("People");
    expect(html).not.toContain("Leads");
    expect(html).not.toContain("Companies");
  });
});
