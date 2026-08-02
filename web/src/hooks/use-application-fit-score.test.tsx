import { describe, test, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useApplicationFitScore } from "./use-application-fit-score";
import { useApplications } from "./use-applications";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    applications: {
      ":id": { "fit-score": { $post: vi.fn() } },
      $get: vi.fn(),
    },
  },
}));

function renderWithQueryClient(queryClient: QueryClient) {
  return renderHook(
    () => ({
      applications: useApplications(),
      fitScore: useApplicationFitScore(),
    }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );
}

describe("useApplicationFitScore", () => {
  test("stays pending until the applications list has refetched with the new fit score", async () => {
    const queryClient = new QueryClient();
    const postMock = vi.mocked(apiClient.applications[":id"]["fit-score"].$post);
    postMock.mockResolvedValue({
      ok: true,
      json: async () => ({ score: 82, rationale: "Strong overlap." }),
    } as unknown as Awaited<
      ReturnType<typeof apiClient.applications[":id"]["fit-score"]["$post"]>
    >);

    const applicationsGet = vi.mocked(apiClient.applications.$get);
    type ApplicationsResponse = Awaited<ReturnType<typeof apiClient.applications.$get>>;
    applicationsGet.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "1", fitScore: null }],
    } as unknown as ApplicationsResponse);

    let resolveRefetch!: () => void;
    applicationsGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefetch = () =>
            resolve({
              ok: true,
              json: async () => [{ id: "1", fitScore: 82 }],
            } as unknown as ApplicationsResponse);
        }),
    );

    const { result } = renderWithQueryClient(queryClient);
    await waitFor(() => expect(result.current.applications.isSuccess).toBe(true));

    act(() => {
      result.current.fitScore.mutate("1");
    });

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    // The applications refetch triggered by invalidateQueries is still in
    // flight — the mutation must still read as pending here, otherwise the
    // card's "Scoring..." button would flip back to "Re-score" a beat
    // before the real fit score is in the cache.
    expect(result.current.fitScore.isPending).toBe(true);
    expect(result.current.applications.data).toEqual([{ id: "1", fitScore: null }]);

    act(() => resolveRefetch());

    await waitFor(() => expect(result.current.fitScore.isPending).toBe(false));
    expect(result.current.applications.data).toEqual([{ id: "1", fitScore: 82 }]);
  });
});
