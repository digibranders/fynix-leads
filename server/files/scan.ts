import "server-only";
import { connect } from "node:net";

/**
 * Malware scan on upload (spec 11), through a ClamAV daemon (clamd) when CLAMAV_HOST is set. With no scanner configured the upload
 * is refused in production, so a missing scanner can never let files through unchecked; in development it is allowed and logged once.
 */
export type ScanResult = { readonly status: "clean" } | { readonly status: "infected"; readonly signature: string } | { readonly status: "skipped" };

let warned = false;

export async function scanUpload(bytes: Uint8Array): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (host === undefined || host === "") {
    if (process.env.NODE_ENV === "production") throw new Error("File uploads are switched off until a malware scanner is configured (CLAMAV_HOST).");
    if (!warned) {
      warned = true;
      console.warn("Uploads are not scanned: CLAMAV_HOST is not set (allowed in development only).");
    }
    return { status: "skipped" };
  }
  const port = Number(process.env.CLAMAV_PORT ?? "3310");
  return new Promise<ScanResult>((resolve, reject) => {
    const socket = connect({ host, port });
    let reply = "";
    socket.setTimeout(30_000, () => {
      socket.destroy();
      reject(new Error("The malware scanner did not answer in time."));
    });
    socket.on("error", (error) => reject(new Error(`The malware scanner could not be reached (${error.message}).`)));
    socket.on("data", (chunk) => {
      reply += chunk.toString("utf8");
    });
    socket.on("close", () => {
      const text = reply.replace(/\0/g, "").trim();
      if (text.endsWith("OK")) resolve({ status: "clean" });
      else if (text.endsWith("FOUND")) resolve({ status: "infected", signature: text.replace(/^stream:\s*/, "").replace(/\s*FOUND$/, "") });
      else reject(new Error("The malware scanner gave an answer that could not be read."));
    });
    socket.write("zINSTREAM\0");
    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const part = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      const size = Buffer.alloc(4);
      size.writeUInt32BE(part.length);
      socket.write(size);
      socket.write(part);
    }
    socket.write(Buffer.alloc(4));
  });
}
