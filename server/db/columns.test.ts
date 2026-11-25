import { describe, expect, it } from "vitest";
import { TENANT_COLUMNS, columnNames } from "@/server/db/columns";
import { TENANT_ROLES, type TenantRoleName } from "@/server/db/roles";

/** Columns a tenant role must never be able to ask for, per table. */
const FORBIDDEN: Record<"organisation" | "campaign", readonly string[]> = {
  // Migration 0080: the contact details are Fynix's alone.
  organisation: ["id", "status", "created_at", "contact_name", "contact_email", "contact_phone", "website", "address", "notes"],
  campaign: ["client_org_id", "client_org_kind", "agency_org_id", "agency_org_kind", "internal_notes", "created_at"],
};

const CLIENT_LEAD_FORBIDDEN = ["source_org_id", "submitted_by_user_id", "alias_identity_id", "over_share", "duplicate_override"];
const TENANT_MEETING_FORBIDDEN = ["recorded_by_user_id"];
/** The person who decided a lead is the client's alone: the coordinator and the agencies see the note as from "Client". */
const AGENCY_LEAD_FORBIDDEN = ["decision_by_user_id", "submitted_by_user_id"];
const CLIENT_CONVERSATION_FORBIDDEN = ["supplier_org_id", "agency_org_id"];
const AGENCY_CONVERSATION_FORBIDDEN = ["client_org_id"];
const TENANT_MESSAGE_FORBIDDEN = ["sender_org_id"];

describe.each(TENANT_ROLES)("%s column lists", (role: TenantRoleName) => {
  it.each(["organisation", "campaign"] as const)("never name a forbidden column of %s", (table) => {
    const names = columnNames(TENANT_COLUMNS[role][table]);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => FORBIDDEN[table].includes(name))).toEqual([]);
  });

  it("names no column twice", () => {
    for (const table of ["organisation", "campaign", "lead", "meeting", "conversation", "conversationMessage", "notification"] as const) {
      const names = columnNames(TENANT_COLUMNS[role][table]);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("client lead columns never expose coordinator or agency identities", () => {
    const names = columnNames(TENANT_COLUMNS.leads_client.lead);
    expect(names.filter((name) => CLIENT_LEAD_FORBIDDEN.includes(name))).toEqual([]);
  });

  it("agency lead columns never expose the person who decided", () => {
    const names = columnNames(TENANT_COLUMNS.leads_agency.lead);
    expect(names.filter((name) => AGENCY_LEAD_FORBIDDEN.includes(name))).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(["decision_note", "decision_source", "decision_at", "outcome_recorded_at"]));
  });

  it("tenant meeting columns never expose internal audit fields", () => {
    const names = columnNames(TENANT_COLUMNS[role].meeting);
    expect(names.filter((name) => TENANT_MEETING_FORBIDDEN.includes(name))).toEqual([]);
  });

  it("client conversation columns never expose coordinator or agency org ids", () => {
    const names = columnNames(TENANT_COLUMNS.leads_client.conversation);
    expect(names.filter((name) => CLIENT_CONVERSATION_FORBIDDEN.includes(name))).toEqual([]);
  });

  it("agency conversation columns never expose client org id", () => {
    const names = columnNames(TENANT_COLUMNS.leads_agency.conversation);
    expect(names.filter((name) => AGENCY_CONVERSATION_FORBIDDEN.includes(name))).toEqual([]);
  });

  it("tenant message columns never expose sender org id", () => {
    const names = columnNames(TENANT_COLUMNS[role].conversationMessage);
    expect(names.filter((name) => TENANT_MESSAGE_FORBIDDEN.includes(name))).toEqual([]);
  });
});
