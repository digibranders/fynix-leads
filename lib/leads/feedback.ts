import type { ThreadSide } from "./thread";

/**
 * The second line of the agency's "Clarification requested" cell. Null when nobody has written in the thread yet:
 * claiming a reply that was never sent would be wrong.
 */
export function clarificationNote(lastSide: ThreadSide | null): string | null {
  if (lastSide === "client") return "Waiting on your reply";
  if (lastSide === "fynix") return "You replied";
  return null;
}
