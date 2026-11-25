import { and, eq, inArray, sql } from "drizzle-orm";
import { createDatabase } from "@/server/db/pool";
import {
  agreement,
  agreementAcceptance,
  aliasIdentity,
  auditLog,
  campaign,
  campaignHost,
  campaignShare,
  conversation,
  conversationMessage,
  hostHours,
  lead,
  leadHistory,
  meeting,
  member,
  organisation,
  user,
} from "@/server/db/schema";
import { getEnv, getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Development only. Fills the dev database with sample leads, meetings, conversations, an agreement, a host and an alias, so
// every screen of the client, supplier and agency portals shows rows. It writes as the owner role, so it never goes through
// the app's own checks: do not point it at anything but the dev database.
//
// It needs the three dev accounts and organisations that `pnpm admin:create` and the dev sign-in setup leave behind:
// dev-client, dev-supplier and dev-agency (see the README). It refuses a database that already holds a lead.

const CLIENT_REF = "ORG-8H3D";
const SUPPLIER_REF = "ORG-2B6R";
const AGENCY_REF = "ORG-DV01";
const DAY = 86_400_000;

function firstRow<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Seeding ${what} found nothing. Run the dev account setup first.`);
  return row;
}

/** At a given hour of the local day `offsetDays` from now, in UTC. Good enough for sample data. */
function at(offsetDays: number, hour: number): Date {
  const date = new Date(Date.now() + offsetDays * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

interface SampleLead {
  readonly ref: string;
  readonly meetingRef: string | null;
  readonly campaign: 0 | 1;
  readonly name: string;
  readonly title: string;
  readonly company: string;
  readonly domain: string;
  readonly stage: string;
  readonly meetingOffsetDays: number | null;
  readonly outcome?: string;
  readonly submittedDaysAgo: number;
  readonly declineReason?: string;
  readonly disputeReason?: string;
}

const LEADS: readonly SampleLead[] = [
  { ref: "LD-3K7M", meetingRef: null, campaign: 0, name: "Marta Lindqvist", title: "Head of Logistics", company: "Nordvik Cold Chain", domain: "nordvikcold.example", stage: "awaiting_client", meetingOffsetDays: null, submittedDaysAgo: 1 },
  { ref: "LD-5P2R", meetingRef: null, campaign: 1, name: "Owen Pritchard", title: "Procurement Director", company: "Dalefield Foods", domain: "dalefield.example", stage: "awaiting_client", meetingOffsetDays: null, submittedDaysAgo: 2 },
  { ref: "LD-8T4V", meetingRef: "MTG-2C5H", campaign: 0, name: "Ingrid Sørensen", title: "VP Supply Chain", company: "Fjordline Distribution", domain: "fjordline.example", stage: "scheduled", meetingOffsetDays: 3, submittedDaysAgo: 5 },
  { ref: "LD-9W6X", meetingRef: "MTG-4D7J", campaign: 1, name: "Callum Reid", title: "Operations Manager", company: "Tarnbrook Grocers", domain: "tarnbrook.example", stage: "scheduled", meetingOffsetDays: 6, submittedDaysAgo: 6 },
  { ref: "LD-2A8Z", meetingRef: "MTG-6F9K", campaign: 0, name: "Hanneke de Vries", title: "Supply Planning Lead", company: "Zeeland Frozen Goods", domain: "zeeland-frozen.example", stage: "outcome_due", meetingOffsetDays: -1, submittedDaysAgo: 9 },
  { ref: "LD-4B9C", meetingRef: "MTG-8G2M", campaign: 1, name: "Priya Raman", title: "Director of Distribution", company: "Greenfield Markets", domain: "greenfield-markets.example", stage: "delivered", meetingOffsetDays: -5, outcome: "held", submittedDaysAgo: 14 },
  { ref: "LD-6D1E", meetingRef: "MTG-3H4N", campaign: 0, name: "Tomasz Wrona", title: "Head of Procurement", company: "Baltic Cold Storage", domain: "baltic-cold.example", stage: "delivered", meetingOffsetDays: -9, outcome: "held", submittedDaysAgo: 18 },
  { ref: "LD-7F3G", meetingRef: null, campaign: 1, name: "Siobhan Keane", title: "Category Manager", company: "Harrowgate Retail", domain: "harrowgate.example", stage: "declined", meetingOffsetDays: null, submittedDaysAgo: 8, declineReason: "Budget does not meet the agreed range for this campaign." },
  { ref: "LD-1H5J", meetingRef: "MTG-5J6P", campaign: 0, name: "Lars Eriksen", title: "COO", company: "Kattegat Freight", domain: "kattegat.example", stage: "disputed", meetingOffsetDays: -3, outcome: "held", submittedDaysAgo: 12, disputeReason: "The prospect said they had no budget this year, which does not meet the agreed BANT criteria." },
];

runScript(async () => {
  loadEnvLocal();
  const owner = createDatabase(getToolingEnv().DATABASE_URL_OWNER, { max: 1 });
  const fynix = createDatabase(getEnv().DATABASE_URL_FYNIX, { max: 1 });
  try {
    const db = owner.db;
    const existing = await db.select({ id: lead.id }).from(lead).limit(1);
    if (existing.length > 0) throw new Error("The dev database already holds leads, so nothing was seeded.");

    const orgs = await db.select({ id: organisation.id, ref: organisation.publicRef }).from(organisation).where(inArray(organisation.publicRef, [CLIENT_REF, SUPPLIER_REF, AGENCY_REF]));
    const orgId = (ref: string): string => firstRow(orgs.filter((row) => row.ref === ref), `organisation ${ref}`).id;
    const clientOrg = orgId(CLIENT_REF);
    const supplierOrg = orgId(SUPPLIER_REF);
    const agencyOrg = orgId(AGENCY_REF);

    const people = await db
      .select({ userId: user.id, email: user.email, memberId: member.id })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(inArray(user.email, ["dev-client@fynix-leads.test", "dev-supplier@fynix-leads.test", "dev-agency@fynix-leads.test", "dev-admin@fynix-leads.test"]));
    const person = (email: string) => firstRow(people.filter((row) => row.email === email), `user ${email}`);
    const clientUser = person("dev-client@fynix-leads.test");
    const supplierUser = person("dev-supplier@fynix-leads.test");
    const agencyUser = person("dev-agency@fynix-leads.test");
    const adminUser = person("dev-admin@fynix-leads.test");

    const campaigns = await db.select({ id: campaign.id, ref: campaign.publicRef, name: campaign.name }).from(campaign).where(and(eq(campaign.clientOrgId, clientOrg), eq(campaign.agencyOrgId, supplierOrg))).orderBy(campaign.publicRef);
    const first = firstRow(campaigns, "a campaign of the dev client served by the dev supplier");
    const second = campaigns[1] ?? first;
    const sampleCampaigns = [first, second] as const;

    // The people and rules the leads depend on.
    for (const row of sampleCampaigns) {
      await db.insert(campaignShare).values({ campaignId: row.id, agencyOrgId: agencyOrg, monthlyShare: 8 }).onConflictDoNothing();
      await db.insert(campaignHost).values({ campaignId: row.id, clientOrgId: clientOrg, memberId: clientUser.memberId, jobTitle: "Chief Operating Officer" }).onConflictDoNothing();
    }
    const hasHours = (await db.select({ id: hostHours.id }).from(hostHours).where(eq(hostHours.memberId, clientUser.memberId)).limit(1)).length > 0;
    for (const weekday of hasHours ? [] : [1, 2, 3, 4, 5]) {
      await db.insert(hostHours).values({ memberId: clientUser.memberId, timeZone: "Europe/London", weekday, startMinute: 540, endMinute: 1020 }).onConflictDoNothing();
    }
    for (const row of sampleCampaigns) {
      await db
        .insert(agreement)
        .values({ campaignId: row.id, party: "client", version: 1, monthlyTarget: 20, totalTarget: 120, rules: "A no-show counts after ten minutes. A client who cancels less than 24 hours before is counted as a no-show.", notes: "Reviewed every quarter.", createdBy: adminUser.memberId })
        .onConflictDoNothing();
      const clientAgreement = firstRow(await db.select({ id: agreement.id }).from(agreement).where(and(eq(agreement.campaignId, row.id), eq(agreement.party, "client"), eq(agreement.version, 1))), "client agreement");
      await db.insert(agreementAcceptance).values({ agreementId: clientAgreement.id, userId: clientUser.userId, networkAddress: "203.0.113.10" }).onConflictDoNothing();
    }

    await db
      .insert(aliasIdentity)
      .values({ publicRef: "ALI-7M2K", memberId: agencyUser.memberId, clientOrgId: clientOrg, displayName: "Lena Hartmann", jobTitle: "Business Development Manager", aliasEmail: "lena.hartmann@halden-outreach.example", verifiedAt: new Date(), status: "active" })
      .onConflictDoNothing();
    const alias = firstRow(await db.select({ id: aliasIdentity.id }).from(aliasIdentity).where(eq(aliasIdentity.publicRef, "ALI-7M2K")), "alias identity");

    // Leads, history, meetings and conversations are written as the Fynix role, as the app does: the tables force row-level
    // security, so even the owner cannot write them, and every Fynix change needs an audit row in its transaction.
    await fynix.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.org_id', '', true), set_config('app.user_id', ${adminUser.userId}, true)`);
      await tx.insert(auditLog).values({ actorUserId: adminUser.userId, action: "demo.seed", subjectTable: "lead", subjectId: adminUser.userId, subjectRef: "DEMO", before: null, after: { note: "sample data for the dev database" } });
      const db = tx;
      // Leads, their history, and the meetings that follow from them.
    const leadIds = new Map<string, string>();
    for (const sample of LEADS) {
      const target = sampleCampaigns[sample.campaign];
      const submittedAt = new Date(Date.now() - sample.submittedDaysAgo * DAY);
      const slot = (days: number, hour: number): string => at(days, hour).toISOString();
      const proposedTimes = sample.stage === "awaiting_client" ? [slot(4, 10), slot(5, 14), slot(7, 11)] : [];
      const meetingTime = sample.meetingOffsetDays === null ? null : at(sample.meetingOffsetDays, 10 + (sample.ref.charCodeAt(3) % 5));
      const created = firstRow(
        await db
          .insert(lead)
          .values({
            publicRef: sample.ref,
            campaignId: target.id,
            sourceOrgId: agencyOrg,
            submittedByUserId: agencyUser.userId,
            aliasIdentityId: alias.id,
            hostMemberId: clientUser.memberId,
            prospectName: sample.name,
            prospectTitle: sample.title,
            prospectCompany: sample.company,
            prospectDomain: sample.domain,
            prospectLinkedinUrl: `https://www.linkedin.com/in/${sample.name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
            prospectEmail: `${sample.name.split(" ")[0]?.toLowerCase() ?? "contact"}@${sample.domain}`.replace(/[^a-z0-9@.-]/g, ""),
            prospectPhone: "+44 20 7946 0958",
            prospectNotes: "Replied to the second outreach and asked for a short call.",
            bantBudget: "Confirmed for this financial year",
            bantAuthority: "Signs off supply contracts above 50k",
            bantNeed: "Replacing a manual ordering process",
            bantTimeline: "Decision within one quarter",
            stage: sample.stage,
            declineReason: sample.declineReason ?? null,
            disputeReason: sample.disputeReason ?? null,
            proposedTimes,
            scheduledMeetingTime: meetingTime,
            scheduledAt: meetingTime === null ? null : submittedAt,
            deliveredAt: sample.stage === "delivered" && meetingTime !== null ? meetingTime : null,
            disputedAt: sample.stage === "disputed" && meetingTime !== null ? at(sample.meetingOffsetDays ?? 0, 18) : null,
            submittedAt,
          })
          .returning({ id: lead.id }),
        `lead ${sample.ref}`,
      );
      leadIds.set(sample.ref, created.id);
      await db.insert(leadHistory).values({ leadId: created.id, actorUserId: agencyUser.userId, actorRole: "agency", action: "lead.submitted", fromStage: null, toStage: "awaiting_client", note: null, createdAt: submittedAt });
      if (sample.stage !== "awaiting_client") {
        await db.insert(leadHistory).values({ leadId: created.id, actorUserId: clientUser.userId, actorRole: "client", action: sample.stage === "declined" ? "lead.declined" : "lead.accepted", fromStage: "awaiting_client", toStage: sample.stage === "declined" ? "declined" : "scheduled", note: sample.declineReason ?? null, createdAt: new Date(submittedAt.getTime() + DAY / 2) });
      }
      if (sample.meetingRef !== null && meetingTime !== null) {
        await db.insert(meeting).values({
          publicRef: sample.meetingRef,
          leadId: created.id,
          campaignId: target.id,
          hostMemberId: clientUser.memberId,
          scheduledStartTime: meetingTime,
          durationMinutes: 30,
          googleMeetUrl: null,
          outcome: sample.outcome ?? "scheduled",
          heldAt: sample.outcome === "held" ? meetingTime : null,
          recordedAt: sample.outcome === undefined ? null : meetingTime,
          recordedByUserId: sample.outcome === undefined ? null : agencyUser.userId,
        });
      }
    }

    // Conversations: client with Fynix, supplier with Fynix, supplier with its agency.
    const threads = [
      { ref: "MSG-2K4P", side: "client_fynix", clientOrgId: clientOrg, supplierOrgId: null, agencyOrgId: null, subject: "Meeting times for the Nordic campaign", lead: "LD-8T4V", sender: clientUser, role: "client", name: "Dev Client", body: "Could we move the Fjordline call to the afternoon? The morning clashes with a board review." },
      { ref: "MSG-5R7T", side: "supplier_fynix", clientOrgId: null, supplierOrgId: supplierOrg, agencyOrgId: null, subject: "Monthly target for frozen food", lead: null, sender: supplierUser, role: "supplier", name: "Dev Supplier", body: "We have four qualified prospects ready for next week. Is the share allocation confirmed?" },
    ] as const;
    for (const thread of threads) {
      const target = sampleCampaigns[0];
      const created = firstRow(
        await db
          .insert(conversation)
          .values({ publicRef: thread.ref, campaignId: target.id, leadId: thread.lead === null ? null : (leadIds.get(thread.lead) ?? null), side: thread.side, clientOrgId: thread.clientOrgId, supplierOrgId: thread.supplierOrgId, agencyOrgId: thread.agencyOrgId, subject: thread.subject })
          .returning({ id: conversation.id }),
        `conversation ${thread.ref}`,
      );
      await db.insert(conversationMessage).values({ conversationId: created.id, senderUserId: thread.sender.userId, senderOrgId: thread.clientOrgId ?? thread.agencyOrgId ?? thread.supplierOrgId, senderRole: thread.role, senderName: thread.name, body: thread.body });
      await db.insert(conversationMessage).values({ conversationId: created.id, senderUserId: adminUser.userId, senderOrgId: null, senderRole: "fynix", senderName: "Fynix", body: "Thanks, we are looking at this now and will come back today." });
    }

    console.log(`Seeded ${LEADS.length} leads, ${LEADS.filter((l) => l.meetingRef !== null).length} meetings and ${threads.length} conversations for ${first.name}${second === first ? "" : ` and ${second.name}`}.`);
    });

  } catch (error) {
    if (error instanceof Error && error.cause instanceof Error) console.error(`Cause: ${error.cause.message}`);
    throw error;
  } finally {
    await Promise.all([owner.close(), fynix.close()]);
  }
});
