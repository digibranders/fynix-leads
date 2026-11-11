import type { ThreadMessage } from "@/lib/domain/types";

export type ThreadSide = ThreadMessage["side"];

/** Who wrote the final message, or null when nobody has written yet. */
export function lastMessageSide(thread: readonly { side: ThreadSide }[]): ThreadSide | null {
  return thread.length === 0 ? null : thread[thread.length - 1].side;
}

/** The state of an open clarification: a question still waiting for Fynix, or an answer waiting for the client. */
export function clarificationState(thread: readonly { side: ThreadSide }[]): "awaiting_reply" | "reply_received" {
  return lastMessageSide(thread) === "fynix" ? "reply_received" : "awaiting_reply";
}
