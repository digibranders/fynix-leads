import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WhoJoined } from "./who-joined";

describe("the Who joined block", () => {
  it("says it is not available yet when there are no rows", () => {
    const html = renderToStaticMarkup(<WhoJoined joins={[]} />);
    expect(html).toContain("Who joined");
    expect(html).toContain("Not available yet");
  });

  it("lists each person with the time they joined and how long they stayed, and nothing like an email", () => {
    const html = renderToStaticMarkup(
      <WhoJoined
        joins={[
          { displayName: "Priya Nair", joinedAt: new Date("2026-11-24T09:01:00Z"), durationSeconds: 1380 },
          { displayName: "Lena", joinedAt: new Date("2026-11-24T09:03:00Z"), durationSeconds: 20 },
        ]}
      />,
    );
    expect(html).toContain("Priya Nair");
    expect(html).toContain("stayed 23 minutes");
    expect(html).toContain("stayed under a minute");
    expect(html).toContain("<time");
    expect(html).not.toContain("Not available yet");
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/@/);
  });
});
