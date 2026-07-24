import { describe, expect, test } from "bun:test";
import { detectResumeFileType, extractResumeText } from "./extract-resume-text";

describe("detectResumeFileType", () => {
  test("detects .pdf by extension regardless of MIME type", () => {
    expect(detectResumeFileType("resume.pdf", "application/octet-stream")).toBe("pdf");
  });

  test("detects .docx by extension regardless of MIME type", () => {
    expect(detectResumeFileType("resume.docx", "application/octet-stream")).toBe("docx");
  });

  test("falls back to MIME type when the extension doesn't match", () => {
    expect(detectResumeFileType("resume", "application/pdf")).toBe("pdf");
    expect(
      detectResumeFileType(
        "resume",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("docx");
  });

  test("rejects an unsupported file type", () => {
    expect(detectResumeFileType("resume.txt", "text/plain")).toBeNull();
  });
});

describe("extractResumeText", () => {
  test("rejects a corrupt/unreadable PDF", async () => {
    const garbage = Buffer.from("this is not a real PDF file");
    await expect(extractResumeText(garbage, "pdf")).rejects.toThrow();
  });

  test("rejects a corrupt/unreadable DOCX", async () => {
    const garbage = Buffer.from("this is not a real DOCX file");
    await expect(extractResumeText(garbage, "docx")).rejects.toThrow();
  });
});
