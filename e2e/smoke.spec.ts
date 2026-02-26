import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const collaboratorEmail = process.env.E2E_COLLAB_EMAIL;
const collaboratorPassword = process.env.E2E_COLLAB_PASSWORD;

async function loginTeam(page: Page, credentials?: { email?: string; password?: string }) {
  const loginEmail = (credentials?.email ?? email ?? "").trim().toLowerCase();
  const loginPassword = (credentials?.password ?? password ?? "").trim();

  await page.goto("/login");
  const teamCard = page.getByRole("button", { name: /equipa beyond/i });
  if (await teamCard.count()) {
    await teamCard.first().click();
  }

  await page.getByPlaceholder(/@/i).first().fill(loginEmail);

  const continueButton = page.getByRole("button", { name: /continuar/i });
  if (await continueButton.count()) {
    await continueButton.first().click();
  }

  const passwordTab = page.getByRole("button", { name: /^password$/i });
  if (await passwordTab.count()) {
    await passwordTab.first().click();
  }

  await page.locator('input[type="password"]').first().fill(loginPassword);
  await page.getByRole("button", { name: /^entrar$/i }).first().click();

  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

async function createProjectAndGetId(page: Page) {
  await page.goto("/app/projects/new");
  await page.getByRole("button", { name: /criar projeto/i }).first().click();
  await page.waitForURL((url) => {
    const path = url.pathname;
    return /^\/app\/projects\/[^/]+$/.test(path) && !path.endsWith("/new");
  }, { timeout: 30_000 });

  const projectId = page.url().split("/").at(-1) ?? "";
  expect(projectId).toMatch(/^[0-9a-f-]{20,}$/i);
  return projectId;
}

async function archiveCurrentProject(page: Page, projectId: string) {
  const res = await page.request.delete(`/api/projects/${projectId}`);
  expect(res.ok()).toBeTruthy();
  await page.goto("/app/projects");
  await page.waitForURL(/\/app\/projects$/, { timeout: 30_000 });
}

test("auth page does not render role gateway copy", async ({ page }) => {
  await page.goto("/login");
  const content = await page.content();
  expect(content).not.toContain("Seleciona o teu acesso");
  expect(content.toLowerCase()).not.toContain("role gateway");
});

test("version probe is non-cacheable", async ({ request }) => {
  const res = await request.get("/api/version");
  expect(res.ok()).toBeTruthy();
  const cacheControl = res.headers()["cache-control"] ?? "";
  expect(cacheControl.toLowerCase()).toContain("no-store");
});

test.describe("Beyond Pricing smoke", () => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run smoke tests.");

  test("login + core app pages", async ({ page }) => {
    test.setTimeout(180_000);

    await loginTeam(page);

    const projectId = await createProjectAndGetId(page);
    await archiveCurrentProject(page, projectId);
    await expect(page.getByText("Application error")).toHaveCount(0);

    for (const route of [
      "/app/checklists",
      "/app/journal",
      "/app/tasks",
      "/app/crm",
      "/app/clients",
      "/app/inbox",
      "/app/insights",
      "/app/integrations",
      "/app/diagnostics",
    ]) {
      await page.goto(route);
      const pathname = new URL(page.url()).pathname;
      expect(
        pathname.startsWith(route)
        || pathname.startsWith("/app/dashboard")
        || pathname.startsWith("/app/collaborator"),
      ).toBeTruthy();
      await expect(page.getByText("Application error")).toHaveCount(0);
    }
  });

  test("auth guardrails: team cannot stay in portal area", async ({ page }) => {
    test.setTimeout(120_000);
    await loginTeam(page);

    await page.goto("/portal");
    await page.waitForURL(/\/app\//, { timeout: 30_000 });
    await expect(page.getByText("Application error")).toHaveCount(0);
  });

  test("layout sanity: edge-to-edge shell and no overlapping dashboard cards", async ({ page }) => {
    test.setTimeout(120_000);
    await loginTeam(page);

    await page.goto("/app/dashboard");
    await page.waitForURL(/\/app\/dashboard|\/app$/, { timeout: 30_000 });

    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();

    const shell = page.locator(".super-app-surface").first();
    const shellBox = await shell.boundingBox();
    expect(shellBox).toBeTruthy();
    if (shellBox && viewport) {
      expect(shellBox.width).toBeGreaterThanOrEqual(viewport.width * 0.95);
    }

    const cards = page.locator(".dashboard-grid > *");
    const count = await cards.count();
    const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (let i = 0; i < Math.min(count, 10); i += 1) {
      const box = await cards.nth(i).boundingBox();
      if (!box) continue;
      if (box.width < 40 || box.height < 40) continue;
      boxes.push(box);
    }

    const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => {
      const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      return xOverlap * yOverlap > 16;
    };

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(intersects(boxes[i], boxes[j])).toBeFalsy();
      }
    }
  });

  test("collaborator mode restrictions", async ({ page }) => {
    test.skip(!collaboratorEmail || !collaboratorPassword, "Set E2E_COLLAB_EMAIL and E2E_COLLAB_PASSWORD.");
    test.setTimeout(180_000);

    await loginTeam(page, { email: collaboratorEmail, password: collaboratorPassword });
    await page.waitForURL(/\/app\/collaborator/, { timeout: 30_000 });

    await page.goto("/app/clients");
    await page.waitForURL(/\/app\/collaborator/, { timeout: 30_000 });
    await expect(page.getByText("Acesso restrito no modo colaborador")).toHaveCount(1);

    await page.goto("/app/integrations");
    await page.waitForURL(/\/app\/collaborator/, { timeout: 30_000 });
    await expect(page.getByText("Application error")).toHaveCount(0);
  });

  test("review flow: version + guest comment + task + approvals + access sanity", async ({ page, baseURL }) => {
    test.setTimeout(240_000);

    await loginTeam(page);

    const projectId = await createProjectAndGetId(page);

    const deliverableRes = await page.request.post("/api/review/deliverables", {
      data: {
        projectId,
        title: `E2E Deliverable ${Date.now()}`,
        description: "Smoke test review flow",
        fileUrl: "https://picsum.photos/seed/beyond-review/1280/720",
        fileType: "image/jpeg",
        notes: "Uploaded by smoke test",
      },
    });
    expect(deliverableRes.ok()).toBeTruthy();
    const deliverablePayload = await deliverableRes.json() as {
      deliverable: { id: string };
      version?: { id?: string };
    };

    const deliverableId = deliverablePayload.deliverable.id;
    let versionId = deliverablePayload.version?.id ?? "";
    expect(deliverableId).toBeTruthy();

    if (!versionId) {
      const detailsRes = await page.request.get(`/api/review/deliverables/${deliverableId}`);
      expect(detailsRes.ok()).toBeTruthy();
      const details = await detailsRes.json() as { selectedVersionId?: string | null };
      versionId = details.selectedVersionId ?? "";
    }
    expect(versionId).toBeTruthy();

    await page.goto(`/app/projects/${projectId}?tab=approvals`);
    await page.waitForURL(/\/app\/projects\/[0-9a-f-]+/i, { timeout: 30_000 });
    await expect(page.getByText("Application error")).toHaveCount(0);

    const threadRes = await page.request.post("/api/review/threads", {
      data: {
        versionId,
        body: "E2E team comment at timecode",
        timecodeSeconds: 12,
      },
    });
    expect(threadRes.ok()).toBeTruthy();
    const threadPayload = await threadRes.json() as { thread: { id: string } };

    const linkRes = await page.request.post("/api/review/links", {
      data: {
        deliverableId,
        expiresInDays: 7,
        allowGuestComments: true,
        singleUse: false,
        requireAuth: false,
      },
    });
    expect(linkRes.ok()).toBeTruthy();
    const linkPayload = await linkRes.json() as { shareUrl: string };
    const shareUrl = linkPayload.shareUrl;
    expect(shareUrl).toContain("/review-link/");

    const token = shareUrl.split("/review-link/")[1]?.split("?")[0] ?? "";
    expect(token).toBeTruthy();

    const guestCtx = await playwrightRequest.newContext({ baseURL });
    const guestCommentRes = await guestCtx.post(`/api/review-link/${token}/comments`, {
      data: {
        versionId,
        body: "Guest feedback: please tweak pacing",
        name: "Guest QA",
        email: "guest.qa@example.com",
        timecodeSeconds: 14,
      },
    });
    expect(guestCommentRes.ok()).toBeTruthy();

    const deniedThreadsRes = await guestCtx.get(`/api/review/threads?versionId=${encodeURIComponent(versionId)}`);
    expect([401, 403]).toContain(deniedThreadsRes.status());
    await guestCtx.dispose();

    const threadsListRes = await page.request.get(`/api/review/threads?versionId=${encodeURIComponent(versionId)}`);
    expect(threadsListRes.ok()).toBeTruthy();
    const threadsList = await threadsListRes.json() as {
      threads: Array<{ id: string; review_comments: Array<{ body: string }> }>;
    };
    const guestThread = threadsList.threads.find((thread) =>
      thread.review_comments.some((comment) => comment.body.includes("Guest feedback")),
    );
    expect(guestThread?.id).toBeTruthy();

    const taskRes = await page.request.post("/api/review/tasks", {
      data: { threadId: guestThread?.id ?? threadPayload.thread.id },
    });
    expect(taskRes.ok()).toBeTruthy();

    const changesRes = await page.request.post("/api/review/approvals", {
      data: {
        deliverableId,
        versionId,
        decision: "changes_requested",
        note: "Smoke test requested changes",
      },
    });
    expect(changesRes.ok()).toBeTruthy();

    const approveRes = await page.request.post("/api/review/approvals", {
      data: {
        deliverableId,
        versionId,
        decision: "approved",
        note: "Smoke test final approval",
      },
    });
    expect(approveRes.ok()).toBeTruthy();

    const finalRes = await page.request.get(`/api/review/deliverables/${deliverableId}`);
    expect(finalRes.ok()).toBeTruthy();
    const finalPayload = await finalRes.json() as {
      approvals: Array<{ decision: string }>;
      deliverable: { status?: string | null };
    };

    expect(finalPayload.approvals.some((row) => row.decision === "changes_requested")).toBeTruthy();
    expect(finalPayload.approvals.some((row) => row.decision === "approved")).toBeTruthy();
    expect(["approved", "in_review", "pending"]).toContain(finalPayload.deliverable.status ?? "pending");
  });

  test("hq assistant widget: open + task + search + report + interpret", async ({ page }) => {
    test.setTimeout(180_000);

    await loginTeam(page);
    await page.goto("/app/dashboard");

    const fab = page.getByTestId("hq-assistant-fab");
    await expect(fab).toBeVisible();
    await fab.click();

    await expect(page.getByTestId("hq-actions-tab")).toBeVisible();

    const title = `E2E HQ task ${Date.now()}`;
    await page.getByTestId("hq-create-task-title").fill(title);
    await page.getByTestId("hq-create-task-submit").click();

    await page.getByRole("button", { name: "Pesquisa" }).click();
    await expect(page.getByTestId("hq-search-tab")).toBeVisible();
    await page.getByTestId("hq-search-input").fill("projeto");
    await expect(page.getByTestId("hq-search-results")).toBeVisible();

    await page.getByTestId("hq-report-bug").click();
    await page.getByPlaceholder("Descreve o que aconteceu").fill("E2E report bug via HQ Assistant.");
    await page.getByPlaceholder("O que esperavas que acontecesse?").fill("Esperava render sem erros.");
    await page.getByPlaceholder("Passos para reproduzir (se souberes)").fill("1) Abrir dashboard 2) Abrir widget");
    await page.getByTestId("hq-report-submit").click();

    const interpretRes = await page.request.post("/api/assistant/interpret", {
      data: {
        message: "cria tarefa para follow-up",
        context_minimal: {
          route: "/app/dashboard",
        },
      },
    });

    expect([200, 429]).toContain(interpretRes.status());
    const interpretJson = await interpretRes.json() as { intent?: string };
    expect(interpretJson.intent).toBeTruthy();
  });
});
