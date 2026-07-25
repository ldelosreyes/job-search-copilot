import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useFitScoreAll() {
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
  });
}
