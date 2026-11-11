import type { ActivityEvent, Campaign, Lead, ThreadMessage } from "@/lib/domain/types";

/** The fixed "now" of the prototype (a Wednesday). Every date below is relative to it. */
export const SAMPLE_NOW = new Date("2026-11-11T10:00:00Z");

export const VIEWER_ZONES = { client: "Europe/London", agency: "Asia/Kolkata" } as const;

/** Client reps. They appear only as `Meeting.repName`, never in activity or thread text. */
export const SAMPLE_REPS = ["Imogen Price", "Daniel Okafor", "Priya Raman"] as const;
const [IMOGEN, DANIEL, PRIYA] = SAMPLE_REPS;

// Role-shaped actors, as the client sees them.
const CLIENT = "Client";
const AARAV = "Aarav, Fynix";
const MEERA = "Meera, Fynix";

// Time helpers, all relative to SAMPLE_NOW and returning ISO strings in UTC.
const iso = (d: Date): string => d.toISOString().replace(".000Z", "Z");
const minutesAgo = (n: number): string => iso(new Date(SAMPLE_NOW.getTime() - n * 60_000));
const hoursAgo = (n: number): string => minutesAgo(n * 60);
/** `daysFromNow` calendar days from today (negative is the past), at HH:MM UTC. */
const at = (daysFromNow: number, hhmm: string): string =>
  iso(
    new Date(
      Date.UTC(
        SAMPLE_NOW.getUTCFullYear(),
        SAMPLE_NOW.getUTCMonth(),
        SAMPLE_NOW.getUTCDate() + daysFromNow,
        Number(hhmm.slice(0, 2)),
        Number(hhmm.slice(3, 5)),
      ),
    ),
  );

const human = (id: string, when: string, actor: string, text: string): ActivityEvent => ({
  id,
  at: when,
  actor,
  kind: "human",
  text,
});
const system = (id: string, when: string, text: string): ActivityEvent => ({
  id,
  at: when,
  actor: "System",
  kind: "system",
  text,
});
const message = (id: string, when: string, side: "client" | "fynix", author: string, body: string): ThreadMessage => ({
  id,
  at: when,
  author,
  side,
  body,
});

export const SAMPLE_CAMPAIGN: Campaign = {
  ref: "CMP-7Q2X",
  name: "UK mid-market finance teams",
  brand: "Kestrel Ledger",
  monthlyTarget: 12,
  totalTarget: 72,
  startsOn: "2026-09-01",
  endsOn: "2027-02-28",
};

const CAMPAIGN_REF = SAMPLE_CAMPAIGN.ref;

export const SAMPLE_LEADS: Lead[] = [
  // ---- Pending, meeting scheduled ----
  {
    ref: "LD-3M7A",
    campaignRef: CAMPAIGN_REF,
    approval: "pending",
    submittedAt: hoursAgo(3),
    prospect: {
      name: "Harriet Oyelaran",
      title: "Head of Finance Operations",
      company: "Brindle & Marsh",
      companyDomain: "brindlemarsh.co.uk",
      email: "harriet.oyelaran@brindlemarsh.co.uk",
      phone: "+44 20 7946 0318",
      linkedinUrl: "https://www.linkedin.com/in/harriet-oyelaran-4c8e2a1",
      zone: "Europe/London",
    },
    bant: {
      budget: "Approved 40,000 pounds for tooling in the 2027 plan.",
      authority: "Signs off software spend up to 75,000 pounds with the CFO's agreement.",
      need: "Month end close takes nine working days and the board wants it under five.",
      timeline: "Wants a tool chosen by the end of January.",
    },
    meetings: [
      {
        id: "MT-1001",
        status: "scheduled",
        startsAt: at(6, "14:00"),
        durationMinutes: 30,
        repName: DANIEL,
        meetLink: "https://meet.google.com/kqx-mrvd-tzn",
      },
    ],
    activity: [
      human("EV-3M7A-1", minutesAgo(200), AARAV, "Meeting scheduled for Tue 17 Nov"),
      human("EV-3M7A-2", minutesAgo(180), AARAV, "Submitted for review"),
      system("EV-3M7A-3", minutesAgo(178), "Notification email delivered"),
    ],
    thread: [],
  },
  {
    // The one US-based prospect: 12:30 UTC is 7:30 am in New York, so the off-hours warning shows.
    ref: "LD-8R2D",
    campaignRef: CAMPAIGN_REF,
    approval: "pending",
    submittedAt: hoursAgo(20),
    prospect: {
      name: "Marcus Delaney",
      title: "Group Finance Director",
      company: "Pellam Industrial Group",
      companyDomain: "pellamgroup.co.uk",
      email: "marcus.delaney@pellamgroup.co.uk",
      phone: "+44 20 7946 0472",
      linkedinUrl: "https://www.linkedin.com/in/marcus-delaney-7d3f90b",
      zone: "America/New_York",
    },
    bant: {
      budget: "Has a 120,000 pound line for finance systems, split across two financial years.",
      authority: "Owns the shortlist and takes the recommendation to the board.",
      need: "Three business units run separate ledgers and consolidation is done in spreadsheets.",
      timeline: "The board meets in mid December and wants a recommendation before then.",
    },
    meetings: [
      {
        id: "MT-1002",
        status: "scheduled",
        startsAt: at(1, "12:30"),
        durationMinutes: 30,
        repName: PRIYA,
        meetLink: "https://meet.google.com/tbw-hxan-qud",
      },
    ],
    activity: [
      human("EV-8R2D-1", hoursAgo(21), MEERA, "Meeting scheduled for Thu 12 Nov"),
      human("EV-8R2D-2", hoursAgo(20), MEERA, "Submitted for review"),
      system("EV-8R2D-3", minutesAgo(1198), "Notification email delivered"),
      system("EV-8R2D-4", minutesAgo(1196), "Prospect time zone noted as New York"),
    ],
    thread: [],
  },
  {
    // Waiting more than 24 hours: overdue.
    ref: "LD-5T6C",
    campaignRef: CAMPAIGN_REF,
    approval: "pending",
    submittedAt: at(-2, "04:00"),
    prospect: {
      name: "Tom Whitcombe",
      title: "CFO",
      company: "Halden Freight",
      companyDomain: "haldenfreight.co.uk",
      email: "tom.whitcombe@haldenfreight.co.uk",
      phone: "+44 161 496 0254",
      linkedinUrl: "https://www.linkedin.com/in/tom-whitcombe-91a6d3e",
      zone: "Europe/London",
    },
    bant: {
      budget: "Freight margins are thin, so spend is capped at 25,000 pounds without board approval.",
      authority: "Has the final say on finance software, with the CEO kept informed.",
      need: "Invoicing 1,800 hauliers a month still relies on manual matching.",
      timeline: "The contract with the current provider ends in April, so a decision is due by February.",
    },
    meetings: [
      {
        id: "MT-1003",
        status: "scheduled",
        startsAt: at(5, "11:00"),
        durationMinutes: 45,
        repName: IMOGEN,
        meetLink: "https://meet.google.com/lzp-dcrk-vmy",
      },
    ],
    activity: [
      human("EV-5T6C-1", at(-2, "03:30"), AARAV, "Meeting scheduled for Mon 16 Nov"),
      human("EV-5T6C-2", at(-2, "04:00"), AARAV, "Submitted for review"),
      system("EV-5T6C-3", at(-2, "04:01"), "Notification email delivered"),
      system("EV-5T6C-4", at(-1, "04:00"), "Reminder sent: waiting for review for 24 hours"),
    ],
    thread: [],
  },

  // ---- Pending, meeting completed ----
  {
    // Waiting about two days: overdue.
    ref: "LD-2W9H",
    campaignRef: CAMPAIGN_REF,
    approval: "pending",
    submittedAt: at(-2, "11:00"),
    prospect: {
      name: "Priyanka Venkataraman",
      title: "Financial Controller",
      company: "Ashgrove Veterinary Group",
      companyDomain: "ashgrovevets.co.uk",
      email: "priyanka.venkataraman@ashgrovevets.co.uk",
      phone: "+44 20 7946 0691",
      linkedinUrl: "https://www.linkedin.com/in/priyanka-venkataraman-3e5b8f2",
      zone: "Europe/London",
    },
    bant: {
      budget: "Has 30,000 pounds ring-fenced for reporting automation.",
      authority: "Runs the vendor review and reports to the group CFO.",
      need: "Reporting across 46 clinics is rebuilt by hand every month.",
      timeline: "Wants a pilot to start in the first quarter of 2027.",
    },
    meetings: [
      {
        id: "MT-1004",
        status: "completed",
        startsAt: at(-2, "09:30"),
        durationMinutes: 30,
        repName: DANIEL,
        meetLink: "https://meet.google.com/hjv-wqpa-ceb",
      },
    ],
    activity: [
      human("EV-2W9H-1", at(-6, "09:30"), AARAV, "Meeting scheduled for Mon 9 Nov"),
      system("EV-2W9H-2", at(-2, "10:10"), "Meeting marked completed"),
      human("EV-2W9H-3", at(-2, "11:00"), AARAV, "Submitted for review"),
      system("EV-2W9H-4", at(-2, "11:01"), "Notification email delivered"),
      system("EV-2W9H-5", at(-1, "11:00"), "Reminder sent: waiting for review for 24 hours"),
    ],
    thread: [],
  },
  {
    ref: "LD-6B4N",
    campaignRef: CAMPAIGN_REF,
    approval: "pending",
    submittedAt: at(-1, "11:30"),
    prospect: {
      name: "Callum Rutherford",
      title: "Finance Director",
      company: "Fellgate Outdoor Retail",
      companyDomain: "fellgateoutdoor.co.uk",
      email: "callum.rutherford@fellgateoutdoor.co.uk",
      phone: "+44 161 496 0137",
      linkedinUrl: "https://www.linkedin.com/in/callum-rutherford-c82d5a4",
      zone: "Europe/London",
    },
    bant: {
      budget: "Holds 55,000 pounds for stock and cash forecasting tools.",
      authority: "Sponsors the project and signs the order.",
      need: "Seasonal cash swings across 31 shops are forecast on a shared workbook.",
      timeline: "Needs the tool running before the spring buying round.",
    },
    meetings: [
      {
        id: "MT-1005",
        status: "completed",
        startsAt: at(-1, "09:30"),
        durationMinutes: 30,
        repName: PRIYA,
        meetLink: "https://meet.google.com/bnd-xtlk-rqm",
      },
    ],
    activity: [
      human("EV-6B4N-1", at(-6, "10:15"), MEERA, "Meeting scheduled for Tue 10 Nov"),
      system("EV-6B4N-2", at(-1, "10:05"), "Meeting marked completed"),
      human("EV-6B4N-3", at(-1, "11:30"), MEERA, "Submitted for review"),
      system("EV-6B4N-4", at(-1, "11:31"), "Notification email delivered"),
    ],
    thread: [],
  },

  // ---- Pending replacement for a rejected lead, meeting completed ----
  {
    ref: "LD-9F1K",
    campaignRef: CAMPAIGN_REF,
    approval: "pending",
    submittedAt: hoursAgo(6),
    replacesRef: "LD-3H8Q",
    prospect: {
      name: "Aisling Brennan",
      title: "Head of Financial Planning and Analysis",
      company: "Calderbrook Homes",
      companyDomain: "calderbrookhomes.co.uk",
      email: "aisling.brennan@calderbrookhomes.co.uk",
      phone: "+44 161 496 0829",
      linkedinUrl: "https://www.linkedin.com/in/aisling-brennan-6f1c0b9",
      zone: "Europe/London",
    },
    bant: {
      budget: "The planning round includes 60,000 pounds for forecasting software.",
      authority: "Leads planning and presents the vendor recommendation to the CFO.",
      need: "Build cost forecasts for 14 live sites sit in separate workbooks.",
      timeline: "Wants a supplier signed before the March budget reset.",
    },
    meetings: [
      {
        id: "MT-1006",
        status: "completed",
        startsAt: at(-1, "15:00"),
        durationMinutes: 30,
        repName: IMOGEN,
        meetLink: "https://meet.google.com/dmr-fzcv-ypw",
      },
    ],
    activity: [
      human("EV-9F1K-1", at(-6, "09:00"), MEERA, "Meeting scheduled for Tue 10 Nov"),
      system("EV-9F1K-2", at(-1, "15:35"), "Meeting marked completed"),
      human("EV-9F1K-3", hoursAgo(6), MEERA, "Submitted as a replacement for LD-3H8Q"),
      system("EV-9F1K-4", minutesAgo(359), "Notification email delivered"),
    ],
    thread: [],
  },

  // ---- Approved ----
  {
    ref: "LD-7C3E",
    campaignRef: CAMPAIGN_REF,
    approval: "approved",
    submittedAt: at(-13, "09:30"),
    prospect: {
      name: "Oluwaseun Adeyemi",
      title: "Chief Financial Officer",
      company: "Ludgate Precision Engineering",
      companyDomain: "ludgateprecision.co.uk",
      email: "oluwaseun.adeyemi@ludgateprecision.co.uk",
      phone: "+44 20 7946 0764",
      linkedinUrl: "https://www.linkedin.com/in/oluwaseun-adeyemi-a07e3d6",
      zone: "Europe/London",
    },
    bant: {
      budget: "The board signed off 85,000 pounds for finance automation this year.",
      authority: "Budget holder with no further sign-off needed.",
      need: "Intercompany reconciliations between two plants take a week each quarter.",
      timeline: "Implementation is due to begin in January.",
    },
    meetings: [
      {
        id: "MT-1007",
        status: "completed",
        startsAt: at(-6, "10:00"),
        durationMinutes: 45,
        repName: DANIEL,
        meetLink: "https://meet.google.com/pst-nwbe-ahk",
      },
    ],
    decision: {
      outcome: "approved",
      note: "Senior contact with a confirmed budget.",
      decidedAt: at(-12, "11:20"),
    },
    activity: [
      human("EV-7C3E-1", at(-13, "09:30"), AARAV, "Submitted for review"),
      system("EV-7C3E-2", at(-13, "09:31"), "Notification email delivered"),
      human("EV-7C3E-3", at(-12, "11:20"), CLIENT, "Approved"),
      human("EV-7C3E-4", at(-12, "14:00"), AARAV, "Meeting scheduled for Thu 5 Nov"),
      system("EV-7C3E-5", at(-6, "10:50"), "Meeting marked completed"),
    ],
    thread: [],
  },
  {
    ref: "LD-1X8S",
    campaignRef: CAMPAIGN_REF,
    approval: "approved",
    submittedAt: at(-9, "10:30"),
    prospect: {
      name: "Rebecca Hallam",
      title: "Financial Controller",
      company: "Stannard Packaging",
      companyDomain: "stannardpackaging.co.uk",
      email: "rebecca.hallam@stannardpackaging.co.uk",
      phone: "+44 161 496 0583",
      linkedinUrl: "https://www.linkedin.com/in/rebecca-hallam-5b92e7c",
      zone: "Europe/London",
    },
    bant: {
      budget: "Has an annual software budget of 35,000 pounds, with about half unspent this year.",
      authority: "Approves purchases up to 20,000 pounds and advises the CFO above that.",
      need: "Accruals for 900 supplier invoices a month are checked by hand.",
      timeline: "Wants to start a trial before Christmas.",
    },
    meetings: [
      {
        id: "MT-1008",
        status: "completed",
        startsAt: at(-2, "13:00"),
        durationMinutes: 30,
        repName: PRIYA,
        meetLink: "https://meet.google.com/vfc-lmgr-sdu",
      },
    ],
    decision: { outcome: "approved", decidedAt: at(-8, "09:40") },
    activity: [
      human("EV-1X8S-1", at(-9, "10:30"), MEERA, "Submitted for review"),
      system("EV-1X8S-2", at(-9, "10:31"), "Notification email delivered"),
      human("EV-1X8S-3", at(-8, "09:40"), CLIENT, "Approved"),
      human("EV-1X8S-4", at(-8, "12:15"), MEERA, "Meeting scheduled for Mon 9 Nov"),
      system("EV-1X8S-5", at(-2, "13:40"), "Meeting marked completed"),
    ],
    thread: [],
  },
  {
    ref: "LD-4D5V",
    campaignRef: CAMPAIGN_REF,
    approval: "approved",
    submittedAt: at(-6, "09:00"),
    prospect: {
      name: "Imran Qureshi",
      title: "Director of Finance",
      company: "Bexley Park Care Group",
      companyDomain: "bexleyparkcare.co.uk",
      email: "imran.qureshi@bexleyparkcare.co.uk",
      phone: "+44 20 7946 0205",
      linkedinUrl: "https://www.linkedin.com/in/imran-qureshi-d3a48f0",
      zone: "Europe/London",
    },
    bant: {
      budget: "Has 48,000 pounds in the digital budget for care homes, not yet committed.",
      authority: "Chairs the vendor panel that picks finance tools.",
      need: "Payroll and agency staff costs across 22 homes are reconciled by hand each month.",
      timeline: "The panel expects to decide in the first week of December.",
    },
    meetings: [
      {
        id: "MT-1009",
        status: "completed",
        startsAt: at(-1, "10:30"),
        durationMinutes: 30,
        repName: DANIEL,
        meetLink: "https://meet.google.com/wzt-ghpa-ynx",
      },
    ],
    decision: { outcome: "approved", decidedAt: at(-6, "15:45") },
    activity: [
      human("EV-4D5V-1", at(-6, "09:00"), AARAV, "Submitted for review"),
      system("EV-4D5V-2", at(-6, "09:01"), "Notification email delivered"),
      human("EV-4D5V-3", at(-6, "15:45"), CLIENT, "Approved"),
      human("EV-4D5V-4", at(-5, "09:20"), AARAV, "Meeting scheduled for Tue 10 Nov"),
      system("EV-4D5V-5", at(-1, "11:05"), "Meeting marked completed"),
    ],
    thread: [],
  },
  {
    ref: "LD-6J2Z",
    campaignRef: CAMPAIGN_REF,
    approval: "approved",
    submittedAt: at(-2, "09:15"),
    prospect: {
      name: "Fiona McAllister",
      title: "Head of Finance",
      company: "Tayside Marine Services",
      companyDomain: "taysidemarine.co.uk",
      email: "fiona.mcallister@taysidemarine.co.uk",
      phone: "+44 20 7946 0546",
      linkedinUrl: "https://www.linkedin.com/in/fiona-mcallister-8e0d4b7",
      zone: "Europe/London",
    },
    bant: {
      budget: "Has a finance systems budget of 28,000 pounds, reviewed each April.",
      authority: "Shares sign-off with the managing director.",
      need: "Vessel maintenance costs are tracked across five yards in separate systems.",
      timeline: "Wants a demo before the end of November.",
    },
    meetings: [
      {
        id: "MT-1010",
        status: "scheduled",
        startsAt: at(2, "10:30"),
        durationMinutes: 30,
        repName: IMOGEN,
        meetLink: "https://meet.google.com/rkh-tqve-bmj",
      },
    ],
    decision: { outcome: "approved", decidedAt: at(-2, "16:20") },
    activity: [
      human("EV-6J2Z-1", at(-2, "09:15"), MEERA, "Submitted for review"),
      system("EV-6J2Z-2", at(-2, "09:16"), "Notification email delivered"),
      human("EV-6J2Z-3", at(-2, "16:20"), CLIENT, "Approved"),
      human("EV-6J2Z-4", at(-1, "09:45"), MEERA, "Meeting scheduled for Fri 13 Nov"),
    ],
    thread: [],
  },

  // ---- Rejected ----
  {
    ref: "LD-3H8Q",
    campaignRef: CAMPAIGN_REF,
    approval: "rejected",
    submittedAt: at(-13, "12:00"),
    prospect: {
      name: "Gareth Pugh",
      title: "Financial Controller",
      company: "Cwm Valley Bakeries",
      companyDomain: "cwmvalleybakeries.co.uk",
      email: "gareth.pugh@cwmvalleybakeries.co.uk",
      phone: "+44 20 7946 0933",
      linkedinUrl: "https://www.linkedin.com/in/gareth-pugh-1a7c5e8",
      zone: "Europe/London",
    },
    bant: {
      budget: "Spends about 4,000 pounds a year on finance tools.",
      authority: "Needs the owner's approval for any new spend.",
      need: "Wants to move from spreadsheets to basic cloud bookkeeping.",
      timeline: "No date set.",
    },
    meetings: [
      {
        id: "MT-1011",
        status: "completed",
        startsAt: at(-14, "13:00"),
        durationMinutes: 30,
        repName: DANIEL,
        meetLink: "https://meet.google.com/gxe-yamu-fdc",
      },
    ],
    decision: {
      outcome: "rejected",
      reasonCode: "not_icp",
      note: "Under 30 staff, well below the mid-market range for this campaign.",
      decidedAt: at(-9, "10:10"),
    },
    activity: [
      human("EV-3H8Q-1", at(-19, "09:00"), MEERA, "Meeting scheduled for Wed 28 Oct"),
      system("EV-3H8Q-2", at(-14, "13:35"), "Meeting marked completed"),
      human("EV-3H8Q-3", at(-13, "12:00"), MEERA, "Submitted for review"),
      system("EV-3H8Q-4", at(-13, "12:01"), "Notification email delivered"),
      human("EV-3H8Q-5", at(-9, "10:10"), CLIENT, "Rejected: company outside the target profile"),
      system("EV-3H8Q-6", hoursAgo(6), "Replacement lead LD-9F1K submitted"),
    ],
    thread: [],
  },
  {
    ref: "LD-8L4T",
    campaignRef: CAMPAIGN_REF,
    approval: "rejected",
    submittedAt: at(-9, "10:00"),
    prospect: {
      name: "Naomi Fitzgerald",
      title: "Head of Finance Systems",
      company: "Kingsbridge Mutual",
      companyDomain: "kingsbridgemutual.co.uk",
      email: "naomi.fitzgerald@kingsbridgemutual.co.uk",
      phone: "+44 20 7946 0127",
      linkedinUrl: "https://www.linkedin.com/in/naomi-fitzgerald-e49b2c3",
      zone: "Europe/London",
    },
    bant: {
      budget: "The finance systems budget is held by group IT and was not shared.",
      authority: "Runs finance systems and recommends tools to group IT.",
      need: "Is looking to replace a reserves reporting spreadsheet.",
      timeline: "A group review of finance tools is due early next year.",
    },
    meetings: [
      {
        id: "MT-1012",
        status: "prospect_declined",
        startsAt: at(-5, "14:00"),
        durationMinutes: 30,
        repName: PRIYA,
      },
    ],
    decision: {
      outcome: "rejected",
      reasonCode: "existing_customer",
      note: "Already in contract talks with our enterprise team.",
      decidedAt: at(-6, "09:50"),
    },
    activity: [
      human("EV-8L4T-1", at(-9, "10:00"), AARAV, "Submitted for review"),
      system("EV-8L4T-2", at(-9, "10:01"), "Notification email delivered"),
      human("EV-8L4T-3", at(-9, "12:30"), AARAV, "Meeting scheduled for Fri 6 Nov"),
      system("EV-8L4T-4", at(-7, "15:00"), "Prospect declined the meeting"),
      human("EV-8L4T-5", at(-6, "09:50"), CLIENT, "Rejected: already a customer or in talks"),
    ],
    thread: [],
  },

  // ---- Needs clarification ----
  {
    ref: "LD-4K9P",
    campaignRef: CAMPAIGN_REF,
    approval: "needs_clarification",
    submittedAt: at(-2, "10:00"),
    prospect: {
      name: "Sunita Bhatt",
      title: "Finance Director",
      company: "Ormerod Wholesale Foods",
      companyDomain: "ormerodwholesale.co.uk",
      email: "sunita.bhatt@ormerodwholesale.co.uk",
      phone: "+44 161 496 0378",
      linkedinUrl: "https://www.linkedin.com/in/sunita-bhatt-2c6f8d1",
      zone: "Europe/London",
    },
    bant: {
      budget: "Mentioned 45,000 pounds, though it may be shared with IT.",
      authority: "A group procurement team reviews any contract over 25,000 pounds.",
      need: "Margin reporting for 3,000 product lines is assembled across four spreadsheets.",
      timeline: "Wants to decide before the half year close in January.",
    },
    meetings: [
      {
        id: "MT-1013",
        status: "scheduled",
        startsAt: at(7, "15:00"),
        durationMinutes: 30,
        repName: DANIEL,
        meetLink: "https://meet.google.com/ycg-jnak-lpt",
      },
    ],
    activity: [
      human("EV-4K9P-1", at(-2, "10:00"), AARAV, "Submitted for review"),
      system("EV-4K9P-2", at(-2, "10:01"), "Notification email delivered"),
      system("EV-4K9P-7", at(-2, "10:02"), "Meeting invitation sent to the prospect"),
      system("EV-4K9P-8", at(-2, "10:03"), "Prospect opened the meeting invitation"),
      human("EV-4K9P-3", at(-1, "09:10"), CLIENT, "Asked for clarification"),
      human("EV-4K9P-4", at(-1, "11:00"), AARAV, "Replied to the clarification request"),
      human("EV-4K9P-5", at(-1, "13:30"), CLIENT, "Asked a follow-up question"),
      human("EV-4K9P-6", at(0, "08:20"), MEERA, "Replied to the follow-up question"),
    ],
    thread: [
      message(
        "TH-4K9P-1",
        at(-1, "09:10"),
        "client",
        CLIENT,
        "Can you confirm whether procurement has been told about this project? The notes say contracts over 25,000 pounds go to a group procurement team.",
      ),
      message(
        "TH-4K9P-2",
        at(-1, "11:00"),
        "fynix",
        AARAV,
        "The prospect says procurement knows a project is coming but has not seen any vendor names yet. We can ask for an introduction to the procurement lead before the meeting.",
      ),
      message(
        "TH-4K9P-3",
        at(-1, "13:30"),
        "client",
        CLIENT,
        "Please do. Also confirm that the 45,000 pounds is for this financial year and not the next one.",
      ),
      message(
        "TH-4K9P-4",
        at(0, "08:20"),
        "fynix",
        MEERA,
        "The prospect confirmed the 45,000 pounds is for the current financial year. We have asked about the procurement introduction and will update the notes once we hear back.",
      ),
    ],
  },
  {
    ref: "LD-5N7W",
    campaignRef: CAMPAIGN_REF,
    approval: "needs_clarification",
    submittedAt: at(-1, "08:50"),
    prospect: {
      name: "Jack Strachan",
      title: "Head of Treasury",
      company: "Dunmore Retail Group",
      companyDomain: "dunmoreretail.co.uk",
      email: "jack.strachan@dunmoreretail.co.uk",
      phone: "+44 20 7946 0852",
      linkedinUrl: "https://www.linkedin.com/in/jack-strachan-f5a31c7",
      zone: "Europe/London",
    },
    bant: {
      budget: "Has a treasury tooling budget of 70,000 pounds approved in principle.",
      authority: "Reports to the CFO, who will join the final demo.",
      need: "Cash positioning across 12 bank accounts is pulled together by hand each morning.",
      timeline: "Aims to pick a supplier by the end of the first quarter.",
    },
    meetings: [
      {
        id: "MT-1014",
        status: "proposed",
        startsAt: at(8, "11:30"),
        durationMinutes: 30,
        repName: PRIYA,
      },
    ],
    activity: [
      human("EV-5N7W-1", at(-1, "08:50"), MEERA, "Submitted for review"),
      system("EV-5N7W-2", at(-1, "08:51"), "Notification email delivered"),
      human("EV-5N7W-3", at(-1, "09:30"), MEERA, "Meeting time proposed for Thu 19 Nov"),
      human("EV-5N7W-4", at(-1, "15:20"), CLIENT, "Asked for clarification"),
      human("EV-5N7W-5", at(0, "07:50"), MEERA, "Replied to the clarification request"),
      human("EV-5N7W-6", at(0, "09:20"), CLIENT, "Asked a follow-up question"),
    ],
    thread: [
      message(
        "TH-5N7W-1",
        at(-1, "15:20"),
        "client",
        CLIENT,
        "The notes say the budget is approved in principle. Has the CFO confirmed it, or is that the prospect's understanding?",
      ),
      message(
        "TH-5N7W-2",
        at(0, "07:50"),
        "fynix",
        MEERA,
        "The prospect says the CFO confirmed the budget at the October planning meeting. We have asked for the date and who attended, and will add both to the notes.",
      ),
      message(
        "TH-5N7W-3",
        at(0, "09:20"),
        "client",
        CLIENT,
        "Thanks. Please also confirm whether the CFO will join the first meeting or only the final demo.",
      ),
    ],
  },
];
