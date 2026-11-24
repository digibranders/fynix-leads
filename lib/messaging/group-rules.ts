/** Said under every group picker, and again when a group is refused for mixing sides. */
export const GROUP_RULE_TEXT = "A group is Fynix plus one client, or one coordinator with its agencies.";

/**
 * The database refuses a group that would hold more than one side with a plain sentence of its own. This finds it anywhere in an error's cause chain and
 * answers in the words a person reads, or null for any other error.
 */
export function groupRefusalMessage(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 10; current = current.cause, depth += 1) {
    if (current.message.includes("A group holds Fynix and one side only")) return `Those people cannot be in one group. ${GROUP_RULE_TEXT}`;
  }
  return null;
}
