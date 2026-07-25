import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { JdParseResult } from "@job-search-copilot/api/src/schemas/jd-parse.ts";
import type { FitScoreResult } from "@job-search-copilot/api/src/schemas/fit-score.ts";

export type CallResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function readError(res: Response, fallback: string): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

async function callJdParse(jdText: string): Promise<CallResult<JdParseResult>> {
  const res = await apiClient["jd-parse"].$post({ json: { jdText } });
  if (!res.ok) return { ok: false, error: await readError(res, "Couldn't parse the JD.") };
  return { ok: true, data: await res.json() };
}

async function callFitScore(jdText: string): Promise<CallResult<FitScoreResult>> {
  const res = await apiClient["fit-score"].$post({ json: { jdText } });
  if (!res.ok) return { ok: false, error: await readError(res, "Couldn't check fit.") };
  return { ok: true, data: await res.json() };
}

/**
 * Both calls always resolve (never throw) with their own ok/error
 * result, and run via Promise.all — per the Phase 4 spec, a missing
 * resume (422 from fit-score) must not prevent jd-parse's independent
 * result from rendering, and vice versa.
 */
export function useAnalyzeWithAi() {
  return useMutation({
    mutationFn: async (jdText: string) => {
      const [jdParse, fitScore] = await Promise.all([callJdParse(jdText), callFitScore(jdText)]);
      return { jdParse, fitScore };
    },
  });
}
