import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResumeAndScoreStrip } from "./resume-and-score-strip";
import { useResumeStatus, useUploadResume } from "@/hooks/use-resume";
import { useFitScoreAll } from "@/hooks/use-fit-score-all";

vi.mock("@/hooks/use-resume", () => ({
  useResumeStatus: vi.fn(),
  useUploadResume: vi.fn(),
}));
vi.mock("@/hooks/use-fit-score-all", () => ({
  useFitScoreAll: vi.fn(),
}));

const mockUseResumeStatus = vi.mocked(useResumeStatus);
const mockUseUploadResume = vi.mocked(useUploadResume);
const mockUseFitScoreAll = vi.mocked(useFitScoreAll);

function mockNoResume() {
  mockUseResumeStatus.mockReturnValue({
    data: { filename: null, updatedAt: null },
    isLoading: false,
  } as unknown as ReturnType<typeof useResumeStatus>);
}

function mockHasResume() {
  mockUseResumeStatus.mockReturnValue({
    data: { filename: "resume.pdf", updatedAt: "2026-01-01T00:00:00.000Z" },
    isLoading: false,
  } as unknown as ReturnType<typeof useResumeStatus>);
}

describe("ResumeAndScoreStrip", () => {
  const uploadMutate = vi.fn();
  const fitScoreAllMutate = vi.fn();

  beforeEach(() => {
    uploadMutate.mockReset();
    fitScoreAllMutate.mockReset();
    mockUseUploadResume.mockReturnValue({
      mutate: uploadMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useUploadResume>);
    mockUseFitScoreAll.mockReturnValue({
      mutate: fitScoreAllMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useFitScoreAll>);
  });

  test("shows an upload prompt and disables scoring when no resume has been uploaded", () => {
    mockNoResume();
    render(<ResumeAndScoreStrip />);

    expect(screen.getByText(/No resume uploaded yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Score new applications" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload resume" })).toBeInTheDocument();
  });

  test("shows the current resume and enables scoring once one is uploaded", () => {
    mockHasResume();
    render(<ResumeAndScoreStrip />);

    expect(screen.getByText(/Current resume: resume\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Score new applications" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Replace resume" })).toBeInTheDocument();
  });

  test("clicking Score new applications calls the mutation", async () => {
    mockHasResume();
    const user = userEvent.setup();
    render(<ResumeAndScoreStrip />);

    await user.click(screen.getByRole("button", { name: "Score new applications" }));

    expect(fitScoreAllMutate).toHaveBeenCalledTimes(1);
  });

  test("uploading a file calls the upload mutation", async () => {
    mockNoResume();
    const user = userEvent.setup();
    render(<ResumeAndScoreStrip />);

    const file = new File(["dummy"], "resume.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(uploadMutate).toHaveBeenCalledWith(file);
  });
});
