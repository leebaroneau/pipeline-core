#!/usr/bin/env node

// scripts/fleet-doctor.mjs
//
// Drives the install-doctor across every repo listed in
// `<config-dir>/repos.json`. For each entry:
//   1. Shallow-clones the repo into a temp dir using FLEET_PAT
//   2. Runs `scripts/doctor.mjs --json` against the checkout
//   3. Aggregates ok/failures/warnings into `<state-dir>/results.json`
//
// Designed to be invoked from each org's `.github` repo via the reusable
// `fleet.yml` workflow. The doctor binary is THIS pipeline-core checkout's
// sibling — no `--pipeline-core-path` plumbing needed.

import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCTOR_PATH = join(__dirname, "doctor.mjs");

const GIT_ASKPASS_PATH = join(__dirname, "lib", "git-askpass.mjs");

// Strip auth tokens out of any string that might land in logs, state, or
// committed output. Older clone code used authenticated URLs; keep this
// sanitizer for historical errors and defensive handling.
export function redactToken(s) {
  return String(s ?? "").replace(/x-access-token:[^@\s]+@/g, "x-access-token:***@");
}

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
    const safeStream = redactToken(r.stderr || r.stdout);
    const err = new Error(`${cmd} ${safeArgs} exited ${r.status}: ${safeStream}`);
    err.status = r.status;
    err.stdout = redactToken(r.stdout);
    err.stderr = redactToken(r.stderr);
    throw err;
  }
  return r;
}

// Returns { repos, invalid } so callers can audit the valid rows and report
// (rather than abort on) malformed entries. One bad row in a 30-row config
// should never block the other 29 from being audited.
export function loadRepos(configPath) {
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.repos ?? [];
  const repos = [];
  const invalid = [];
  for (const e of entries) {
    if (!e.owner || !e.name) {
      invalid.push({ entry: e, reason: "missing owner/name" });
      continue;
    }
    repos.push({ ...e, branch: e.branch ?? "main", tier: e.tier ?? 1 });
  }
  return { repos, invalid };
}

export function cloneShallow({ owner, name, branch, token, into, runCommand = run }) {
  const url = `https://github.com/${owner}/${name}.git`;
  const env = authenticatedGitEnv(token);
  runCommand("git", [
    "clone",
    "--depth", "1",
    "--single-branch",
    "--branch", branch,
    "--filter=blob:none",
    "--sparse",
    url,
    into,
  ], { env });
  runCommand("git", ["-C", into, "sparse-checkout", "set", ".github", "docs"], { env });
}

function runDoctorOn({ repoDir, owner, name, branch, token, doctorPath }) {
  const env = { ...process.env, GITHUB_TOKEN: token };
  const r = run("node", [
    doctorPath,
    "--repo", repoDir,
    "--owner", owner,
    "--repo-name", name,
    "--branch", branch,
    "--json",
  ], { env, allowFailure: true });
  try {
    return { result: JSON.parse(r.stdout), exitCode: r.status };
  } catch {
    return {
      result: { ok: false, failures: [{ check: "fleet", message: `doctor produced non-JSON output: ${(r.stderr || r.stdout).slice(0, 500)}` }], warnings: [] },
      exitCode: r.status ?? -1,
    };
  }
}

export async function runFleetDoctor({
  configPath,
  resultsPath,
  doctorPath = DOCTOR_PATH,
  token = process.env.FLEET_PAT ?? process.env.GITHUB_TOKEN,
}) {
  if (!configPath) throw new Error("runFleetDoctor() needs configPath.");
  if (!resultsPath) throw new Error("runFleetDoctor() needs resultsPath.");
  if (!token) throw new Error("runFleetDoctor() needs FLEET_PAT or GITHUB_TOKEN.");
  if (!existsSync(doctorPath)) throw new Error(`doctor.mjs not found at ${doctorPath}`);

  const { repos, invalid } = loadRepos(configPath);
  const results = [];
  const startedAt = new Date().toISOString();

  // Per-row validation failures land as fleet-level failures alongside the
  // real audit output, so the operator sees both classes in the same tracker.
  for (const bad of invalid) {
    process.stderr.write(`[fleet-doctor] invalid config row: ${bad.reason} (${JSON.stringify(bad.entry)})\n`);
    results.push({
      owner: bad.entry?.owner ?? "(unknown)",
      name: bad.entry?.name ?? "(unknown)",
      branch: "main",
      tier: 0,
      result: { ok: false, failures: [{ check: "fleet-config", message: `Invalid config row: ${bad.reason}` }], warnings: [] },
      exitCode: -1,
      error: bad.reason,
    });
  }

  for (const entry of repos) {
    const slug = `${entry.owner}/${entry.name}`;
    process.stdout.write(`[fleet-doctor] ${slug}@${entry.branch} ... `);
    const cloneDir = mkdtempSync(join(tmpdir(), `fleet-doctor-${entry.name}-`));
    try {
      cloneShallow({ owner: entry.owner, name: entry.name, branch: entry.branch, token, into: cloneDir });
      const { result, exitCode } = runDoctorOn({
        doctorPath,
        repoDir: cloneDir,
        owner: entry.owner,
        name: entry.name,
        branch: entry.branch,
        token,
      });
      results.push({ ...entry, result, exitCode, error: null });
      process.stdout.write(result.ok ? "OK\n" : `FAIL (${result.failures?.length ?? "?"} failure(s))\n`);
    } catch (err) {
      const safeMessage = redactToken(err.message).slice(0, 500);
      results.push({
        ...entry,
        result: { ok: false, failures: [{ check: "fleet", message: safeMessage }], warnings: [] },
        exitCode: -1,
        error: safeMessage,
      });
      process.stdout.write(`ERROR (${err.status ?? "?"})\n`);
    } finally {
      try { rmSync(cloneDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }

  const totals = {
    managed: results.length,
    ok: results.filter((r) => r.result?.ok).length,
    failing: results.filter((r) => !r.result?.ok).length,
    warningsOnly: results.filter((r) => r.result?.ok && (r.result.warnings?.length ?? 0) > 0).length,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    startedAt,
    totals,
    results,
  };

  // Only rewrite the state file if the semantic content (everything except the
  // run timestamps) actually changed. Otherwise the daily cron would commit a
  // pure-timestamp diff every single day, polluting git history with no-op
  // commits. The commit step downstream uses `git status --porcelain` to
  // decide whether to commit, so an unchanged file = no commit.
  mkdirSync(dirname(resultsPath), { recursive: true });
  const newSemantic = JSON.stringify({ totals, results });
  let prevSemantic = null;
  try {
    const prev = JSON.parse(readFileSync(resultsPath, "utf8"));
    prevSemantic = JSON.stringify({ totals: prev.totals, results: prev.results });
  } catch { /* no prior file or unreadable — write fresh */ }
  if (newSemantic !== prevSemantic) {
    writeFileSync(resultsPath, JSON.stringify(summary, null, 2) + "\n");
  }
  process.stdout.write(`\n${newSemantic !== prevSemantic ? "Wrote" : "No change to"} ${resultsPath}\nManaged: ${totals.managed}, OK: ${totals.ok}, Failing: ${totals.failing}\n`);
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/fleet-doctor.mjs")) {
  const configPath = process.env.CONFIG_PATH ?? process.argv[2] ?? "config/repos.json";
  const resultsPath = process.env.RESULTS_PATH ?? process.argv[3] ?? "state/results.json";
  runFleetDoctor({ configPath, resultsPath }).catch((err) => {
    process.stderr.write(`fleet-doctor.mjs failed: ${err.message}\n`);
    process.exit(1);
  });
}
