import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Encrypts what the portal keeps of a connection: the refresh token, with AES-256-GCM. The key is `CALENDAR_TOKEN_KEY` (32 bytes) and lives in the environment,
 * never in the database. A stored value reads `v1.<iv>.<tag>.<ciphertext>` in base64url; the `v1` is the key version, so a later key can be introduced without
 * breaking what is stored. Access tokens are never stored at all.
 */
const VERSION = "v1";

/** The 32 key bytes, from base64 or base64url. Throws naming the variable, never its value. */
export function tokenKey(source: string | undefined): Buffer {
  if (source === undefined || source === "") throw new Error("CALENDAR_TOKEN_KEY must be set");
  const key = Buffer.from(source, "base64url");
  if (key.length !== 32) throw new Error("CALENDAR_TOKEN_KEY must be 32 bytes");
  return key;
}

export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** Throws when the value is not ours, was changed, or was made with another key. */
export function decryptToken(stored: string, key: Buffer): string {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== VERSION || iv === undefined || tag === undefined || body === undefined) throw new Error("A stored calendar token has an unknown form");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/** A PKCE pair: a random verifier and its S256 challenge. */
export function pkcePair(): { readonly verifier: string; readonly challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

const sign = (payload: string, key: Buffer): string => createHmac("sha256", key).update(`calendar-state:${payload}`).digest("base64url");

/** A value that carries its own proof it was made here: `<payload>.<signature>`. */
export function signValue(payload: object, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

/** The payload when the signature holds, otherwise null. */
export function verifyValue(value: string, key: Buffer): unknown {
  const [body, signature] = value.split(".");
  if (body === undefined || signature === undefined) return null;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
