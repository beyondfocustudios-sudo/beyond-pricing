import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("Beyond Pricing smoke", () => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run smoke tests.");

  test("login + core app pages", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(email ?? "");
    await page.getByLabel(/password/i).fill(password ?? "");
    await page.getByRole("button", { name: /entrar|login|sign in/i }).click();

    await page.waitForURL(/\/app/, { timeout: 30_000 });
    await expect(page.getByText("Application error")).toHaveCount(0);

    await page.goto("/app/projects/new");
    await page.waitForURL(/\/app\/projects\/.+/, { timeout: 30_000 });
    await expect(page.getByText("Application error")).toHaveCount(0);

    await page.goto("/app/checklists");
    await expect(page).toHaveURL(/\/app\/checklists/);
    await expect(page.getByText("Application error")).toHaveCount(0);

    await page.goto("/app/journal");
    await expect(page).toHaveURL(/\/app\/journal/);
    await expect(page.getByText("Application error")).toHaveCount(0);

    await page.goto("/app/tasks");
    await expect(page).toHaveURL(/\/app\/tasks/);
    await expect(page.getByText("Application error")).toHaveCount(0);

    await page.goto("/app/crm");
    await expect(page).toHaveURL(/\/app\/crm/);
    await expect(page.getByText("Application error")).toHaveCount(0);

    await page.goto("/app/clients");
    await expect(page).toHaveURL(/\/app\/clients/);
    await expect(page.getByText("Application error")).toHaveCount(0);

    await page.goto("/app/inbox");
    await expect(page).toHaveURL(/\/app\/inbox/);
    await expect(page.getByText("Application error")).toHaveCount(0);
  });
});
