#!/usr/bin/env node

// scripts/discover.mjs
//
// Discovers Pipeline Core management gaps for an org. Output is three sets:
//
//   - managed:    listed in <config-dir>/repos.json   (the fleet's allowlist)
//   - skipped:    listed in <config-dir>/skip.json    (intentional opt-outs)
//   - candidates: visible to FLEET_PAT in `--owner` but in neither list
//
// Consumers (each org's `.github` repo) invoke this from the reusable
// `fleet.yml` workflow. The result file is `<state-dir>/discovery.json`;
// downstream tooling (fleet doctor, batch installer, push-patches) reads it.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

function loadList(path) {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(raw) ? raw : raw.repos ?? [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export function keyOf({ owner, name }) {
  return `${owner}/${name}`;
}

export function classifyRepo(repo, { managedKeys, skippedKeys }) {
  if (repo.archived) return "archived";
  if (repo.fork) return "fork";
  const k = keyOf({ owner: repo.owner?.login ?? repo._owner, name: repo.name });
  if (managedKeys.has(k)) return "managed";
  if (skippedKeys.has(k)) return "skipped";
  return "candidate";
}

async function fetchPage(base, page, fetch, token) {
  return fetch(`${base}&page=${page}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "pipeline-core-fleet",
    },
  });
}

async function paginate(base, fetch, token) {
  const out = [];
  for (let page = 1; page < 20; page++) {
    const res = await fetchPage(base, page, fetch, token);
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      const err = new Error(`${res.status} from ${base}: ${body}`);
      err.status = res.status;
      throw err;
    }
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < 100) return out;
  }
  return out;
}

async function listOwnerRepos(owner, fetch, token) {
  // Try the orgs endpoint first. Only fall back to /users on a 404 — that's
  // the legitimate "this owner is a personal account, not an org" signal.
  // Any other status (401 auth, 403 forbidden, 429 rate-limit) is a real
  // failure and gets surfaced verbatim, not masked by a fallback.
  const orgsUrl = `https://api.github.com/orgs/${owner}/repos?per_page=100&type=all`;
  try {
    return await paginate(orgsUrl, fetch, token);
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  const usersUrl = `https://api.github.com/users/${owner}/repos?per_page=100&type=owner`;
  return paginate(usersUrl, fetch, token);
}

export async function discover({
  owner,
  token,
  configDir,
  fetch = globalThis.fetch,
}) {
  if (!owner) throw new Error("discover() needs an owner.");
  if (!token) throw new Error("discover() needs a token (FLEET_PAT or GITHUB_TOKEN).");
  if (!configDir) throw new Error("discover() needs a configDir.");

  const managed = loadList(join(configDir, "repos.json"));
  const skipped = loadList(join(configDir, "skip.json"));
  const managedKeys = new Set(managed.map(keyOf));
  const skippedKeys = new Set(skipped.map(keyOf));

  const repos = await listOwnerRepos(owner, fetch, token);
  const candidates = [];
  const categorized = { managed: [], skipped: [], archived: [], forks: [], candidates: [] };
  for (const repo of repos) {
    repo._owner = owner;
    const klass = classifyRepo(repo, { managedKeys, skippedKeys });
    const entry = {
      owner: repo.owner?.login ?? owner,
      name: repo.name,
      visibility: repo.visibility,
      primaryLanguage: repo.language || null,
      updatedAt: repo.updated_at,
      description: repo.description,
    };
    if (klass === "candidate") candidates.push(entry);
    categorized[klass === "fork" ? "forks" : klass + (klass === "candidate" ? "s" : "")].push(entry);
  }

  return {
    owner,
    managed,
    skipped,
    candidates,
    counts: {
      managed: managed.length,
      skipped: skipped.length,
      candidates: candidates.length,
      archived: categorized.archived.length,
      forks: categorized.forks.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function writeDiscoveryState(result, statePath) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(result, null, 2) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/discover.mjs")) {
  const owner = process.env.OWNER ?? process.argv[2];
  const configDir = process.env.CONFIG_DIR ?? process.argv[3] ?? "config";
  const stateDir = process.env.STATE_DIR ?? process.argv[4] ?? "state";
  const token = process.env.FLEET_PAT ?? process.env.GITHUB_TOKEN;

  if (!owner) {
    process.stderr.write("discover.mjs needs --owner OR $OWNER env var (e.g. Haverford-Brands).\n");
    process.exit(1);
  }
  if (!token) {
    process.stderr.write("discover.mjs needs FLEET_PAT or GITHUB_TOKEN in the environment.\n");
    process.exit(1);
  }
  const result = await discover({ owner, token, configDir });
  writeDiscoveryState(result, join(stateDir, "discovery.json"));
  process.stdout.write(`Discovery sweep ${result.generatedAt} for ${owner}\n`);
  process.stdout.write(`  managed: ${result.counts.managed}, skipped: ${result.counts.skipped}, candidates: ${result.counts.candidates}\n`);
  if (result.candidates.length) {
    process.stdout.write("\nUnmanaged candidates:\n");
    for (const c of result.candidates) {
      process.stdout.write(`  - ${c.owner}/${c.name}  (${c.visibility}, ${c.primaryLanguage || "—"}, updated ${c.updatedAt?.slice(0, 10)})\n`);
    }
  }
}
