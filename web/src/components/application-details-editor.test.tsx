import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationDetailsEditor } from "./application-details-editor";
import { useUpdateApplication } from "@/hooks/use-applications";

vi.mock("@/hooks/use-applications", () => ({
  useUpdateApplication: vi.fn(),
}));

const mockUseUpdateApplication = vi.mocked(useUpdateApplication);

describe("ApplicationDetailsEditor", () => {
  const mutate = vi.fn();

  beforeEach(() => {
    mutate.mockReset();
    mockUseUpdateApplication.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateApplication>);
  });

  test("shows a JD preview and an 'Edit' label when a JD already exists", () => {
    render(
      <ApplicationDetailsEditor id="1" company="Acme Co" roleTitle="Staff Engineer" jdText="A short JD." />,
    );

    expect(screen.getByText("A short JD.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit JD" })).toBeInTheDocument();
  });

  test("shows an 'Add JD' label and no preview when there's no JD yet", () => {
    render(<ApplicationDetailsEditor id="1" company="Acme Co" roleTitle="Staff Engineer" jdText={null} />);

    expect(screen.getByRole("button", { name: "Add JD" })).toBeInTheDocument();
  });

  test("truncates a long JD in the preview", () => {
    const longJd = "a".repeat(250);
    render(<ApplicationDetailsEditor id="1" company="Acme Co" roleTitle="Staff Engineer" jdText={longJd} />);

    expect(screen.getByText(`${"a".repeat(200)}…`)).toBeInTheDocument();
  });

  test("editing and saving sends trimmed company/roleTitle/jdText", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationDetailsEditor id="app-1" company="Acme Co" roleTitle="Staff Engineer" jdText={null} />,
    );

    await user.click(screen.getByRole("button", { name: "Add JD" }));
    await user.type(screen.getByPlaceholderText("Paste the JD"), "  A new JD.  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mutate).toHaveBeenCalledWith(
      {
        id: "app-1",
        input: { company: "Acme Co", roleTitle: "Staff Engineer", jdText: "A new JD." },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("cancel discards edits without saving", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationDetailsEditor id="1" company="Acme Co" roleTitle="Staff Engineer" jdText="Original JD." />,
    );

    await user.click(screen.getByRole("button", { name: "Edit JD" }));
    await user.clear(screen.getByPlaceholderText("Paste the JD"));
    await user.type(screen.getByPlaceholderText("Paste the JD"), "Changed.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Original JD.")).toBeInTheDocument();
  });
});
