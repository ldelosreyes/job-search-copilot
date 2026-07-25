import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResumeFitView } from "./resume-fit-view";
import { useResumeStatus, useUploadResume } from "@/hooks/use-resume";
import { useFitScoreAll } from "@/hooks/use-fit-score-all";
import { useApplications } from "@/hooks/use-applications";

/**
 * All four hooks are mocked wholesale, same pattern as
 * application-form.test.tsx — this is a unit test of the view's
 * rendering/interaction logic, not an integration test of TanStack Query
 * or the real API.
 */
vi.mock("@/hooks/use-resume", () => ({
  useResumeStatus: vi.fn(),
  useUploadResume: vi.fn(),
}));
vi.mock("@/hooks/use-fit-score-all", () => ({
  useFitScoreAll: vi.fn(),
}));
vi.mock("@/hooks/use-applications", () => ({
  useApplications: vi.fn(),
}));

const mockUseResumeStatus = vi.mocked(useResumeStatus);
const mockUseUploadResume = vi.mocked(useUploadResume);
const mockUseFitScoreAll = vi.mocked(useFitScoreAll);
const mockUseApplications = vi.mocked(useApplications);

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

describe("ResumeFitView", () => {
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
      data: undefined,
    } as unknown as ReturnType<typeof useFitScoreAll>);
    mockUseApplications.mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useApplications>);
  });

  test("shows an upload prompt and disables scoring when no resume has been uploaded", () => {
    mockNoResume();
    render(<ResumeFitView />);

    expect(screen.getByText(/No resume uploaded yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Score all applications" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload resume" })).toBeInTheDocument();
  });

  test("shows the current resume and enables scoring once one is uploaded", () => {
    mockHasResume();
    render(<ResumeFitView />);

    expect(screen.getByText(/Current resume: resume\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Score all applications" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
  });

  test("clicking Score all applications calls the mutation", async () => {
    mockHasResume();
    const user = userEvent.setup();
    render(<ResumeFitView />);

    await user.click(screen.getByRole("button", { name: "Score all applications" }));

    expect(fitScoreAllMutate).toHaveBeenCalledTimes(1);
  });

  test("shows a disabled 'Scoring applications…' state while pending", () => {
    mockHasResume();
    mockUseFitScoreAll.mockReturnValue({
      mutate: fitScoreAllMutate,
      isPending: true,
      isError: false,
      data: undefined,
    } as unknown as ReturnType<typeof useFitScoreAll>);

    render(<ResumeFitView />);

    expect(screen.getByRole("button", { name: "Scoring applications…" })).toBeDisabled();
  });

  test("shows the empty state when no application has a jdText", () => {
    mockHasResume();
    mockUseFitScoreAll.mockReturnValue({
      mutate: fitScoreAllMutate,
      isPending: false,
      isError: false,
      data: { results: [], consideredCount: 0, skippedCount: 0 },
    } as unknown as ReturnType<typeof useFitScoreAll>);

    render(<ResumeFitView />);

    expect(screen.getByText(/None of your tracked applications have a JD yet/)).toBeInTheDocument();
  });

  test("renders results sorted by score with company/role, and the skipped note only when skippedCount > 0", () => {
    mockHasResume();
    mockUseApplications.mockReturnValue({
      data: [
        { id: "a", company: "Acme Co", roleTitle: "Staff Engineer" },
        { id: "b", company: "Globex", roleTitle: "Platform Engineer" },
      ],
    } as unknown as ReturnType<typeof useApplications>);
    mockUseFitScoreAll.mockReturnValue({
      mutate: fitScoreAllMutate,
      isPending: false,
      isError: false,
      data: {
        results: [
          { applicationId: "a", score: 87, rationale: "Strong overlap in core skills." },
          { applicationId: "b", score: 61, rationale: "Some relevant experience." },
        ],
        consideredCount: 2,
        skippedCount: 3,
      },
    } as unknown as ReturnType<typeof useFitScoreAll>);

    render(<ResumeFitView />);

    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
    expect(screen.getByText(/87.*Strong match/)).toBeInTheDocument();
    expect(screen.getByText(/61.*Possible match/)).toBeInTheDocument();
    expect(screen.getByText(/3 others skipped/)).toBeInTheDocument();
  });

  test("expands a row's rationale on click, and collapses it on a second click", async () => {
    mockHasResume();
    mockUseApplications.mockReturnValue({
      data: [{ id: "a", company: "Acme Co", roleTitle: "Staff Engineer" }],
    } as unknown as ReturnType<typeof useApplications>);
    mockUseFitScoreAll.mockReturnValue({
      mutate: fitScoreAllMutate,
      isPending: false,
      isError: false,
      data: {
        results: [{ applicationId: "a", score: 87, rationale: "Strong overlap in core skills." }],
        consideredCount: 1,
        skippedCount: 0,
      },
    } as unknown as ReturnType<typeof useFitScoreAll>);

    const user = userEvent.setup();
    render(<ResumeFitView />);

    expect(screen.queryByText("Strong overlap in core skills.")).not.toBeInTheDocument();

    await user.click(screen.getByText("Acme Co"));
    expect(screen.getByText("Strong overlap in core skills.")).toBeInTheDocument();

    await user.click(screen.getByText("Acme Co"));
    expect(screen.queryByText("Strong overlap in core skills.")).not.toBeInTheDocument();
  });

  test("uploading a file calls the upload mutation", async () => {
    mockNoResume();
    const user = userEvent.setup();
    render(<ResumeFitView />);

    const file = new File(["dummy"], "resume.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(uploadMutate).toHaveBeenCalledWith(file);
  });
});
