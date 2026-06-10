import { expect, test } from "@playwright/test";

test("reviewer can run offboarding, approve writes, and export evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /reset seed state/i }).click();
  await page.getByRole("button", { name: /generate plan/i }).click();
  await expect(page.getByRole("heading", { name: "Live Systems" })).toBeVisible();
  await expect(page.getByText("REST Ticketing").first()).toBeVisible();
  await expect(page.getByText("Pending write").first()).toBeVisible();
  await expect(page.getByText("Generated typed plan")).toBeVisible();
  await expect(page.getByText("Approval required").first()).toBeVisible();
  await page.getByRole("button", { name: /approve/i }).first().click();
  await expect(page.getByText("Transferred 2 tickets").first()).toBeVisible();
  await expect(page.getByText("Disabled").first()).toBeVisible();
  await page.getByRole("button", { name: /run probe/i }).click();
  await expect(page.getByText("missing token")).toBeVisible();
  await expect(page.getByText("wrong scope/token")).toBeVisible();
  await expect(page.getByText("valid write token", { exact: true })).toBeVisible();
  await page.getByText("/api/internal/rest/tickets/transfer").last().click();
  await expect(page.getByText('"dryRun": true').last()).toBeVisible();
  await expect(page.getByText("Alex Chen offboarding completed")).toBeVisible();
  await expect(page.getByRole("button", { name: /export json/i }).first()).toBeEnabled();
});

test("unauthorized role is visibly blocked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /reset seed state/i }).click();
  await page.getByLabel("Actor / RBAC").selectOption("employee");
  await page.getByRole("button", { name: /generate plan/i }).click();
  await expect(page.getByRole("alert").getByText("Blocked")).toBeVisible();
  await expect(page.getByText(/Employees cannot run access cleanup workflows/).first()).toBeVisible();
});

test("forced connector failure pauses and can retry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /reset seed state/i }).click();
  await page.getByLabel("Scenario").selectOption("rest_failure");
  await page.getByRole("button", { name: /generate plan/i }).click();
  await page.getByRole("button", { name: /approve/i }).first().click();
  await expect(page.getByText("REST ticketing timed out after applying transfer")).toBeVisible();
  await expect(page.getByRole("button", { name: /retry paused step/i })).toBeVisible();
  await page.getByRole("button", { name: /retry paused step/i }).click();
  await expect(page.getByText("Alex Chen offboarding completed")).toBeVisible();
});

test("prompt-injection fixture is shown as contained untrusted content", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /reset seed state/i }).click();
  await page.getByLabel("Scenario").selectOption("prompt_injection");
  await page.getByRole("button", { name: /generate plan/i }).click();
  await expect(page.getByText("Untrusted retrieved content")).toBeVisible();
  await expect(page.getByText(/Ignore all prior instructions/)).toBeVisible();
  await expect(page.getByText(/mints no unrelated CEO capability/)).toBeVisible();
});

test("mobile layout keeps the workflow first without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await expect(page.getByText("Natural-language offboarding request")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Systems" })).toBeVisible();
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Execution timeline").last()).toBeVisible();
  await page.getByRole("tab", { name: "Probe" }).click();
  await expect(page.getByText("Security Probe").last()).toBeVisible();
  await page.getByRole("tab", { name: "Protocol" }).click();
  await expect(page.getByText("Raw protocol inspector").last()).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});

test("sidebar navigation only exposes working section links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /^Run$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Systems$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Evidence$/ })).toBeVisible();
  await expect(page.getByText("Settings")).toHaveCount(0);
  await page.getByRole("link", { name: /^Evidence$/ }).click();
  await expect(page).toHaveURL(/#evidence$/);
  await expect(page.getByRole("heading", { name: "Reviewer evidence packet" })).toBeVisible();
});
