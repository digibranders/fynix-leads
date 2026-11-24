import { describe, expect, it } from "vitest";
import { GROUP_RULE_TEXT, groupRefusalMessage } from "./group-rules";

describe("groupRefusalMessage", () => {
  it("turns the database's refusal into plain words, wherever it sits in the chain", () => {
    const inner = new Error("A group holds Fynix and one side only: one client, or one coordinator with its agencies");
    const outer = new Error("Failed query: select ...", { cause: inner });
    expect(groupRefusalMessage(outer)).toBe(`Those people cannot be in one group. ${GROUP_RULE_TEXT}`);
  });
  it("leaves any other error alone", () => {
    expect(groupRefusalMessage(new Error("connection reset"))).toBeNull();
    expect(groupRefusalMessage("text")).toBeNull();
  });
});
