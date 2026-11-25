import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/pool";
import { DomainError } from "@/server/domain/errors";
import {
  assertConversationAccess,
  forwardMessage,
  getOrCreateConversation,
  listConversationMessages,
  listConversations,
  listUserNotifications,
  markNotificationRead,
  postMessage,
  type MessagingActor,
} from "./messaging";

describe("messaging domain service", () => {
  const dummyDb = {} as unknown as Database;

  const fynixActor: MessagingActor = {
    userId: "11111111-1111-4111-8111-111111111111",
    orgId: null,
    orgKind: "fynix",
    role: "manager",
    displayName: "Fynix Admin",
  };

  const clientActor: MessagingActor = {
    userId: "22222222-2222-4222-8222-222222222222",
    orgId: "33333333-3333-4333-8333-333333333333",
    orgKind: "client",
    role: "member",
    displayName: "Client User",
  };

  const otherClientActor: MessagingActor = {
    userId: "44444444-4444-4444-8444-444444444444",
    orgId: "55555555-5555-4555-8555-555555555555",
    orgKind: "client",
    role: "member",
  };

  const coordinatorActor: MessagingActor = {
    userId: "66666666-6666-4666-8666-666666666666",
    orgId: "77777777-7777-4777-8777-777777777777",
    orgKind: "agency",
    role: "manager",
    displayName: "Coordinator User",
  };

  const partnerAgencyActor: MessagingActor = {
    userId: "88888888-8888-4888-8888-888888888888",
    orgId: "99999999-9999-4999-8999-999999999999",
    orgKind: "agency",
    role: "member",
    displayName: "Partner Agency User",
  };

  const campaignId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const clientFynixConv = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    publicRef: "MSG-0001",
    campaignId,
    leadId: null,
    side: "client_fynix",
    clientOrgId: clientActor.orgId!,
    coordinatorOrgId: null,
    agencyOrgId: null,
  };

  const coordinatorFynixConv = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    publicRef: "MSG-0002",
    campaignId,
    leadId: null,
    side: "supplier_fynix",
    clientOrgId: null,
    coordinatorOrgId: coordinatorActor.orgId!,
    agencyOrgId: null,
  };

  const coordinatorAgencyConv = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    publicRef: "MSG-0003",
    campaignId,
    leadId: null,
    side: "supplier_agency",
    clientOrgId: null,
    coordinatorOrgId: coordinatorActor.orgId!,
    agencyOrgId: partnerAgencyActor.orgId!,
  };

  describe("assertConversationAccess", () => {
    it("allows Fynix to access client_fynix and supplier_fynix conversations", () => {
      expect(() => assertConversationAccess(fynixActor, clientFynixConv)).not.toThrow();
      expect(() => assertConversationAccess(fynixActor, coordinatorFynixConv)).not.toThrow();
    });

    it("strictly blocks Fynix from accessing supplier_agency conversations (spec D5)", () => {
      expect(() => assertConversationAccess(fynixActor, coordinatorAgencyConv)).toThrow(DomainError);
      expect(() => assertConversationAccess(fynixActor, coordinatorAgencyConv)).toThrow("Fynix cannot access coordinator-agency conversations.");
    });

    it("allows Client to access its own client_fynix conversations", () => {
      expect(() => assertConversationAccess(clientActor, clientFynixConv)).not.toThrow();
    });

    it("refuses Client from accessing other client organisations' conversations", () => {
      expect(() => assertConversationAccess(otherClientActor, clientFynixConv)).toThrow(DomainError);
    });

    it("refuses Client from accessing supplier_fynix or supplier_agency conversations", () => {
      expect(() => assertConversationAccess(clientActor, coordinatorFynixConv)).toThrow(DomainError);
      expect(() => assertConversationAccess(clientActor, coordinatorAgencyConv)).toThrow(DomainError);
    });

    it("allows Coordinator to access its own supplier_fynix and supplier_agency conversations", () => {
      expect(() => assertConversationAccess(coordinatorActor, coordinatorFynixConv)).not.toThrow();
      expect(() => assertConversationAccess(coordinatorActor, coordinatorAgencyConv)).not.toThrow();
    });

    it("refuses Coordinator from accessing client_fynix conversations", () => {
      expect(() => assertConversationAccess(coordinatorActor, clientFynixConv)).toThrow(DomainError);
    });

    it("allows Partner Agency to access supplier_agency conversations it participates in", () => {
      expect(() => assertConversationAccess(partnerAgencyActor, coordinatorAgencyConv)).not.toThrow();
    });

    it("refuses Partner Agency from accessing client_fynix or supplier_fynix conversations", () => {
      expect(() => assertConversationAccess(partnerAgencyActor, clientFynixConv)).toThrow(DomainError);
      expect(() => assertConversationAccess(partnerAgencyActor, coordinatorFynixConv)).toThrow(DomainError);
    });
  });

  describe("getOrCreateConversation input validation & authorization", () => {
    it("refuses Fynix from creating a supplier_agency conversation", async () => {
      await expect(
        getOrCreateConversation(dummyDb, fynixActor, {
          campaignId,
          side: "supplier_agency",
          coordinatorOrgId: coordinatorActor.orgId,
          agencyOrgId: partnerAgencyActor.orgId,
        }),
      ).rejects.toThrow("Fynix cannot access coordinator-agency conversations.");
    });

    it("refuses Client from creating conversations on the coordinator or agency side", async () => {
      await expect(
        getOrCreateConversation(dummyDb, clientActor, {
          campaignId,
          side: "supplier_fynix",
        }),
      ).rejects.toThrow("Client can only create client-fynix conversations.");
    });

    it("refuses Client from creating conversations for a different client organisation", async () => {
      await expect(
        getOrCreateConversation(dummyDb, clientActor, {
          campaignId,
          side: "client_fynix",
          clientOrgId: otherClientActor.orgId,
        }),
      ).rejects.toThrow("Client cannot create conversations for another organisation.");
    });

    it("refuses Agency from creating client_fynix conversations", async () => {
      await expect(
        getOrCreateConversation(dummyDb, partnerAgencyActor, {
          campaignId,
          side: "client_fynix",
          clientOrgId: clientActor.orgId,
        }),
      ).rejects.toThrow("Agencies cannot access client-fynix conversations.");
    });

    it("throws invalid-input on malformed campaign ID", async () => {
      await expect(
        getOrCreateConversation(dummyDb, clientActor, {
          campaignId: "not-a-uuid",
          side: "client_fynix",
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("postMessage input validation & execution", () => {
    it("rejects empty message body", async () => {
      await expect(
        postMessage(dummyDb, clientActor, {
          conversationId: clientFynixConv.id,
          body: "   ",
        }),
      ).rejects.toThrow(DomainError);
    });

    it("rejects invalid conversation ID", async () => {
      await expect(
        postMessage(dummyDb, clientActor, {
          conversationId: "invalid-uuid",
          body: "Hello",
        }),
      ).rejects.toThrow(DomainError);
    });

    it("inserts message and updates conversation timestamp in transaction", async () => {
      const fixedNow = new Date("2026-12-15T10:00:00Z");
      const insertedMessages: unknown[] = [];
      const updatedConvs: unknown[] = [];
      const notifications: unknown[] = [];

      const mockTx = {
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [clientFynixConv],
            }),
          }),
        }),
        insert: () => ({
          values: (val: Record<string, unknown>) => {
            if ("senderRole" in val) {
              insertedMessages.push(val);
              return {
                returning: () => [{ id: "12345678-1234-4234-8234-1234567890aa", ...val }],
              };
            }
            notifications.push(val);
            return Promise.resolve();
          },
        }),
        update: () => ({
          set: (val: unknown) => {
            updatedConvs.push(val);
            return {
              where: () => Promise.resolve(),
            };
          },
        }),
      };

      const mockDb = {
        transaction: async (fn: (tx: unknown) => unknown) => fn(mockTx),
        execute: async () => ({ rows: [] }),
      } as unknown as Database;

      const result = await postMessage(
        mockDb,
        clientActor,
        {
          conversationId: clientFynixConv.id,
          body: "Can we clarify the meeting time?",
        },
        { now: () => fixedNow },
      );

      expect(result).toBeDefined();
      expect(insertedMessages).toHaveLength(1);
      expect(insertedMessages[0]).toMatchObject({
        conversationId: clientFynixConv.id,
        senderUserId: clientActor.userId,
        senderRole: "client",
        body: "Can we clarify the meeting time?",
        forwardOfMessageId: null,
        scrubbedCount: 0,
      });
      expect(updatedConvs).toEqual([{ updatedAt: fixedNow }]);
    });
  });

  describe("forwardMessage across hops with automatic scrubbing", () => {
    it("scrubs contact details when forwarding across client vs coordinator/agency boundary", async () => {
      const fixedNow = new Date("2026-12-15T11:00:00Z");
      const originalMessage = {
        id: "12345678-1234-4234-8234-1234567890aa",
        conversationId: clientFynixConv.id,
        senderUserId: clientActor.userId,
        senderRole: "client",
        senderName: "Client User",
        body: "Please contact the prospect at alex@example.com or call +44 7911 123456.",
        createdAt: new Date("2026-12-15T09:00:00Z"),
      };

      const insertedMessages: unknown[] = [];
      let callCount = 0;

      const mockTx = {
        execute: async () => ({ rows: [] }),
        select: (cols: unknown) => ({
          from: () => ({
            where: () => ({
              limit: () => {
                if (typeof cols === "object" && cols !== null && "senderRole" in cols) {
                  return [originalMessage];
                }
                callCount += 1;
                // Call 1: source conversation lookup -> clientFynixConv
                if (callCount === 1) return [clientFynixConv];
                // Call 2: target conversation lookup -> coordinatorFynixConv
                return [coordinatorFynixConv];
              },
            }),
          }),
        }),
        insert: () => ({
          values: (val: Record<string, unknown>) => {
            if ("senderRole" in val) {
              insertedMessages.push(val);
              return {
                returning: () => [{ id: "12345678-1234-4234-8234-1234567890bb", ...val }],
              };
            }
            return Promise.resolve();
          },
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
      };

      const mockDb = {
        transaction: async (fn: (tx: unknown) => unknown) => fn(mockTx),
        execute: async () => ({ rows: [] }),
      } as unknown as Database;

      const forwarded = await forwardMessage(
        mockDb,
        fynixActor,
        {
          messageId: originalMessage.id,
          targetConversationId: coordinatorFynixConv.id,
        },
        { now: () => fixedNow },
      );

      expect(forwarded).toBeDefined();
      expect(insertedMessages).toHaveLength(1);
      const inserted = insertedMessages[0] as Record<string, unknown>;

      // Verify scrubbed contact details
      expect(inserted.forwardOfMessageId).toBe(originalMessage.id);
      expect(inserted.scrubbedCount).toBe(2); // email + phone
      expect(inserted.body).not.toContain("alex@example.com");
      expect(inserted.body).not.toContain("+44 7911 123456");
      expect(inserted.body).toContain("[removed]");
    });

    it("preserves body without scrubbing when forwarding within the same side boundary", async () => {
      const fixedNow = new Date("2026-12-15T12:00:00Z");
      const originalMessage = {
        id: "12345678-1234-4234-8234-1234567890cc",
        conversationId: coordinatorFynixConv.id,
        senderUserId: coordinatorActor.userId,
        senderRole: "supplier",
        senderName: "Coordinator User",
        body: "Internal note: contact is internal@coordinator.com",
        createdAt: new Date("2026-12-15T09:00:00Z"),
      };

      const insertedMessages: unknown[] = [];
      let callCount = 0;

      const mockTx = {
        execute: async () => ({ rows: [] }),
        select: (cols: unknown) => ({
          from: () => ({
            where: () => ({
              limit: () => {
                if (typeof cols === "object" && cols !== null && "senderRole" in cols) {
                  return [originalMessage];
                }
                callCount += 1;
                // Both source and target are coordinator/agency side (supplier_fynix -> supplier_agency)
                if (callCount === 1) return [coordinatorFynixConv];
                return [coordinatorAgencyConv];
              },
            }),
          }),
        }),
        insert: () => ({
          values: (val: Record<string, unknown>) => {
            if ("senderRole" in val) {
              insertedMessages.push(val);
              return {
                returning: () => [{ id: "12345678-1234-4234-8234-1234567890dd", ...val }],
              };
            }
            return Promise.resolve();
          },
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
      };

      const mockDb = {
        transaction: async (fn: (tx: unknown) => unknown) => fn(mockTx),
        execute: async () => ({ rows: [] }),
      } as unknown as Database;

      await forwardMessage(
        mockDb,
        coordinatorActor,
        {
          messageId: originalMessage.id,
          targetConversationId: coordinatorAgencyConv.id,
        },
        { now: () => fixedNow },
      );

      expect(insertedMessages).toHaveLength(1);
      const inserted = insertedMessages[0] as Record<string, unknown>;
      expect(inserted.scrubbedCount).toBe(0);
      expect(inserted.body).toBe(originalMessage.body);
    });

    it("rejects forwarding when original message is not found", async () => {
      const mockTx = {
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [],
            }),
          }),
        }),
      };
      const mockDb = {
        transaction: async (fn: (tx: unknown) => unknown) => fn(mockTx),
        execute: async () => ({ rows: [] }),
      } as unknown as Database;

      await expect(
        forwardMessage(mockDb, fynixActor, {
          messageId: "11111111-1111-4111-8111-111111111111",
          targetConversationId: "22222222-2222-4222-8222-222222222222",
        }),
      ).rejects.toThrow("There is no such message to forward.");
    });
  });

  describe("markNotificationRead", () => {
    it("validates notification ID format", async () => {
      await expect(
        markNotificationRead(dummyDb, clientActor, "not-a-valid-uuid"),
      ).rejects.toThrow(DomainError);
    });

    it("updates readAt when notification belongs to actor", async () => {
      const fixedNow = new Date("2026-12-15T15:00:00Z");
      const notifId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
      const existingNotif = {
        id: notifId,
        userId: clientActor.userId,
        readAt: null,
      };

      let updatedData: unknown = null;

      const mockTx = {
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [existingNotif],
            }),
          }),
        }),
        update: () => ({
          set: (val: unknown) => {
            updatedData = val;
            return {
              where: () => ({
                returning: () => [{ ...existingNotif, ...val as object }],
              }),
            };
          },
        }),
      };

      const mockDb = {
        transaction: async (fn: (tx: unknown) => unknown) => fn(mockTx),
        execute: async () => ({ rows: [] }),
      } as unknown as Database;

      const result = await markNotificationRead(mockDb, clientActor, notifId, { now: () => fixedNow });
      expect(result).toBeDefined();
      expect(updatedData).toEqual({ readAt: fixedNow });
    });

    it("throws not-found when notification belongs to another user or does not exist", async () => {
      const mockTx = {
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [],
            }),
          }),
        }),
      };

      const mockDb = {
        transaction: async (fn: (tx: unknown) => unknown) => fn(mockTx),
        execute: async () => ({ rows: [] }),
      } as unknown as Database;

      await expect(
        markNotificationRead(mockDb, clientActor, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
      ).rejects.toThrow("There is no such notification.");
    });
  });

  describe("listConversations, listConversationMessages, listUserNotifications", () => {
    it("listConversations queries with role-based side filters", async () => {
      const mockTx = {
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => [clientFynixConv],
            }),
          }),
        }),
      };

      const mockDb = {
        transaction: async (fn: (tx: unknown) => unknown) => fn(mockTx),
        execute: async () => ({ rows: [] }),
      } as unknown as Database;

      const convs = await listConversations(mockDb, clientActor);
      expect(convs).toHaveLength(1);
    });

    it("listConversationMessages asserts conversation access before querying messages", async () => {
      const mockTx = {
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [coordinatorAgencyConv], // conversation Fynix cannot access
            }),
          }),
        }),
      };

      const mockDb = {
        transaction: async (fn: (tx: unknown) => unknown) => fn(mockTx),
        execute: async () => ({ rows: [] }),
      } as unknown as Database;

      await expect(
        listConversationMessages(mockDb, fynixActor, coordinatorAgencyConv.id),
      ).rejects.toThrow("Fynix cannot access coordinator-agency conversations.");
    });

    it("listUserNotifications returns user notifications", async () => {
      const sampleNotif = {
        id: "11111111-2222-4333-8444-555555555555",
        userId: clientActor.userId,
        orgId: clientActor.orgId,
        kind: "message_received",
        title: "Test notification",
        body: "Message preview",
        link: "/client/messages/MSG-0001",
        readAt: null,
        createdAt: new Date(),
      };

      const mockTx = {
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => [sampleNotif],
            }),
          }),
        }),
      };

      const mockDb = {
        transaction: async (fn: (tx: unknown) => unknown) => fn(mockTx),
        execute: async () => ({ rows: [] }),
      } as unknown as Database;

      const notifs = await listUserNotifications(mockDb, clientActor);
      expect(notifs).toHaveLength(1);
      expect(notifs[0]?.title).toBe("Test notification");
    });
  });
});
