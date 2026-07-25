import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/**
 * Scores every unscored/stale application against the current resume in
 * one batched call (skips ones already scored against the same
 * jdText/roleTitle/resume) and persists each result server-side —
 * afterward, the applications list is invalidated so cards re-fetch
 * their (now updated) fitScore/fitRationale directly, rather than this
 * hook holding a separate results list.
 */
export function useFitScoreAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient["fit-score-all"].$post();
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Failed to score applications";
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
