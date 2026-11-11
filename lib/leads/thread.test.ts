import { describe, expect, it } from "vitest";
import { clarificationState, lastMessageSide } from "./thread";

const m = (side: "client" | "fynix") => ({ side });

describe("lastMessageSide", () => {
  it("is null for an empty thread", () => expect(lastMessageSide([])).toBeNull());
  it("is the side of the final message", () => {
    expect(lastMessageSide([m("client")])).toBe("client");
    expect(lastMessageSide([m("client"), m("fynix")])).toBe("fynix");
  });
});

describe("clarificationState", () => {
  it("is awaiting reply when the client spoke last or the thread is empty", () => {
    expect(clarificationState([m("client")])).toBe("awaiting_reply");
    expect(clarificationState([])).toBe("awaiting_reply");
  });
  it("is reply received when Fynix spoke last", () => {
    expect(clarificationState([m("client"), m("fynix")])).toBe("reply_received");
  });
});
