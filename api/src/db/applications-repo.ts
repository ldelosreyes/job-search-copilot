import { sql } from "./client";
import {
  applicationSchema,
  type Application,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from "../schemas/application";
import { ok, err, type Result } from "../lib/result";

/**
 * Postgres stores column names in snake_case; our TypeScript types are
 * camelCase. This mapper is the single place that translation happens,
 * so the rest of the app never has to think about it.
 */
function rowToApplication(row: Record<string, unknown>): Application {
  const mapped = {
    id: row.id,
    company: row.company,
    roleTitle: row.role_title,
    source: row.source,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    jdText: row.jd_text,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  // Re-validate on the way out of the DB too, not just on the way in.
  // Catches drift between the schema and the actual table shape early.
  return applicationSchema.parse(mapped);
}

export async function listApplications(): Promise<Result<Application[]>> {
  try {
    const rows = await sql`
      select * from applications
      order by created_at desc
    `;
    return ok(rows.map(rowToApplication));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function getApplication(id: string): Promise<Result<Application | null>> {
  try {
    const rows = await sql`
      select * from applications where id = ${id}
    `;
    return ok(rows[0] ? rowToApplication(rows[0]) : null);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function createApplication(
  input: CreateApplicationInput,
): Promise<Result<Application>> {
  try {
    const rows = await sql`
      insert into applications
        (company, role_title, source, salary_min, salary_max, jd_text, notes, status)
      values (
        ${input.company},
        ${input.roleTitle},
        ${input.source},
        ${input.salaryMin},
        ${input.salaryMax},
        ${input.jdText},
        ${input.notes},
        ${sql.json(input.status)}
      )
      returning *
    `;
    return ok(rowToApplication(rows[0]!));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function updateApplication(
  id: string,
  input: UpdateApplicationInput,
): Promise<Result<Application | null>> {
  try {
    // postgres.js's sql() helper builds a dynamic SET clause safely
    // (parameterized), avoiding hand-rolled string concatenation.
    const patch: Record<string, unknown> = {};
    if (input.company !== undefined) patch.company = input.company;
    if (input.roleTitle !== undefined) patch.role_title = input.roleTitle;
    if (input.source !== undefined) patch.source = input.source;
    if (input.salaryMin !== undefined) patch.salary_min = input.salaryMin;
    if (input.salaryMax !== undefined) patch.salary_max = input.salaryMax;
    if (input.jdText !== undefined) patch.jd_text = input.jdText;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.status !== undefined) patch.status = sql.json(input.status);

    if (Object.keys(patch).length === 0) {
      return await getApplication(id);
    }

    const rows = await sql`
      update applications
      set ${sql(patch)}, updated_at = now()
      where id = ${id}
      returning *
    `;
    return ok(rows[0] ? rowToApplication(rows[0]) : null);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function deleteApplication(id: string): Promise<Result<boolean>> {
  try {
    const rows = await sql`
      delete from applications where id = ${id} returning id
    `;
    return ok(rows.length > 0);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
