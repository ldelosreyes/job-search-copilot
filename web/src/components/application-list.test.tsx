import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationList } from "./application-list";
import {
  useApplications,
  useDeleteApplication,
  useUpdateApplication,
} from "@/hooks/use-applications";
import type { Application } from "@job-search-copilot/api/src/schemas/application.ts";

vi.mock("@/hooks/use-applications", () => ({
  useApplications: vi.fn(),
  useDeleteApplication: vi.fn(),
  useUpdateApplication: vi.fn(),
}));

vi.mock("@/components/fit-score-button", () => ({
  FitScoreButton: () => null,
}));

const application: Application = {
  id: "5ac2d7a3-061c-449f-9e39-aa57f6e9988a",
  company: "Acme Co",
  roleTitle: "Staff Engineer",
  source: "referral",
  salaryMin: 150000,
  salaryMax: 180000,
  jdText: "Build reliable systems.",
  notes: "Follow up next week.",
  status: { stage: "interview", interviewRound: 2 },
  fitScore: 82,
  fitRationale: "Strong TypeScript overlap.",
  fitScoredAt: "2026-07-25T10:00:00.000Z",
  fitScoreFingerprint: "fingerprint",
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-25T10:00:00.000Z",
};

const mockUseApplications = vi.mocked(useApplications);
const mockUseDeleteApplication = vi.mocked(useDeleteApplication);
const mockUseUpdateApplication = vi.mocked(useUpdateApplication);

describe("ApplicationList loading state", () => {
  test("shows skeleton cards and an accessible loading status while fetching", () => {
    mockUseApplications.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useApplications>);

    const { container } = render(<ApplicationList />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading applications…");
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});

describe("ApplicationList card editing", () => {
  const updateMutate = vi.fn();
  const deleteMutate = vi.fn();
  let animationFrames: FrameRequestCallback[];

  beforeEach(() => {
    updateMutate.mockReset();
    deleteMutate.mockReset();
    animationFrames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    mockUseApplications.mockReturnValue({
      data: [application],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useApplications>);
    mockUseUpdateApplication.mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateApplication>);
    mockUseDeleteApplication.mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useDeleteApplication>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function flushAnimationFrames() {
    act(() => {
      for (const callback of animationFrames.splice(0)) callback(0);
    });
  }

  test("opens every editable field in a modal from an icon-only edit button", async () => {
    const user = userEvent.setup();
    render(<ApplicationList />);

    expect(screen.getByText("Staff Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Acme Co/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();

    const editButton = screen.getByRole("button", { name: "Edit application" });
    expect(editButton).toHaveAttribute("aria-label", "Edit application");
    expect(editButton).toHaveAttribute("title", "Edit application");
    expect(editButton).toHaveTextContent("");

    await user.click(editButton);

    const dialog = screen.getByRole("dialog", { name: "Edit application" });
    expect(within(dialog).getByLabelText("Company")).toHaveValue("Acme Co");
    expect(within(dialog).getByLabelText("Role title")).toHaveValue("Staff Engineer");
    expect(within(dialog).getByLabelText("Source")).toHaveValue("referral");
    expect(within(dialog).getByLabelText("Salary minimum")).toHaveValue(150000);
    expect(within(dialog).getByLabelText("Salary maximum")).toHaveValue(180000);
    expect(within(dialog).getByLabelText("Stage")).toHaveValue("interview");
    expect(within(dialog).getByLabelText("Interview round")).toHaveValue(2);
    expect(within(dialog).getByLabelText("Job description")).toHaveValue(
      "Build reliable systems.",
    );
    expect(within(dialog).getByLabelText("Notes")).toHaveValue(
      "Follow up next week.",
    );
  });

  test("keeps a rejected status badge beside the role title", () => {
    const rejectionReason = "The position was filled by another candidate.";
    mockUseApplications.mockReturnValue({
      data: [
        {
          ...application,
          notes: rejectionReason,
          status: {
            stage: "rejected",
            rejectedAt: "2026-07-25T10:00:00.000Z",
          },
        },
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useApplications>);

    render(<ApplicationList />);

    const title = screen.getByText("Staff Engineer");
    const titleRow = title.parentElement;
    expect(titleRow).toContainElement(screen.getByText("Rejected").parentElement);
    expect(titleRow).toHaveClass("flex-nowrap");
    expect(title).not.toHaveClass("flex-1");
    expect(titleRow).not.toContainElement(screen.getByText(rejectionReason));
    expect(screen.getByText(rejectionReason)).toHaveClass("text-muted-foreground");
  });

  test("uses Notes instead of stage-specific reason fields", async () => {
    const user = userEvent.setup();
    render(<ApplicationList />);

    await user.click(screen.getByRole("button", { name: "Edit application" }));
    await user.selectOptions(screen.getByLabelText("Stage"), "rejected");
    expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Stage"), "withdrawn");
    expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Notes"));
    await user.type(screen.getByLabelText("Notes"), "Accepted another role.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          status: { stage: "withdrawn" },
          notes: "Accepted another role.",
        }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("saves all edited fields in one application update", async () => {
    const user = userEvent.setup();
    render(<ApplicationList />);

    await user.click(screen.getByRole("button", { name: "Edit application" }));

    await user.clear(screen.getByLabelText("Company"));
    await user.type(screen.getByLabelText("Company"), "  New Co  ");
    await user.clear(screen.getByLabelText("Role title"));
    await user.type(screen.getByLabelText("Role title"), "Principal Engineer");
    await user.selectOptions(screen.getByLabelText("Source"), "direct");
    await user.clear(screen.getByLabelText("Salary minimum"));
    await user.type(screen.getByLabelText("Salary minimum"), "160000");
    await user.clear(screen.getByLabelText("Salary maximum"));
    await user.selectOptions(screen.getByLabelText("Stage"), "offer");
    await user.type(screen.getByLabelText("Offer amount"), "200000");
    await user.clear(screen.getByLabelText("Job description"));
    await user.clear(screen.getByLabelText("Notes"));
    await user.type(screen.getByLabelText("Notes"), "  Final interview complete.  ");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: application.id,
        input: {
          company: "New Co",
          roleTitle: "Principal Engineer",
          source: "direct",
          salaryMin: 160000,
          salaryMax: null,
          status: { stage: "offer", offerAmount: 200000 },
          jdText: null,
          notes: "Final interview complete.",
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("shows validation feedback and blocks invalid salary values", async () => {
    const user = userEvent.setup();
    render(<ApplicationList />);

    await user.click(screen.getByRole("button", { name: "Edit application" }));
    await user.clear(screen.getByLabelText("Salary minimum"));
    await user.type(screen.getByLabelText("Salary minimum"), "-1");

    expect(screen.getByRole("alert")).toHaveTextContent("Salaries cannot be negative.");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("shows an accessible error when an application update fails", async () => {
    mockUseUpdateApplication.mockReturnValue({
      mutate: updateMutate,
      isPending: false,
      isError: true,
      error: new Error("Failed to update application"),
    } as unknown as ReturnType<typeof useUpdateApplication>);

    const user = userEvent.setup();
    render(<ApplicationList />);
    await user.click(screen.getByRole("button", { name: "Edit application" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to update application");
  });

  test("opens a confirmation dialog from an icon-only card delete button", async () => {
    const user = userEvent.setup();
    render(<ApplicationList />);

    const deleteButton = screen.getByRole("button", { name: "Delete application" });
    expect(deleteButton).toHaveAttribute("aria-label", "Delete application");
    expect(deleteButton).toHaveAttribute("title", "Delete application");
    expect(deleteButton).toHaveTextContent("");

    await user.click(deleteButton);

    const dialog = screen.getByRole("dialog", { name: "Delete application" });
    expect(within(dialog).getByText(/Staff Engineer at Acme Co/)).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    expect(deleteMutate).toHaveBeenCalledWith(
      application.id,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("keeps deletion out of editing and returns focus after cancelling deletion", async () => {
    const user = userEvent.setup();
    render(<ApplicationList />);

    await user.click(screen.getByRole("button", { name: "Edit application" }));
    const editDialog = screen.getByRole("dialog", { name: "Edit application" });
    expect(
      within(editDialog).queryByRole("button", { name: "Delete application" }),
    ).not.toBeInTheDocument();
    await user.click(within(editDialog).getByRole("button", { name: "Cancel" }));
    flushAnimationFrames();

    const deleteButton = screen.getByRole("button", { name: "Delete application" });
    await user.click(deleteButton);
    const deleteDialog = screen.getByRole("dialog", { name: "Delete application" });
    await user.click(within(deleteDialog).getByRole("button", { name: "Cancel" }));
    flushAnimationFrames();

    expect(
      screen.queryByRole("dialog", { name: "Delete application" }),
    ).not.toBeInTheDocument();
    expect(deleteButton).toHaveFocus();
  });

  test("shows an accessible error when application deletion fails", async () => {
    mockUseDeleteApplication.mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
      isError: true,
      error: new Error("Failed to delete application"),
    } as unknown as ReturnType<typeof useDeleteApplication>);

    const user = userEvent.setup();
    render(<ApplicationList />);
    await user.click(screen.getByRole("button", { name: "Delete application" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to delete application");
  });

  test("closes the modal and returns focus to the edit button after cancelling", async () => {
    const user = userEvent.setup();
    render(<ApplicationList />);

    await user.click(screen.getByRole("button", { name: "Edit application" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    flushAnimationFrames();

    expect(screen.queryByRole("dialog", { name: "Edit application" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit application" })).toHaveFocus();
  });

  test("closes the edit modal with Escape", async () => {
    const user = userEvent.setup();
    render(<ApplicationList />);

    await user.click(screen.getByRole("button", { name: "Edit application" }));
    await user.keyboard("{Escape}");
    flushAnimationFrames();

    expect(screen.queryByRole("dialog", { name: "Edit application" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit application" })).toHaveFocus();
  });
});
