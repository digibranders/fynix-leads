import { describe, expect, it } from "vitest";
import { createDecisionGate } from "./decision-gate";

function setup(lockMs?: number) {
  let t = 1000;
  const gate = createDecisionGate(lockMs, () => t);
  return { gate, advance: (ms: number) => (t += ms) };
}

describe("createDecisionGate", () => {
  it("allows the first decision", () => {
    expect(setup().gate.allow()).toBe(true);
  });

  it("refuses a second decision inside the lock window", () => {
    const { gate, advance } = setup(400);
    gate.allow();
    advance(60);
    expect(gate.allow()).toBe(false);
    advance(339);
    expect(gate.allow()).toBe(false);
  });

  it("allows a decision once the window has passed", () => {
    const { gate, advance } = setup(400);
    gate.allow();
    advance(400);
    expect(gate.allow()).toBe(true);
  });

  it("does not extend the window by refused attempts", () => {
    const { gate, advance } = setup(400);
    gate.allow();
    advance(300);
    gate.allow();
    advance(100);
    expect(gate.allow()).toBe(true);
  });

  it("locks again after a selection change", () => {
    const { gate, advance } = setup(400);
    gate.allow();
    advance(1000);
    gate.touch();
    advance(100);
    expect(gate.allow()).toBe(false);
    advance(300);
    expect(gate.allow()).toBe(true);
  });

  it("uses 400 ms by default", () => {
    const { gate, advance } = setup();
    gate.allow();
    advance(399);
    expect(gate.allow()).toBe(false);
    advance(1);
    expect(gate.allow()).toBe(true);
  });
});
