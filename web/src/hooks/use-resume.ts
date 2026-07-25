import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiBaseUrl, getApiHeaders } from "@/lib/api-client";
import type { ResumeStatus } from "@job-search-copilot/api/src/schemas/resume.ts";

const resumeStatusKey = ["resume-status"] as const;

export function useResumeStatus() {
  return useQuery({
    queryKey: resumeStatusKey,
    queryFn: async () => {
      const res = await apiClient.resume.$get();
      if (!res.ok) throw new Error("Failed to fetch resume status");
      return res.json();
    },
  });
}

export function useUploadResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      // hc<AppType>() can't type a multipart body for a route with no
      // Zod validator (resume.ts's PUT reads it via c.req.parseBody()
      // directly), so this one request is a raw fetch instead of going
      // through apiClient — same base URL/auth headers as everywhere else.
      const res = await fetch(`${apiBaseUrl}/resume`, {
        method: "PUT",
        headers: await getApiHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Failed to upload resume";
        throw new Error(message);
      }
      return res.json() as Promise<ResumeStatus>;
    },
    onSuccess: (status) => {
      queryClient.setQueryData(resumeStatusKey, status);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useDeleteResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.resume.$delete();
      if (!res.ok) throw new Error("Failed to remove resume");
    },
    onSuccess: () => {
      queryClient.setQueryData<ResumeStatus>(resumeStatusKey, {
        filename: null,
        updatedAt: null,
      });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
