#!/usr/bin/env node

// scripts/refresh.mjs
//
// Fleet refresh write-mode. For each repo in `<config-dir>/repos.json`, distributes
// any caller shims that exist in `templates/pipeline-consumer-shim/` but are missing
// from the repo's `.github/workflows/`. Opens one pipeline-compliant PR per repo
// (issue-linked, `task/<#>-distribute-pipeline-shims` branch, `Fixes #<#>` body).
//
// Unlike fleet-doctor.mjs (read-only audit), this WRITES to consumer repos. It is
// gated behind `mode: refresh` in fleet.yml so the daily cron stays read-only.
//
// Idempotency: before acting, it checks each repo for an open issue carrying the
// REFRESH_LABEL. If one exists, the repo is skipped (a refresh is already in flight).
//
// Auth: FLEET_PAT with repo + read:org + (for the target repos) issues:write.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { loadRepos, redactToken } from "./fleet-doctor.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_CORE_ROOT = join(__dirname, "..");
const CALLER_TEMPLATES_DIR = join(PIPELINE_CORE_ROOT, "templates", "pipeline-consumer-shim");

export const REFRESH_LABEL = "pipeline:shim-refresh";
const REFRESH_SLUG = "distribute-pipeline-shims";

const GIT_ASKPASS_PATH = join(__dirname, "lib", "git-askpass.mjs");

// ─── Pure logic (unit-tested without network or filesystem mutation) ─────────

export function diffShims({ templateFiles, presentFiles }) {
  const present = new Set(presentFiles);
  const missing = templateFiles.filter((f) => !present.has(f)).sort();
  return { missing };
}

export function refreshBranchName(issueNumber) {
  return `task/${issueNumber}-${REFRESH_SLUG}`;
}

export function listShimFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith("pipeline-") && (f.endsWith(".yml") || f.endsWith(".yaml")))
    .sort();
}

export function planRepoRefresh({ repoDir, templateFiles, workflowsDir = ".github/workflows" }) {
  const wfDir = join(repoDir, workflowsDir);
  if (!existsSync(wfDir)) {
    return { skip: true, reason: "not-installed", missing: [] };
  }
  const presentFiles = listShimFiles(wfDir);
  const { missing } = diffShims({ templateFiles, presentFiles });
  if (missing.length === 0) {
    return { skip: true, reason: "in-sync", missing: [] };
  }
  return { skip: false, missing };
}

export function refreshIssueBody(missing) {
  const list = missing.map((f) => `- \`${f}\``).join("\n");
  return [
    "Automated fleet refresh: this repo is missing pipeline-core caller shims that",
    "exist in `templates/pipeline-consumer-shim/`. Adding them keeps the repo in sync",
    "with the current pipeline-core surface.",
    "",
    "Shims being added:",
    list,
    "",
    `_Opened by the fleet refresh write-mode. Tracked with the \`${REFRESH_LABEL}\` label._`,
  ].join("\n");
}

export function refreshPrBody({ issueNumber, missing }) {
  const list = missing.map((f) => `- \`${f}\``).join("\n");
  return [
    `Fixes #${issueNumber}`,
    "",
    "## Summary",
    "",
    "Distributes missing pipeline-core caller shims into `.github/workflows/`.",
    "",
    "Shims added:",
    list,
    "",
    "## Test plan",
    "",
    "- [ ] `pipeline/branch-name`, `pipeline/issue-link`, `pipeline/merge-gate` go green",
    "- [ ] Each added shim references `leebaroneau/pipeline-core/.github/workflows/<wf>.yml@v1`",
  ].join("\n");
}

// ─── Side-effectful helpers (thin; injectable runners for testability) ───────

function authenticatedGitEnv(token) {
  return {
    ...process.env,
    GIT_ASKPASS: GIT_ASKPASS_PATH,
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTH_USERNAME: "x-access-token",
    GIT_AUTH_TOKEN: token,
  };
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
  if (r.status !== 0 && !opts.allowFailure) {
    const safeArgs = args.map(redactToken).join(" ");
    const err = new Error(`${cmd} ${safeArgs} exited ${r.status}: ${redactToken(r.stderr || r.stdout)}`);
    err.status = r.status;
    throw err;
  }
  return r;
}

function cloneShallow({ owner, name, branch, token, into, runCommand = run }) {
  const url = `https://github.com/${owner}/${name}.git`;
  const env = authenticatedGitEnv(token);
  runCommand("git", [
    "clone", "--depth", "1", "--single-branch", "--branch", branch,
    "--filter=blob:none", "--sparse", url, into,
  ], { env });
  runCommand("git", ["-C", into, "sparse-checkout", "set", ".github"], { env });
}

function hasOpenRefreshIssue({ owner, name, token, runCommand = run }) {
  const env = { ...process.env, GH_TOKEN: token };
  const r = runCommand("gh", [
    "issue", "list", "--repo", `${owner}/${name}`,
    "--state", "open", "--label", REFRESH_LABEL, "--json", "number", "--limit", "1",
  ], { env, allowFailure: true });
  if (r.status !== 0) return false;
  try {
    return JSON.parse(r.stdout || "[]").length > 0;
  } catch {
    return false;
  }
}

function ensureRefreshLabel({ owner, name, token, runCommand = run }) {
  const env = { ...process.env, GH_TOKEN: token };
  runCommand("gh", [
    "label", "create", REFRESH_LABEL, "--repo", `${owner}/${name}`,
    "--description", "Automated pipeline-core shim distribution", "--color", "ededed", "--force",
  ], { env, allowFailure: true });
}

// ─── Per-repo orchestration ──────────────────────────────────────────────────

export function refreshRepo({
  entry,
  token,
  callerTemplatesDir = CALLER_TEMPLATES_DIR,
  runCommand = run,
  cloneInto,
}) {
  const { owner, name, branch } = entry;
  const slug = `${owner}/${name}`;
  const templateFiles = listShimFiles(callerTemplatesDir);
  const cloneDir = cloneInto || mkdtempSync(join(tmpdir(), `fleet-refresh-${name}-`));

  try {
    cloneShallow({ owner, name, branch, token, into: cloneDir, runCommand });

    const plan = planRepoRefresh({ repoDir: cloneDir, templateFiles });
    if (plan.skip) {
      return { slug, status: "skipped", reason: plan.reason, missing: [] };
    }

    if (hasOpenRefreshIssue({ owner, name, token, runCommand })) {
      return { slug, status: "skipped", reason: "refresh-in-flight", missing: plan.missing };
    }

    ensureRefreshLabel({ owner, name, token, runCommand });

    const env = { ...process.env, GH_TOKEN: token };
    const gitEnv = authenticatedGitEnv(token);

    // 1. Create the tracking issue
    const issueRes = runCommand("gh", [
      "issue", "create", "--repo", slug,
      "--title", "Task: distribute missing pipeline-core caller shims",
      "--label", `type:task,${REFRESH_LABEL}`,
      "--body", refreshIssueBody(plan.missing),
    ], { env });
    const issueUrl = (issueRes.stdout || "").trim();
    const issueNumber = Number(issueUrl.split("/").pop());
    if (!Number.isInteger(issueNumber)) {
      throw new Error(`Could not parse issue number from: ${issueUrl}`);
    }

    // 2. Branch
    const branchName = refreshBranchName(issueNumber);
    runCommand("git", ["-C", cloneDir, "checkout", "-b", branchName], { env: gitEnv });

    // 3. Copy missing shims
    const destDir = join(cloneDir, ".github", "workflows");
    mkdirSync(destDir, { recursive: true });
    for (const file of plan.missing) {
      copyFileSync(join(callerTemplatesDir, file), join(destDir, file));
    }

    // 4. Commit
    runCommand("git", ["-C", cloneDir, "config", "user.name", "github-actions[bot]"], { env: gitEnv });
    runCommand("git", ["-C", cloneDir, "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], { env: gitEnv });
    runCommand("git", ["-C", cloneDir, "add", ".github/workflows"], { env: gitEnv });
    runCommand("git", ["-C", cloneDir, "commit", "-m", `chore: distribute ${plan.missing.length} pipeline-core caller shim(s)`], { env: gitEnv });

    // 5. Push
    runCommand("git", ["-C", cloneDir, "push", "-u", "origin", branchName], { env: gitEnv });

    // 6. PR
    runCommand("gh", [
      "pr", "create", "--repo", slug,
      "--head", branchName, "--base", branch,
      "--title", "Task: distribute missing pipeline-core caller shims",
      "--body", refreshPrBody({ issueNumber, missing: plan.missing }),
    ], { env });

    return { slug, status: "updated", issueNumber, branch: branchName, missing: plan.missing };
  } catch (err) {
    return { slug, status: "error", error: redactToken(err.message).slice(0, 500), missing: [] };
  } finally {
    if (!cloneInto) {
      try { rmSync(cloneDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
}

export async function runRefresh({
  configPath,
  token = process.env.FLEET_PAT ?? process.env.GITHUB_TOKEN,
  callerTemplatesDir = CALLER_TEMPLATES_DIR,
}) {
  if (!configPath) throw new Error("runRefresh() needs configPath.");
  if (!token) throw new Error("runRefresh() needs FLEET_PAT or GITHUB_TOKEN.");

  const { repos, invalid } = loadRepos(configPath);
  const results = [];

  for (const bad of invalid) {
    results.push({ slug: `${bad.entry?.owner}/${bad.entry?.name}`, status: "error", error: bad.reason, missing: [] });
  }

  for (const entry of repos) {
    process.stdout.write(`[fleet-refresh] ${entry.owner}/${entry.name}@${entry.branch} ... `);
    const result = refreshRepo({ entry, token, callerTemplatesDir });
    results.push(result);
    process.stdout.write(`${result.status}${result.reason ? ` (${result.reason})` : ""}\n`);
  }

  const totals = {
    managed: results.length,
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
  };
  process.stdout.write(`\nManaged: ${totals.managed}, Updated: ${totals.updated}, Skipped: ${totals.skipped}, Errors: ${totals.errors}\n`);
  return { totals, results };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/refresh.mjs")) {
  const configPath = process.env.CONFIG_PATH ?? process.argv[2] ?? "config/repos.json";
  runRefresh({ configPath }).catch((err) => {
    process.stderr.write(`refresh.mjs failed: ${err.message}\n`);
    process.exit(1);
  });
}
