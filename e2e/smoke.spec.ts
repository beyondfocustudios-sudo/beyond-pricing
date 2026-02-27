import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const clientEmail = process.env.E2E_CLIENT_EMAIL ?? "cliente.teste@beyondfoc.us";
const clientPassword = process.env.E2E_CLIENT_PASSWORD ?? "BtPortal!2026#";
const collaboratorEmail = process.env.E2E_COLLAB_EMAIL;
const collaboratorPassword = process.env.E2E_COLLAB_PASSWORD;
const e2eBaseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

const NOISE_PATTERNS = [
  /chrome-extension:\/\//i,
  /FrameDoesNotExistError/i,
  /manifest/i,
  /permissions?\b/i,
  /background\.js/i,
  /localhost:8081/i,
];

function shouldIgnoreNoise(message: string, url?: string) {
  if (url && NOISE_PATTERNS.some((pattern) => pattern.test(url))) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(message));
}

const envCache = new Map<string, string>();

function readLocalEnv(name: string) {
  if (envCache.has(name)) return envCache.get(name) ?? "";
  const fromProcess = process.env[name];
  if (fromProcess) {
    envCache.set(name, fromProcess);
    return fromProcess;
  }
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const raw = trimmed.slice(idx + 1).trim();
      const value = raw.replace(/^['"]|['"]$/g, "");
      if (!envCache.has(key)) envCache.set(key, value);
    }
  } catch {
    // Ignore env file read failures.
  }
  return envCache.get(name) ?? "";
}

async function getSupabaseSessionCookie(emailAddress: string, passwordValue: string) {
  const supabaseUrl = readLocalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = readLocalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: emailAddress, password: passwordValue }),
  });

  if (!response.ok) return null;

  const session = await response.json() as Record<string, unknown>;
  const token = Buffer.from(JSON.stringify(session), "utf8").toString("base64");
  const projectRef = new URL(supabaseUrl).host.split(".")[0];
  return {
    authCookieName: `sb-${projectRef}-auth-token`,
    authCookieValue: `base64-${token}`,
  };
}

function createConsoleGuard(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    const location = msg.location();
    const url = location?.url ?? "";
    if (shouldIgnoreNoise(text, url)) return;
    errors.push(`[console.error] ${text}${url ? ` @ ${url}` : ""}`);
  });
  page.on("pageerror", (error) => {
    const text = error?.message ?? String(error);
    if (shouldIgnoreNoise(text)) return;
    errors.push(`[pageerror] ${text}`);
  });
  return () => {
    expect(errors, errors.join("\n")).toEqual([]);
  };
}

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

async function loginClient(page: Page, credentials?: { email?: string; password?: string }) {
  const loginEmail = (credentials?.email ?? clientEmail ?? "").trim().toLowerCase();
  const loginPassword = (credentials?.password ?? clientPassword ?? "").trim();

  const supabaseSessionCookie = await getSupabaseSessionCookie(loginEmail, loginPassword);
  if (supabaseSessionCookie) {
    await page.context().addCookies([
      {
        name: supabaseSessionCookie.authCookieName,
        value: supabaseSessionCookie.authCookieValue,
        url: e2eBaseUrl,
      },
      {
        name: "bp_session_ttl",
        value: String(Math.floor(Date.now() / 1000) + 86400),
        url: e2eBaseUrl,
      },
    ]);
    await page.goto("/portal");
    if (/\/portal/.test(new URL(page.url()).pathname)) return;
  }

  await page.goto("/login");
  await page.getByPlaceholder(/@/i).first().fill(loginEmail);

  const continueButton = page.getByRole("button", { name: /continuar/i });
  if (await continueButton.count()) {
    await continueButton.first().click();
  }

  const passwordTab = page.getByRole("button", { name: /^password$/i });
  if (await passwordTab.count()) {
    await passwordTab.first().click({ force: true });
  }

  const passwordInput = page.locator('input[type="password"]').first();
  if (await passwordInput.count() === 0 && await passwordTab.count()) {
    await passwordTab.first().click({ force: true });
  }
  await expect(passwordInput).toBeVisible({ timeout: 12_000 });
  await passwordInput.fill(loginPassword);
  await page.getByRole("button", { name: /^entrar$/i }).first().click();
  await page.waitForURL(/\/portal/, { timeout: 30_000 });
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
    const assertNoConsoleErrors = createConsoleGuard(page);

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
    assertNoConsoleErrors();
  });

  test("auth guardrails: team cannot stay in portal area", async ({ page }) => {
    test.setTimeout(120_000);
    const assertNoConsoleErrors = createConsoleGuard(page);
    await loginTeam(page);

    await page.goto("/portal");
    await page.waitForURL(/\/app\//, { timeout: 30_000 });
    await expect(page.getByText("Application error")).toHaveCount(0);
    assertNoConsoleErrors();
  });

  test("layout sanity: edge-to-edge shell and no overlapping dashboard cards", async ({ page }) => {
    test.setTimeout(120_000);
    const assertNoConsoleErrors = createConsoleGuard(page);
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
    assertNoConsoleErrors();
  });

  test("collaborator mode restrictions", async ({ page }) => {
    test.skip(!collaboratorEmail || !collaboratorPassword, "Set E2E_COLLAB_EMAIL and E2E_COLLAB_PASSWORD.");
    test.setTimeout(180_000);
    const assertNoConsoleErrors = createConsoleGuard(page);

    await loginTeam(page, { email: collaboratorEmail, password: collaboratorPassword });
    await page.waitForURL(/\/app\/collaborator/, { timeout: 30_000 });

    await page.goto("/app/clients");
    await page.waitForURL(/\/app\/collaborator/, { timeout: 30_000 });
    await expect(page.getByText("Acesso restrito no modo colaborador")).toHaveCount(1);

    await page.goto("/app/integrations");
    await page.waitForURL(/\/app\/collaborator/, { timeout: 30_000 });
    await expect(page.getByText("Application error")).toHaveCount(0);
    assertNoConsoleErrors();
  });

  test("review flow: version + guest comment + task + approvals + access sanity", async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    const assertNoConsoleErrors = createConsoleGuard(page);

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
    assertNoConsoleErrors();
  });

  test("hq assistant widget: open + task + search + report + interpret", async ({ page }) => {
    test.setTimeout(180_000);
    const assertNoConsoleErrors = createConsoleGuard(page);

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
    assertNoConsoleErrors();
  });
});

test.describe("Portal client smoke", () => {
  test.skip(!clientEmail || !clientPassword, "Set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD.");

  test("client login + portal routes + project tabs", async ({ page }) => {
    test.setTimeout(180_000);
    const assertNoConsoleErrors = createConsoleGuard(page);

    await loginClient(page);

    await page.goto("/portal");
    await expect(page.getByText("Application error")).toHaveCount(0);

    await page.goto("/portal/projects");
    await expect(page).toHaveURL(/\/portal\/projects/);
    await expect(page.getByText("Application error")).toHaveCount(0);

    const emptyProjects = page.getByText("Sem projetos para o filtro atual.");
    if (await emptyProjects.count()) {
      await expect(emptyProjects).toBeVisible();
      assertNoConsoleErrors();
      return;
    }

    const searchInput = page.getByLabel("Search portal");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("zzzz_sem_resultados_qa");
    await expect(page.getByText("Sem projetos para o filtro atual.")).toBeVisible();
    await searchInput.fill("");
    await expect(page.getByRole("link", { name: /abrir/i }).first()).toBeVisible();

    await expect(page).toHaveURL(/selected=/);
    const selectedId = new URL(page.url()).searchParams.get("selected");
    expect(selectedId).toBeTruthy();
    await page.goto(`/portal/projects/${selectedId}`);
    await expect(page).toHaveURL(/\/portal\/projects\/[0-9a-f-]+/i);

    for (const [name, key] of [
      ["Overview", "overview"],
      ["Entregas", "deliveries"],
      ["Documentos", "documents"],
      ["Referências", "references"],
      ["Inbox", "inbox"],
      ["Calendário", "calendar"],
      ["Aprovações", "approvals"],
    ] as const) {
      await page.getByRole("button", { name }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${key}`));
      await expect(page.getByText("Application error")).toHaveCount(0);
    }

    assertNoConsoleErrors();
  });

  test("client inbox send persists and calendar links are valid", async ({ page }) => {
    test.setTimeout(180_000);
    const assertNoConsoleErrors = createConsoleGuard(page);

    await loginClient(page);
    await page.goto("/portal/projects");

    await expect(page).toHaveURL(/selected=/);
    const selectedId = new URL(page.url()).searchParams.get("selected");
    if (!selectedId) {
      await expect(page.getByText("Seleciona um projeto")).toBeVisible();
      assertNoConsoleErrors();
      return;
    }
    await page.goto(`/portal/projects/${selectedId}`);
    await expect(page).toHaveURL(/\/portal\/projects\/[0-9a-f-]+/i);

    await page.getByRole("button", { name: "Inbox" }).click();
    await expect(page).toHaveURL(/tab=inbox/);

    const contentBefore = await page.content();
    const text = `E2E portal message ${Date.now()}`;
    await page.getByPlaceholder("Escrever mensagem").fill(text);
    await page.getByRole("button", { name: "Enviar mensagem" }).first().click();
    await expect(page.getByText(text)).toBeVisible();
    await page.reload();
    await expect(page.getByText(text)).toBeVisible();

    await page.getByRole("button", { name: "Calendário" }).click();
    await expect(page).toHaveURL(/tab=calendar/);
    const googleLink = page.getByRole("link", { name: /add to google/i }).first();
    if (await googleLink.count()) {
      const href = await googleLink.getAttribute("href");
      expect(href).toBeTruthy();
      expect(href ?? "").toContain("calendar.google.com/calendar/render");
    } else {
      await expect(page.getByText(/sem marcos definidos/i)).toHaveCount(1);
    }

    const icsLink = page.getByRole("link", { name: /download ics/i }).first();
    if (await icsLink.count()) {
      const href = await icsLink.getAttribute("href");
      expect(href).toBeTruthy();
      expect(href ?? "").toContain("/api/calendar/event.ics");
    }

    const contentAfter = await page.content();
    expect(contentAfter.length).toBeGreaterThan(contentBefore.length / 2);
    assertNoConsoleErrors();
  });

  test("portal deliveries preview drawer + calendar toggles", async ({ page }) => {
    test.setTimeout(180_000);
    const assertNoConsoleErrors = createConsoleGuard(page);

    await loginClient(page);
    await page.goto("/portal/projects");
    await expect(page).toHaveURL(/selected=/);
    const selectedId = new URL(page.url()).searchParams.get("selected");
    if (!selectedId) return;

    await page.goto(`/portal/projects/${selectedId}?tab=deliveries`);
    await expect(page).toHaveURL(/tab=deliveries/);

    const firstDeliveryCard = page.locator("section").nth(1).locator("button").first();
    if (await firstDeliveryCard.count()) {
      await firstDeliveryCard.click();
      const previewButton = page.getByRole("button", { name: /abrir preview/i }).first();
      if (await previewButton.count()) {
        await previewButton.click();
      }
      await expect(page.getByRole("button", { name: /fechar/i }).first()).toBeVisible();
    }

    await page.goto("/portal/calendar");
    await expect(page.getByRole("button", { name: /milestones/i }).first()).toBeVisible();
    await page.getByRole("button", { name: /timeline/i }).first().click();
    await page.getByRole("button", { name: /tasks/i }).first().click();
    await page.getByRole("button", { name: /milestones/i }).first().click();
    await page.getByRole("button", { name: /abrir inbox|fechar inbox/i }).first().click();

    assertNoConsoleErrors();
  });

  test("client dashboard smoke: portal loads without crashing", async ({ page }) => {
    test.setTimeout(60_000);
    const assertNoConsoleErrors = createConsoleGuard(page);

    // Login as client user
    await loginClient(page);

    // Navigate to portal dashboard
    await page.goto("/portal");

    // Verify page loaded without errors
    await expect(page).toHaveURL(/\/portal\/?$/);
    await expect(page.getByText("Application error")).toHaveCount(0);
    await expect(page.getByText("Cliente Dashboard")).toBeVisible();

    // Verify navigation and key elements are present
    await expect(page.getByRole("navigation").first()).toBeVisible();

    // Check that no unexpected console errors occurred
    assertNoConsoleErrors();
  });
});
