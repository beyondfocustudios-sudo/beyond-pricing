import { chromium, type Page } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.E2E_BASE_URL ?? "https://beyond-pricing.vercel.app";
const teamEmail = process.env.E2E_EMAIL ?? "";
const teamPassword = process.env.E2E_PASSWORD ?? "";
const clientEmail = process.env.E2E_CLIENT_EMAIL ?? "cliente.teste@beyondfoc.us";
const clientPassword = process.env.E2E_CLIENT_PASSWORD ?? "BtPortal!2026#";

async function loginWithPassword(page: Page, email: string, password: string, expectedPath: RegExp) {
  await page.goto(`${baseURL}/login`);
  await page.getByPlaceholder(/@/i).first().fill(email.trim().toLowerCase());

  const continueButton = page.getByRole("button", { name: /continuar/i });
  if (await continueButton.count()) {
    await continueButton.first().click();
  }

  const passwordTab = page.getByRole("button", { name: /^password$/i });
  if (await passwordTab.count()) {
    await passwordTab.first().click();
  }

  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /^entrar$/i }).first().click();
  await page.waitForURL(expectedPath, { timeout: 45_000 });
}

async function main() {
  if (!teamEmail || !teamPassword) {
    throw new Error("Missing E2E_EMAIL/E2E_PASSWORD to generate team storage state.");
  }

  const browser = await chromium.launch();

  try {
    const teamContext = await browser.newContext();
    const teamPage = await teamContext.newPage();
    await loginWithPassword(teamPage, teamEmail, teamPassword, /\/app/);
    await teamContext.storageState({ path: path.resolve("e2e/storageState-team.json") });
    await teamContext.close();

    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    await loginWithPassword(clientPage, clientEmail, clientPassword, /\/portal/);
    await clientContext.storageState({ path: path.resolve("e2e/storageState-client.json") });
    await clientContext.close();

    // eslint-disable-next-line no-console
    console.log("Storage states generated: e2e/storageState-team.json, e2e/storageState-client.json");
  } finally {
    await browser.close();
  }
}

void main();

