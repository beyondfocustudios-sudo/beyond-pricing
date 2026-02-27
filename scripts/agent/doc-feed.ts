#!/usr/bin/env node

/**
 * DOC-FEED SCRIPT - Automatic Documentation Injection for Agents
 *
 * Usage:
 *   npx tsx scripts/agent/doc-feed.ts --task "fix portal scroll issue"
 *   npx tsx scripts/agent/doc-feed.ts --task "add supabase migration" --mode jarvis
 *
 * Output:
 *   docs/agent/FEED.md - Human-readable doc pack
 *   docs/agent/FEED.json - Structured data
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface DocEntry {
  id: string;
  path: string;
  title: string;
  priority: number;
  tags: string[];
  when_to_read: string;
  must_read_before_commit: boolean;
  must_read_before_push?: boolean;
  related_features: string[];
}

interface Manifest {
  docs: DocEntry[];
  keywords_to_docs: Record<string, string[]>;
  feature_to_docs: Record<string, string[]>;
}

interface FeedItem {
  id: string;
  title: string;
  path: string;
  priority: number;
  reason: string;
}

interface Feed {
  context: {
    branch: string;
    sha: string;
    timestamp: string;
    mode: string;
    task: string;
  };
  must_read: FeedItem[];
  recommended: FeedItem[];
  checklist: string[];
  guardrails: string[];
  commands: string[];
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function extractKeywords(task: string): string[] {
  const cleaned = task.toLowerCase().replace(/[^\w\s]/g, " ");
  return cleaned.split(/\s+/).filter((w) => w.length > 2);
}

function chooseDocs(manifest: Manifest, task: string): [FeedItem[], FeedItem[]] {
  const mustRead = new Set<string>();
  const recommended = new Set<string>();

  const keywords = extractKeywords(task);

  // Keyword matching
  keywords.forEach((keyword) => {
    Object.entries(manifest.keywords_to_docs).forEach(([key, docIds]) => {
      if (key.includes(keyword) || keyword.includes(key)) {
        docIds.forEach((id) => {
          const doc = manifest.docs.find((d) => d.id === id);
          if (doc && doc.must_read_before_commit) {
            mustRead.add(id);
          } else if (doc) {
            recommended.add(id);
          }
        });
      }
    });
  });

  // Always include source-of-truth-main
  mustRead.add("source-of-truth-main");

  // Always include workflow-30s as recommended
  recommended.add("workflow-30s");

  // Convert to FeedItem[]
  const mustReadArray = Array.from(mustRead)
    .map((id) => {
      const doc = manifest.docs.find((d) => d.id === id);
      return doc
        ? {
            id: doc.id,
            title: doc.title,
            path: doc.path,
            priority: doc.priority,
            reason: `Must read before working on: ${task}`,
          }
        : null;
    })
    .filter((x) => x !== null) as FeedItem[];

  const recommendedArray = Array.from(recommended)
    .filter((id) => !mustRead.has(id))
    .map((id) => {
      const doc = manifest.docs.find((d) => d.id === id);
      return doc
        ? {
            id: doc.id,
            title: doc.title,
            path: doc.path,
            priority: doc.priority,
            reason: `Helpful for: ${task}`,
          }
        : null;
    })
    .filter((x) => x !== null) as FeedItem[];

  // Sort by priority
  mustReadArray.sort((a, b) => a.priority - b.priority);
  recommendedArray.sort((a, b) => a.priority - b.priority);

  return [mustReadArray, recommendedArray];
}

function generateFeed(
  task: string,
  mode: string,
  branch: string,
  sha: string,
  mustRead: FeedItem[],
  recommended: FeedItem[],
): Feed {
  const checklist = [
    "Branch is NOT main (git branch)",
    "Working tree is clean (git status)",
    "Read all docs in FEED.md",
    "npm run build passes (EXIT=0)",
    "npm run preflight passes",
    "Manual testing done",
    "Commit message format: feat: / fix: / chore:",
    "No .env.local changes",
  ];

  const guardrails = [
    "🔒 Produção = main. Nunca trabalhar em main.",
    "🔒 Branch must be feature/* ou jarvis/*",
    "🔒 Never touch .env.local",
    "🔒 npm run build must pass (EXIT=0)",
    "🔒 npm run preflight must pass",
    "🔒 /api/version must show correct branch+sha",
  ];

  const commands = [
    "npm run preflight",
    "npm run build",
    "npm run test:smoke",
    `curl http://localhost:3000/api/version | jq (local)`,
    `curl https://beyond-pricing.vercel.app/api/version | jq (production)`,
  ];

  return {
    context: {
      branch,
      sha: sha.substring(0, 7),
      timestamp: new Date().toISOString(),
      mode,
      task,
    },
    must_read: mustRead,
    recommended,
    checklist,
    guardrails,
    commands,
  };
}

function feedToMarkdown(feed: Feed): string {
  return `# 📦 Doc Feed - Auto-Generated Documentation Pack

**Generated**: ${feed.context.timestamp}
**Task**: ${feed.context.task}
**Mode**: ${feed.context.mode}
**Branch**: ${feed.context.branch}
**SHA**: ${feed.context.sha}

---

## 🎯 Context Snapshot

\`\`\`
Branch: ${feed.context.branch}
SHA: ${feed.context.sha}
Timestamp: ${feed.context.timestamp}
Task: ${feed.context.task}
Mode: ${feed.context.mode}
\`\`\`

---

## 📚 MUST READ (Before You Start)

These docs are mandatory for this task:

${feed.must_read
  .map(
    (doc, i) =>
      `### ${i + 1}. ${doc.title}

**Path**: \`${doc.path}\`
**Priority**: ${doc.priority}
**Reason**: ${doc.reason}

Read this file completely before proceeding.

---`,
  )
  .join("\n")}

## 💡 Recommended Docs (Optional But Helpful)

These docs provide additional context:

${
  feed.recommended.length > 0
    ? feed.recommended
        .map(
          (doc, i) =>
            `${i + 1}. **${doc.title}** (\`${doc.path}\`)
   - Reason: ${doc.reason}`,
        )
        .join("\n\n")
    : "No additional docs recommended for this task."
}

---

## ✅ Pre-Commit Checklist

Before running \`git commit\`:

${feed.checklist.map((item) => `- [ ] ${item}`).join("\n")}

---

## 🔒 Guardrails (Never Break These)

${feed.guardrails.map((rule) => `${rule}`).join("\n")}

---

## 🛠️ Standard Commands

Run these during your work:

\`\`\`bash
# Validate everything before push
npm run preflight

# Build locally (must pass)
npm run build

# Run smoke tests
npm run test:smoke

# Check version (local)
curl http://localhost:3000/api/version | jq

# Check version (production)
curl https://beyond-pricing.vercel.app/api/version | jq
\`\`\`

---

## 📋 Workflow Summary

1. **Read** all MUST READ docs above
2. **Code** using the guidelines
3. **Validate** with npm run build + preflight
4. **Test** manually and with smoke tests
5. **Commit** with proper message format
6. **Push** to feature/* branch
7. **PR** on GitHub for review
8. **Merge** to main
9. **Verify** /api/version in production

---

## 🚨 If You're Stuck

1. Re-read the MUST READ docs
2. Run \`npm run preflight\` (tells you what's wrong)
3. Check KNOWN_ISSUES.md for historical problems
4. Verify /api/version to confirm environment

---

**Generated by doc-feed.ts**
**For questions, check docs/agent/README.md**
`;
}

function main() {
  // Parse args
  const args = process.argv.slice(2);
  let task = "";
  let mode = "claude";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--task" && i + 1 < args.length) {
      task = args[i + 1];
      i++;
    } else if (args[i] === "--mode" && i + 1 < args.length) {
      mode = args[i + 1];
      i++;
    }
  }

  if (!task) {
    console.error(
      'Error: --task is required. Example: npx tsx scripts/agent/doc-feed.ts --task "fix portal scroll"',
    );
    process.exit(1);
  }

  // Get git context
  const branch = run("git branch --show-current");
  const sha = run("git rev-parse HEAD");

  if (!branch || !sha) {
    console.error("Error: Could not determine git context. Are you in a repo?");
    process.exit(1);
  }

  // Load manifest
  const manifestPath = resolve(process.cwd(), "docs/agent/MANIFEST.json");
  let manifest: Manifest;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    console.error(`Error: Could not load manifest from ${manifestPath}`);
    process.exit(1);
  }

  // Choose docs
  const [mustRead, recommended] = chooseDocs(manifest, task);

  // Generate feed
  const feed = generateFeed(task, mode, branch, sha, mustRead, recommended);

  // Write FEED.json
  const feedJsonPath = resolve(process.cwd(), "docs/agent/FEED.json");
  writeFileSync(feedJsonPath, JSON.stringify(feed, null, 2));

  // Write FEED.md
  const feedMdPath = resolve(process.cwd(), "docs/agent/FEED.md");
  const feedMarkdown = feedToMarkdown(feed);
  writeFileSync(feedMdPath, feedMarkdown);

  // Output summary
  console.log("\n✅ Doc Feed Generated\n");
  console.log(`📄 FEED.md  : ${feedMdPath}`);
  console.log(`📄 FEED.json: ${feedJsonPath}\n`);
  console.log(`📖 Must Read: ${mustRead.length} doc(s)`);
  console.log(`💡 Recommended: ${recommended.length} doc(s)\n`);
  console.log("👉 Next step: Read docs/agent/FEED.md\n");
}

main();
