import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { convertFileToDocument, IMPORT_MAX_BYTES } from "@/lib/importers";
import { signSession, verifySession } from "@/lib/session";
import { resolveDatabaseUrl } from "@/lib/db";
import { expectAppError } from "./helpers";

const bytes = (s: string) => new TextEncoder().encode(s);

async function makeDocx(bodyXml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("file import", () => {
  it("converts Markdown to editable rich text, titled by its first heading", async () => {
    const md = "# Launch plan\n\nShip **fast** and _safely_.\n\n- one\n- two\n\n<script>alert(1)</script>";
    const { title, content } = await convertFileToDocument("draft_v2.md", bytes(md));
    expect(title).toBe("Launch plan");
    expect(content).toContain("<h1>Launch plan</h1>");
    expect(content).toContain("<strong>fast</strong>");
    expect(content).toContain("<em>safely</em>");
    expect(content).toMatch(/<ul>\s*<li>one<\/li>/);
    expect(content).not.toContain("script");
  });

  it("converts plain text into paragraphs and escapes markup", async () => {
    const { title, content } = await convertFileToDocument("team_notes.txt", bytes("Line one\nline two\n\n<b>not bold</b>"));
    expect(title).toBe("team notes"); // no heading → named after the file
    expect(content).toBe("<p>Line one<br />line two</p><p>&lt;b&gt;not bold&lt;/b&gt;</p>");
  });

  it("converts .docx, keeping bold, italic and underline", async () => {
    const docx = await makeDocx(
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold intro</w:t></w:r><w:r><w:t xml:space="preserve"> then plain</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Italic line</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Underlined</w:t></w:r></w:p>`,
    );
    const { title, content } = await convertFileToDocument("Brief.docx", docx);
    expect(title).toBe("Brief");
    expect(content).toContain("<strong>Bold intro</strong> then plain");
    expect(content).toContain("<em>Italic line</em>");
    expect(content).toContain("<u>Underlined</u>");
  });

  it("rejects unsupported, empty, oversized and corrupt files", async () => {
    await expectAppError(convertFileToDocument("photo.png", bytes("x")), 415);
    await expectAppError(convertFileToDocument("empty.md", new Uint8Array()), 422);
    await expectAppError(convertFileToDocument("big.txt", new Uint8Array(IMPORT_MAX_BYTES + 1).fill(97)), 413);
    await expectAppError(convertFileToDocument("fake.docx", bytes("not a zip")), 422);
    await expectAppError(convertFileToDocument("bin.txt", new Uint8Array([0xff, 0xfe, 0xfd])), 422);
  });
});

describe("database location", () => {
  const prod = { NODE_ENV: "production" } as const;

  it("prefers DATABASE_URL, then a Railway volume, then a local file in dev", () => {
    expect(resolveDatabaseUrl({ ...prod, DATABASE_URL: "libsql://x.turso.io", RAILWAY_VOLUME_MOUNT_PATH: "/data" })).toBe(
      "libsql://x.turso.io",
    );
    expect(resolveDatabaseUrl({ ...prod, RAILWAY_VOLUME_MOUNT_PATH: "/data/" })).toBe("file:/data/colabdocs.db");
    expect(resolveDatabaseUrl({ NODE_ENV: "development" })).toBe("file:local.db");
  });

  it("refuses to fall back to the container disk in production", () => {
    expect(() => resolveDatabaseUrl({ ...prod })).toThrow(/No database configured/);
  });
});

describe("session cookie", () => {
  it("round-trips a signed user id and rejects tampering", () => {
    const token = signSession("u_alice");
    expect(verifySession(token)).toBe("u_alice");

    const forged = token.replace("u_alice", "u_bob");
    expect(verifySession(forged)).toBeNull();
    expect(verifySession("u_bob")).toBeNull();
    expect(verifySession(undefined)).toBeNull();
  });
});
