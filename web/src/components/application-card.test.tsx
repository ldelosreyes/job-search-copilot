import { describe, test, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApplicationCard } from "./application-card";
import type { ApplicationWithFitScoreStatus } from "@job-search-copilot/api/src/schemas/application.ts";

const mockFitScoreButton = vi.fn((_props: unknown) => null);
vi.mock("@/components/fit-score-button", () => ({
  FitScoreButton: (props: unknown) => mockFitScoreButton(props),
}));

const application: ApplicationWithFitScoreStatus = {
  id: "5ac2d7a3-061c-449f-9e39-aa57f6e9988a",
  company: "Acme Co",
  roleTitle: "Staff Engineer",
  source: "referral",
  salaryMin: null,
  salaryMax: null,
  jdText: "Build reliable systems.",
  notes: null,
  status: { stage: "applied", appliedAt: "2026-07-20T10:00:00.000Z" },
  fitScore: 82,
  fitRationale: "Strong TypeScript overlap.",
  fitScoredAt: "2026-07-25T10:00:00.000Z",
  fitScoreFingerprint: "fingerprint",
  needsFitScore: false,
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-25T10:00:00.000Z",
};

function renderCard(
  queryClient: QueryClient,
  overrides: Partial<ApplicationWithFitScoreStatus> = {},
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ApplicationCard
        application={{ ...application, ...overrides }}
        isEditing={false}
        onEdit={() => {}}
        onCancel={() => {}}
      />
    </QueryClientProvider>,
  );
}

// Starts a mutation that never resolves, purely to seed the shared mutation
// cache in a "pending" state the way an in-flight fit-score request would —
// matching what ApplicationCard's useMutationState filters look for.
function startPendingMutation(
  queryClient: QueryClient,
  mutationKey: string[],
  variables: unknown,
) {
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationKey,
    mutationFn: () => new Promise(() => {}),
  });
  void mutation.execute(variables);
}

describe("ApplicationCard fit-result loading state", () => {
  test("shows the fit score by default", () => {
    const queryClient = new QueryClient();
    renderCard(queryClient);

    expect(screen.getByText(/Fit:/)).toBeInTheDocument();
  });

  test("shows a loading skeleton instead of the fit score while this application is being scored", async () => {
    const queryClient = new QueryClient();
    renderCard(queryClient);

    act(() => {
      startPendingMutation(queryClient, ["fit-score"], application.id);
    });

    expect(await screen.findByRole("status", { name: "Scoring fit…" })).toBeInTheDocument();
    expect(screen.queryByText(/Fit:/)).not.toBeInTheDocument();
  });

  test("does not show a loading skeleton when a different application is being scored", () => {
    const queryClient = new QueryClient();
    renderCard(queryClient);

    act(() => {
      startPendingMutation(queryClient, ["fit-score"], "some-other-id");
    });

    expect(screen.queryByRole("status", { name: "Scoring fit…" })).not.toBeInTheDocument();
    expect(screen.getByText(/Fit:/)).toBeInTheDocument();
  });

  test("shows a loading skeleton for an unscored card while a bulk score-all run is in flight", async () => {
    const queryClient = new QueryClient();
    renderCard(queryClient, {
      fitScore: null,
      fitRationale: null,
      fitScoredAt: null,
      needsFitScore: true,
    });

    act(() => {
      startPendingMutation(queryClient, ["fit-score-all"], undefined);
    });

    expect(await screen.findByRole("status", { name: "Scoring fit…" })).toBeInTheDocument();
  });

  test("shows a loading skeleton for a scored-but-stale card (JD or resume changed since) during a bulk run", async () => {
    const queryClient = new QueryClient();
    renderCard(queryClient, { needsFitScore: true });

    act(() => {
      startPendingMutation(queryClient, ["fit-score-all"], undefined);
    });

    expect(await screen.findByRole("status", { name: "Scoring fit…" })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockFitScoreButton).toHaveBeenLastCalledWith(
        expect.objectContaining({ disabledByBulkScore: false }),
      );
    });
  });

  test("does not show a loading skeleton during a bulk run for a card with no job description", () => {
    const queryClient = new QueryClient();
    renderCard(queryClient, {
      jdText: null,
      fitScore: null,
      fitRationale: null,
      needsFitScore: false,
    });

    act(() => {
      startPendingMutation(queryClient, ["fit-score-all"], undefined);
    });

    expect(screen.queryByRole("status", { name: "Scoring fit…" })).not.toBeInTheDocument();
  });

  test("does not show a loading skeleton during a bulk run for a card already scored", () => {
    const queryClient = new QueryClient();
    renderCard(queryClient);

    act(() => {
      startPendingMutation(queryClient, ["fit-score-all"], undefined);
    });

    expect(screen.queryByRole("status", { name: "Scoring fit…" })).not.toBeInTheDocument();
    expect(screen.getByText(/Fit:/)).toBeInTheDocument();
  });

  test("tells FitScoreButton to disable itself for an already-scored card during a bulk run", async () => {
    const queryClient = new QueryClient();
    renderCard(queryClient);

    act(() => {
      startPendingMutation(queryClient, ["fit-score-all"], undefined);
    });

    await waitFor(() => {
      expect(mockFitScoreButton).toHaveBeenLastCalledWith(
        expect.objectContaining({ disabledByBulkScore: true }),
      );
    });
  });
});
