export type ScrubResult = { text: string; removed: number };

const REMOVED = "[removed]";

// Top level domains a bare domain must end in. Short on purpose: a longer list turns ordinary words into domains.
const TLDS = [
  "com", "net", "org", "info", "biz", "edu", "gov", "int", "io", "co", "ai", "app", "dev", "xyz", "online", "site", "tech", "cloud",
  "agency", "digital", "email", "asia", "eu", "me", "tv", "ly", "gl", "to", "cc", "ws", "vc", "fm", "sh", "gg", "is", "it", "in", "ac",
  "uk", "us", "ca", "au", "nz", "ie", "de", "fr", "es", "nl", "be", "ch", "at", "se", "no", "dk", "fi", "pl", "pt", "cz", "sk", "hu",
  "ro", "bg", "gr", "tr", "ru", "ua", "il", "ae", "sa", "qa", "eg", "ng", "ke", "za", "gh", "pk", "bd", "lk", "np", "sg", "my", "id",
  "th", "vn", "ph", "hk", "tw", "cn", "jp", "kr", "br", "mx", "ar", "cl", "pe", "lt", "lv", "ee", "si", "hr", "rs", "lu", "mt", "cy",
].sort((a, b) => b.length - a.length);
const TLD = TLDS.join("|");

// Endings that are also everyday words. They only count in lower case, so "Thanks.No rush" is not a domain.
const WORDY_TLDS = new Set(["it", "in", "is", "at", "be", "to", "us", "me", "no", "my", "id", "email", "online", "site", "tech", "cloud", "digital", "agency", "info", "app", "dev"]);
const isDomainTld = (tld: string): boolean => !WORDY_TLDS.has(tld.toLowerCase()) || tld === tld.toLowerCase();

const WORD = String.raw`\p{L}\p{M}\p{N}`;
// The last character of a url or path may not be punctuation that ends a sentence.
const TAIL = String.raw`[^\s<>"]*[^\s<>".,;:!?)\]']`;
const SCHEME = String.raw`(?:h(?:tt|xx)ps?|ftp)`;

// One pass, leftmost match wins, so an email inside a url (or a url-like domain inside an email) is one removal.
const URL_SCHEME = String.raw`${SCHEME}:\s*\/\/\s*${TAIL}|${SCHEME}:\s*(?=[^\s<>"]*\.\p{L})${TAIL}`;
const URL_WWW = String.raw`www\.${TAIL}`;
const EMAIL = String.raw`[${WORD}._%+-]+@[${WORD}-]+(?:\.[${WORD}-]+)+`;
const BARE_DOMAIN = String.raw`(?<![${WORD}_@])(?:[\p{L}\p{N}](?:[${WORD}-]*[${WORD}])?\.)+(?<tld>${TLD})(?![${WORD}-])(?::\d{2,5})?(?:[/?#](?:${TAIL})?)?`;
const HANDLE = String.raw`(?<![${WORD}_@.])@[\p{L}_][\p{L}\p{N}_.]*[\p{L}\p{N}_]`;
const MESSENGER = String.raw`(?<=\b(?:skype|telegram|wechat|discord|snapchat)\b\s*(?:id|name|handle|username)?\s*[:=]\s*)[^\s,;]*[^\s,;.!?]`;
// Digit groups joined by one space, tab, newline, dot or dash, or by a closing bracket. Plain numbers, money and counts have no such joins.
const PHONE_SEP = String.raw`(?:\r?\n|[ \t.\-]|(?<=\)))`;
const PHONE_GROUP = String.raw`\(?\d+\)?`;
const PHONE_EXT = String.raw`\s*(?:ext(?:ension)?\.?\s*\d{1,6}|x\d{1,6})`;
const PHONE = String.raw`(?<![\p{L}\p{N}])(?<core>[+(]{0,2}\d+\)?(?:${PHONE_SEP}${PHONE_GROUP})*)(?![\p{L}\p{N}]|:\d)(?<ext>${PHONE_EXT})?`;

const CONTACT = new RegExp([URL_SCHEME, URL_WWW, EMAIL, BARE_DOMAIN, HANDLE, MESSENGER, PHONE].map((p) => `(?:${p})`).join("|"), "giu");

const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 15;
const ISO_DATE_START = /^\d{4}-\d{2}-\d{2}/;
const DECIMAL = /^\d+\.\d+$/;

const isYear = (group: string): boolean => /^(?:19|20)\d{2}$/.test(group);

function isPhone(core: string): boolean {
  const digits = core.replace(/\D/g, "").length;
  if (digits < MIN_PHONE_DIGITS || digits > MAX_PHONE_DIGITS) return false;
  if (ISO_DATE_START.test(core) || DECIMAL.test(core)) return false;
  const groups = core.match(/\d+/g) ?? [];
  const first = groups[0] ?? "";
  if (groups.every(isYear)) return false;
  const plus = /^\D*\+/.test(core);
  // A leading 0 counts from two digits on ("020", "07700"), so "0.45 0.60 0.75 0.80" is not a number.
  const zeroLead = first.length >= 2 && first.startsWith("0");
  return plus || zeroLead || groups.some((g) => g.length >= 3);
}

function asciiDigit(char: string): string {
  // Decimal digits sit in contiguous blocks that start at zero, so walk back to the start of the block.
  const code = char.codePointAt(0) ?? 0;
  let start = code;
  while (/\p{Nd}/u.test(String.fromCodePoint(start - 1))) start -= 1;
  return String((code - start) % 10);
}

const DOT_WORD = new RegExp(String.raw`(?<=[${WORD}])\s*[\[({]\s*dot\s*[\])}]\s*(?=[${WORD}])`, "giu");
const AT_BRACKET = new RegExp(String.raw`\s*[\[({]\s*at\s*[\])}]\s*(?=[${WORD}-]+(?:\.|\s+dot\s+))`, "giu");
// Needs a spelled-out "dot": "details at example.com" is plain prose and the domain is caught on its own.
const AT_WORD = new RegExp(String.raw`(?<![${WORD}])([${WORD}._%+-]+)\s+at\s+((?:[${WORD}-]+(?:\.|\s+dot\s+))*[${WORD}-]+\s+dot\s+(${TLD}))(?![${WORD}-])`, "giu");

/** Writes "[at]", "(dot)", "jane at example dot com" and "%40" as a plain address, so one pattern finds it. */
function deobfuscate(text: string): string {
  return text
    .replace(/%40/gi, "@")
    .replace(DOT_WORD, ".")
    .replace(AT_BRACKET, "@")
    .replace(AT_WORD, (match: string, local: string, domain: string, tld: string) =>
      isDomainTld(tld) ? `${local}@${domain.replace(/\s+dot\s+/gi, ".")}` : match,
    );
}

/** The copy that is searched and relayed: NFKC, no format characters (zero-width and the like), ASCII digits, plain addresses. */
function normalise(input: string): string {
  const folded = input
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/(?![0-9])\p{Nd}/gu, asciiDigit);
  return deobfuscate(folded);
}

/**
 * Spec section 5: relayed text has email addresses, phone numbers, urls, domains and handles replaced with "[removed]".
 *
 * The returned text is normalised (NFKC, no zero-width or other format characters, ASCII digits, "[at]" and "%40" written
 * as "@"), so a relayed message can differ from what was typed in those ways. Detection runs on that copy, which closes
 * the fullwidth, zero-width and non-ASCII tricks. A phone needs 9 to 15 digits and a leading + or 0, or a group of 3 digits or more.
 *
 * shortcut: pattern matching only. Still not caught: spelled-out digits ("nine eight seven"), words such as "at gmail", a detail
 * split across two messages, a handle on a messenger other than Skype, Telegram, WeChat, Discord or Snapchat, and a bare domain
 * written "Example.Com" when its ending is also a word (".It", ".No"). Known over-matches: a bare run of 9 to 15 digits is read as
 * a phone (so an order number goes), as is a spaced amount such as "100 000 000". Upgrade by holding risky text for Fynix review
 * before it is relayed.
 */
export function scrubContactDetails(input: string): ScrubResult {
  let removed = 0;
  const text = normalise(input).replace(CONTACT, (match: string, ...rest: unknown[]) => {
    const groups = rest[rest.length - 1] as { core?: string; tld?: string };
    if (groups.core !== undefined && !isPhone(groups.core)) return match;
    if (groups.tld !== undefined && !isDomainTld(groups.tld)) return match;
    removed += 1;
    return REMOVED;
  });
  return { text, removed };
}
