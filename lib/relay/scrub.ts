export type ScrubResult = { text: string; removed: number };

const REMOVED = "[removed]";

// One pass, leftmost match wins, so an email inside a url (or a url-like domain inside an email) is one removal.
const URL = String.raw`(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)?linkedin\.com\/)[^\s<>"]*[^\s<>".,;:!?)\]']`;
const EMAIL = String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+`;
// Starts with +, 0 or ( so that money, years and counts such as "1,200" or "2026 2027" are not read as numbers.
const PHONE = String.raw`(?<![\w])[+(0][  \d().-]{7,}\d(?![\w])`;

const CONTACT = new RegExp(`${URL}|${EMAIL}|${PHONE}`, "gi");

const MIN_PHONE_DIGITS = 9;

function digitCount(s: string): number {
  return s.replace(/\D/g, "").length;
}

/**
 * Spec section 5: relayed text has email addresses, phone numbers and urls replaced with "[removed]".
 *
 * shortcut: pattern matching only. It misses spelled-out details ("jane at company dot com"), bare domains
 * without www (example.co.uk), and numbers with no leading +, 0 or bracket (such as 98765 43210). It can also
 * remove a long number that is not a phone number, and two numbers separated only by a space count as one. Upgrade by adding a Fynix review step before relay.
 */
export function scrubContactDetails(input: string): ScrubResult {
  let removed = 0;
  const text = input.replace(CONTACT, (match) => {
    const isPhoneShaped = /^[+(0]/.test(match) && !/[@/]|www\./i.test(match);
    if (isPhoneShaped) {
      const digits = digitCount(match);
      if (digits < MIN_PHONE_DIGITS) return match;
    }
    removed += 1;
    return REMOVED;
  });
  return { text, removed };
}
