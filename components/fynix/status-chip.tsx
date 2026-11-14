import type { Icon } from "@phosphor-icons/react";
import {
  Archive,
  ArrowsClockwise,
  CalendarBlank,
  CheckCircle,
  Clock,
  Envelope,
  FlagCheckered,
  Hourglass,
  PauseCircle,
  PencilSimple,
  Prohibit,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import type { CampaignStatus } from "@/lib/domain/campaign-status";
import type { LeadStage } from "@/lib/leads/stage";

type Variant = "neutral" | "quiet" | "amber" | "green" | "red" | "blue";
interface Look {
  readonly label: string;
  readonly icon: Icon;
  readonly variant: Variant;
}

const CAMPAIGN: Record<CampaignStatus, Look> = {
  draft: { label: "Draft", icon: PencilSimple, variant: "quiet" },
  active: { label: "Active", icon: CheckCircle, variant: "green" },
  paused: { label: "Paused", icon: PauseCircle, variant: "amber" },
  completed: { label: "Completed", icon: FlagCheckered, variant: "blue" },
  archived: { label: "Archived", icon: Archive, variant: "quiet" },
};

const LEAD: Record<LeadStage, Look> = {
  draft: { label: "Draft", icon: PencilSimple, variant: "quiet" },
  awaiting_client: { label: "Awaiting client", icon: Hourglass, variant: "amber" },
  scheduled: { label: "Scheduled", icon: CalendarBlank, variant: "green" },
  outcome_due: { label: "Outcome due", icon: Clock, variant: "amber" },
  reschedule_needed: { label: "Reschedule needed", icon: ArrowsClockwise, variant: "blue" },
  held: { label: "Meeting held", icon: CheckCircle, variant: "neutral" },
  client_no_show: { label: "Client no-show", icon: Prohibit, variant: "red" },
  prospect_no_show: { label: "Prospect no-show", icon: Prohibit, variant: "red" },
  delivered: { label: "Delivered", icon: CheckCircle, variant: "green" },
  disputed: { label: "Disputed", icon: WarningCircle, variant: "red" },
  declined: { label: "Declined", icon: Prohibit, variant: "red" },
  withdrawn: { label: "Withdrawn", icon: Archive, variant: "quiet" },
  lost: { label: "Lost", icon: Prohibit, variant: "quiet" },
  rejected: { label: "Rejected", icon: Prohibit, variant: "red" },
};

const PERSON = {
  active: { label: "Active", icon: CheckCircle, variant: "green" },
  suspended: { label: "Suspended", icon: Prohibit, variant: "quiet" },
  invited: { label: "Invited", icon: Envelope, variant: "amber" },
  "invite-expired": { label: "Invite expired", icon: Clock, variant: "red" },
} as const satisfies Record<string, Look>;

const HOST = {
  active: { label: "Taking meetings", icon: CheckCircle, variant: "green" },
  paused: { label: "Paused", icon: Prohibit, variant: "quiet" },
} as const satisfies Record<string, Look>;

const AGREEMENT = {
  accepted: { label: "Accepted", icon: CheckCircle, variant: "green" },
  waiting: { label: "Waiting", icon: Hourglass, variant: "amber" },
} as const satisfies Record<string, Look>;

const MEETING = {
  scheduled: { label: "Scheduled", icon: CalendarBlank, variant: "green" },
  held: { label: "Held", icon: CheckCircle, variant: "green" },
  client_no_show: { label: "Client no-show", icon: Prohibit, variant: "red" },
  prospect_no_show: { label: "Prospect no-show", icon: Prohibit, variant: "red" },
  rescheduled: { label: "Rescheduled", icon: ArrowsClockwise, variant: "blue" },
  cancelled: { label: "Cancelled", icon: Prohibit, variant: "quiet" },
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
      return CAMPAIGN[props.status];
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

/** A status is an icon, a word and a tint, never colour alone. */
export function StatusChip(props: Props) {
  const { label, icon: Glyph, variant } = look(props);
  return (
    <Badge variant={variant} size={props.size ?? "default"}>
      <Glyph aria-hidden weight="fill" />
      {label}
    </Badge>
  );
}
