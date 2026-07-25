import { Hono } from "hono";
import { detectResumeFileType, extractResumeText } from "../lib/extract-resume-text.js";
import { getResumeStatus, upsertResume } from "../db/resume-repo.js";

// ~2MB cap per the Phase 4 spec's Guardrails — rejected before ever
// reaching the parsing libraries.
const MAX_RESUME_BYTES = 2 * 1024 * 1024;

export const resumeRoute = new Hono()
  .get("/", async (c) => {
    const result = await getResumeStatus();
    if (!result.ok) {
      return c.json({ error: "Failed to fetch resume status" }, 500);
    }
    return c.json(result.value);
  })

  .put("/", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return c.json({ error: "Expected a multipart upload with a 'file' field" }, 400);
    }

    if (file.size > MAX_RESUME_BYTES) {
      return c.json({ error: "File too large (max 2MB)" }, 400);
    }

    const fileType = detectResumeFileType(file.name, file.type);
    if (!fileType) {
      return c.json({ error: "Only PDF and DOCX files are supported" }, 400);
    }

    let content: string;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      content = await extractResumeText(buffer, fileType);
    } catch {
      return c.json({ error: "Couldn't read that file" }, 400);
    }

    const result = await upsertResume(file.name, content);
    if (!result.ok) {
      return c.json({ error: "Failed to save resume" }, 500);
    }
    return c.json(result.value);
  });
