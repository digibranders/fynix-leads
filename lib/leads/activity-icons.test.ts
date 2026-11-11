import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@/lib/domain/types";
import { activityIcon } from "./activity-icons";

const ev = (actor: string, text: string, kind: "human" | "system" = "human"): ActivityEvent => ({
  id: "EV-1",
  at: "2026-11-11T08:00:00Z",
  actor,
  kind,
  text,
});

describe("activityIcon", () => {
  it("gives a Fynix reply a peach chat disc", () => {
    expect(activityIcon(ev("Meera, Fynix", "Replied to the follow-up question"))).toEqual({ glyph: "chat", tone: "peach" });
  });

  it("gives a client message a navy chat disc", () => {
    expect(activityIcon(ev("Client", "Asked for clarification"))).toEqual({ glyph: "chat", tone: "navy" });
  });

  it("gives a submission a peach paper plane", () => {
    expect(activityIcon(ev("Aarav, Fynix", "Submitted for review"))).toEqual({ glyph: "paper-plane", tone: "peach" });
    expect(activityIcon(ev("Meera, Fynix", "Submitted as a replacement for LD-3H8Q"))).toEqual({
      glyph: "paper-plane",
      tone: "peach",
    });
  });

  it("gives meeting events a calendar", () => {
    expect(activityIcon(ev("Aarav, Fynix", "Meeting scheduled for Tue 17 Nov"))).toEqual({ glyph: "calendar", tone: "peach" });
    expect(activityIcon(ev("Client", "Meeting marked completed"))).toEqual({ glyph: "calendar", tone: "navy" });
  });

  it("gives the client decisions a check or a cross", () => {
    expect(activityIcon(ev("Client", "Approved"))).toEqual({ glyph: "check", tone: "navy" });
    expect(activityIcon(ev("Client", "Rejected: company outside the target profile"))).toEqual({ glyph: "cross", tone: "navy" });
  });

  it("gives system events a quiet gear", () => {
    expect(activityIcon(ev("System", "Notification email delivered", "system"))).toEqual({ glyph: "system", tone: "navy" });
  });

  it("decides by the event kind, not by the words, for system events", () => {
    expect(activityIcon(ev("System", "Submitted for review", "system")).glyph).toBe("system");
  });
});
