import { describe, expect, it } from "vitest";
import { decisionNoteLabel, historyActionText, historySideText, stageChangeText } from "./history-text";

describe("history text", () => {
  it("words the known actions and falls back for an unknown one", () => {
    expect(historyActionText("lead.auto_accept")).toBe("Accepted automatically");
    expect(historyActionText("lead.something_new")).toBe("Updated");
  });

  it("never calls the supply side a coordinator or an agency to the client", () => {
    expect(historySideText("supply", "client")).toBe("Fynix team");
    expect(historySideText("supply", "supply")).toBe("Coordinator or agency");
    expect(historySideText("client", "supply")).toBe("Client");
    expect(historySideText("client", "client")).toBe("Your team");
  });

  it("describes a stage change only when there is one", () => {
    expect(stageChangeText("scheduled", "awaiting_decision")).toBe("Scheduled to Awaiting decision");
    expect(stageChangeText("scheduled", "scheduled")).toBeNull();
    expect(stageChangeText(null, "awaiting_client")).toBe("Awaiting client");
  });
});

describe("decisionNoteLabel", () => {
  it("shows the supply side the client, never the person", () => {
    expect(decisionNoteLabel("supply", "client", "Daniel Okafor")).toBe("Client's note");
  });

  it("names the person to the client and to Fynix", () => {
    expect(decisionNoteLabel("client", "client", "Daniel Okafor")).toBe("Note from Daniel Okafor");
    expect(decisionNoteLabel("fynix", "client", "Daniel Okafor")).toBe("Client's note, Daniel Okafor");
  });

  it("says when the answer was automatic or came from Fynix", () => {
    expect(decisionNoteLabel("client", "auto", null)).toBe("Automatic acceptance");
    expect(decisionNoteLabel("supply", "fynix", "Mira Costa")).toBe("Fynix note");
    expect(decisionNoteLabel("fynix", "fynix", "Mira Costa")).toBe("Fynix note, Mira Costa");
  });
});
