import { fetchRange, type CalendarQuery } from "@/lib/calendar/view";
import type { HoursWindow } from "@/lib/domain/weekly-hours";
import type { Database } from "@/server/db/pool";
import type { TenantActor } from "@/server/domain/alias-identity";
import { listCampaignRows } from "@/server/domain/campaign-overview";
import { listTenantCampaigns } from "@/server/domain/campaigns-tenant";
import type { DomainDeps } from "@/server/domain/deps";
import type { FynixActor } from "@/server/domain/fynix-write";
import { listAgencyMeetings, listClientMeetings, listFynixMeetings } from "@/server/domain/meetings";
import { readTeamTimeForFynix, readTeamTimeForTenant, type TeamMemberTime } from "@/server/domain/team-availability";

/** One client to choose from: the label people read, and a campaign of that client that names its team. An agency never reads an organisation id. */
export interface CalendarTeamChoice {
  readonly campaignId: string;
  readonly label: string;
}

/** One person of the client team as a calendar page draws them. Everything is plain text and numbers so it can cross to the browser. */
export interface CalendarPerson {
  readonly memberId: string;
  readonly displayName: string;
  readonly timeZone: string;
  readonly hours: readonly HoursWindow[];
  /** Busy time as ISO moments, with nothing to say why. */
  readonly busy: readonly { readonly start: string; readonly end: string }[];
}

/** A meeting the viewer may read, as a calendar block. What it carries depends on who is looking, and it never names an agency to a client or a client person to an agency. */
export interface CalendarMeeting {
  readonly id: string;
  readonly ref: string;
  readonly start: string;
  readonly minutes: number;
  readonly status: string;
  readonly company: string;
  readonly link: string | null;
  /** The client team member on the meeting, for the client and Fynix. Never for an agency. */
  readonly with: string | null;
}

export interface CalendarData {
  readonly choices: readonly CalendarTeamChoice[];
  /** The campaign that names the team on screen, or null when the viewer has no campaign. */
  readonly selected: string | null;
  readonly people: readonly CalendarPerson[];
  readonly meetings: readonly CalendarMeeting[];
}

export interface CalendarInput {
  /** A campaign id from the address. One that is not in the viewer's list is ignored. */
  readonly team?: string;
  readonly query: CalendarQuery;
}

interface CampaignRef {
  readonly id: string;
  readonly clientName: string;
}

interface MeetingRow {
  readonly id: string;
  readonly publicRef: string;
  readonly campaignId: string;
  readonly scheduledStartTime: Date;
  readonly durationMinutes: number;
  readonly outcome: string;
  readonly prospectCompany: string;
  readonly googleMeetUrl: string | null;
  readonly hostName?: string | null;
}

/** The clients of a list of campaigns, in the order they first appear, each with the ids of all its campaigns. */
function groupByClient(campaigns: readonly CampaignRef[]): { readonly label: string; readonly ids: readonly string[] }[] {
  const groups = new Map<string, string[]>();
  for (const row of campaigns) groups.set(row.clientName, [...(groups.get(row.clientName) ?? []), row.id]);
  return [...groups.entries()].map(([label, ids]) => ({ label, ids }));
}

function toPerson(row: TeamMemberTime): CalendarPerson {
  return {
    memberId: row.memberId,
    displayName: row.displayName,
    timeZone: row.availability.timeZone ?? "Europe/London",
    hours: row.availability.hours,
    busy: row.busy.map((span) => ({ start: span.start.toISOString(), end: span.end.toISOString() })),
  };
}

function toMeeting(row: MeetingRow, shows: "host" | "nobody"): CalendarMeeting {
  return {
    id: row.id,
    ref: row.publicRef,
    start: row.scheduledStartTime.toISOString(),
    minutes: row.durationMinutes,
    status: row.outcome,
    company: row.prospectCompany,
    link: row.googleMeetUrl,
    with: shows === "host" ? (row.hostName ?? null) : null,
  };
}

/** Picks the client on screen, keeps the meetings of its campaigns inside the range, and adds the people. The caller supplies how to read the people. */
async function build(
  campaigns: readonly CampaignRef[],
  input: CalendarInput,
  meetings: readonly MeetingRow[],
  shows: "host" | "nobody",
  oneClient: boolean,
  readPeople: (campaignId: string, range: { readonly from: string; readonly to: string }) => Promise<readonly TeamMemberTime[]>,
): Promise<CalendarData> {
  const groups = groupByClient(campaigns);
  const chosen = groups.find((group) => group.ids.includes(input.team ?? "")) ?? groups[0];
  if (chosen === undefined) return { choices: [], selected: null, people: [], meetings: [] };
  const selected = chosen.ids[0] ?? "";
  const range = fetchRange(input.query);
  const inside = meetings.filter((row) => chosen.ids.includes(row.campaignId) && row.scheduledStartTime >= range.from && row.scheduledStartTime < range.to);
  const people = await readPeople(selected, { from: range.from.toISOString(), to: range.to.toISOString() });
  return {
    choices: oneClient ? [] : groups.map((group) => ({ campaignId: group.ids[0] ?? "", label: group.label })),
    selected,
    people: people.map(toPerson),
    meetings: inside.map((row) => toMeeting(row, shows)).sort((a, b) => a.start.localeCompare(b.start)),
  };
}

/**
 * What a client, a coordinator or an agency calendar page draws: the client team and their busy time, and the meetings the viewer may read. A client has one team
 * and so no choice to make. An agency or coordinator chooses among the clients of its campaigns.
 */
export async function loadCalendarForTenant(db: Database, actor: TenantActor, audience: "client" | "agency" | "coordinator", input: CalendarInput): Promise<CalendarData> {
  const campaigns = await listTenantCampaigns(db, actor, audience);
  const meetings: readonly MeetingRow[] = audience === "client" ? await listClientMeetings(db, actor) : await listAgencyMeetings(db, actor);
  return build(campaigns, input, meetings, audience === "client" ? "host" : "nobody", audience === "client", async (campaignId, range) =>
    readTeamTimeForTenant(db, actor, { campaignId, ...range }),
  );
}

/** What the Fynix calendar draws: any client, every meeting, with the client team member named. */
export async function loadCalendarForFynix(deps: DomainDeps, actor: FynixActor, input: CalendarInput): Promise<CalendarData> {
  const campaigns = await listCampaignRows(deps, actor);
  const meetings = await listFynixMeetings(deps.fynixDb, actor);
  return build(campaigns, input, meetings, "host", false, async (campaignId, range) => readTeamTimeForFynix(deps, actor, { campaignId, ...range }));
}
