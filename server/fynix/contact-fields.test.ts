import { describe, expect, it } from "vitest";
import { contactCreateBody, contactUpdateBody } from "@/server/fynix/contact-fields";
import { createCoordinatorSchema, updateOrganisationSchema } from "@/server/domain/inputs";

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";

describe("contact form bodies", () => {
  it("leave blank fields out when adding, and trim the rest", () => {
    expect(contactCreateBody(form({ contactName: "  Asha Rao ", website: " https://a.example ", notes: "   " }))).toEqual({ contactName: "Asha Rao", website: "https://a.example" });
  });

  it("send null for a blank field when editing, so it is cleared", () => {
    const body = contactUpdateBody(form({ contactEmail: "a@b.example" }));
    expect(body).toEqual({ contactName: null, contactEmail: "a@b.example", contactPhone: null, website: null, address: null, notes: null });
    expect(updateOrganisationSchema.safeParse(body).success).toBe(true);
  });

  it("keep line breaks inside an address and notes", () => {
    expect(contactCreateBody(form({ address: "1 Mill Lane\nLeeds" })).address).toBe("1 Mill Lane\nLeeds");
  });

  it("produce input the schema accepts, and one it refuses for a bad email or an http site", () => {
    expect(createCoordinatorSchema.safeParse({ name: "X", ...contactCreateBody(form({ contactEmail: "a@b.example", website: "https://b.example" })) }).success).toBe(true);
    expect(createCoordinatorSchema.safeParse({ name: "X", ...contactCreateBody(form({ contactEmail: "nope" })) }).success).toBe(false);
    expect(createCoordinatorSchema.safeParse({ name: "X", ...contactCreateBody(form({ website: "http://b.example" })) }).success).toBe(false);
  });
});
