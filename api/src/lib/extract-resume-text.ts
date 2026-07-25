import mammoth from "mammoth";

export type ResumeFileType = "pdf" | "docx";

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Resume uploads are identified by extension first, MIME type as a
 * fallback — browsers/clients are inconsistent about setting
 * `Content-Type` correctly on multipart file parts, but the filename
 * extension is reliably present.
 */
export function detectResumeFileType(filename: string, mimeType: string): ResumeFileType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".docx") || mimeType === DOCX_MIME_TYPE) return "docx";
  return null;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Dynamic import, not a top-level one: pdf-parse pulls in pdfjs-dist,
  // whose module-scope code unconditionally references the browser-only
  // DOMMatrix global as a fallback when its native canvas polyfill isn't
  // available. A top-level import would crash the entire app at cold
  // start on Node (no DOMMatrix), for every route, not just PDF uploads.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

/**
 * Throws on anything unreadable (corrupt file, password-protected PDF,
 * a DOCX with no extractable text) — the route layer maps that to a
 * 400 "Couldn't read that file" per the Phase 4 spec's error table,
 * not a 500, since an unreadable upload is a client input problem.
 */
export async function extractResumeText(buffer: Buffer, fileType: ResumeFileType): Promise<string> {
  const text = fileType === "pdf" ? await extractPdfText(buffer) : await extractDocxText(buffer);
  if (!text) {
    throw new Error("No extractable text found in file.");
  }
  return text;
}
