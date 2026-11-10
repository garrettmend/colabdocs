import mammoth from "mammoth";
import { marked } from "marked";
import { AppError } from "./errors";
import { sanitizeDocumentHtml } from "./sanitize";
import { DEFAULT_TITLE, TITLE_MAX } from "./documents";

/**
 * File import: turns an uploaded file into a new editable document.
 * Supported: .txt, .md/.markdown, .docx (max 2 MB). Images, tables and
 * styling beyond headings / lists / bold / italic / underline / links are
 * dropped, because the editor can't represent them.
 */

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.join(",");

type Kind = "text" | "markdown" | "docx";

function kindFor(filename: string): Kind | null {
  const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (ext === ".txt") return "text";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".docx") return "docx";
  return null;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text → paragraphs (blank line) and line breaks (single newline). */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("");
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return (base || DEFAULT_TITLE).slice(0, TITLE_MAX);
}

function decodeEntities(text: string) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new AppError(422, "unreadable_file", "This file isn't valid UTF-8 text.");
  }
}

export async function convertFileToDocument(
  filename: string,
  bytes: Uint8Array,
): Promise<{ title: string; content: string }> {
  const kind = kindFor(filename);
  if (!kind) {
    throw new AppError(415, "unsupported_type", `Unsupported file type. Use ${IMPORT_EXTENSIONS.join(", ")}.`);
  }
  if (bytes.byteLength === 0) throw new AppError(422, "empty_file", "This file is empty.");
  if (bytes.byteLength > IMPORT_MAX_BYTES) {
    throw new AppError(413, "file_too_large", "Files must be 2 MB or smaller.");
  }

  let html: string;
  if (kind === "text") {
    html = textToHtml(decodeUtf8(bytes));
  } else if (kind === "markdown") {
    html = await marked.parse(decodeUtf8(bytes), { gfm: true, breaks: false });
  } else {
    // .docx is a zip archive; check the signature before handing it to the parser.
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new AppError(422, "unreadable_file", "This doesn't look like a valid .docx file.");
    }
    try {
      const result = await mammoth.convertToHtml(
        { buffer: Buffer.from(bytes) },
        { styleMap: ["u => u", "strike => s"] }, // mammoth drops these by default
      );
      html = result.value;
    } catch {
      throw new AppError(422, "unreadable_file", "We couldn't read this .docx file.");
    }
  }

  const content = sanitizeDocumentHtml(html);
  if (!content) throw new AppError(422, "empty_file", "No readable text was found in this file.");

  // Prefer a leading "# Heading" as the title; fall back to the filename.
  const h1 = content.match(/^<h1>([^<]{1,200})<\/h1>/)?.[1]?.trim();
  return { title: h1 ? decodeEntities(h1) : titleFromFilename(filename), content };
}
