import type { Icon } from "@phosphor-icons/react";
import { Archive, CheckCircle, Clock, Envelope, FlagCheckered, Hourglass, PauseCircle, PencilSimple, Prohibit } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import type { CampaignStatus } from "@/lib/domain/campaign-status";

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

type Props =
  | { kind: "campaign"; status: CampaignStatus; size?: "default" | "sm" }
  | { kind: "person"; status: keyof typeof PERSON; size?: "default" | "sm" }
  | { kind: "host"; status: keyof typeof HOST; size?: "default" | "sm" }
  | { kind: "agreement"; status: keyof typeof AGREEMENT; size?: "default" | "sm" };

function look(props: Props): Look {
  switch (props.kind) {
    case "campaign":
      return CAMPAIGN[props.status];
    case "person":
      return PERSON[props.status];
    case "host":
      return HOST[props.status];
    case "agreement":
      return AGREEMENT[props.status];
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
