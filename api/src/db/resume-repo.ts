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

export interface ResumeSnapshot {
  filename: string;
  content: string;
  updatedAt: string;
}

/** Reads content and its version from the same row snapshot for persisted scoring. */
export async function getResumeSnapshot(): Promise<Result<ResumeSnapshot | null>> {
  try {
    const rows = await sql`
      select filename, content, updated_at
      from resume
      where id = 1
    `;
    if (!rows[0]) return ok(null);
    return ok({
      filename: rows[0].filename as string,
      content: rows[0].content as string,
      updatedAt: toIsoString(rows[0].updated_at),
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Replaces the singleton resume and invalidates every score derived from the old version. */
export async function upsertResumeAndClearScores(
  filename: string,
  content: string,
): Promise<Result<ResumeStatus>> {
  try {
    const status = await sql.begin(async (trx) => {
      const rows = await trx`
        insert into resume (id, filename, content)
        values (1, ${filename}, ${content})
        on conflict (id) do update
          set filename = excluded.filename, content = excluded.content, updated_at = now()
        returning filename, updated_at
      `;
      await trx`
        update applications
        set fit_score = null,
            fit_rationale = null,
            fit_scored_at = null,
            fit_score_fingerprint = null
        where fit_score is not null
           or fit_rationale is not null
           or fit_scored_at is not null
           or fit_score_fingerprint is not null
      `;
      const row = rows[0]!;
      return {
        filename: row.filename as string,
        updatedAt: toIsoString(row.updated_at),
      };
    });
    return ok(status);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function deleteResumeAndClearScores(): Promise<Result<boolean>> {
  try {
    const removed = await sql.begin(async (trx) => {
      const rows = await trx`delete from resume where id = 1 returning id`;
      await trx`
        update applications
        set fit_score = null,
            fit_rationale = null,
            fit_scored_at = null,
            fit_score_fingerprint = null
        where fit_score is not null
           or fit_rationale is not null
           or fit_scored_at is not null
           or fit_score_fingerprint is not null
      `;
      return rows.length > 0;
    });
    return ok(removed);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
