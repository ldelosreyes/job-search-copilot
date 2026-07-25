import { describe, expect, test } from "bun:test";
import { envInt } from "./ai-limits";

describe("envInt", () => {
  test("falls back to the default when unset", () => {
    expect(envInt("SOME_UNSET_VAR", 400)).toBe(400);
  });

  test("uses a valid positive override", () => {
    process.env.SOME_TEST_VAR = "800";
    expect(envInt("SOME_TEST_VAR", 400)).toBe(800);
    delete process.env.SOME_TEST_VAR;
  });

  test("falls back to the default on a non-numeric value", () => {
    process.env.SOME_TEST_VAR = "not-a-number";
    expect(envInt("SOME_TEST_VAR", 400)).toBe(400);
    delete process.env.SOME_TEST_VAR;
  });

  test("falls back to the default on zero or negative values", () => {
    process.env.SOME_TEST_VAR = "0";
    expect(envInt("SOME_TEST_VAR", 400)).toBe(400);

    process.env.SOME_TEST_VAR = "-10";
    expect(envInt("SOME_TEST_VAR", 400)).toBe(400);
    delete process.env.SOME_TEST_VAR;
  });
});
