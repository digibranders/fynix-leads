import type { Icon } from "@phosphor-icons/react";
import { CheckCircle, Info, Timer, WarningCircle } from "@phosphor-icons/react/dist/ssr";

const TONES = {
  red: { box: "bg-red-soft text-red-text", icon: WarningCircle, role: "alert" },
  amber: { box: "bg-amber-soft text-amber-text", icon: Timer, role: "alert" },
  green: { box: "bg-green-soft text-green-text", icon: CheckCircle, role: "status" },
  blue: { box: "bg-blue-soft text-blue-text", icon: Info, role: "status" },
} as const;

export type NoticeTone = keyof typeof TONES;

type Props = { tone: NoticeTone; id?: string; icon?: Icon; className?: string; children: React.ReactNode };

/** An icon and words on a soft fill, never an outline. Problems are announced at once (`alert`), information politely (`status`). */
export function Notice({ tone, id, icon, className = "", children }: Props) {
  const { box, icon: ToneIcon, role } = TONES[tone];
  const Glyph = icon ?? ToneIcon;
  return (
    <div id={id} role={role} className={`flex items-start gap-2.5 rounded-sm px-3.5 py-3 text-body font-medium ${box} ${className}`}>
      <Glyph aria-hidden size={18} className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}
