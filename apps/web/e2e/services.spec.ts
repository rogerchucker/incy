import { test, expect } from "@playwright/test";
import {
  mockServicesAPI,
  mockServiceDetailAPI,
  testData,
} from "./fixtures/api-mocks";

test.describe("Services List", () => {
  test.beforeEach(async ({ page }) => {
    await mockServicesAPI(page);
  });

  test("displays list of services", async ({ page }) => {
    await page.goto("/services");

    // Check service card is shown
    const cards = page.getByTestId("service-card");
    await expect(cards).toHaveCount(1);
    await expect(page.getByText("Payment API")).toBeVisible();
    await expect(page.getByText("payment-api")).toBeVisible();
  });

  test("creates a new service", async ({ page }) => {
    await page.goto("/services");

    // Click create button
    await page.getByTestId("create-service-button").click();

    // Fill the form
    await page.getByTestId("service-name-input").fill("Auth Service");

    // Slug should auto-populate
    await expect(page.getByTestId("service-slug-input")).toHaveValue("auth-service");

    // Select team from dropdown
    await page.getByTestId("team-select").click();
    await page.getByRole("option", { name: "Platform Team" }).click();

    // Submit
    await page.getByTestId("submit-service").click();

    // Dialog should close and new service should appear
    await expect(page.getByText("Auth Service")).toBeVisible();
    const cards = page.getByTestId("service-card");
    await expect(cards).toHaveCount(2);
  });

  test("navigates to service detail", async ({ page }) => {
    await mockServiceDetailAPI(page);
    await page.goto("/services");

    // Click service card
    await page.getByTestId("service-card").first().click();

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/services\/30000000/);
    await expect(page.getByTestId("service-name")).toHaveText("Payment API");
  });
});

test.describe("Service Detail & Integrations", () => {
  test.beforeEach(async ({ page }) => {
    await mockServiceDetailAPI(page);
  });

  test("displays service details and integrations", async ({ page }) => {
    await page.goto(`/services/${testData.SERVICE_1.id}`);

    // Service name
    await expect(page.getByTestId("service-name")).toHaveText("Payment API");

    // Integrations list
    await expect(page.getByTestId("integrations-list")).toBeVisible();
    const items = page.getByTestId("integration-item");
    await expect(items).toHaveCount(1);
    await expect(page.getByText("Datadog Webhook")).toBeVisible();

    // Integration key is visible
    await expect(page.getByTestId("integration-key").first()).toContainText("int_");
  });

  test("shows webhook example", async ({ page }) => {
    await page.goto(`/services/${testData.SERVICE_1.id}`);

    await expect(page.getByTestId("webhook-example")).toBeVisible();
    await expect(page.getByText("Example webhook payload:")).toBeVisible();
    await expect(page.getByText("integration_key")).toBeVisible();
  });

  test("creates a new integration", async ({ page }) => {
    await page.goto(`/services/${testData.SERVICE_1.id}`);

    // Click add integration
    await page.getByTestId("create-integration-button").click();

    // Fill the form
    await page.getByTestId("integration-name-input").fill("Sentry Webhook");
    await page.getByTestId("integration-description-input").fill("Error tracking alerts");

    // Submit
    await page.getByTestId("submit-integration").click();

    // Should show 2 integrations now
    const items = page.getByTestId("integration-item");
    await expect(items).toHaveCount(2);
    await expect(page.getByText("Sentry Webhook")).toBeVisible();
  });

  test("displays webhook URL", async ({ page }) => {
    await page.goto(`/services/${testData.SERVICE_1.id}`);

    // Webhook URL section is visible with the endpoint
    const webhookSection = page.getByTestId("webhook-url-section");
    await expect(webhookSection).toBeVisible();
    await expect(page.getByTestId("webhook-url")).toContainText("/v1/events");
  });

  test("displays integration health status", async ({ page }) => {
    await page.goto(`/services/${testData.SERVICE_1.id}`);

    // Health status is visible
    const health = page.getByTestId("integration-health");
    await expect(health).toBeVisible();

    // Last event time is shown
    await expect(page.getByTestId("last-event-time")).toBeVisible();

    // Event count badge shows count
    await expect(page.getByTestId("event-count-badge")).toContainText("42 events (24h)");
  });
});
