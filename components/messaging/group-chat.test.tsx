import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/fynix/inbox", useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }) }));
vi.mock("@/server/domain/group-actions", () => {
  const action = async () => ({ status: "idle" as const });
  return { addGroupMembersAction: action, createGroupAction: action, deleteGroupAction: action, leaveGroupAction: action, openDirectChatAction: action, loadGroupCandidatesAction: async () => [], loadGroupMembersAction: async () => [], removeGroupMemberAction: action, renameGroupAction: action };
});

const { PeoplePicker } = await import("./group-chat");

const people = [
  { userId: "u1", displayName: "Asha", orgName: "Kestrel", roleLabel: "Client" },
  { userId: "u2", displayName: "Marc", orgName: "Fynix", roleLabel: "Fynix" },
];

describe("PeoplePicker", () => {
  it("says what a group may hold when it picks for a group", () => {
    const html = renderToStaticMarkup(<PeoplePicker candidates={people} selected={new Set()} onToggle={() => undefined} showRule />);
    expect(html).toContain("A group is Fynix plus one client, or one coordinator with its agencies.");
    expect(html).toContain("Asha");
  });
  it("stays quiet for a chat between two people", () => {
    const html = renderToStaticMarkup(<PeoplePicker candidates={people} selected={new Set()} onToggle={() => undefined} onPick={() => undefined} />);
    expect(html).not.toContain("A group is Fynix");
  });
});
