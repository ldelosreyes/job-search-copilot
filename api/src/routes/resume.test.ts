import { beforeEach, describe, expect, mock, test } from "bun:test";

const deleteResumeAndClearScoresMock = mock(
  async (): Promise<
    { ok: true; value: boolean } | { ok: false; error: Error }
  > => ({
    ok: true,
    value: true,
  }),
);

mock.module("../db/resume-repo", () => ({
  getResumeStatus: mock(async () => ({
    ok: true,
    value: { filename: null, updatedAt: null },
  })),
  getResumeContent: mock(async () => ({ ok: true, value: null })),
  upsertResume: mock(async () => ({
    ok: true,
    value: { filename: "resume.pdf", updatedAt: "2026-01-01T00:00:00.000Z" },
  })),
  deleteResumeAndClearScores: deleteResumeAndClearScoresMock,
}));

const { resumeRoute } = await import("./resume");

describe("DELETE /resume", () => {
  beforeEach(() => {
    deleteResumeAndClearScoresMock.mockClear();
    deleteResumeAndClearScoresMock.mockResolvedValue({ ok: true, value: true });
  });

  test("removes the resume and clears cached fit scores", async () => {
    const response = await resumeRoute.request("/", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(deleteResumeAndClearScoresMock).toHaveBeenCalledTimes(1);
  });

  test("returns 500 when the database operation fails", async () => {
    deleteResumeAndClearScoresMock.mockResolvedValueOnce({
      ok: false,
      error: new Error("database unavailable"),
    });

    const response = await resumeRoute.request("/", { method: "DELETE" });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to remove resume" });
  });
});
