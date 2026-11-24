import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/server/db/pool";
import { campaign, campaignShare, lead } from "@/server/db/schema";
import { DomainError } from "@/server/domain/errors";
import {
  getAgencyOverviewMetrics,
  getClientOverviewMetrics,
  getFynixOverviewMetrics,
  getSupplierOverviewMetrics,
} from "./analytics";

vi.mock("@/server/db/scope", () => ({
  withTenantScope: vi.fn((_db, _scope, work) => work(currentMockTx)),
}));

vi.mock("@/server/domain/fynix-write", () => ({
  fynixRead: vi.fn((_db, _actor, work) => work(currentMockTx)),
}));

let currentMockTx: Record<string, unknown> | null = null;

function setMockData(data: {
  campaigns?: readonly Record<string, unknown>[];
  leads?: readonly Record<string, unknown>[];
  shares?: readonly Record<string, unknown>[];
  /** What public.app_my_partner_agencies() returns: the supplier's partner agencies by id and name. */
  partners?: readonly { readonly id: string; readonly name: string }[];
}) {
  currentMockTx = {
    execute: vi.fn(() => Promise.resolve({ rows: data.partners ?? [] })),
    select: vi.fn(() => ({
      from: vi.fn((table) => {
        if (table === campaign) {
          return Promise.resolve(data.campaigns ?? []);
        }
        if (table === lead) {
          return Promise.resolve(data.leads ?? []);
        }
        if (table === campaignShare) {
          return Promise.resolve(data.shares ?? []);
        }
        return Promise.resolve([]);
      }),
    })),
  };
}

describe("analytics domain service", () => {
  const dummyDb = {} as unknown as Database;

  const clientActor = {
    userId: "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
    orgKind: "client" as const,
    role: "manager" as const,
  };

  const supplierActor = {
    userId: "33333333-3333-4333-8333-333333333333",
    orgId: "44444444-4444-4444-8444-444444444444",
    orgKind: "agency" as const,
    role: "manager" as const,
  };

  const agencyActor = {
    userId: "55555555-5555-4555-8555-555555555555",
    orgId: "66666666-6666-4666-8666-666666666666",
    orgKind: "agency" as const,
    role: "member" as const,
  };

  const fynixActor = {
    userId: "77777777-7777-4777-8777-777777777777",
  };

  describe("getClientOverviewMetrics", () => {
    it("refuses non-client actors", async () => {
      await expect(getClientOverviewMetrics(dummyDb, supplierActor)).rejects.toThrow(DomainError);
    });

    it("calculates client KPI counts correctly", async () => {
      setMockData({
        campaigns: [
          { id: "c1", monthlyTarget: 20, totalTarget: 60, status: "active" },
          { id: "c2", monthlyTarget: 15, totalTarget: 45, status: "active" },
        ],
        leads: [
          { id: "l1", stage: "delivered" },
          { id: "l2", stage: "delivered" },
          { id: "l3", stage: "awaiting_client" },
          { id: "l4", stage: "scheduled" },
          { id: "l5", stage: "disputed" },
          { id: "l6", stage: "rejected" },
        ],
      });

      const metrics = await getClientOverviewMetrics(dummyDb, clientActor);
      expect(metrics.targetCount).toBe(35);
      expect(metrics.deliveredCount).toBe(2);
      expect(metrics.awaitingClientCount).toBe(1);
      expect(metrics.scheduledCount).toBe(1);
      expect(metrics.disputedCount).toBe(1);
    });
  });

  describe("getSupplierOverviewMetrics", () => {
    it("refuses client actors", async () => {
      await expect(getSupplierOverviewMetrics(dummyDb, clientActor)).rejects.toThrow(DomainError);
    });

    it("calculates coordinator KPI metrics and partner agency breakdown", async () => {
      setMockData({
        campaigns: [
          { id: "c1", monthlyTarget: 40, totalTarget: 120, status: "active" },
        ],
        shares: [
          { id: "s1", campaignId: "c1", agencyOrgId: supplierActor.orgId, monthlyShare: 25 },
          { id: "s2", campaignId: "c1", agencyOrgId: agencyActor.orgId, monthlyShare: 15 },
        ],
        leads: [
          { id: "l1", sourceOrgId: supplierActor.orgId, stage: "delivered", overShare: false },
          { id: "l2", sourceOrgId: agencyActor.orgId, stage: "delivered", overShare: false },
          { id: "l3", sourceOrgId: agencyActor.orgId, stage: "awaiting_client", overShare: true },
          { id: "l4", sourceOrgId: agencyActor.orgId, stage: "disputed", overShare: false },
        ],
        partners: [{ id: agencyActor.orgId, name: "Ridgeway Partner Media Ltd" }],
      });

      const metrics = await getSupplierOverviewMetrics(dummyDb, supplierActor);
      expect(metrics.supplierTarget).toBe(40);
      expect(metrics.deliveredCount).toBe(2);
      expect(metrics.awaitingClientCount).toBe(1);
      expect(metrics.overShareCount).toBe(1);
      expect(metrics.disputedCount).toBe(1);
      expect(metrics.agencyBreakdown).toHaveLength(2);

      const supplierBreakdown = metrics.agencyBreakdown.find((b) => b.agencyOrgId === supplierActor.orgId);
      expect(supplierBreakdown?.shareTarget).toBe(25);
      expect(supplierBreakdown?.deliveredCount).toBe(1);
      expect(supplierBreakdown?.agencyName).toBe("Direct Coordinator");

      const partnerBreakdown = metrics.agencyBreakdown.find((b) => b.agencyOrgId === agencyActor.orgId);
      expect(partnerBreakdown?.agencyName).toBe("Ridgeway Partner Media Ltd");
      expect(partnerBreakdown?.shareTarget).toBe(15);
      expect(partnerBreakdown?.deliveredCount).toBe(1);
      expect(partnerBreakdown?.awaitingClientCount).toBe(1);
      expect(partnerBreakdown?.overShareCount).toBe(1);
      expect(partnerBreakdown?.disputedCount).toBe(1);
    });
  });

  describe("getAgencyOverviewMetrics", () => {
    it("refuses client actors", async () => {
      await expect(getAgencyOverviewMetrics(dummyDb, clientActor)).rejects.toThrow(DomainError);
    });

    it("calculates agency KPI metrics isolated to actor sourceOrgId", async () => {
      setMockData({
        shares: [
          { id: "s1", agencyOrgId: agencyActor.orgId, monthlyShare: 15 },
        ],
        leads: [
          { id: "l1", sourceOrgId: agencyActor.orgId, stage: "delivered", overShare: false },
          { id: "l2", sourceOrgId: agencyActor.orgId, stage: "awaiting_client", overShare: true },
          { id: "l3", sourceOrgId: agencyActor.orgId, stage: "disputed", overShare: false },
          // Lead from another agency should be ignored
          { id: "l4", sourceOrgId: "other-org-id", stage: "delivered", overShare: false },
        ],
      });

      const metrics = await getAgencyOverviewMetrics(dummyDb, agencyActor);
      expect(metrics.agencyShareTarget).toBe(15);
      expect(metrics.deliveredCount).toBe(1);
      expect(metrics.awaitingClientCount).toBe(1);
      expect(metrics.overShareCount).toBe(1);
      expect(metrics.disputedCount).toBe(1);
    });
  });

  describe("getFynixOverviewMetrics", () => {
    it("calculates global KPIs across all campaigns and leads", async () => {
      setMockData({
        campaigns: [
          { id: "c1", monthlyTarget: 20, totalTarget: 60, status: "active" },
          { id: "c2", monthlyTarget: 30, totalTarget: 90, status: "paused" },
        ],
        leads: [
          { id: "l1", stage: "delivered", overShare: false },
          { id: "l2", stage: "awaiting_client", overShare: true },
          { id: "l3", stage: "scheduled", overShare: false },
          { id: "l4", stage: "disputed", overShare: false },
          { id: "l5", stage: "rejected", overShare: false },
        ],
      });

      const metrics = await getFynixOverviewMetrics(dummyDb, fynixActor);
      expect(metrics.totalCampaignsCount).toBe(2);
      expect(metrics.activeCampaignsCount).toBe(1);
      expect(metrics.totalTargetCount).toBe(50);
      expect(metrics.deliveredCount).toBe(1);
      expect(metrics.awaitingClientCount).toBe(1);
      expect(metrics.scheduledCount).toBe(1);
      expect(metrics.disputedCount).toBe(1);
      expect(metrics.overShareCount).toBe(1);
      expect(metrics.totalLeadsCount).toBe(5);
    });
  });
});
