import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function createReviewToken() {
  return randomBytes(32).toString("hex");
}

export function hashReviewToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashReviewPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyReviewPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return true;
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}

export function maskTokenPreview(token: string) {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
