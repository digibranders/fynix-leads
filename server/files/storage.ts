import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Private file storage: a directory outside the web root (UPLOAD_DIR, default `.data/uploads`), one file per upload under a random
 * key, never served directly. The only way to read a file is through the download route, which checks the conversation first.
 */
function root(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), ".data", "uploads");
}

const KEY = /^[0-9a-f]{40}$/;

function pathFor(key: string): string {
  if (!KEY.test(key)) throw new Error("That is not a storage key");
  return join(root(), key.slice(0, 2), key);
}

export async function saveUpload(bytes: Uint8Array): Promise<string> {
  const key = randomBytes(20).toString("hex");
  const path = pathFor(key);
  await mkdir(join(root(), key.slice(0, 2)), { recursive: true, mode: 0o700 });
  await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
  return key;
}

export async function readUpload(key: string): Promise<Buffer> {
  return readFile(pathFor(key));
}

export async function deleteUpload(key: string): Promise<void> {
  await rm(pathFor(key), { force: true });
}
