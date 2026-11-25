/**
 * The one paragraph a Fynix admin may write for a campaign's confirmation letter to prospects (owner decision, 2026-11-25). The rules a prospect letter holds to
 * become rules on this text: no name of Fynix, of the coordinator or of an agency, and no address of any kind. Pure: used when the paragraph is saved and again
 * when the letter is rendered, so a paragraph that stops passing is left out and the default wording goes out.
 */
export const LETTER_OPENING_MAX = 600;

export interface LetterOpeningResult {
  readonly ok: boolean;
  /** One plain sentence per rule that failed. Empty when `ok`. */
  readonly problems: readonly string[];
}

/** One paragraph: runs of white space, line breaks included, become one space. */
export const tidyLetterOpening = (text: string): string => text.replace(/\s+/g, " ").trim();

// `name.tld`: a dot between a word and two or more letters, with no space after the dot. "time. We" and "e.g. on" do not match; "example.io" does.
const ADDRESS = /:\/\/|www\.|@|\b[a-z0-9-]{2,}\.[a-z]{2,}\b/i;
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

/**
 * A company's name as people say it: lower case, without its legal ending ("Brightpath Marketing Ltd" is "brightpath marketing"). A name that would be shorter
 * than three characters without the ending keeps it. `app_name_core` in the database is the same rule, and an integration test holds the two equal.
 */
const LEGAL_ENDING = /([\s,.]+(ltd|limited|llc|llp|inc|incorporated|plc|gmbh|pvt|private|pty|co|corp|corporation|company|bv|sa|ag|sarl|srl))+[\s.]*$/;
export function nameCore(name: string): string {
  const full = name.trim().toLowerCase();
  const core = full.replace(LEGAL_ENDING, "").trim();
  return core.length >= 3 ? core : full;
}

/** Checks a tidied paragraph. `forbiddenNames` are the organisations a prospect must never read of: the coordinator and the agencies of the campaign. */
export function checkLetterOpening(text: string, forbiddenNames: readonly string[] = []): LetterOpeningResult {
  const tidy = tidyLetterOpening(text);
  const lower = tidy.toLowerCase();
  const problems: string[] = [];
  if (tidy.length === 0) problems.push("Write the paragraph, or remove it to use the default wording.");
  if (tidy.length > LETTER_OPENING_MAX) problems.push(`Keep the paragraph to ${LETTER_OPENING_MAX} characters or fewer.`);
  if (ADDRESS.test(tidy)) problems.push("Take out the web or email address. A letter holds only the meeting link and the client's privacy page.");
  if (lower.includes("fynix")) problems.push("Take out the word Fynix. A prospect must never read it.");
  if (forbiddenNames.some((name) => name.trim() !== "" && lower.includes(nameCore(name)))) problems.push("Take out the name of the coordinator or agency. A prospect must never read it.");
  if (LONG_DASH.test(tidy)) problems.push("Use a comma or a full stop, not a long dash.");
  if (tidy.includes("!")) problems.push("Take out the exclamation mark.");
  return { ok: problems.length === 0, problems };
}
