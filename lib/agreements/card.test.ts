import { describe, expect, it } from "vitest";
import { agreementCard } from "./card";

const v = (version: number, status: "current" | "superseded", inForce: boolean) => ({ version, status, inForce });

describe("agreementCard", () => {
  it("keeps the old version in force while the newer one waits", () => {
    const card = agreementCard([v(3, "current", false), v(2, "superseded", true), v(1, "superseded", false)]);
    expect(card.inForce?.version).toBe(2);
    expect(card.pending?.version).toBe(3);
    expect(card.history.map((row) => row.version)).toEqual([1]);
  });

  it("has nothing in force before both sides accept the first version", () => {
    const card = agreementCard([v(1, "current", false)]);
    expect(card.inForce).toBeNull();
    expect(card.pending?.version).toBe(1);
    expect(card.history).toEqual([]);
  });

  it("has nothing pending once the newest version is in force", () => {
    const card = agreementCard([v(2, "current", true), v(1, "superseded", false)]);
    expect(card.pending).toBeNull();
    expect(card.history.map((row) => row.version)).toEqual([1]);
    expect(agreementCard([])).toEqual({ inForce: null, pending: null, history: [] });
  });
});
