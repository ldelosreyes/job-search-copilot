import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
} from "@job-search-copilot/api/src/schemas/application.ts";

const applicationsKey = ["applications"] as const;

export function useApplications() {
  return useQuery({
    queryKey: applicationsKey,
    queryFn: async () => {
      const res = await apiClient.applications.$get();
      if (!res.ok) throw new Error("Failed to load applications");
      return res.json();
    },
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateApplicationInput) => {
      const res = await apiClient.applications.$post({ json: input });
      if (!res.ok) throw new Error("Failed to create application");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationsKey });
    },
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UpdateApplicationInput;
    }) => {
      const res = await apiClient.applications[":id"].$patch({
        param: { id },
        json: input,
      });
      if (!res.ok) throw new Error("Failed to update application");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationsKey });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.applications[":id"].$delete({
        param: { id },
      });
      if (!res.ok) throw new Error("Failed to delete application");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationsKey });
    },
  });
}
