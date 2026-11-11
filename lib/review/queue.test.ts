import { describe, expect, it } from "vitest";
import type { ApprovalStatus } from "@/lib/domain/status";
import type { Lead } from "@/lib/domain/types";
import { SAMPLE_LEADS } from "@/lib/sample/data";
import { insertAt, queueSegments, removeByRef, reviewQueue } from "./queue";

const item = (ref: string) => ({ ref });
const refs = (items: readonly { ref: string }[]) => items.map((i) => i.ref);

function lead(ref: string, approval: ApprovalStatus, submittedAt: string): Lead {
  return {
    ref,
    campaignRef: "CMP-TEST",
    approval,
    submittedAt,
    prospect: {
      name: "Test Person",
      title: "Title",
      company: "Company",
      companyDomain: "example.test",
      email: "test@example.test",
      phone: "+44 20 0000 0000",
      linkedinUrl: "https://www.linkedin.com/in/test",
      zone: "Europe/London",
    },
    bant: { budget: "b", authority: "a", need: "n", timeline: "t" },
    meetings: [],
    activity: [],
    thread: [],
  };
}

describe("removeByRef", () => {
  const list = [item("A"), item("B"), item("C")];

  it("selects the next item when a middle item is removed", () => {
    const result = removeByRef(list, "B");
    expect(refs(result.items)).toEqual(["A", "C"]);
    expect(result.nextRef).toBe("C");
    expect(result.index).toBe(1);
  });

  it("selects the next item when the first item is removed", () => {
    const result = removeByRef(list, "A");
    expect(refs(result.items)).toEqual(["B", "C"]);
    expect(result.nextRef).toBe("B");
    expect(result.index).toBe(0);
  });

  it("selects the previous item when the last item is removed", () => {
    const result = removeByRef(list, "C");
    expect(refs(result.items)).toEqual(["A", "B"]);
    expect(result.nextRef).toBe("B");
    expect(result.index).toBe(2);
  });

  it("gives a null nextRef when the only item is removed", () => {
    const result = removeByRef([item("A")], "A");
    expect(result.items).toEqual([]);
    expect(result.nextRef).toBeNull();
    expect(result.index).toBe(0);
  });

  it("returns the same items for an unknown ref", () => {
    const result = removeByRef(list, "Z");
    expect(result.items).toEqual(list);
    expect(result.nextRef).toBeNull();
    expect(result.index).toBe(-1);
  });

  it("does not mutate the input", () => {
    removeByRef(list, "B");
    expect(refs(list)).toEqual(["A", "B", "C"]);
  });
});

describe("insertAt", () => {
  const list = [item("A"), item("C")];

  it("restores an item at its original index", () => {
    expect(refs(insertAt(list, item("B"), 1))).toEqual(["A", "B", "C"]);
  });

  it("clamps an index past the end", () => {
    expect(refs(insertAt(list, item("D"), 99))).toEqual(["A", "C", "D"]);
  });

  it("clamps a negative index to the start", () => {
    expect(refs(insertAt(list, item("Z"), -5))).toEqual(["Z", "A", "C"]);
  });

  it("does not mutate the input", () => {
    insertAt(list, item("B"), 1);
    expect(refs(list)).toEqual(["A", "C"]);
  });

  it("round-trips with removeByRef", () => {
    const original = [item("A"), item("B"), item("C")];
    const removed = removeByRef(original, "B");
    expect(insertAt(removed.items, item("B"), removed.index)).toEqual(original);
  });
});

describe("reviewQueue", () => {
  it("keeps only pending leads, oldest submission first", () => {
    const leads = [
      lead("LD-0001", "pending", "2026-11-11T09:00:00Z"),
      lead("LD-0002", "approved", "2026-11-01T09:00:00Z"),
      lead("LD-0003", "pending", "2026-11-09T09:00:00Z"),
      lead("LD-0004", "needs_clarification", "2026-11-02T09:00:00Z"),
      lead("LD-0005", "rejected", "2026-11-03T09:00:00Z"),
      lead("LD-0006", "draft", "2026-11-04T09:00:00Z"),
      lead("LD-0007", "pending", "2026-11-10T09:00:00Z"),
    ];
    expect(refs(reviewQueue(leads))).toEqual(["LD-0003", "LD-0007", "LD-0001"]);
  });

  it("does not mutate the input", () => {
    const leads = [lead("LD-0001", "pending", "2026-11-11T09:00:00Z"), lead("LD-0002", "pending", "2026-11-09T09:00:00Z")];
    reviewQueue(leads);
    expect(refs(leads)).toEqual(["LD-0001", "LD-0002"]);
  });

  it("returns an empty list when nothing is pending", () => {
    expect(reviewQueue([lead("LD-0001", "approved", "2026-11-01T09:00:00Z")])).toEqual([]);
  });
});

describe("queueSegments", () => {
  const decided = (ref: string, approval: ApprovalStatus, submittedAt: string, decidedAt: string): Lead => ({
    ...lead(ref, approval, submittedAt),
    decision: { outcome: approval === "approved" ? "approved" : "rejected", decidedAt },
  });

  const leads = [
    lead("LD-0001", "pending", "2026-11-11T09:00:00Z"),
    lead("LD-0002", "pending", "2026-11-09T09:00:00Z"),
    lead("LD-0003", "needs_clarification", "2026-11-10T09:00:00Z"),
    lead("LD-0004", "needs_clarification", "2026-11-08T09:00:00Z"),
    decided("LD-0005", "approved", "2026-11-01T09:00:00Z", "2026-11-05T09:00:00Z"),
    decided("LD-0006", "rejected", "2026-11-02T09:00:00Z", "2026-11-07T09:00:00Z"),
    decided("LD-0007", "approved", "2026-11-03T09:00:00Z", "2026-11-06T09:00:00Z"),
    lead("LD-0008", "draft", "2026-11-04T09:00:00Z"),
  ];

  it("puts pending leads in waiting, oldest submission first", () => {
    expect(refs(queueSegments(leads).waiting)).toEqual(["LD-0002", "LD-0001"]);
  });

  it("puts needs_clarification leads in clarifying, oldest submission first", () => {
    expect(refs(queueSegments(leads).clarifying)).toEqual(["LD-0004", "LD-0003"]);
  });

  it("puts approved and rejected leads in decided, newest decision first", () => {
    expect(refs(queueSegments(leads).decided)).toEqual(["LD-0006", "LD-0007", "LD-0005"]);
  });

  it("leaves drafts out of every segment", () => {
    const all = queueSegments(leads);
    expect([...all.waiting, ...all.clarifying, ...all.decided].map((l) => l.ref)).not.toContain("LD-0008");
  });

  it("keeps a decided lead without a decision at the end instead of throwing", () => {
    const result = queueSegments([
      lead("LD-0009", "approved", "2026-11-01T09:00:00Z"),
      decided("LD-0005", "approved", "2026-11-01T09:00:00Z", "2026-11-05T09:00:00Z"),
    ]);
    expect(refs(result.decided)).toEqual(["LD-0005", "LD-0009"]);
  });

  it("does not mutate the input", () => {
    const copy = [...leads];
    queueSegments(leads);
    expect(refs(leads)).toEqual(refs(copy));
  });

  it("gives 6 waiting, 2 clarifying and 6 decided on the sample data", () => {
    const { waiting, clarifying, decided: done } = queueSegments(SAMPLE_LEADS);
    expect([waiting.length, clarifying.length, done.length]).toEqual([6, 2, 6]);
  });
});
