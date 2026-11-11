import type { ActivityEvent } from "@/lib/domain/types";

export type ActivityGlyph = "chat" | "paper-plane" | "calendar" | "check" | "cross" | "system";

/** `peach` is for events by the Fynix team, `navy` for the client's own events and for system lines. */
export type ActivityTone = "peach" | "navy";

const CLIENT_ACTOR = "Client";

/** Which glyph and disc tint an activity row gets. The caller maps the glyph to an icon component. */
export function activityIcon(event: Pick<ActivityEvent, "actor" | "kind" | "text">): { glyph: ActivityGlyph; tone: ActivityTone } {
  const tone: ActivityTone = event.actor === CLIENT_ACTOR || event.kind === "system" ? "navy" : "peach";
  if (event.kind === "system") return { glyph: "system", tone };
  if (event.text.startsWith("Submitted")) return { glyph: "paper-plane", tone };
  if (event.text.startsWith("Meeting")) return { glyph: "calendar", tone };
  if (event.text.startsWith("Approved")) return { glyph: "check", tone };
  if (event.text.startsWith("Rejected")) return { glyph: "cross", tone };
  return { glyph: "chat", tone };
}
