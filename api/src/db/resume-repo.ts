import { sql } from "./client.js";
import { ok, err, type Result } from "../lib/result.js";
import type { ResumeStatus } from "../schemas/resume.js";

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : (value as string);
}

export async function getResumeStatus(): Promise<Result<ResumeStatus>> {
  try {
    const rows = await sql`select filename, updated_at from resume where id = 1`;
    if (!rows[0]) {
      return ok({ filename: null, updatedAt: null });
    }
    return ok({
      filename: rows[0].filename as string,
      updatedAt: toIsoString(rows[0].updated_at),
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Only ever read server-side by the AI endpoints (/fit-score,
 * /fit-score-all) — never returned in an API response body. GET
 * /resume exposes getResumeStatus instead, which deliberately omits
 * content.
 */
export async function getResumeContent(): Promise<Result<string | null>> {
  try {
    const rows = await sql`select content from resume where id = 1`;
    return ok(rows[0] ? (rows[0].content as string) : null);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Upserts the singleton row (id = 1) — there is ever only one resume. */
export async function upsertResume(filename: string, content: string): Promise<Result<ResumeStatus>> {
  try {
    const rows = await sql`
      insert into resume (id, filename, content)
      values (1, ${filename}, ${content})
      on conflict (id) do update
        set filename = excluded.filename, content = excluded.content, updated_at = now()
      returning filename, updated_at
    `;
    const row = rows[0]!;
    return ok({
      filename: row.filename as string,
      updatedAt: toIsoString(row.updated_at),
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
