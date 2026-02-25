import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

async function loginTeam(page: Page) {
  await page.goto("/login?mode=team");
  const teamCard = page.getByRole("button", { name: /equipa beyond/i });
  if (await teamCard.count()) {
    await teamCard.first().click();
  }

  await page.getByPlaceholder(/@/i).first().fill((email ?? "").trim().toLowerCase());
  await page.getByPlaceholder(/••••/i).first().fill((password ?? "").trim());
  await page.getByRole("button", { name: /entrar|login|sign in/i }).click();

  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

async function createProjectAndGetId(page: Page) {
  await page.goto("/app/projects/new");
  await page.waitForURL((url) => {
    const path = url.pathname;
    return /^\/app\/projects\/[^/]+$/.test(path) && !path.endsWith("/new");
  }, { timeout: 30_000 });

  const projectId = page.url().split("/").at(-1) ?? "";
  expect(projectId).toMatch(/^[0-9a-f-]{20,}$/i);
  return projectId;
}

test.describe("Beyond Pricing smoke", () => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run smoke tests.");

  test("login + core app pages", async ({ page }) => {
    test.setTimeout(180_000);

    await loginTeam(page);

    await createProjectAndGetId(page);
    await expect(page.getByText("Application error")).toHaveCount(0);

    for (const route of [
      "/app/checklists",
      "/app/journal",
      "/app/tasks",
      "/app/crm",
      "/app/clients",
      "/app/inbox",
      "/app/insights",
      "/app/diagnostics",
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace("/", "\\/")));
      await expect(page.getByText("Application error")).toHaveCount(0);
    }
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

    await page.goto(`/portal/review/${deliverableId}`);
    await expect(page).toHaveURL(new RegExp(`/portal/review/${deliverableId}`));
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
