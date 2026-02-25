import crypto from "node:crypto";

export function createInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function maskEmail(email: string) {
  const [name = "", domain = ""] = email.split("@");
  if (!name || !domain) return email;
  if (name.length <= 2) return `${name[0] ?? "*"}*@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}
