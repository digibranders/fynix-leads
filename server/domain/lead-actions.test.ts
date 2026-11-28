import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_TENANT_ACTION } from "@/lib/tenant/action-state";
import { DomainError } from "@/server/domain/errors";

class Redirected extends Error {
  constructor(readonly to: string, readonly type: string | undefined) {
    super(`redirect to ${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  submitLead: vi.fn(),
  updateDraft: vi.fn(),
  submitDraft: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (to: string, type?: string): never => {
    throw new Redirected(to, type);
  },
}));
vi.mock("@/server/auth", () => ({
  getSessionContext: async () => ({ kind: "agency", userId: "user", orgId: "agency", memberRole: "manager" }),
}));
vi.mock("@/server/auth/rate-limit", () => ({ firstBlockedLimit: async () => null }));
vi.mock("@/server/calendar", () => ({ calendarSetupFromEnv: () => null }));
vi.mock("@/server/calendar/live-check", () => ({ assertLiveFree: vi.fn() }));
vi.mock("@/server/db/client", () => ({ getDatabase: () => ({ db: {} }) }));
vi.mock("@/server/domain", () => ({ getDomain: () => ({ now: () => new Date() }) }));
vi.mock("@/server/domain/leads", () => ({ submitLead: mocks.submitLead }));
vi.mock("@/server/domain/lead-drafts", () => ({
  updateDraft: mocks.updateDraft,
  submitDraft: mocks.submitDraft,
}));

const { submitLeadAction } = await import("./lead-actions");

function leadForm(draftId = ""): FormData {
  const data = new FormData();
  data.set("campaignId", "campaign");
  data.set("draftId", draftId);
  data.set("proposedTimes", "2026-12-01T10:00:00.000Z");
  data.set("inviteeMemberIds", "invitee");
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("submitLeadAction", () => {
  it.each([
    ["/agency/leads", ""],
    ["/coordinator/leads", "draft"],
  ] as const)("revalidates both lists and redirects to %s after sending", async (href, draftId) => {
    await expect(submitLeadAction(href, IDLE_TENANT_ACTION, leadForm(draftId)))
      .rejects.toMatchObject({ to: href, type: "replace" });
    expect(draftId ? mocks.submitDraft : mocks.submitLead).toHaveBeenCalledOnce();
    if (draftId) expect(mocks.updateDraft).toHaveBeenCalledBefore(mocks.submitDraft);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/agency/leads"], ["/coordinator/leads"]]);
  });

  it("returns the draft error in place when a saved draft cannot be sent", async () => {
    mocks.submitDraft.mockRejectedValue(new DomainError("prospect-duplicate", "This prospect already exists."));

    await expect(submitLeadAction("/agency/leads", IDLE_TENANT_ACTION, leadForm("draft"))).resolves.toEqual({
      status: "error",
      message: "Your changes are saved in the draft, but it was not sent. This prospect already exists.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a redirect destination outside the two leads lists before submitting", async () => {
    await expect(submitLeadAction("https://example.com", IDLE_TENANT_ACTION, leadForm()))
      .resolves.toMatchObject({ status: "error" });
    expect(mocks.submitLead).not.toHaveBeenCalled();
  });
});
