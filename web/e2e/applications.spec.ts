import { test, expect } from "@playwright/test";

/**
 * Each test creates its own application with a unique company name
 * (rather than relying on seed data or a known starting DB state) so
 * tests stay independent of each other and of whatever else is in the
 * database — matters here since CI's throwaway Postgres starts empty,
 * but this would also work unchanged against a DB with real/seeded data.
 *
 * Scoped to `[data-slot="card"]` (set by web/src/components/ui/card.tsx)
 * rather than matching on page position, so each assertion targets the
 * specific application's card, not "whichever card is currently first."
 *
 * Status text is asserted via `[data-slot="badge"]` specifically, not a
 * generic getByText — the stage <select>'s own <option> elements contain
 * the same words in lowercase (e.g. "interview"), and getByText's
 * case-insensitive default matching makes that genuinely ambiguous.
 */

test.describe("application CRUD", () => {
  test("create an application and see it in the list", async ({ page }) => {
    const company = `E2E Create Co ${Date.now()}`;
    await page.goto("/");

    await page.getByRole("textbox", { name: "Company" }).fill(company);
    await page.getByRole("textbox", { name: "Role title" }).fill("E2E Test Role");
    await page.getByRole("button", { name: "Add application" }).click();

    const card = page.locator('[data-slot="card"]', { hasText: company });
    await expect(card).toBeVisible();
    await expect(card.getByText("E2E Test Role")).toBeVisible();
    // Default status for a newly created application.
    await expect(card.locator('[data-slot="badge"]')).toHaveText("Applied");
  });

  test("update an application's stage", async ({ page }) => {
    const company = `E2E Update Co ${Date.now()}`;
    await page.goto("/");
    await page.getByRole("textbox", { name: "Company" }).fill(company);
    await page.getByRole("textbox", { name: "Role title" }).fill("Update Test Role");
    await page.getByRole("button", { name: "Add application" }).click();

    const card = page.locator('[data-slot="card"]', { hasText: company });
    await expect(card).toBeVisible();

    // The discriminated union in practice: switching to "interview"
    // reveals the round input, which only exists for that stage.
    await card.getByRole("combobox").selectOption("interview");
    await expect(card.getByPlaceholder("Round")).toBeVisible();
    await card.getByRole("button", { name: "Save" }).click();

    await expect(card.locator('[data-slot="badge"]')).toHaveText("Interview");
  });

  test("delete an application removes it from the list", async ({ page }) => {
    const company = `E2E Delete Co ${Date.now()}`;
    await page.goto("/");
    await page.getByRole("textbox", { name: "Company" }).fill(company);
    await page.getByRole("textbox", { name: "Role title" }).fill("Delete Test Role");
    await page.getByRole("button", { name: "Add application" }).click();

    const card = page.locator('[data-slot="card"]', { hasText: company });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Delete" }).click();

    await expect(page.locator('[data-slot="card"]', { hasText: company })).toHaveCount(0);
  });

  test("rejects submitting the create form with company and role title blank", async ({
    page,
  }) => {
    await page.goto("/");
    const cardCountBefore = await page.locator('[data-slot="card"]').count();

    // Neither field is touched — both are required, matching the guard
    // in ApplicationForm's handleSubmit (web/src/components/application-form.tsx).
    await page.getByRole("button", { name: "Add application" }).click();

    await expect(page.getByText("Company and role title are required.")).toBeVisible();
    // No new card was created, and no network request was made at all —
    // this is caught client-side before the createApplication mutation runs.
    // Compared against the count beforehand, not asserted as 0, since
    // other tests in this suite leave their own cards in the shared DB.
    await expect(page.locator('[data-slot="card"]')).toHaveCount(cardCountBefore);
  });

  test("does not change the visible stage when an invalid interview round is saved", async ({
    page,
  }) => {
    const company = `E2E Invalid Round Co ${Date.now()}`;
    await page.goto("/");
    await page.getByRole("textbox", { name: "Company" }).fill(company);
    await page.getByRole("textbox", { name: "Role title" }).fill("Invalid Round Role");
    await page.getByRole("button", { name: "Add application" }).click();

    const card = page.locator('[data-slot="card"]', { hasText: company });
    await expect(card).toBeVisible();

    // interviewRound must be a positive integer (api/src/schemas/application.ts).
    // A negative round is rejected server-side with a 400; the UI has no
    // error banner for a failed stage update, so the observable behavior
    // is that the badge simply never advances to "Interview".
    await card.getByRole("combobox").selectOption("interview");
    await card.getByPlaceholder("Round").fill("-1");
    await card.getByRole("button", { name: "Save" }).click();

    await expect(card.locator('[data-slot="badge"]')).toHaveText("Applied");
  });

  test("deleting a nonexistent application returns 404", async ({ request }) => {
    // Direct API call, not routed through the UI — there's no "delete an
    // application that no longer exists" affordance in the UI itself
    // (every visible Delete button targets a card that's actually there),
    // so this exercises the route's own not-found handling instead.
    const response = await request.delete(
      "/api/applications/00000000-0000-4000-8000-000000000000",
    );
    expect(response.status()).toBe(404);
  });
});
