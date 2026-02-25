import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getSecretKey() {
  const secret = process.env.CALENDAR_TOKEN_SECRET;
  if (!secret) {
    throw new Error("Missing CALENDAR_TOKEN_SECRET");
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(value: string) {
  const key = getSecretKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(payload: string) {
  const raw = Buffer.from(payload, "base64");
  if (raw.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted payload");
  }

  const key = getSecretKey();
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
