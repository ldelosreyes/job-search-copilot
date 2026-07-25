import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FitScoreButton } from "./fit-score-button";
import { useApplicationFitScore } from "@/hooks/use-application-fit-score";
import { useResumeStatus } from "@/hooks/use-resume";

vi.mock("@/hooks/use-application-fit-score", () => ({
  useApplicationFitScore: vi.fn(),
}));

vi.mock("@/hooks/use-resume", () => ({
  useResumeStatus: vi.fn(),
}));

const mockUseApplicationFitScore = vi.mocked(useApplicationFitScore);
const mockUseResumeStatus = vi.mocked(useResumeStatus);

describe("FitScoreButton", () => {
  const mutate = vi.fn();

  beforeEach(() => {
    mutate.mockReset();
    mockUseApplicationFitScore.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useApplicationFitScore>);
    mockUseResumeStatus.mockReturnValue({
      data: { filename: "resume.pdf", updatedAt: "2026-01-01T00:00:00.000Z" },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useResumeStatus>);
  });

  test("is disabled when the application has no JD", () => {
    render(<FitScoreButton id="1" hasJd={false} hasScore={false} />);

    expect(screen.getByRole("button", { name: "Score fit" })).toBeDisabled();
    expect(
      screen.getByRole("tooltip", { name: "Add a job description before scoring fit." }),
    ).toBeInTheDocument();
  });

  test("is disabled and explains when no resume is available", () => {
    mockUseResumeStatus.mockReturnValue({
      data: { filename: null, updatedAt: null },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useResumeStatus>);

    render(<FitScoreButton id="1" hasJd={true} hasScore={false} />);

    expect(screen.getByRole("button", { name: "Score fit" })).toBeDisabled();
    const tooltip = screen.getByRole("tooltip", {
      name: "Upload a resume before scoring fit.",
    });
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveClass("left-0");
    expect(tooltip).not.toHaveClass("-translate-x-1/2");
  });

  test("shows 'Score fit' when never scored, and calls mutate with the id on click", async () => {
    const user = userEvent.setup();
    render(<FitScoreButton id="app-1" hasJd={true} hasScore={false} />);

    const button = screen.getByRole("button", { name: "Score fit" });
    expect(button).toBeEnabled();
    await user.click(button);

    expect(mutate).toHaveBeenCalledWith("app-1");
  });

  test("shows 'Re-score' once the application already has a score", () => {
    render(<FitScoreButton id="1" hasJd={true} hasScore={true} />);

    expect(screen.getByRole("button", { name: "Re-score" })).toBeInTheDocument();
  });

  test("shows a disabled 'Scoring...' state while pending", () => {
    mockUseApplicationFitScore.mockReturnValue({
      mutate,
      isPending: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useApplicationFitScore>);

    render(<FitScoreButton id="1" hasJd={true} hasScore={false} />);

    expect(screen.getByRole("button", { name: "Scoring..." })).toBeDisabled();
  });

  test("shows the error message on failure", () => {
    mockUseApplicationFitScore.mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new Error("Upload a resume to check fit"),
    } as unknown as ReturnType<typeof useApplicationFitScore>);

    render(<FitScoreButton id="1" hasJd={true} hasScore={false} />);

    expect(screen.getByText("Upload a resume to check fit")).toBeInTheDocument();
  });
});
