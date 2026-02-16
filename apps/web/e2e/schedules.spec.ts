import { test, expect } from "@playwright/test";
import {
  mockSchedulesAPI,
  mockScheduleDetailAPI,
  testData,
} from "./fixtures/api-mocks";

test.describe("Schedules List", () => {
  test.beforeEach(async ({ page }) => {
    await mockSchedulesAPI(page);
  });

  test("displays list of schedules", async ({ page }) => {
    await page.goto("/schedules");

    const cards = page.getByTestId("schedule-card");
    await expect(cards).toHaveCount(1);
    await expect(page.getByText("Primary On-Call Rotation")).toBeVisible();
  });

  test("shows current on-call user on schedule card", async ({ page }) => {
    await page.goto("/schedules");

    const oncall = page.getByTestId("schedule-oncall");
    await expect(oncall).toBeVisible();
    await expect(oncall).toContainText("Alice Engineer");
  });

  test("creates a new schedule", async ({ page }) => {
    await page.goto("/schedules");

    await page.getByTestId("create-schedule-button").click();
    await page.getByTestId("schedule-name-input").fill("Secondary Rotation");

    // Select team
    await page.getByTestId("schedule-team-select").click();
    await page.getByRole("option", { name: "Platform Team" }).click();

    await page.getByTestId("submit-schedule").click();

    // Should now show 2 schedule cards
    await expect(page.getByText("Secondary Rotation")).toBeVisible();
    const cards = page.getByTestId("schedule-card");
    await expect(cards).toHaveCount(2);
  });
});

test.describe("Schedule Detail", () => {
  test.beforeEach(async ({ page }) => {
    await mockScheduleDetailAPI(page);
  });

  test("displays schedule detail with layers", async ({ page }) => {
    await page.goto(`/schedules/${testData.SCHEDULE_1.id}`);

    await expect(page.getByTestId("schedule-name")).toHaveText(
      "Primary On-Call Rotation"
    );

    // Current on-call
    await expect(page.getByTestId("current-oncall")).toContainText("Alice Engineer");

    // Layers
    const layers = page.getByTestId("layer-item");
    await expect(layers).toHaveCount(1);
    await expect(page.getByText("Layer 1")).toBeVisible();
    await expect(page.getByTestId("layer-item").getByText("Weekly")).toBeVisible();
  });

  test("creates an override", async ({ page }) => {
    await page.goto(`/schedules/${testData.SCHEDULE_1.id}`);

    await page.getByTestId("create-override-button").click();

    // Select user
    await page.getByTestId("override-user-select").click();
    await page.getByRole("option", { name: "Bob Oncall" }).click();

    // Fill dates
    await page.getByTestId("override-start-input").fill("2026-02-20T09:00");
    await page.getByTestId("override-end-input").fill("2026-02-20T17:00");

    await page.getByTestId("submit-override").click();

    // Override should appear in the list
    const overrides = page.getByTestId("override-item");
    await expect(overrides).toHaveCount(1);
    await expect(overrides.first()).toContainText("Bob Oncall");
  });
});
