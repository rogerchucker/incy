import { test, expect } from "@playwright/test";
import {
  mockEscalationPoliciesAPI,
  mockEscalationPolicyDetailAPI,
  testData,
} from "./fixtures/api-mocks";

test.describe("Escalation Policies List", () => {
  test.beforeEach(async ({ page }) => {
    await mockEscalationPoliciesAPI(page);
  });

  test("displays list of escalation policies", async ({ page }) => {
    await page.goto("/escalation-policies");

    const cards = page.getByTestId("policy-card");
    await expect(cards).toHaveCount(1);
    await expect(page.getByText("Platform Default")).toBeVisible();
    await expect(page.getByText("2 rules")).toBeVisible();
    await expect(page.getByText("1 service")).toBeVisible();
    await expect(page.getByText("2 loops")).toBeVisible();
  });

  test("creates a new escalation policy with rules", async ({ page }) => {
    await page.goto("/escalation-policies");

    await page.getByTestId("create-policy-button").click();
    await page.getByTestId("policy-name-input").fill("Critical Alerts");

    // Select team
    await page.getByTestId("policy-team-select").click();
    await page.getByRole("option", { name: "Platform Team" }).click();

    // First rule is already there; set target
    const ruleEditors = page.getByTestId("rule-editor");
    await expect(ruleEditors).toHaveCount(1);
    await ruleEditors.first().getByTestId("rule-target-select").click();
    await page.getByRole("option", { name: "Alice Engineer" }).click();

    await page.getByTestId("submit-policy").click();

    // Should now show 2 policy cards
    await expect(page.getByText("Critical Alerts")).toBeVisible();
    const cards = page.getByTestId("policy-card");
    await expect(cards).toHaveCount(2);
  });
});

test.describe("Escalation Policy Detail", () => {
  test.beforeEach(async ({ page }) => {
    await mockEscalationPolicyDetailAPI(page);
  });

  test("displays policy detail with escalation chain", async ({ page }) => {
    await page.goto(
      `/escalation-policies/${testData.ESCALATION_POLICY_1.id}`
    );

    await expect(page.getByTestId("policy-name")).toHaveText("Platform Default");

    // Rules chain
    const rules = page.getByTestId("rule-item");
    await expect(rules).toHaveCount(2);
    await expect(page.getByText("Primary On-Call Rotation")).toBeVisible();
    await expect(page.getByText("5 min delay")).toBeVisible();
    await expect(page.getByText("Bob Oncall")).toBeVisible();
    await expect(page.getByText("10 min delay")).toBeVisible();
  });

  test("shows linked services", async ({ page }) => {
    await page.goto(
      `/escalation-policies/${testData.ESCALATION_POLICY_1.id}`
    );

    const linkedServices = page.getByTestId("linked-services");
    await expect(linkedServices).toBeVisible();
    await expect(page.getByTestId("linked-service-item")).toHaveCount(1);
    await expect(page.getByText("Payment API")).toBeVisible();
  });
});
