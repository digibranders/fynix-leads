import { describe, expect, it } from "vitest";
import { tallyAgencyLeads, type AgencyLeadFact } from "@/lib/fynix/agency-leads";

const NOW = new Date("2027-03-15T12:00:00Z");
const fact = (over: Partial<AgencyLeadFact>): AgencyLeadFact => ({ stage: "submitted", meetingTime: null, submittedAt: new Date("2027-03-02T09:00:00Z"), timeZone: "UTC", ...over });

describe("tallyAgencyLeads", () => {
  it("counts leads sent this month, and leaves last month out", () => {
    const tally = tallyAgencyLeads([fact({}), fact({ submittedAt: new Date("2027-02-27T09:00:00Z") })], NOW);
    expect(tally.submittedThisMonth).toBe(1);
  });

  it("counts an accepted lead in the month its meeting was held, not the month it was sent", () => {
    const tally = tallyAgencyLeads(
      [
        fact({ stage: "accepted", meetingTime: new Date("2027-03-10T10:00:00Z"), submittedAt: new Date("2027-02-20T09:00:00Z") }),
        fact({ stage: "accepted", meetingTime: new Date("2027-02-10T10:00:00Z") }),
      ],
      NOW,
    );
    expect(tally).toEqual({ submittedThisMonth: 1, acceptedThisMonth: 1, delivered: 2 });
  });

  it("counts a client no-show and ignores a rejection or a lead with no meeting", () => {
    const tally = tallyAgencyLeads(
      [
        fact({ stage: "client_no_show", meetingTime: new Date("2027-03-05T10:00:00Z") }),
        fact({ stage: "rejected", meetingTime: new Date("2027-03-05T10:00:00Z") }),
        fact({ stage: "accepted", meetingTime: null }),
      ],
      NOW,
    );
    expect(tally.acceptedThisMonth).toBe(1);
    expect(tally.delivered).toBe(1);
  });

  it("reads the month in the campaign's zone", () => {
    // 23:30 UTC on 31 March is already April in Asia/Kolkata.
    const tally = tallyAgencyLeads([fact({ stage: "accepted", meetingTime: new Date("2027-03-31T23:30:00Z"), timeZone: "Asia/Kolkata", submittedAt: new Date("2027-03-31T23:30:00Z") })], NOW);
    expect(tally).toEqual({ submittedThisMonth: 0, acceptedThisMonth: 0, delivered: 1 });
  });
});
