import {
  ArrowsClockwise,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  CheckCircle,
  Clock,
  Handshake,
  NotePencil,
  Prohibit,
  Question,
  UserMinus,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import {
  approvalLabel,
  approvalTone,
  meetingLabel,
  meetingTone,
  type ApprovalStatus,
  type MeetingStatus,
  type StatusTone,
} from "@/lib/domain/status";
import { cn } from "@/lib/utils";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const APPROVAL_ICON: Record<ApprovalStatus, Icon> = {
  draft: NotePencil,
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  needs_clarification: Question,
};

const MEETING_ICON: Record<MeetingStatus, Icon> = {
  proposed: CalendarPlus,
  scheduled: CalendarCheck,
  rescheduled: ArrowsClockwise,
  completed: Handshake,
  prospect_no_show: UserMinus,
  client_no_show: UserMinus,
  prospect_declined: CalendarX,
  cancelled: Prohibit,
};

const APPROVAL_VARIANT: Record<StatusTone, BadgeVariant> = {
  neutral: "quiet",
  pending: "amber",
  approved: "green",
  rejected: "red",
  clarify: "blue",
  problem: "red",
};

type Props =
  | { kind: "approval"; status: ApprovalStatus; size?: "sm" | "md" | "lg"; className?: string }
  | { kind: "meeting"; status: MeetingStatus; className?: string };

/** Approval is a soft chip (22px "sm" in tables, 26px "md" in panel headers, 30px "lg" on the lead record). Meeting status is quiet icon plus text; problems turn red. */
export function StatusBadge(props: Props) {
  if (props.kind === "approval") {
    const Glyph = APPROVAL_ICON[props.status];
    const small = props.size === "sm";
    return (
      <Badge
        variant={APPROVAL_VARIANT[approvalTone(props.status)]}
        size={small ? "sm" : props.size === "lg" ? "lg" : "default"}
        className={props.className}
      >
        <Glyph aria-hidden weight="fill" />
        {approvalLabel(props.status)}
      </Badge>
    );
  }
  const Glyph = MEETING_ICON[props.status];
  const problem = meetingTone(props.status) === "problem";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px] leading-[17px] whitespace-nowrap",
        problem ? "font-medium text-red-text" : "text-ink-2",
        props.className,
      )}
    >
      <Glyph aria-hidden size={16} weight="regular" className="shrink-0" />
      {meetingLabel(props.status)}
    </span>
  );
}
