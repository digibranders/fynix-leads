import type { ApprovalStatus, MeetingStatus } from "./status";

export type Prospect = {
  name: string;
  title: string;
  company: string;
  companyDomain: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  zone: string; // IANA time zone of the prospect
};

export type Bant = { budget: string; authority: string; need: string; timeline: string };

export type Meeting = {
  id: string;
  status: MeetingStatus;
  startsAt: string; // ISO, UTC
  durationMinutes: number;
  repName: string; // client rep
  meetLink?: string;
};

export type Decision = {
  outcome: "approved" | "rejected";
  reasonCode?: string;
  note?: string;
  decidedAt: string;
};

export type ActivityEvent = {
  id: string;
  at: string;
  actor: string; // already role-shaped: "Client", "Aarav, Fynix", "System"
  kind: "human" | "system";
  text: string;
};

export type ThreadMessage = {
  id: string;
  at: string;
  author: string; // role-shaped name
  side: "client" | "fynix";
  body: string; // already scrubbed
};

export type Lead = {
  ref: string;
  campaignRef: string;
  approval: ApprovalStatus;
  submittedAt: string;
  prospect: Prospect;
  bant: Bant;
  meetings: Meeting[];
  decision?: Decision;
  replacesRef?: string;
  activity: ActivityEvent[];
  thread: ThreadMessage[];
};

export type Campaign = {
  ref: string;
  name: string;
  brand: string;
  monthlyTarget: number;
  totalTarget: number;
  startsOn: string;
  endsOn: string;
};
