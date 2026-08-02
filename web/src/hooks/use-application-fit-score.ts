import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/** Scores a single existing application and persists the result server-side. */
export function useApplicationFitScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["fit-score"],
    mutationFn: async (id: string) => {
      const res = await apiClient.applications[":id"]["fit-score"].$post({ param: { id } });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Failed to score application";
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      // Returned (not fire-and-forget) so isPending — and therefore the
      // "Scoring..." button state — stays true until the applications list
      // has actually refetched with the new fit score, instead of the
      // loader disappearing a beat before the real score/description
      // appears.
      return queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
