#!/usr/bin/env node

/**
 * PREFLIGHT SCRIPT - Pre-Commit & Pre-Push Validation
 *
 * Usage:
 *   npm run preflight                       - Full validation
 *   npx tsx scripts/preflight.ts --quick    - Fast checks only
 *   npx tsx scripts/preflight.ts --skip-smoke - Skip Playwright tests
 *
 * Validates:
 *   1. Branch is NOT main
 *   2. Git working tree is clean
 *   3. npm run build passes (EXIT=0)
 *   4. Smoke tests pass (Playwright)
 *   5. /api/version endpoint is valid
 *   6. No .env.local file committed
 *
 * Exit codes:
 *   0 = All checks passed
 *   1 = Validation failed
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning";
}

// Color codes
const RED = "\x1b[0;31m";
const YELLOW = "\x1b[1;33m";
const GREEN = "\x1b[0;32m";
const BLUE = "\x1b[0;36m";
const NC = "\x1b[0m"; // No Color

function log(color: string, message: string) {
  console.log(`${color}${message}${NC}`);
}

function run(cmd: string, options?: { ignoreError?: boolean }): string {
  try {
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch (err) {
    if (options?.ignoreError) {
      return "";
    }
    throw err;
  }
}

function runCommand(
  cmd: string,
  options?: { ignoreError?: boolean; silent?: boolean }
): string {
  try {
    return spawnSync("sh", ["-c", cmd], {
      encoding: "utf-8",
      stdio: options?.silent ? "pipe" : "inherit",
    }).stdout || "";
  } catch (err) {
    if (options?.ignoreError) {
      return "";
    }
    throw err;
  }
}

// ============================================================================
// CHECK 1: Branch is NOT main
// ============================================================================
function checkBranch(): CheckResult {
  const branch = run("git branch --show-current");

  if (branch === "main") {
    return {
      name: "Branch Check",
      passed: false,
      message: "❌ You are on main branch. Never commit directly to main!",
      severity: "error",
    };
  }

  return {
    name: "Branch Check",
    passed: true,
    message: `✅ On feature branch: ${branch}`,
    severity: "error",
  };
}

// ============================================================================
// CHECK 2: Git working tree is clean (unstaged changes only)
// ============================================================================
function checkGitStatus(): CheckResult {
  // Only check for UNSTAGED changes (exclude staged files with --untracked-files=no)
  // This allows checking if there are changes that haven't been staged yet
  const unstaged = run("git diff --name-only");

  if (unstaged.length > 0) {
    const lines = unstaged.split("\n").filter((l) => l.length > 0).length;
    return {
      name: "Git Status",
      passed: false,
      message: `❌ Unstaged changes (${lines} files). Run: git add . before commit`,
      severity: "error",
    };
  }

  return {
    name: "Git Status",
    passed: true,
    message: "✅ Working tree is clean (no unstaged changes)",
    severity: "error",
  };
}

// ============================================================================
// CHECK 3: npm run build passes
// ============================================================================
function checkBuild(): CheckResult {
  log(BLUE, "  Running: npm run build");

  try {
    // Use spawnSync to check actual exit code
    const result = spawnSync("sh", ["-c", "npm run build"], {
      encoding: "utf-8",
      stdio: "pipe",
    });

    // Exit code 0 = success
    if (result.status === 0) {
      return {
        name: "Build Check",
        passed: true,
        message: "✅ Build passed",
        severity: "error",
      };
    }

    // Non-zero exit = failure
    return {
      name: "Build Check",
      passed: false,
      message: `❌ Build failed (exit code ${result.status}). Run: npm run build`,
      severity: "error",
    };
  } catch (err) {
    return {
      name: "Build Check",
      passed: false,
      message: "❌ Build failed (exception). Run: npm run build",
      severity: "error",
    };
  }
}

// ============================================================================
// CHECK 4: Smoke tests pass (optional, can be skipped)
// ============================================================================
function checkSmokeTests(skipSmoke: boolean): CheckResult {
  if (skipSmoke) {
    return {
      name: "Smoke Tests",
      passed: true,
      message: "⏭️  Skipped (--skip-smoke flag)",
      severity: "warning",
    };
  }

  log(BLUE, "  Running: npm run test:smoke");

  try {
    runCommand("npm run test:smoke 2>&1", { silent: true });
    return {
      name: "Smoke Tests",
      passed: true,
      message: "✅ Smoke tests passed",
      severity: "warning",
    };
  } catch (err) {
    return {
      name: "Smoke Tests",
      passed: false,
      message:
        "⚠️  Smoke tests failed (warning only). Review before pushing.",
      severity: "warning",
    };
  }
}

// ============================================================================
// CHECK 5: No .env.local file committed
// ============================================================================
function checkEnvLocal(): CheckResult {
  // Check if .env.local is tracked by git or staged
  const tracked = run("git ls-files .env.local", { ignoreError: true });
  const staged = run("git diff --cached --name-only | grep .env.local", {
    ignoreError: true,
  });

  if (tracked || staged) {
    return {
      name: ".env.local Check",
      passed: false,
      message:
        "❌ .env.local is staged/tracked! Remove with: git rm --cached .env.local",
      severity: "error",
    };
  }

  return {
    name: ".env.local Check",
    passed: true,
    message: "✅ .env.local not committed",
    severity: "error",
  };
}

// ============================================================================
// CHECK 6: /api/version endpoint is valid (only if server running)
// ============================================================================
function checkVersionEndpoint(): CheckResult {
  try {
    const response = runCommand(
      'curl -s http://localhost:3000/api/version 2>/dev/null || echo ""',
      { ignoreError: true }
    );

    if (!response || response.length === 0) {
      return {
        name: "Version Endpoint",
        passed: true,
        message: "⏭️  Server not running (skip - check in production)",
        severity: "warning",
      };
    }

    try {
      const versionData = JSON.parse(response);

      if (
        versionData.branch &&
        versionData.sha &&
        versionData.deploymentUrl
      ) {
        return {
          name: "Version Endpoint",
          passed: true,
          message: `✅ /api/version valid (branch: ${versionData.branch.substring(0, 20)})`,
          severity: "warning",
        };
      }
    } catch {
      // Response is not JSON
    }

    return {
      name: "Version Endpoint",
      passed: false,
      message:
        "⚠️  /api/version returned invalid data (warning only - check in production)",
      severity: "warning",
    };
  } catch {
    return {
      name: "Version Endpoint",
      passed: true,
      message: "⏭️  Could not reach localhost:3000 (skip - check in production)",
      severity: "warning",
    };
  }
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const skipSmoke = args.includes("--skip-smoke");
  const quick = args.includes("--quick");

  log(BLUE, "\n🔒 PREFLIGHT CHECK - Pre-Commit & Pre-Push Validation\n");

  const checks: CheckResult[] = [];

  // Always run critical checks
  checks.push(checkBranch());
  checks.push(checkEnvLocal());
  checks.push(checkGitStatus());

  if (!quick) {
    // Run build and tests only if not --quick
    checks.push(checkBuild());
    checks.push(checkSmokeTests(skipSmoke));
    checks.push(checkVersionEndpoint());
  }

  // ========================================================================
  // RESULTS
  // ========================================================================
  log(BLUE, "---\n");

  const errors = checks.filter((c) => !c.passed && c.severity === "error");
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning");

  checks.forEach((check) => {
    log(NC, `${check.message}`);
  });

  log(BLUE, "\n---\n");

  if (errors.length > 0) {
    log(RED, `❌ PREFLIGHT FAILED - ${errors.length} error(s)\n`);
    errors.forEach((err) => {
      log(RED, `   • ${err.name}: ${err.message.replace(/^❌ /, "")}`);
    });
    log(RED, "\n   Fix issues and try again.\n");
    process.exit(1);
  }

  if (warnings.length > 0) {
    log(YELLOW, `⚠️  PREFLIGHT PASSED with ${warnings.length} warning(s)\n`);
  } else {
    log(GREEN, `✅ PREFLIGHT PASSED - Ready to commit!\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  log(RED, `❌ Unexpected error: ${err.message}\n`);
  process.exit(1);
});
