import { slugify } from "@/lib/utils";

export const DROPBOX_PATH_OUTSIDE_ROOT = "DROPBOX_PATH_OUTSIDE_ROOT";
export const DEFAULT_DROPBOX_ROOT = "/Clientes";

function normalizeAnyPath(value: string) {
  const raw = String(value ?? "").trim();
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const cleaned = withSlash.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return cleaned || "/";
}

function sanitizePart(part: string) {
  return String(part ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

export function normalizeRoot(root: string) {
  const normalized = normalizeAnyPath(root);
  if (!normalized || normalized === "/") {
    throw new Error("DROPBOX_ROOT_REQUIRED");
  }
  const lower = normalized.toLowerCase();
  if (lower === "/clientes") return "/Clientes";
  if (lower.startsWith("/clientes/")) {
    return `/Clientes/${normalized.split("/").slice(2).join("/")}`.replace(/\/{2,}/g, "/");
  }
  return normalized;
}

export function join(root: string, ...parts: string[]) {
  const normalizedRoot = normalizeRoot(root);
  const safeParts = parts
    .map(sanitizePart)
    .filter(Boolean);

  if (safeParts.length === 0) return normalizedRoot;
  return normalizeAnyPath(`${normalizedRoot}/${safeParts.join("/")}`);
}

export function assertInsideRoot(root: string, path: string) {
  const normalizedRoot = normalizeRoot(root);
  const normalizedPath = normalizeAnyPath(path);
  if (normalizedPath === normalizedRoot) return normalizedPath;
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) return normalizedPath;

  const err = new Error(DROPBOX_PATH_OUTSIDE_ROOT);
  err.name = DROPBOX_PATH_OUTSIDE_ROOT;
  throw err;
}

export function clientPath(root: string, clientName: string) {
  const slug = slugify(clientName) || "cliente";
  return join(root, slug);
}

export function projectPath(root: string, clientName: string, projectName: string) {
  const clientSlug = slugify(clientName) || "cliente";
  const projectSlug = slugify(projectName) || "projeto";
  return join(root, clientSlug, projectSlug);
}

export function normalizeAndAssertInsideRoot(root: string, path: string) {
  return assertInsideRoot(root, normalizeAnyPath(path));
}
