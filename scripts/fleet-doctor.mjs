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

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
  if (r.status !== 0 && !opts.allowFailure) {
    const err = new Error(`${cmd} ${args.join(" ")} exited ${r.status}: ${r.stderr || r.stdout}`);
    err.status = r.status;
    err.stdout = r.stdout;
    err.stderr = r.stderr;
    throw err;
  }
  return r;
}

export function loadRepos(configPath) {
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.repos ?? [];
  for (const e of entries) {
    if (!e.owner || !e.name) throw new Error(`config entry missing owner/name: ${JSON.stringify(e)}`);
    e.branch ??= "main";
    e.tier ??= 1;
  }
  return entries;
}

function cloneShallow({ owner, name, branch, token, into }) {
  const url = `https://x-access-token:${token}@github.com/${owner}/${name}.git`;
  run("git", [
    "clone",
    "--depth", "1",
    "--single-branch",
    "--branch", branch,
    "--filter=blob:none",
    "--sparse",
    url,
    into,
  ]);
  run("git", ["-C", into, "sparse-checkout", "set", ".github", "docs"]);
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

  const repos = loadRepos(configPath);
  const results = [];
  const startedAt = new Date().toISOString();

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
      results.push({
        ...entry,
        result: { ok: false, failures: [{ check: "fleet", message: err.message.slice(0, 500) }], warnings: [] },
        exitCode: -1,
        error: err.message.slice(0, 500),
      });
      process.stdout.write(`ERROR (${err.status ?? "?"})\n`);
    } finally {
      try { rmSync(cloneDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    startedAt,
    totals: {
      managed: results.length,
      ok: results.filter((r) => r.result?.ok).length,
      failing: results.filter((r) => !r.result?.ok).length,
      warningsOnly: results.filter((r) => r.result?.ok && (r.result.warnings?.length ?? 0) > 0).length,
    },
    results,
  };

  mkdirSync(dirname(resultsPath), { recursive: true });
  writeFileSync(resultsPath, JSON.stringify(summary, null, 2) + "\n");
  process.stdout.write(`\nWrote ${resultsPath}\nManaged: ${summary.totals.managed}, OK: ${summary.totals.ok}, Failing: ${summary.totals.failing}\n`);
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
