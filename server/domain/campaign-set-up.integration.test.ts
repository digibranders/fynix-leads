import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { campaign } from "@/server/db/schema";
import { addClientContact } from "@/server/domain/client-contacts";
import { createCampaign, updateCampaign } from "@/server/domain/campaigns";
import { DomainError } from "@/server/domain/errors";
import { openDomainRig } from "@/server/domain/testing";

const rig = openDomainRig();
beforeAll(async () => {
  await rig.reset();
});
afterAll(async () => {
  await rig.close();
});
beforeEach(async () => {
  await rig.reset();
});

const refusal = async (work: Promise<unknown>): Promise<DomainError> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError, but the call succeeded.");
};
const base = () => ({ clientOrgId: rig.world().kestrel.id, agencyOrgId: rig.world().northgate.id, name: "Benelux cold chain", startDate: "2027-01-04", endDate: "2027-06-30", monthlyTarget: 12, totalTarget: 72 });
const stored = async (id: string) => (await rig.dbs.owner.db.select().from(campaign).where(eq(campaign.id, id)))[0];

describe("what a campaign takes when it is set up", () => {
  it("stores the brand and service answers, the questions, the two emails and the contact person", async () => {
    const contact = await addClientContact(rig.deps(), rig.actor, { clientOrgId: rig.world().kestrel.id, name: "Maya Rao" });
    const created = await createCampaign(rig.deps(), rig.actor, {
      ...base(),
      pitchIntroduction: "We move chilled goods.",
      pitchServices: "Cold chain",
      pitchDifferentiator: "Same-day recovery",
      pitchCollaterals: "https://example.com/brochure.pdf",
      pitchCaseStudies: "Halved spoilage",
      qualifyingQuestions: "What do you ship?\nHow often?",
      firstEmail: "Hello",
      secondEmail: "Following up",
      primaryContactId: contact.id,
    });
    expect(await stored(created.id)).toMatchObject({ pitchIntroduction: "<p>We move chilled goods.</p>", pitchServices: "<p>Cold chain</p>", qualifyingQuestions: "What do you ship?\nHow often?", firstEmail: "Hello", secondEmail: "Following up", primaryContactId: contact.id });
  });

  it("stores the questions with their expected answers as cleaned rich text, and drops empty rows", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, {
      ...base(),
      pitchServices: '<p>We <strong>move</strong> goods</p><script>alert(1)</script><ul><li onclick="x()">Cold chain</li></ul>',
      qualifyingItems: [
        { question: "<p>What do you ship?</p>", answer: '<ul><li>Chilled</li><li><a href="javascript:alert(1)">Frozen</a></li></ul>' },
        { question: "<p></p>", answer: "" },
        { question: "How often?", answer: "" },
      ],
    });
    const row = await stored(created.id);
    expect(row?.pitchServices).toBe("<p>We <strong>move</strong> goods</p><ul><li>Cold chain</li></ul>");
    expect(row?.qualifyingItems).toEqual([
      { question: "<p>What do you ship?</p>", answer: '<ul><li>Chilled</li><li><a target="_blank" rel="noopener noreferrer nofollow">Frozen</a></li></ul>' },
      { question: "<p>How often?</p>", answer: "" },
    ]);
    // Replacing the list on an existing campaign, and clearing it.
    await updateCampaign(rig.deps(), rig.actor, created.id, { qualifyingItems: [{ question: "One?", answer: "Yes" }] });
    expect((await stored(created.id))?.qualifyingItems).toEqual([{ question: "<p>One?</p>", answer: "<p>Yes</p>" }]);
    await updateCampaign(rig.deps(), rig.actor, created.id, { qualifyingItems: [] });
    expect((await stored(created.id))?.qualifyingItems).toEqual([]);
  });

  it("refuses more than 30 questions", async () => {
    const many = Array.from({ length: 31 }, (_, index) => ({ question: `Question ${index}?`, answer: "" }));
    expect((await refusal(createCampaign(rig.deps(), rig.actor, { ...base(), qualifyingItems: many }))).code).toBe("invalid-input");
  });

  it("leaves them empty when they are not given", async () => {
    const created = await createCampaign(rig.deps(), rig.actor, base());
    expect(await stored(created.id)).toMatchObject({ pitchIntroduction: "", qualifyingQuestions: "", qualifyingItems: [], firstEmail: "", secondEmail: "", primaryContactId: null });
  });

  it("refuses a contact person who belongs to another client, or has been removed", async () => {
    const other = await addClientContact(rig.deps(), rig.actor, { clientOrgId: rig.world().halden.id, name: "Someone Else" });
    expect((await refusal(createCampaign(rig.deps(), rig.actor, { ...base(), primaryContactId: other.id }))).code).toBe("invalid-input");
  });

  it("changes and clears the contact person on an existing campaign, and refuses another client's", async () => {
    const mine = await addClientContact(rig.deps(), rig.actor, { clientOrgId: rig.world().kestrel.id, name: "Maya Rao" });
    const other = await addClientContact(rig.deps(), rig.actor, { clientOrgId: rig.world().halden.id, name: "Someone Else" });
    const created = await createCampaign(rig.deps(), rig.actor, base());
    await updateCampaign(rig.deps(), rig.actor, created.id, { primaryContactId: mine.id, firstEmail: "Hi" });
    expect(await stored(created.id)).toMatchObject({ primaryContactId: mine.id, firstEmail: "Hi" });
    expect((await refusal(updateCampaign(rig.deps(), rig.actor, created.id, { primaryContactId: other.id }))).code).toBe("invalid-input");
    await updateCampaign(rig.deps(), rig.actor, created.id, { primaryContactId: null });
    expect((await stored(created.id))?.primaryContactId).toBeNull();
  });
});
