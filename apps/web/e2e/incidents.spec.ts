import { test, expect } from "@playwright/test";
import {
  mockIncidentsAPI,
  mockIncidentDetailAPI,
  testData,
} from "./fixtures/api-mocks";

test.describe("Incidents List", () => {
  test.beforeEach(async ({ page }) => {
    await mockIncidentsAPI(page);
  });

  test("displays list of incidents", async ({ page }) => {
    await page.goto("/incidents");

    // Wait for incidents to load
    await expect(page.getByText("3 incidents")).toBeVisible();

    // Check all 3 incidents are shown
    const rows = page.getByTestId("incident-row");
    await expect(rows).toHaveCount(3);

    // Check first incident content
    await expect(page.getByText("CPU usage above 90% on payment-api")).toBeVisible();
    await expect(page.getByText("P99 latency above 2s on payment-api")).toBeVisible();
    await expect(page.getByText("Disk usage above 95% on payment-api")).toBeVisible();
  });

  test("displays incident status badges", async ({ page }) => {
    await page.goto("/incidents");
    await expect(page.getByText("3 incidents")).toBeVisible();

    const statuses = page.getByTestId("incident-status");
    await expect(statuses).toHaveCount(3);

    await expect(statuses.nth(0)).toHaveText("triggered");
    await expect(statuses.nth(1)).toHaveText("acknowledged");
    await expect(statuses.nth(2)).toHaveText("resolved");
  });

  test("filters incidents by status", async ({ page }) => {
    await page.goto("/incidents");
    await expect(page.getByText("3 incidents")).toBeVisible();

    // Click the status filter
    await page.getByTestId("status-filter").click();

    // Select "Triggered"
    await page.getByRole("option", { name: "Triggered" }).click();

    // Should show only 1 incident
    await expect(page.getByText("1 incident")).toBeVisible();
    const rows = page.getByTestId("incident-row");
    await expect(rows).toHaveCount(1);
    await expect(page.getByText("CPU usage above 90% on payment-api")).toBeVisible();
  });

  test("navigates to incident detail", async ({ page }) => {
    await mockIncidentDetailAPI(page);
    await page.goto("/incidents");
    await expect(page.getByText("3 incidents")).toBeVisible();

    // Click the first incident link
    await page.getByTestId("incident-link").first().click();

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/incidents\/50000000/);
    await expect(page.getByTestId("incident-title")).toHaveText(
      "CPU usage above 90% on payment-api"
    );
  });
});

test.describe("Incident Detail", () => {
  test.beforeEach(async ({ page }) => {
    await mockIncidentDetailAPI(page);
  });

  test("displays incident details and timeline", async ({ page }) => {
    await page.goto(`/incidents/${testData.INCIDENT_TRIGGERED.id}`);

    // Title and status
    await expect(page.getByTestId("incident-title")).toHaveText(
      "CPU usage above 90% on payment-api"
    );
    await expect(page.getByTestId("incident-status")).toHaveText("triggered");

    // Timeline entries
    await expect(page.getByTestId("timeline")).toBeVisible();
    const entries = page.getByTestId("timeline-entry");
    await expect(entries).toHaveCount(1);
    await expect(entries.first()).toContainText("triggered");
  });

  test("shows ack and resolve buttons for triggered incident", async ({ page }) => {
    await page.goto(`/incidents/${testData.INCIDENT_TRIGGERED.id}`);

    await expect(page.getByTestId("ack-button")).toBeVisible();
    await expect(page.getByTestId("resolve-button")).toBeVisible();
  });

  test("acknowledges an incident", async ({ page }) => {
    await page.goto(`/incidents/${testData.INCIDENT_TRIGGERED.id}`);

    // Click acknowledge
    await page.getByTestId("ack-button").click();

    // After ack, status should update to acknowledged
    await expect(page.getByTestId("incident-status")).toHaveText("acknowledged");

    // Ack button should disappear (only shown for triggered)
    await expect(page.getByTestId("ack-button")).not.toBeVisible();

    // Resolve button should still be visible
    await expect(page.getByTestId("resolve-button")).toBeVisible();
  });

  test("resolves an incident", async ({ page }) => {
    await page.goto(`/incidents/${testData.INCIDENT_TRIGGERED.id}`);

    // Click resolve
    await page.getByTestId("resolve-button").click();

    // After resolve, status should update to resolved
    await expect(page.getByTestId("incident-status")).toHaveText("resolved");

    // Both buttons should disappear
    await expect(page.getByTestId("ack-button")).not.toBeVisible();
    await expect(page.getByTestId("resolve-button")).not.toBeVisible();
  });
});
