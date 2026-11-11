import { afterEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_LEADS } from "@/lib/sample/data";
import { queueSegments } from "./queue";
import { getServerSnapshot, getSnapshot, resetPendingCount, setPendingCount, subscribe } from "./pending-store";

afterEach(() => resetPendingCount());

describe("pending store", () => {
  it("starts at the number of pending sample leads", () => {
    expect(getSnapshot()).toBe(queueSegments(SAMPLE_LEADS).waiting.length);
    expect(getServerSnapshot()).toBe(queueSegments(SAMPLE_LEADS).waiting.length);
  });

  it("updates the snapshot and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setPendingCount(2);
    expect(getSnapshot()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not notify when the value is unchanged", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setPendingCount(getSnapshot());
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    subscribe(listener)();
    setPendingCount(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("reset restores the initial count and notifies", () => {
    setPendingCount(0);
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    resetPendingCount();
    expect(getSnapshot()).toBe(queueSegments(SAMPLE_LEADS).waiting.length);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("rejects counts that are not non-negative integers", () => {
    expect(() => setPendingCount(-1)).toThrow(RangeError);
    expect(() => setPendingCount(1.5)).toThrow(RangeError);
  });
});
