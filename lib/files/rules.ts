/**
 * What a message attachment may be (spec 11): PDF, Word, Excel, PNG and JPG, up to 10 MB each, at most 5 to a message. The type is
 * decided by the file's first bytes, never by its name or the type the browser claims, so a renamed program does not pass.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export type AttachmentKind = "document" | "spreadsheet" | "image";

export interface AllowedType {
  readonly contentType: string;
  readonly kind: AttachmentKind;
  readonly extensions: readonly string[];
  /** Whether a browser may show it inline (an image). Everything else is always a download. */
  readonly inline: boolean;
}

export const ALLOWED_TYPES: readonly AllowedType[] = [
  { contentType: "application/pdf", kind: "document", extensions: ["pdf"], inline: false },
  { contentType: "application/msword", kind: "document", extensions: ["doc"], inline: false },
  { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document", extensions: ["docx"], inline: false },
  { contentType: "application/vnd.ms-excel", kind: "spreadsheet", extensions: ["xls"], inline: false },
  { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "spreadsheet", extensions: ["xlsx"], inline: false },
  { contentType: "image/png", kind: "image", extensions: ["png"], inline: true },
  { contentType: "image/jpeg", kind: "image", extensions: ["jpg", "jpeg"], inline: true },
];

/** What each entry of the attach menu offers the file picker. */
export const ATTACH_MENU: readonly { readonly kind: AttachmentKind; readonly label: string; readonly hint: string; readonly accept: string }[] = [
  { kind: "document", label: "Document", hint: "PDF or Word", accept: ".pdf,.doc,.docx" },
  { kind: "spreadsheet", label: "Spreadsheet", hint: "Excel", accept: ".xls,.xlsx" },
  { kind: "image", label: "Image", hint: "PNG or JPG", accept: ".png,.jpg,.jpeg" },
];

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

/** The content type the first bytes say the file is, among the allowed ones, or null. Word and Excel share a signature with other zip files, so the extension picks between them. */
export function sniffContentType(head: Uint8Array, extension: string): string | null {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return null;
  }
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    if (extension === "doc") return "application/msword";
    if (extension === "xls") return "application/vnd.ms-excel";
    return null;
  }
  return null;
}

export type UploadCheck = { readonly ok: true; readonly contentType: string } | { readonly ok: false; readonly reason: string };

/** The size part of the check, on the size the browser reports, so a file that is too big is refused before it is read into memory. */
export function checkUploadSize(file: { readonly name: string; readonly size: number }): string | null {
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is larger than 10 MB.`;
  return null;
}

/** Checks one file before anything is stored. `head` is at least the first 8 bytes. */
export function checkUpload(file: { readonly name: string; readonly size: number }, head: Uint8Array): UploadCheck {
  const sizeProblem = checkUploadSize(file);
  if (sizeProblem !== null) return { ok: false, reason: sizeProblem };
  const extension = extensionOf(file.name);
  const allowed = ALLOWED_TYPES.find((type) => type.extensions.includes(extension));
  if (allowed === undefined) return { ok: false, reason: `${file.name} is not a PDF, Word, Excel, PNG or JPG file.` };
  const sniffed = sniffContentType(head, extension);
  if (sniffed === null || sniffed !== allowed.contentType) return { ok: false, reason: `${file.name} does not look like a real ${extension.toUpperCase()} file.` };
  return { ok: true, contentType: allowed.contentType };
}

/** A name safe to store and show: no path parts or control characters, at most 180 characters, with a usable fallback. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
  const shortened = cleaned.length > 180 ? `${cleaned.slice(0, 170)}${cleaned.slice(cleaned.lastIndexOf("."))}`.slice(0, 180) : cleaned;
  return shortened === "" ? "file" : shortened;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
