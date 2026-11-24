import { Badge } from "@/components/ui/badge";
import { campaignStatusLabel, campaignStatusTone, type CampaignTone } from "@/lib/campaign-status";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import type { LeadStage } from "@/lib/leads/stage";

type Variant = "neutral" | "quiet" | "amber" | "green" | "red" | "blue" | "teal";
interface Look {
  readonly label: string;
  readonly variant: Variant;
}

const CAMPAIGN_VARIANT: Record<CampaignTone, Variant> = { quiet: "quiet", green: "green", amber: "amber" };

/** A campaign shows one of three words, whatever its database status: Setting up, Active or Closed (`lib/campaign-status.ts`). */
const campaignLook = (status: CampaignStatus): Look => ({ label: campaignStatusLabel(status), variant: CAMPAIGN_VARIANT[campaignStatusTone(status)] });

/** Lead stages by colour: waiting on someone is amber, booked is blue, outcome due is teal, done is green, a problem is red, ended is grey. */
export const LEAD: Record<LeadStage, Look> = {
  draft: { label: "Draft", variant: "quiet" },
  awaiting_client: { label: "Awaiting client", variant: "amber" },
  scheduled: { label: "Scheduled", variant: "blue" },
  outcome_due: { label: "Outcome due", variant: "teal" },
  reschedule_needed: { label: "Reschedule needed", variant: "amber" },
  held: { label: "Meeting held", variant: "neutral" },
  awaiting_decision: { label: "Awaiting decision", variant: "teal" },
  accepted: { label: "Accepted", variant: "green" },
  client_no_show: { label: "Client no-show", variant: "red" },
  prospect_no_show: { label: "Prospect no-show", variant: "red" },
  delivered: { label: "Accepted", variant: "green" },
  disputed: { label: "Disputed", variant: "red" },
  declined: { label: "Rejected before the meeting", variant: "quiet" },
  withdrawn: { label: "Withdrawn", variant: "quiet" },
  lost: { label: "Lost", variant: "quiet" },
  rejected: { label: "Rejected", variant: "red" },
};

const PERSON = {
  active: { label: "Active", variant: "green" },
  suspended: { label: "Suspended", variant: "quiet" },
  invited: { label: "Invited", variant: "amber" },
  "invite-expired": { label: "Invite expired", variant: "red" },
} as const satisfies Record<string, Look>;

const HOST = {
  active: { label: "Taking meetings", variant: "green" },
  paused: { label: "Paused", variant: "quiet" },
} as const satisfies Record<string, Look>;

const AGREEMENT = {
  accepted: { label: "Accepted", variant: "green" },
  waiting: { label: "Waiting", variant: "amber" },
} as const satisfies Record<string, Look>;

const MEETING = {
  scheduled: { label: "Scheduled", variant: "blue" },
  held: { label: "Held", variant: "green" },
  client_no_show: { label: "Client no-show", variant: "red" },
  prospect_no_show: { label: "Prospect no-show", variant: "red" },
  rescheduled: { label: "Rescheduled", variant: "blue" },
  cancelled: { label: "Cancelled", variant: "quiet" },
} as const satisfies Record<string, Look>;

type Props =
  | { kind: "campaign"; status: CampaignStatus; size?: "default" | "sm" }
  | { kind: "lead"; status: LeadStage; size?: "default" | "sm" }
  | { kind: "person"; status: keyof typeof PERSON; size?: "default" | "sm" }
  | { kind: "host"; status: keyof typeof HOST; size?: "default" | "sm" }
  | { kind: "agreement"; status: keyof typeof AGREEMENT; size?: "default" | "sm" }
  | { kind: "meeting"; status: keyof typeof MEETING; size?: "default" | "sm" };

function look(props: Props): Look {
  switch (props.kind) {
    case "campaign":
      return campaignLook(props.status);
    case "lead":
      return LEAD[props.status];
    case "person":
      return PERSON[props.status];
    case "host":
      return HOST[props.status];
    case "agreement":
      return AGREEMENT[props.status];
    case "meeting":
      return MEETING[props.status];
  }
}

/** A status is a word in a tint. The word carries the meaning, so colour is never the only cue. */
export function StatusChip(props: Props) {
  const { label, variant } = look(props);
  return (
    <Badge variant={variant} size={props.size ?? "default"}>
      {label}
    </Badge>
  );
}
