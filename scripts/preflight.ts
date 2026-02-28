#!/usr/bin/env tsx
/**
 * preflight.ts — Pre-commit / pre-push validation script
 *
 * Modes:
 *   --skip-smoke   Fast checks only (used by pre-commit hook)
 *   (no flag)      Full suite (used by pre-push hook)
 */

import { execSync } from "child_process";

const args = process.argv.slice(2);
const skipSmoke = args.includes("--skip-smoke");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[36m";
const NC = "\x1b[0m";

function ok(msg: string) {
  console.log(`${GREEN}✅ ${msg}${NC}`);
}

function warn(msg: string) {
  console.log(`${YELLOW}⚠️  ${msg}${NC}`);
}

function fail(msg: string): never {
  console.error(`${RED}❌ ${msg}${NC}`);
  process.exit(1);
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

// ─── Check 1: Not on protected branch ────────────────────────────────────────
const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch === "main") {
  warn("You are committing directly to main.");
  warn("Consider using a feature branch instead.");
}
ok(`Branch: ${branch}`);

// ─── Check 2: No .env.local secrets in staged files ──────────────────────────
const staged = run("git diff --cached --name-only");
if (staged.includes(".env.local") || staged.includes(".env.production")) {
  fail("Staged files include .env.local or .env.production — remove them before committing.");
}
ok("No .env.local in staged files");

// ─── Check 3: No merge conflict markers ──────────────────────────────────────
// Build pattern dynamically to avoid self-detection in this file's source code
const markers = ["<" + "<" + "<" + "<", "=" + "=" + "=" + "=", ">" + ">" + ">" + ">"];
const stagedFiles = staged.split("\n").filter(Boolean);
let conflictFound = false;
for (const file of stagedFiles) {
  const content = run(`git show :${file} 2>/dev/null`);
  if (markers.some((m) => content.includes(m + m))) {
    console.error(`${RED}Conflict marker found in: ${file}${NC}`);
    conflictFound = true;
  }
}
if (conflictFound) {
  fail("Resolve merge conflicts before committing.");
}
ok("No merge conflict markers");

// ─── Fast mode: skip remaining checks ────────────────────────────────────────
if (skipSmoke) {
  ok("Pre-commit checks passed (skip-smoke mode)");
  console.log(`\n${BLUE}🟢 Preflight passed${NC}\n`);
  process.exit(0);
}

// ─── Check 4: TypeScript compile ─────────────────────────────────────────────
console.log(`${BLUE}⏳ Running TypeScript check...${NC}`);
const tscOut = run("npx tsc --noEmit 2>&1");
if (tscOut.includes("error TS")) {
  fail(`TypeScript errors found:\n${tscOut}`);
}
ok("TypeScript: no errors");

// ─── Check 5: Build ───────────────────────────────────────────────────────────
console.log(`${BLUE}⏳ Running next build...${NC}`);
try {
  execSync("npm run build", { stdio: "inherit" });
  ok("Build: passed");
} catch {
  fail("Build failed — fix errors before pushing");
}

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log(`\n${GREEN}🟢 Preflight complete — all checks passed${NC}\n`);
process.exit(0);
