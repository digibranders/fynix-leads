/**
 * Public references: a prefix and four characters from Crockford's base-32 alphabet (digits and capitals without I, L, O
 * and U), for example `CMP-7Q2X`. They are the only names of organisations and campaigns that reach a screen, so they
 * must not be guessable in order and must not spell words by accident. The database check constraints
 * (`organisation_public_ref_format`, `campaign_public_ref_format`) accept exactly this alphabet.
 */
export const REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REF_LENGTH = 4;

export type RefPrefix = "ORG" | "CMP" | "ALI" | "LD" | "MTG" | "MSG";

/** Fills `count` bytes from a source of randomness. `crypto.getRandomValues` fits, and so does a fixed list in a test. */
export type RandomBytes = (count: number) => Uint8Array;

/**
 * One new reference. The alphabet has 32 characters and a byte has 256 values, so `byte & 31` picks each character with
 * the same probability: no modulo bias and no rejection loop.
 */
export function generatePublicRef(prefix: RefPrefix, randomBytes: RandomBytes): string {
  const bytes = randomBytes(REF_LENGTH);
  if (bytes.length < REF_LENGTH) throw new RangeError(`The random source returned ${bytes.length} bytes, ${REF_LENGTH} are needed`);
  let suffix = "";
  for (let index = 0; index < REF_LENGTH; index += 1) suffix += REF_ALPHABET.charAt((bytes[index] ?? 0) & 31);
  return `${prefix}-${suffix}`;
}

/** True for a reference in the shape the database accepts. */
export function isPublicRef(value: string, prefix: RefPrefix): boolean {
  return new RegExp(`^${prefix}-[${REF_ALPHABET}]{${REF_LENGTH}}$`).test(value);
}
