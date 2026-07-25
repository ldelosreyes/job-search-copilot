import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginScreen } from "./login-screen";
import { supabase } from "@/lib/supabase-client";

vi.mock("@/lib/supabase-client", () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
}));

const signInWithPassword = vi.mocked(supabase!.auth.signInWithPassword);

describe("LoginScreen", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
  });

  test("submits the entered email and password", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null } as never);
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByPlaceholderText("Email"), "someone@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "someone@example.com",
      password: "hunter2",
    });
  });

  test("shows an error message on incorrect credentials", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials" },
    } as never);
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByPlaceholderText("Email"), "someone@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });

  test("shows a disabled 'Signing in...' state while submitting", async () => {
    let resolveSignIn: (value: unknown) => void = () => {};
    signInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }) as never,
    );
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByPlaceholderText("Email"), "someone@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled();
    resolveSignIn({ data: {}, error: null });
  });
});
