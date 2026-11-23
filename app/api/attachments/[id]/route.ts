import { getSessionContext } from "@/server/auth";
import { ALLOWED_TYPES } from "@/lib/files/rules";
import { getDatabase } from "@/server/db/client";
import { getAttachmentLocation } from "@/server/domain/attachments";
import type { MessagingActor } from "@/server/domain/messaging";
import { readUpload } from "@/server/files/storage";

/**
 * Serves one message attachment, only to a signed-in member of the conversation it was sent in. Anyone else, and any id that does
 * not exist, gets the same plain 404. Files are always downloads, except images, which may be shown inline when asked for.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();
  const session = await getSessionContext();
  if (session === null) return notFound();

  const role = session.kind === "client" ? "leads_client" : session.kind === "agency" ? "leads_agency" : "leads_fynix";
  const actor: MessagingActor = {
    userId: session.userId,
    orgId: session.kind === "fynix" ? null : session.orgId,
    orgKind: session.kind,
    role: session.memberRole,
    displayName: session.name,
  };
  const location = await getAttachmentLocation(getDatabase(role).db, actor, id);
  if (location === null) return notFound();

  const allowed = ALLOWED_TYPES.find((type) => type.contentType === location.contentType);
  if (allowed === undefined) return notFound();
  let bytes: Buffer;
  try {
    bytes = await readUpload(location.storageKey);
  } catch {
    return notFound();
  }
  const inline = allowed.inline && new URL(request.url).searchParams.get("inline") === "1";
  const asciiName = location.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": location.contentType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(location.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
