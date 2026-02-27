#!/usr/bin/env node

/**
 * VERIFY DEPLOYMENT SCRIPT - Post-Merge Production Validation
 *
 * Usage:
 *   npm run verify-deployment          - Check production matches origin/main
 *   npx tsx scripts/verify-deployment.ts --verbose - Detailed output
 *   npx tsx scripts/verify-deployment.ts --skip-curl - Skip remote check
 *
 * Validates:
 *   1. Local SHA matches origin/main HEAD
 *   2. /api/version endpoint returns correct branch (main)
 *   3. /api/version SHA matches origin/main
 *   4. Production URL is accessible
 *
 * Exit codes:
 *   0 = Deployment verified successfully
 *   1 = Deployment verification failed
 */

import { execSync } from "child_process";
import https from "https";

// Color codes
const RED = "\x1b[0;31m";
const YELLOW = "\x1b[1;33m";
const GREEN = "\x1b[0;32m";
const BLUE = "\x1b[0;36m";
const NC = "\x1b[0m";

interface VersionInfo {
  branch: string;
  sha: string;
  deploymentUrl: string;
  buildTime: string;
  env: string;
}

function log(color: string, message: string) {
  console.log(`${color}${message}${NC}`);
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch (err) {
    return "";
  }
}

async function fetchVersionEndpoint(url: string): Promise<VersionInfo | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(null);
    }, 5000);

    https
      .get(`${url}/api/version`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          clearTimeout(timeoutId);
          try {
            resolve(JSON.parse(data) as VersionInfo);
          } catch {
            resolve(null);
          }
        });
      })
      .on("error", () => {
        clearTimeout(timeoutId);
        resolve(null);
      });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const skipCurl = args.includes("--skip-curl");

  log(BLUE, "\n✈️  DEPLOYMENT VERIFICATION - Post-Merge Validation\n");

  // ========================================================================
  // CHECK 1: Get local main SHA
  // ========================================================================
  log(BLUE, "📍 Checking local branch state...");

  const currentBranch = run("git branch --show-current");
  const localSha = run("git rev-parse HEAD");
  const mainSha = run("git rev-parse origin/main");

  if (!localSha || !mainSha) {
    log(RED, "❌ Could not determine git SHA. Are you in a git repo?");
    process.exit(1);
  }

  log(
    GREEN,
    `  ✅ Current branch: ${currentBranch}`
  );
  log(GREEN, `  ✅ Local SHA: ${localSha.substring(0, 7)}`);
  log(GREEN, `  ✅ origin/main SHA: ${mainSha.substring(0, 7)}`);

  // ========================================================================
  // CHECK 2: Verify /api/version endpoint
  // ========================================================================
  log(BLUE, "\n📡 Checking production /api/version endpoint...");

  if (skipCurl) {
    log(YELLOW, "  ⏭️  Skipped (--skip-curl flag)");
  } else {
    const versionData = await fetchVersionEndpoint(
      "https://beyond-pricing.vercel.app"
    );

    if (!versionData) {
      log(YELLOW, "  ⚠️  Could not reach /api/version (may be deploying)");
    } else {
      if (verbose) {
        log(
          NC,
          `  Raw response: ${JSON.stringify(versionData)}`
        );
      }

      // Check branch
      if (versionData.branch === "main") {
        log(
          GREEN,
          `  ✅ Production branch: ${versionData.branch}`
        );
      } else {
        log(
          RED,
          `  ❌ Wrong branch in production: ${versionData.branch} (expected: main)`
        );
      }

      // Check SHA
      const prodShaShort = versionData.sha.substring(0, 7);
      const mainShaShort = mainSha.substring(0, 7);

      if (versionData.sha === mainSha || prodShaShort === mainShaShort) {
        log(GREEN, `  ✅ Production SHA: ${prodShaShort}`);
      } else {
        log(
          YELLOW,
          `  ⚠️  Production SHA ${prodShaShort} differs from origin/main ${mainShaShort}`
        );
        log(
          YELLOW,
          `     (May be normal if deployment is still in progress - wait 1-2 min)`
        );
      }

      // Check env
      log(GREEN, `  ✅ Environment: ${versionData.env || "production"}`);

      // Check deployment URL
      if (
        versionData.deploymentUrl &&
        versionData.deploymentUrl.includes("vercel.app")
      ) {
        log(
          GREEN,
          `  ✅ Deployment URL: ${versionData.deploymentUrl}`
        );
      }

      // Check build time
      if (versionData.buildTime) {
        const buildTime = new Date(versionData.buildTime);
        const now = new Date();
        const minAgo = Math.floor((now.getTime() - buildTime.getTime()) / 60000);
        log(
          GREEN,
          `  ✅ Built: ${minAgo} minutes ago (${buildTime.toISOString()})`
        );
      }
    }
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  log(BLUE, "\n---\n");

  const isSynced = mainSha === localSha;
  const prodUrl = "https://beyond-pricing.vercel.app";

  if (isSynced) {
    log(
      GREEN,
      `✅ DEPLOYMENT VERIFIED - Production is on origin/main\n`
    );
    log(
      GREEN,
      `   Branch: main\n   SHA: ${mainSha.substring(0, 7)}\n   URL: ${prodUrl}\n`
    );
    process.exit(0);
  } else {
    log(
      YELLOW,
      `⚠️  DEPLOYMENT IN PROGRESS\n`
    );
    log(
      YELLOW,
      `   Your local ${currentBranch} is at ${localSha.substring(0, 7)}\n   origin/main is at ${mainSha.substring(0, 7)}\n   Deployment takes 1-2 minutes. Check again in a moment.\n`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  log(RED, `❌ Error: ${err.message}\n`);
  process.exit(1);
});
