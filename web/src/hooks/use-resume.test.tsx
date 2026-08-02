import { describe, test, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useDeleteResume } from "./use-resume";
import { useApplications } from "./use-applications";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    resume: { $delete: vi.fn() },
    applications: { $get: vi.fn() },
  },
}));

function renderWithQueryClient(queryClient: QueryClient) {
  return renderHook(
    () => ({
      applications: useApplications(),
      // Mirrors resume-status also being invalidated, without needing a
      // second mocked endpoint — only applications' refetch timing matters
      // for this test.
      resumeStatus: useQuery({ queryKey: ["resume-status"], queryFn: () => null }),
      deleteResume: useDeleteResume(),
    }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );
}

describe("useDeleteResume", () => {
  test("stays pending until the applications list has refetched with cleared fit scores", async () => {
    const queryClient = new QueryClient();
    const deleteMock = vi.mocked(apiClient.resume.$delete);
    deleteMock.mockResolvedValue({ ok: true } as unknown as Awaited<
      ReturnType<typeof apiClient.resume.$delete>
    >);

    const applicationsGet = vi.mocked(apiClient.applications.$get);
    type ApplicationsResponse = Awaited<ReturnType<typeof apiClient.applications.$get>>;
    applicationsGet.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "1", fitScore: 82 }],
    } as unknown as ApplicationsResponse);

    let resolveRefetch!: () => void;
    applicationsGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefetch = () =>
            resolve({
              ok: true,
              json: async () => [{ id: "1", fitScore: null }],
            } as unknown as ApplicationsResponse);
        }),
    );

    const { result } = renderWithQueryClient(queryClient);
    await waitFor(() => expect(result.current.applications.isSuccess).toBe(true));

    act(() => {
      result.current.deleteResume.mutate();
    });

    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    // The applications refetch triggered by invalidateQueries is still in
    // flight — the mutation must still read as pending here, otherwise a
    // caller like the remove-resume dialog would close (and its button
    // re-enable) while the stale fit score is still in the cache.
    expect(result.current.deleteResume.isPending).toBe(true);
    expect(result.current.applications.data).toEqual([{ id: "1", fitScore: 82 }]);

    act(() => resolveRefetch());

    await waitFor(() => expect(result.current.deleteResume.isPending).toBe(false));
    expect(result.current.applications.data).toEqual([{ id: "1", fitScore: null }]);
  });
});
