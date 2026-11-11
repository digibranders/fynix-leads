import { scrubContactDetails, type ScrubResult } from "./scrub";

/**
 * The one way text crosses between the client and the agency (reject notes, clarification questions, replies).
 * Trims, then scrubs contact details. The returned text is normalised (see `scrubContactDetails`). Every producer of relayed text calls this.
 */
export function relayText(input: string): ScrubResult {
  const { text, removed } = scrubContactDetails(input.trim());
  return { text: text.trim(), removed };
}
