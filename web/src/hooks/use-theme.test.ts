import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./use-theme";

function mockMatchMedia(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: prefersDark }) as unknown as typeof window.matchMedia;
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  test("defaults to the system theme when nothing is stored", () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  test("defaults to light when the system prefers light", () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  test("toggling flips the theme, updates the dark class, and persists to localStorage", () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  test("picks up a persisted preference over the system default", () => {
    mockMatchMedia(true);
    localStorage.setItem("theme", "light");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
