import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationForm } from "./application-form";
import { useCreateApplication } from "@/hooks/use-applications";

/**
 * Characterization tests for ApplicationForm's current behavior, written
 * before Phase 4 adds an "Analyze with AI" action to this same form
 * (see docs/superpowers/specs/2026-07-23-llm-integration-design.md) —
 * these lock in what already works today so that change can be reviewed
 * against a known-good baseline instead of untested prior behavior.
 *
 * useCreateApplication is mocked wholesale rather than rendered under a
 * real QueryClientProvider — this is a unit test of the form's own
 * validation/submission logic, not an integration test of TanStack Query.
 */
vi.mock("@/hooks/use-applications", () => ({
  useCreateApplication: vi.fn(),
}));

const mockUseCreateApplication = vi.mocked(useCreateApplication);

describe("ApplicationForm", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mockUseCreateApplication.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateApplication>);
  });

  test("shows a validation error and does not submit when company and role title are blank", async () => {
    const user = userEvent.setup();
    render(<ApplicationForm />);

    await user.click(screen.getByRole("button", { name: "Add application" }));

    expect(
      await screen.findByText("Company and role title are required."),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test("submits trimmed values with sensible defaults and resets the form on success", async () => {
    mutateAsync.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ApplicationForm />);

    await user.type(screen.getByPlaceholderText("Company"), "  Acme Co  ");
    await user.type(screen.getByPlaceholderText("Role title"), "  Staff Engineer  ");
    await user.click(screen.getByRole("button", { name: "Add application" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "Acme Co",
        roleTitle: "Staff Engineer",
        source: "direct",
        salaryMin: null,
        salaryMax: null,
        jdText: null,
        notes: null,
        status: expect.objectContaining({
          stage: "applied",
          appliedAt: expect.any(String),
        }),
      }),
    );

    // Form resets after a successful submission.
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Company")).toHaveValue(""),
    );
  });

  test("shows a generic error message when the create request fails", async () => {
    mutateAsync.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    render(<ApplicationForm />);

    await user.type(screen.getByPlaceholderText("Company"), "Acme Co");
    await user.type(screen.getByPlaceholderText("Role title"), "Staff Engineer");
    await user.click(screen.getByRole("button", { name: "Add application" }));

    expect(
      await screen.findByText("Something went wrong saving the application. Try again."),
    ).toBeInTheDocument();
  });
});
