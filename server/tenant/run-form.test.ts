import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DomainError } from "@/server/domain/errors";

const state = vi.hoisted(() => ({ session: vi.fn(), revalidate: vi.fn(), after: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/server", () => ({ after: state.after }));
vi.mock("@/server/auth", () => ({ getSessionContext: () => state.session() }));
vi.mock("@/server/domain", () => ({ sendQueuedMail: async () => ({}) }));

const { runTenantForm } = await import("./run-form");

const form = (values: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};
const schema = z.object({ name: z.string().trim().min(1, "is required") }).strict();
const spec = (over: Partial<Parameters<typeof runTenantForm>[0]> = {}): Parameters<typeof runTenantForm>[0] => ({
  formData: form({ name: "Lakeside" }),
  fieldNames: ["name"],
  kinds: ["agency"],
  build: (data) => ({ name: String(data.get("name")) }),
  schema,
  labels: { name: "Agency name" },
  perform: async () => undefined,
  revalidate: ["/supplier/team"],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  state.session.mockResolvedValue({ kind: "agency", userId: "u1", orgId: "o1", memberRole: "manager", role: "leads_agency" });
});

describe("runTenantForm", () => {
  it("runs the domain function, revalidates and says done", async () => {
    const perform = vi.fn(async () => undefined);
    expect(await runTenantForm(spec({ perform }))).toEqual({ status: "done", redirectTo: null });
    expect(perform).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), { name: "Lakeside" });
    expect(state.revalidate).toHaveBeenCalledWith("/supplier/team", "layout");
    expect(state.after).not.toHaveBeenCalled();
  });

  it("queues the mail send after the response only when asked", async () => {
    await runTenantForm(spec({ sendMail: true }));
    expect(state.after).toHaveBeenCalledTimes(1);
  });

  it("answers a session that is gone, or of the wrong kind, without calling the domain", async () => {
    const perform = vi.fn(async () => undefined);
    state.session.mockResolvedValueOnce(null);
    expect(await runTenantForm(spec({ perform }))).toMatchObject({ status: "error", message: "Your session has ended. Sign in again to continue." });
    state.session.mockResolvedValueOnce({ kind: "client", userId: "u2", orgId: "o2", memberRole: "manager", role: "leads_client" });
    expect(await runTenantForm(spec({ perform }))).toMatchObject({ status: "error" });
    expect(perform).not.toHaveBeenCalled();
  });

  it("puts a schema problem on its field and keeps what was typed", async () => {
    const result = await runTenantForm(spec({ formData: form({ name: "  " }) }));
    expect(result).toMatchObject({ status: "error", message: null, fields: { name: "Agency name is required." }, values: { name: "  " } });
  });

  it("turns a refusal into plain words, on a field when the form says so, and a fault into a neutral sentence that carries nothing private", async () => {
    const refused = await runTenantForm(spec({ perform: async () => { throw new DomainError("duplicate-name", "x"); }, messages: { "duplicate-name": "You already have that agency." }, errorFields: { "duplicate-name": "name" } }));
    expect(refused).toMatchObject({ status: "error", message: null, fields: { name: "You already have that agency." } });
    const fault = await runTenantForm(spec({ perform: async () => { throw new Error("secret@example.com is down"); } }));
    expect(fault).toMatchObject({ status: "error", message: "Something went wrong and nothing was saved. Try again." });
    expect(JSON.stringify(fault)).not.toContain("secret@example.com");
    expect(state.revalidate).not.toHaveBeenCalled();
  });
});
