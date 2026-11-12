import { createHash } from "node:crypto";
import type { RandomBytes } from "@/lib/domain/public-ref";

/** 32 random bytes, 256 bits: unguessable, and never stored. */
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface InviteToken {
  /** What goes in the link. Shown to nobody but the invitee, kept nowhere but the outbox row until it is sent. */
  readonly token: string;
  /** What is stored: the SHA-256 of the token as base64url, 43 characters (the `invite_token_hash_format` constraint). */
  readonly tokenHash: string;
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function generateInviteToken(randomBytes: RandomBytes): InviteToken {
  const bytes = randomBytes(TOKEN_BYTES);
  if (bytes.length < TOKEN_BYTES) throw new RangeError(`The random source returned ${bytes.length} bytes, ${TOKEN_BYTES} are needed`);
  const token = Buffer.from(bytes.subarray(0, TOKEN_BYTES)).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

/** True for text shaped like a token (43 base64url characters). Checked before any lookup so a malformed value never reaches the database. */
export function isWellFormedInviteToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}
