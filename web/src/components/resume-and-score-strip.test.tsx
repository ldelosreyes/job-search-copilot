import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResumeAndScoreStrip } from "./resume-and-score-strip";
import {
  useDeleteResume,
  useResumeStatus,
  useUploadResume,
} from "@/hooks/use-resume";
import { useFitScoreAll, useFitScoreAllStatus } from "@/hooks/use-fit-score-all";

vi.mock("@/hooks/use-resume", () => ({
  useResumeStatus: vi.fn(),
  useUploadResume: vi.fn(),
  useDeleteResume: vi.fn(),
}));
vi.mock("@/hooks/use-fit-score-all", () => ({
  useFitScoreAll: vi.fn(),
  useFitScoreAllStatus: vi.fn(),
}));

const mockUseResumeStatus = vi.mocked(useResumeStatus);
const mockUseUploadResume = vi.mocked(useUploadResume);
const mockUseDeleteResume = vi.mocked(useDeleteResume);
const mockUseFitScoreAll = vi.mocked(useFitScoreAll);
const mockUseFitScoreAllStatus = vi.mocked(useFitScoreAllStatus);

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
  const deleteMutate = vi.fn();
  const fitScoreAllMutate = vi.fn();

  beforeEach(() => {
    uploadMutate.mockReset();
    deleteMutate.mockReset();
    fitScoreAllMutate.mockReset();
    mockUseUploadResume.mockReturnValue({
      mutate: uploadMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useUploadResume>);
    mockUseDeleteResume.mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useDeleteResume>);
    mockUseFitScoreAll.mockReturnValue({
      mutate: fitScoreAllMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useFitScoreAll>);
    mockUseFitScoreAllStatus.mockReturnValue({
      data: { eligibleCount: 1, scoreableCount: 1 },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useFitScoreAllStatus>);
  });

  test("shows an upload prompt and disables scoring when no resume has been uploaded", () => {
    mockNoResume();
    render(<ResumeAndScoreStrip />);

    expect(screen.getByText(/No resume uploaded yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Score applications" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload resume" })).toBeInTheDocument();
  });

  test("shows the current resume and enables scoring once one is uploaded", () => {
    mockHasResume();
    render(<ResumeAndScoreStrip />);

    expect(screen.getByText(/Current resume: resume\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Score applications" })).toBeEnabled();
    const replaceButton = screen.getByRole("button", { name: "Replace resume" });
    expect(replaceButton).not.toHaveTextContent("Replace resume");
    expect(replaceButton.querySelector("svg")).toBeInTheDocument();
    expect(replaceButton).toHaveAttribute("title", "Replace resume");
    const removeButton = screen.getByRole("button", { name: "Remove resume" });
    expect(removeButton).not.toHaveTextContent("Remove resume");
    expect(removeButton.querySelector("svg")).toBeInTheDocument();
  });

  test("shows a disabled up-to-date state when no application needs scoring", () => {
    mockHasResume();
    mockUseFitScoreAllStatus.mockReturnValue({
      data: { eligibleCount: 2, scoreableCount: 0 },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useFitScoreAllStatus>);

    render(<ResumeAndScoreStrip />);

    const button = screen.getByRole("button", { name: "Scores up to date" });
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        name: "All applications are scored for the current resume and job descriptions.",
      }),
    ).toBeInTheDocument();
  });

  test("explains when there are no applications with a job description", () => {
    mockHasResume();
    mockUseFitScoreAllStatus.mockReturnValue({
      data: { eligibleCount: 0, scoreableCount: 0 },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useFitScoreAllStatus>);

    render(<ResumeAndScoreStrip />);

    expect(screen.getByRole("button", { name: "Score applications" })).toBeDisabled();
    expect(
      screen.getByRole("tooltip", {
        name: "Add a job description to at least one application before scoring.",
      }),
    ).toBeInTheDocument();
  });

  test("confirms before removing the resume and its saved fit scores", async () => {
    mockHasResume();
    const user = userEvent.setup();
    render(<ResumeAndScoreStrip />);

    await user.click(screen.getByRole("button", { name: "Remove resume" }));

    const dialog = screen.getByRole("dialog", { name: "Remove resume" });
    expect(
      screen.getByText(/clear all saved fit scores/i),
    ).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(deleteMutate).toHaveBeenCalledTimes(1);
  });

  test("disables resume removal while a replacement upload is pending", () => {
    mockHasResume();
    mockUseUploadResume.mockReturnValue({
      mutate: uploadMutate,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useUploadResume>);

    render(<ResumeAndScoreStrip />);

    expect(screen.getByRole("button", { name: "Remove resume" })).toBeDisabled();
  });

  test("clicking Score applications calls the mutation", async () => {
    mockHasResume();
    const user = userEvent.setup();
    render(<ResumeAndScoreStrip />);

    await user.click(screen.getByRole("button", { name: "Score applications" }));

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
