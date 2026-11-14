const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const TOTAL_CHARS = 10;

/**
 * Generates a Google Meet URL formatted as https://meet.google.com/xxx-yyyy-zzz
 * where x, y, z are lowercase alphabetic characters [a-z].
 */
export function generateGoogleMeetUrl(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(TOTAL_CHARS);
  if (bytes.length < TOTAL_CHARS) {
    throw new RangeError(`The random source returned ${bytes.length} bytes, ${TOTAL_CHARS} are needed`);
  }
  let chars = "";
  for (let i = 0; i < TOTAL_CHARS; i += 1) {
    chars += ALPHABET.charAt((bytes[i] ?? 0) % 26);
  }
  const part1 = chars.slice(0, 3);
  const part2 = chars.slice(3, 7);
  const part3 = chars.slice(7, 10);
  return `https://meet.google.com/${part1}-${part2}-${part3}`;
}

const MEET_URL_PATTERN = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/**
 * Validates whether a URL matches the Google Meet format: https://meet.google.com/xxx-yyyy-zzz
 */
export function isValidGoogleMeetUrl(url: string): boolean {
  return MEET_URL_PATTERN.test(url);
}
