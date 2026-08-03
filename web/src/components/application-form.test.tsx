import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationForm } from "./application-form";
import { useCreateApplication } from "@/hooks/use-applications";
import { useAnalyzeWithAi } from "@/hooks/use-analyze-with-ai";

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

vi.mock("@/hooks/use-analyze-with-ai", () => ({
  useAnalyzeWithAi: vi.fn(),
}));

const mockUseCreateApplication = vi.mocked(useCreateApplication);
const mockUseAnalyzeWithAi = vi.mocked(useAnalyzeWithAi);

describe("ApplicationForm", () => {
  const mutateAsync = vi.fn();
  const analyzeMutate = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    analyzeMutate.mockReset();
    mockUseCreateApplication.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateApplication>);
    mockUseAnalyzeWithAi.mockReturnValue({
      mutate: analyzeMutate,
      isPending: false,
      data: undefined,
    } as unknown as ReturnType<typeof useAnalyzeWithAi>);
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

  describe("Analyze with AI", () => {
    test("right-aligns the action and places its icon after the label", () => {
      render(<ApplicationForm />);

      const button = screen.getByRole("button", { name: "Analyze with AI" });
      expect(button.parentElement).toHaveClass("justify-end");
      expect(button.lastElementChild).toHaveClass("lucide-sparkles");
    });

    test("is disabled until a JD is pasted, and calls analyze with the trimmed text", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm />);

      expect(screen.getByRole("button", { name: "Analyze with AI" })).toBeDisabled();

      await user.type(screen.getByPlaceholderText("Paste the JD (optional)"), "  Some JD text  ");
      expect(screen.getByRole("button", { name: "Analyze with AI" })).toBeEnabled();

      await user.click(screen.getByRole("button", { name: "Analyze with AI" }));

      expect(analyzeMutate).toHaveBeenCalledWith(
        "Some JD text",
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    test("shows a disabled 'Analyzing...' state while pending", () => {
      mockUseAnalyzeWithAi.mockReturnValue({
        mutate: analyzeMutate,
        isPending: true,
        data: undefined,
      } as unknown as ReturnType<typeof useAnalyzeWithAi>);

      render(<ApplicationForm />);

      expect(screen.getByRole("button", { name: "Analyzing..." })).toBeDisabled();
    });

    test("autofills the form from a successful jd-parse result", async () => {
      analyzeMutate.mockImplementation((_jdText, { onSuccess }) => {
        onSuccess({
          jdParse: {
            ok: true,
            data: {
              company: "Acme Co",
              roleTitle: "Staff Engineer",
              source: "referral",
              salaryMin: 100_000,
              salaryMax: 150_000,
            },
          },
          fitScore: { ok: true, data: { score: 82, rationale: "Strong overlap." } },
        });
      });
      const user = userEvent.setup();
      render(<ApplicationForm />);

      await user.type(screen.getByPlaceholderText("Paste the JD (optional)"), "Some JD text");
      await user.click(screen.getByRole("button", { name: "Analyze with AI" }));

      await waitFor(() => expect(screen.getByPlaceholderText("Company")).toHaveValue("Acme Co"));
      expect(screen.getByPlaceholderText("Role title")).toHaveValue("Staff Engineer");
      expect(screen.getByPlaceholderText("Salary min")).toHaveValue(100_000);
      expect(screen.getByPlaceholderText("Salary max")).toHaveValue(150_000);
    });

    test("keeps the user's typed company when the AI result has no company (e.g. an unnamed recruiter posting)", async () => {
      analyzeMutate.mockImplementation((_jdText, { onSuccess }) => {
        onSuccess({
          jdParse: {
            ok: true,
            data: {
              company: "",
              roleTitle: "Staff Engineer",
              source: "recruiter",
              salaryMin: null,
              salaryMax: null,
            },
          },
          fitScore: { ok: true, data: { score: 82, rationale: "Strong overlap." } },
        });
      });
      const user = userEvent.setup();
      render(<ApplicationForm />);

      await user.type(screen.getByPlaceholderText("Company"), "Acme Co");
      await user.type(screen.getByPlaceholderText("Paste the JD (optional)"), "Some JD text");
      await user.click(screen.getByRole("button", { name: "Analyze with AI" }));

      await waitFor(() =>
        expect(screen.getByPlaceholderText("Role title")).toHaveValue("Staff Engineer"),
      );
      expect(screen.getByPlaceholderText("Company")).toHaveValue("Acme Co");
    });

    test("clears stale AI-filled fields when a second, different JD is analyzed and comes back empty", async () => {
      let onSuccess: (result: unknown) => void = () => {};
      analyzeMutate.mockImplementation((_jdText, opts) => {
        onSuccess = opts.onSuccess;
      });
      const user = userEvent.setup();
      render(<ApplicationForm />);

      const jdTextarea = screen.getByPlaceholderText("Paste the JD (optional)");

      // First analysis: fully populates the form from JD #1.
      await user.type(jdTextarea, "JD for Acme");
      await user.click(screen.getByRole("button", { name: "Analyze with AI" }));
      onSuccess({
        jdParse: {
          ok: true,
          data: {
            company: "Acme Co",
            roleTitle: "Staff Engineer",
            source: "referral",
            salaryMin: 100_000,
            salaryMax: 150_000,
          },
        },
        fitScore: { ok: true, data: { score: 82, rationale: "Strong overlap." } },
      });
      await waitFor(() => expect(screen.getByPlaceholderText("Company")).toHaveValue("Acme Co"));

      // User pastes a different JD over the first one and re-analyzes, without
      // submitting — the new posting doesn't name a company or salary.
      await user.clear(jdTextarea);
      await user.type(jdTextarea, "JD for a different, unnamed company");
      await user.click(screen.getByRole("button", { name: "Analyze with AI" }));
      onSuccess({
        jdParse: {
          ok: true,
          data: {
            company: "",
            roleTitle: "",
            source: "recruiter",
            salaryMin: null,
            salaryMax: null,
          },
        },
        fitScore: { ok: true, data: { score: 40, rationale: "Weak overlap." } },
      });

      await waitFor(() => expect(screen.getByPlaceholderText("Company")).toHaveValue(""));
      expect(screen.getByPlaceholderText("Role title")).toHaveValue("");
      expect(screen.getByPlaceholderText("Salary min")).toHaveValue(null);
      expect(screen.getByPlaceholderText("Salary max")).toHaveValue(null);
    });

    test("shows a loading skeleton in place of the analysis result while pending", () => {
      mockUseAnalyzeWithAi.mockReturnValue({
        mutate: analyzeMutate,
        isPending: true,
        data: undefined,
      } as unknown as ReturnType<typeof useAnalyzeWithAi>);

      render(<ApplicationForm />);

      expect(
        screen.getByRole("status", { name: "Analyzing job description…" }),
      ).toBeInTheDocument();
    });

    test("renders the fit score and rationale from a successful result", () => {
      mockUseAnalyzeWithAi.mockReturnValue({
        mutate: analyzeMutate,
        isPending: false,
        data: {
          jdParse: { ok: true, data: {} },
          fitScore: { ok: true, data: { score: 82, rationale: "Strong overlap." } },
        },
      } as unknown as ReturnType<typeof useAnalyzeWithAi>);

      render(<ApplicationForm />);

      expect(screen.getByText("82", { exact: false })).toBeInTheDocument();
      expect(screen.getByText(/Strong overlap\./)).toBeInTheDocument();
    });

    test("renders each call's error independently — a failed fit-score doesn't hide a successful jd-parse", () => {
      mockUseAnalyzeWithAi.mockReturnValue({
        mutate: analyzeMutate,
        isPending: false,
        data: {
          jdParse: { ok: true, data: {} },
          fitScore: { ok: false, error: "Upload a resume to check fit" },
        },
      } as unknown as ReturnType<typeof useAnalyzeWithAi>);

      render(<ApplicationForm />);

      expect(screen.getByText("Upload a resume to check fit")).toBeInTheDocument();
    });

    test("renders each call's error independently — a failed jd-parse doesn't hide a successful fit-score", () => {
      mockUseAnalyzeWithAi.mockReturnValue({
        mutate: analyzeMutate,
        isPending: false,
        data: {
          jdParse: { ok: false, error: "Couldn't parse the JD." },
          fitScore: { ok: true, data: { score: 40, rationale: "Weak overlap." } },
        },
      } as unknown as ReturnType<typeof useAnalyzeWithAi>);

      render(<ApplicationForm />);

      expect(screen.getByText("Couldn't parse the JD.")).toBeInTheDocument();
      expect(screen.getByText(/Weak overlap\./)).toBeInTheDocument();
    });
  });
});
