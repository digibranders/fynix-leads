import { sql } from "drizzle-orm";
import type { Database } from "@/server/db/pool";
import { DomainError } from "@/server/domain/errors";
import { withActorScope, type MessagingActor } from "@/server/domain/messaging";

export interface AttachmentRecord {
  readonly id: string;
  readonly messageId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface AttachmentLocation {
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
}

/** Records a stored file against the caller's own message. The database checks the message is theirs and the conversation is theirs (migration 0050). */
export async function addMessageAttachment(
  db: Database,
  actor: MessagingActor,
  input: { readonly messageId: string; readonly fileName: string; readonly contentType: string; readonly sizeBytes: number; readonly storageKey: string },
): Promise<string> {
  return withActorScope(db, actor, async (tx) => {
    const result = await tx.execute<{ id: string }>(
      sql`select public.app_add_message_attachment(${input.messageId}::uuid, ${input.fileName}, ${input.contentType}, ${input.sizeBytes}::integer, ${input.storageKey}) as id`,
    );
    const id = result.rows[0]?.id;
    if (id === undefined) throw new DomainError("not-authorised", "The file could not be attached to that message.");
    return id;
  });
}

/** Every attachment in a conversation the caller belongs to; nothing for anyone else. */
export async function listConversationAttachments(db: Database, actor: MessagingActor, conversationId: string): Promise<readonly AttachmentRecord[]> {
  return withActorScope(db, actor, async (tx) => {
    const result = await tx.execute<{ id: string; message_id: string; file_name: string; content_type: string; size_bytes: number }>(
      sql`select id, message_id, file_name, content_type, size_bytes from public.app_list_message_attachments(${conversationId}::uuid)`,
    );
    return result.rows.map((row) => ({ id: row.id, messageId: row.message_id, fileName: row.file_name, contentType: row.content_type, sizeBytes: row.size_bytes }));
  });
}

/** Where a file is stored, for a caller who belongs to its conversation. Null for anyone else, and for an id that does not exist. */
export async function getAttachmentLocation(db: Database, actor: MessagingActor, attachmentId: string): Promise<AttachmentLocation | null> {
  return withActorScope(db, actor, async (tx) => {
    const result = await tx.execute<{ storage_key: string; file_name: string; content_type: string }>(
      sql`select storage_key, file_name, content_type from public.app_message_attachment_location(${attachmentId}::uuid)`,
    );
    const row = result.rows[0];
    return row === undefined ? null : { storageKey: row.storage_key, fileName: row.file_name, contentType: row.content_type };
  });
}
