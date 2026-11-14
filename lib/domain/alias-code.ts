import { createHash } from "node:crypto";
import type { RandomBytes } from "@/lib/domain/public-ref";

export interface AliasVerificationCode {
  readonly code: string;
  readonly codeHash: string;
}

export function hashVerificationCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function generateVerificationCode(randomBytes: RandomBytes): AliasVerificationCode {
  const bytes = randomBytes(4);
  const num = (bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16) | (bytes[3]! << 24)) >>> 0;
  const code = (num % 1000000).toString().padStart(6, "0");
  return { code, codeHash: hashVerificationCode(code) };
}
