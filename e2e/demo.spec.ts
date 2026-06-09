import { expect, test } from "@playwright/test";

test("reviewer can run offboarding, approve writes, and export evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /reset seed state/i }).click();
  await page.getByRole("button", { name: /generate plan/i }).click();
  await expect(page.getByText("Generated plan")).toBeVisible();
  await expect(page.getByText("Write capability mints only after approval.").first()).toBeVisible();
  await page.getByRole("button", { name: /approve/i }).first().click();
  await expect(page.getByText("Alex Chen offboarding completed")).toBeVisible();
  await expect(page.getByRole("button", { name: /export json/i })).toBeEnabled();
});

test("unauthorized role is visibly blocked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /reset seed state/i }).click();
  await page.locator("select").first().selectOption("employee");
  await page.getByRole("button", { name: /generate plan/i }).click();
  await expect(page.getByText("Policy block")).toBeVisible();
  await expect(page.getByText(/Employees cannot run access cleanup workflows/).first()).toBeVisible();
});

test("forced connector failure pauses and can retry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /reset seed state/i }).click();
  await page.locator("select").nth(1).selectOption("rest_failure");
  await page.getByRole("button", { name: /generate plan/i }).click();
  await page.getByRole("button", { name: /approve/i }).first().click();
  await expect(page.getByText("REST ticketing timed out after applying transfer")).toBeVisible();
  await expect(page.getByRole("button", { name: /retry paused step/i })).toBeVisible();
  await page.getByRole("button", { name: /retry paused step/i }).click();
  await expect(page.getByText("Alex Chen offboarding completed")).toBeVisible();
});
