import { describe, expect, it } from "vitest";
import type { OrganisationContact } from "@/server/domain/organisations";
import { contactVisibility, SHOW_ALL } from "./contact-visibility";

const none: OrganisationContact = { contactName: null, contactEmail: null, contactPhone: null, website: null, address: null, notes: null };

describe("which contact boxes a record shows", () => {
  it("shows everything when no kind is given", () => {
    expect(contactVisibility(none, undefined)).toEqual(SHOW_ALL);
  });

  it("asks a client for its website only, since its people are the contact people", () => {
    expect(contactVisibility(none, "client")).toEqual({ name: false, email: false, phone: false, website: true, address: false });
  });

  it("asks a coordinator or an agency, who is one person, for an email and a phone", () => {
    expect(contactVisibility(none, "person")).toEqual({ name: false, email: true, phone: true, website: false, address: false });
  });

  it("keeps showing a detail that was stored, so an edit never hides or clears it", () => {
    const stored = { ...none, contactName: "Asha Rao", website: "https://x.example", address: "1 Mill Lane", contactEmail: "a@x.example", contactPhone: "+44 20 7946 0958" };
    expect(contactVisibility(stored, "person")).toEqual({ name: true, email: true, phone: true, website: true, address: true });
    expect(contactVisibility(stored, "client")).toEqual({ name: true, email: true, phone: true, website: true, address: true });
  });
});
