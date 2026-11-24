import { describe, expect, it } from "vitest";
import { badgeLabel, formatBadge } from "./badge";

describe("formatBadge", () => {
  it("shows the number up to 99 and 99+ above it", () => {
    expect(formatBadge(1)).toBe("1");
    expect(formatBadge(99)).toBe("99");
    expect(formatBadge(100)).toBe("99+");
    expect(formatBadge(1234)).toBe("99+");
  });
});

describe("badgeLabel", () => {
  it("names what is counted", () => {
    expect(badgeLabel(3)).toBe("3 waiting");
    expect(badgeLabel(3, "unread")).toBe("3 unread");
    expect(badgeLabel(250, "unread")).toBe("99+ unread");
  });
});
