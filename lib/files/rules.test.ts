import { describe, expect, it } from "vitest";
import { checkUpload, cleanFileName, formatBytes, MAX_ATTACHMENT_BYTES, sniffContentType } from "./rules";

const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const OLE = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0]);

describe("checkUpload", () => {
  it("accepts a real file of each allowed kind", () => {
    expect(checkUpload({ name: "a.pdf", size: 10 }, PDF)).toEqual({ ok: true, contentType: "application/pdf" });
    expect(checkUpload({ name: "a.png", size: 10 }, PNG)).toMatchObject({ ok: true, contentType: "image/png" });
    expect(checkUpload({ name: "a.JPG", size: 10 }, JPG)).toMatchObject({ ok: true, contentType: "image/jpeg" });
    expect(checkUpload({ name: "a.docx", size: 10 }, ZIP)).toMatchObject({ ok: true });
    expect(checkUpload({ name: "a.xlsx", size: 10 }, ZIP)).toMatchObject({ ok: true });
    expect(checkUpload({ name: "a.doc", size: 10 }, OLE)).toMatchObject({ ok: true, contentType: "application/msword" });
    expect(checkUpload({ name: "a.xls", size: 10 }, OLE)).toMatchObject({ ok: true, contentType: "application/vnd.ms-excel" });
  });

  it("refuses a program renamed to look like a document", () => {
    expect(checkUpload({ name: "invoice.pdf", size: 10 }, EXE).ok).toBe(false);
    expect(checkUpload({ name: "photo.png", size: 10 }, PDF).ok).toBe(false);
  });

  it("refuses a zip that is not named as an Office file, and types that are not allowed at all", () => {
    expect(checkUpload({ name: "a.zip", size: 10 }, ZIP).ok).toBe(false);
    expect(checkUpload({ name: "a.svg", size: 10 }, PDF).ok).toBe(false);
    expect(checkUpload({ name: "a.html", size: 10 }, PDF).ok).toBe(false);
  });

  it("refuses empty files and files over 10 MB", () => {
    expect(checkUpload({ name: "a.pdf", size: 0 }, PDF).ok).toBe(false);
    expect(checkUpload({ name: "a.pdf", size: MAX_ATTACHMENT_BYTES + 1 }, PDF).ok).toBe(false);
    expect(checkUpload({ name: "a.pdf", size: MAX_ATTACHMENT_BYTES }, PDF).ok).toBe(true);
  });
});

describe("sniffContentType, cleanFileName and formatBytes", () => {
  it("sniffs from the first bytes only", () => {
    expect(sniffContentType(EXE, "pdf")).toBeNull();
  });

  it("strips path parts and control characters from a name", () => {
    expect(cleanFileName("..\\..\\secret/report.pdf")).toBe("report.pdf");
    expect(cleanFileName("a\u0000b\u001f.pdf")).toBe("ab.pdf");
    expect(cleanFileName("   ")).toBe("file");
  });

  it("writes sizes people can read", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
