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

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "text-muted-foreground",
  pending: "bg-tone-pending-surface text-tone-pending border-tone-pending-border",
  approved: "bg-tone-approved-surface text-tone-approved border-tone-approved-border",
  rejected: "bg-tone-rejected-surface text-tone-rejected border-tone-rejected-border",
  clarify: "bg-tone-clarify-surface text-tone-clarify border-tone-clarify-border",
  problem: "text-tone-problem",
};

type Props =
  | { kind: "approval"; status: ApprovalStatus; className?: string }
  | { kind: "meeting"; status: MeetingStatus; className?: string };

export function StatusBadge(props: Props) {
  const isApproval = props.kind === "approval";
  const tone = isApproval ? approvalTone(props.status) : meetingTone(props.status);
  const label = isApproval ? approvalLabel(props.status) : meetingLabel(props.status);
  const Glyph = isApproval ? APPROVAL_ICON[props.status] : MEETING_ICON[props.status];
  // Approval chips are filled; meeting status is quiet text so the two never compete for colour.
  const chip = isApproval && tone !== "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-table font-medium",
        chip && "h-6 rounded-md border px-2",
        TONE_CLASS[tone],
        props.className,
      )}
    >
      <Glyph aria-hidden size={14} weight={chip ? "fill" : "regular"} />
      {label}
    </span>
  );
}
