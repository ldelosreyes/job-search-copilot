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
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
