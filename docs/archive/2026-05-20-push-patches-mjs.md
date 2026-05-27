# push-patches.mjs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `leebaroneau/pipeline-fleet/scripts/push-patches.mjs` — a CLI tool that, after a new `leebaroneau/pipeline-core` release, opens a "refresh caller workflows" PR in every active-org consumer repo where the installed caller workflows have drifted from the latest templates.

**Architecture:** A `node --test`-tested ES module that walks `config/orgs.json` (active orgs only), pulls each org's consumer list from `<org>/.github/config/repos.json` via the GitHub API, shallow-clones each consumer, diffs `.github/workflows/pipeline-*.yml` against `pipeline-core/templates/caller-workflows/`, and — if any caller is added or updated — branches, commits, pushes, and opens a `gh pr create` PR. Idempotent: byte-equal callers produce no PR. Inactive orgs are skipped entirely.

**Tech Stack:** Node 22+, `node:fs`, `node:path`, `node:child_process` (`spawnSync` for git/gh), `node:test`. No new dependencies. Reuses `relativizePath()` from `pipeline-core/scripts/install.mjs` (v1.0.11), copies the shallow-clone pattern from `pipeline-core/scripts/fleet-doctor.mjs`, mirrors `openAutoPR` from `install.mjs`.

---

## File Structure

```
leebaroneau/pipeline-fleet/
├── scripts/
│   └── push-patches.mjs          ← CREATE: main module (CLI + exported pure functions)
├── tests/
│   └── push-patches.test.mjs     ← CREATE: 15 tests, node --test
├── package.json                  ← CREATE: { "type": "module", "scripts": { "test": "node --test 'tests/**/*.test.mjs'" } }
└── .gitignore                    ← MODIFY: add /node_modules and /tmp-fakes if missing (tests use mkdtempSync)
```

**Decomposition rationale:** Single-file script because the surface area is small and every function shares the same git/gh/fs primitives. Tests in a sibling file. No top-level `lib/` split — keep it flat until the next feature forces one.

**Function ownership:**
- `loadOrgs(configPath)` — parses `config/orgs.json` into `{ active, skipped, invalid }`. Pure.
- `listConsumerRepos({owner, fleetRepo, token, fetch})` — reads `<fleetRepo>/config/repos.json` via gh API. IO-bound, mockable via `fetch` injection.
- `planRefresh({repoDir, callerTemplatesDir})` — pure diff between consumer's installed callers and pipeline-core's templates. Returns `{ unchanged, updated, added, removed }`.
- `applyRefresh({plan, callerTemplatesDir, repoDir})` — writes the updated+added files. Pure FS.
- `preflightAutoPR({repoDir, branch})` — same shape as install.mjs's; refuses dirty tree or existing branch.
- `openRefreshPR({repoDir, branch, written, newVersion})` — git add/commit/push + gh pr create.
- `runPushPatches({orgsConfigPath, owners?, dryRun, callerTemplatesDir, token, ...injects})` — top-level orchestrator.
- `redactToken(s)` — re-imported from pipeline-core's fleet-doctor.mjs (or local copy if cross-repo import is awkward). Used on every error message.

**Token redaction:** Copy `redactToken()` verbatim from `pipeline-core/scripts/fleet-doctor.mjs` (or import via relative path if the layout permits). Apply to every error message before it lands in logs or stderr.

---

## Prerequisites — verify before Task 1

- [ ] Run: `ls /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet/` — confirm the pipeline-fleet checkout exists at this path.
- [ ] Run: `cat /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet/config/orgs.json` — confirm the 5-org retainer registry is in place (1× self, 4× active).
- [ ] Run: `ls /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-core/templates/caller-workflows/` — confirm the 17 caller YAMLs exist (the templates push-patches refreshes).
- [ ] Run: `node --version` — must be ≥22 (matches pipeline-core).

---

## Task 1: Scaffold pipeline-fleet test infrastructure

**Files:**
- Create: `00_repos/pipeline-fleet/package.json`
- Create: `00_repos/pipeline-fleet/tests/push-patches.test.mjs` (empty placeholder)
- Modify: `00_repos/pipeline-fleet/.gitignore` (add `node_modules/` if not present)

- [ ] **Step 1: Create package.json**

```bash
cat > /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet/package.json <<'EOF'
{
  "name": "pipeline-fleet",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "node --test 'tests/**/*.test.mjs'"
  }
}
EOF
```

- [ ] **Step 2: Create empty test file**

```bash
cat > /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet/tests/push-patches.test.mjs <<'EOF'
import { test } from "node:test";
import assert from "node:assert/strict";

test("scaffolding test", () => {
  assert.equal(1 + 1, 2);
});
EOF
```

- [ ] **Step 3: Run test to verify the harness works**

Run: `cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet && npm test`
Expected: `# pass 1` `# fail 0`

- [ ] **Step 4: Ensure .gitignore has node_modules**

```bash
cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet
grep -q "^node_modules/" .gitignore 2>/dev/null || echo "node_modules/" >> .gitignore
```

- [ ] **Step 5: Commit**

```bash
cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet
git checkout -b feat/push-patches-mjs
git add package.json tests/push-patches.test.mjs .gitignore
git commit -m "chore: scaffold node --test harness for push-patches"
```

---

## Task 2: `loadOrgs` — parse config/orgs.json

**Files:**
- Create: `00_repos/pipeline-fleet/scripts/push-patches.mjs`
- Modify: `00_repos/pipeline-fleet/tests/push-patches.test.mjs`

- [ ] **Step 1: Write the failing tests**

Replace `tests/push-patches.test.mjs` with:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadOrgs } from "../scripts/push-patches.mjs";

function withTempConfig(obj) {
  const dir = mkdtempSync(join(tmpdir(), "push-patches-"));
  const path = join(dir, "orgs.json");
  writeFileSync(path, JSON.stringify(obj));
  return path;
}

test("loadOrgs: partitions active+skipped+invalid", () => {
  const path = withTempConfig({
    orgs: [
      { name: "leebaroneau", retainer_status: "self",     pinned_version: null, fleet_repo: "leebaroneau/pipeline-fleet" },
      { name: "Haverford-Brands", retainer_status: "active",   pinned_version: null, fleet_repo: "Haverford-Brands/.github" },
      { name: "alx-finance",      retainer_status: "inactive", pinned_version: "v1.0.5", fleet_repo: "alx-finance/.github" },
      { /* missing name */         retainer_status: "active",   fleet_repo: "Bad/.github" },
    ],
  });
  const r = loadOrgs(path);
  assert.equal(r.active.length, 2,   "self + active count as cascade targets");
  assert.equal(r.skipped.length, 1,  "inactive is skipped");
  assert.equal(r.invalid.length, 1,  "row missing name lands in invalid");
  assert.deepEqual(r.active.map((o) => o.name).sort(), ["Haverford-Brands", "leebaroneau"]);
});

test("loadOrgs: 'self' status counts as active (the patch source cascades to itself)", () => {
  const path = withTempConfig({ orgs: [{ name: "leebaroneau", retainer_status: "self", fleet_repo: "leebaroneau/pipeline-fleet" }] });
  const r = loadOrgs(path);
  assert.equal(r.active.length, 1);
  assert.equal(r.active[0].name, "leebaroneau");
});

test("loadOrgs: unknown retainer_status lands in invalid, not silently in active", () => {
  const path = withTempConfig({ orgs: [{ name: "Mystery", retainer_status: "weirdo", fleet_repo: "x/y" }] });
  const r = loadOrgs(path);
  assert.equal(r.invalid.length, 1);
  assert.match(r.invalid[0].reason, /retainer_status/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet && npm test`
Expected: `Cannot find module '../scripts/push-patches.mjs'` — all 3 tests fail.

- [ ] **Step 3: Implement `loadOrgs` (minimal)**

Create `scripts/push-patches.mjs`:

```javascript
#!/usr/bin/env node

// scripts/push-patches.mjs
//
// Patch-cascade tool. Reads config/orgs.json, iterates ACTIVE orgs, opens a PR
// in each consumer repo whose installed caller workflows have drifted from
// pipeline-core's latest templates.
//
// Triggered by Lee locally after cutting a pipeline-core release. NOT a CI
// workflow — it walks 5 orgs × N consumers and rate-limit hygiene + auth
// scope warrant a human-in-the-loop trigger.

import { readFileSync } from "node:fs";

const ACTIVE_STATUSES = new Set(["self", "active"]);
const KNOWN_STATUSES = new Set(["self", "active", "inactive"]);

export function loadOrgs(configPath) {
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.orgs ?? [];
  const active = [];
  const skipped = [];
  const invalid = [];
  for (const e of entries) {
    if (!e.name) {
      invalid.push({ entry: e, reason: "missing name" });
      continue;
    }
    if (!KNOWN_STATUSES.has(e.retainer_status)) {
      invalid.push({ entry: e, reason: `unknown retainer_status: ${e.retainer_status}` });
      continue;
    }
    if (ACTIVE_STATUSES.has(e.retainer_status)) {
      active.push(e);
    } else {
      skipped.push(e);
    }
  }
  return { active, skipped, invalid };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet && npm test`
Expected: `# tests 4` `# pass 4` `# fail 0` (the scaffolding test stays; we'll drop it later).

- [ ] **Step 5: Commit**

```bash
cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet
git add scripts/push-patches.mjs tests/push-patches.test.mjs
git commit -m "feat(push-patches): loadOrgs partitions active/skipped/invalid"
```

---

## Task 3: `listConsumerRepos` — fetch consumer list from an org's .github repo

**Files:**
- Modify: `00_repos/pipeline-fleet/scripts/push-patches.mjs`
- Modify: `00_repos/pipeline-fleet/tests/push-patches.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/push-patches.test.mjs`:

```javascript
import { listConsumerRepos } from "../scripts/push-patches.mjs";

function fakeFetch(map) {
  // map: { "<url>": { status, json } }
  return async (url) => {
    const entry = map[url];
    if (!entry) return { ok: false, status: 404, statusText: "Not Found" };
    return {
      ok: entry.status === 200,
      status: entry.status,
      statusText: entry.status === 200 ? "OK" : "Error",
      async json() { return entry.json; },
      async text() { return JSON.stringify(entry.json); },
    };
  };
}

test("listConsumerRepos: returns owner+name pairs from repos.json", async () => {
  const url = "https://api.github.com/repos/Haverford-Brands/.github/contents/config/repos.json";
  const fetch = fakeFetch({
    [url]: {
      status: 200,
      json: {
        content: Buffer.from(JSON.stringify({
          repos: [
            { owner: "Haverford-Brands", name: "service-Auth-Gate", branch: "main", tier: 1 },
            { owner: "Haverford-Brands", name: "Catnets.com.au",    branch: "main", tier: 2 },
          ],
        })).toString("base64"),
      },
    },
  });
  const r = await listConsumerRepos({ owner: "Haverford-Brands", fleetRepo: "Haverford-Brands/.github", token: "fake", fetch });
  assert.equal(r.length, 2);
  assert.equal(r[0].name, "service-Auth-Gate");
  assert.equal(r[1].branch, "main");
});

test("listConsumerRepos: empty repos list returns []", async () => {
  const url = "https://api.github.com/repos/Empty/.github/contents/config/repos.json";
  const fetch = fakeFetch({
    [url]: { status: 200, json: { content: Buffer.from(JSON.stringify({ repos: [] })).toString("base64") } },
  });
  const r = await listConsumerRepos({ owner: "Empty", fleetRepo: "Empty/.github", token: "fake", fetch });
  assert.deepEqual(r, []);
});

test("listConsumerRepos: missing config/repos.json throws with a clear message", async () => {
  const fetch = fakeFetch({});
  await assert.rejects(
    () => listConsumerRepos({ owner: "X", fleetRepo: "X/.github", token: "fake", fetch }),
    /config\/repos\.json.*404/i,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: `Cannot find module` for listConsumerRepos, 3 new failures.

- [ ] **Step 3: Implement `listConsumerRepos`**

Append to `scripts/push-patches.mjs` (after `loadOrgs`):

```javascript
export async function listConsumerRepos({ owner, fleetRepo, token, fetch = globalThis.fetch }) {
  const url = `https://api.github.com/repos/${fleetRepo}/contents/config/repos.json`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`config/repos.json fetch failed for ${fleetRepo}: ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const decoded = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
  const entries = Array.isArray(decoded) ? decoded : decoded.repos ?? [];
  return entries
    .filter((e) => e.owner && e.name)
    .map((e) => ({ ...e, branch: e.branch ?? "main", tier: e.tier ?? 1 }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `# pass 7` `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/push-patches.mjs tests/push-patches.test.mjs
git commit -m "feat(push-patches): listConsumerRepos pulls managed list from gh contents API"
```

---

## Task 4: `planRefresh` — diff existing callers vs latest templates

**Files:**
- Modify: `00_repos/pipeline-fleet/scripts/push-patches.mjs`
- Modify: `00_repos/pipeline-fleet/tests/push-patches.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append:

```javascript
import { mkdtempSync as mkdir, writeFileSync as writef, mkdirSync as mkd } from "node:fs";
import { planRefresh } from "../scripts/push-patches.mjs";

function fakeTemplatesDir(files) {
  const dir = mkdir(join(tmpdir(), "tpl-"));
  for (const [name, body] of Object.entries(files)) {
    writef(join(dir, name), body);
  }
  return dir;
}

function fakeConsumer(files) {
  const dir = mkdir(join(tmpdir(), "cns-"));
  mkd(join(dir, ".github", "workflows"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writef(join(dir, ".github", "workflows", name), body);
  }
  return dir;
}

test("planRefresh: empty consumer.github/workflows ⇒ every template is `added`", () => {
  const tpl = fakeTemplatesDir({
    "pipeline-branch-name.yml": "name: Pipeline — branch-name caller\n",
    "pipeline-doctor.yml":      "name: Pipeline — doctor caller\n",
  });
  const repo = fakeConsumer({});
  const r = planRefresh({ repoDir: repo, callerTemplatesDir: tpl });
  assert.deepEqual(r.added.sort(),     ["pipeline-branch-name.yml", "pipeline-doctor.yml"]);
  assert.deepEqual(r.updated,          []);
  assert.deepEqual(r.unchanged,        []);
  assert.deepEqual(r.removed,          []);
});

test("planRefresh: byte-equal existing caller ⇒ `unchanged`", () => {
  const body = "name: Pipeline — branch-name caller\n";
  const tpl = fakeTemplatesDir({ "pipeline-branch-name.yml": body });
  const repo = fakeConsumer({ "pipeline-branch-name.yml": body });
  const r = planRefresh({ repoDir: repo, callerTemplatesDir: tpl });
  assert.deepEqual(r.unchanged, ["pipeline-branch-name.yml"]);
  assert.deepEqual(r.updated,   []);
  assert.deepEqual(r.added,     []);
});

test("planRefresh: byte-different existing caller ⇒ `updated`", () => {
  const tpl  = fakeTemplatesDir({ "pipeline-pr-labels.yml": "with:\n  labeler-config: .github/labeler.yml\n" });
  const repo = fakeConsumer({ "pipeline-pr-labels.yml": "with:\n  config-path: .github/labeler.yml\n" });
  const r = planRefresh({ repoDir: repo, callerTemplatesDir: tpl });
  assert.deepEqual(r.updated, ["pipeline-pr-labels.yml"]);
  assert.deepEqual(r.added,   []);
});

test("planRefresh: caller exists in repo but NOT in templates ⇒ `removed` (informational; not auto-deleted)", () => {
  const tpl  = fakeTemplatesDir({ "pipeline-branch-name.yml": "v1\n" });
  const repo = fakeConsumer({ "pipeline-branch-name.yml": "v1\n", "pipeline-legacy-thing.yml": "old\n" });
  const r = planRefresh({ repoDir: repo, callerTemplatesDir: tpl });
  assert.deepEqual(r.removed, ["pipeline-legacy-thing.yml"]);
  assert.deepEqual(r.updated, []);
});

test("planRefresh: non-pipeline YAMLs in workflows/ are ignored", () => {
  const tpl  = fakeTemplatesDir({ "pipeline-branch-name.yml": "v1\n" });
  const repo = fakeConsumer({ "pipeline-branch-name.yml": "v1\n", "custom-deploy.yml": "non-pipeline\n" });
  const r = planRefresh({ repoDir: repo, callerTemplatesDir: tpl });
  assert.deepEqual(r.unchanged, ["pipeline-branch-name.yml"]);
  assert.deepEqual(r.removed,   []);
  assert.deepEqual(r.updated,   []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 5 new failures, no exports found.

- [ ] **Step 3: Implement `planRefresh`**

Append to `scripts/push-patches.mjs`:

```javascript
import { existsSync, readFileSync as readF, readdirSync } from "node:fs";
import { join } from "node:path";

const PIPELINE_PREFIX = "pipeline-";
const YAML_EXT = /\.(yml|yaml)$/;

export function planRefresh({ repoDir, callerTemplatesDir }) {
  const templates = readdirSync(callerTemplatesDir)
    .filter((f) => f.startsWith(PIPELINE_PREFIX) && YAML_EXT.test(f));
  const workflowsDir = join(repoDir, ".github", "workflows");
  const existing = existsSync(workflowsDir)
    ? readdirSync(workflowsDir).filter((f) => f.startsWith(PIPELINE_PREFIX) && YAML_EXT.test(f))
    : [];

  const unchanged = [];
  const updated   = [];
  const added     = [];

  for (const name of templates) {
    const tplBody = readF(join(callerTemplatesDir, name), "utf8");
    if (!existing.includes(name)) {
      added.push(name);
      continue;
    }
    const consumerBody = readF(join(workflowsDir, name), "utf8");
    if (consumerBody === tplBody) {
      unchanged.push(name);
    } else {
      updated.push(name);
    }
  }

  const templateSet = new Set(templates);
  const removed = existing.filter((f) => !templateSet.has(f));

  return { unchanged, updated, added, removed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `# pass 12` `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/push-patches.mjs tests/push-patches.test.mjs
git commit -m "feat(push-patches): planRefresh diffs existing callers against templates"
```

---

## Task 5: `applyRefresh` — write the planned changes

**Files:**
- Modify: `00_repos/pipeline-fleet/scripts/push-patches.mjs`
- Modify: `00_repos/pipeline-fleet/tests/push-patches.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append:

```javascript
import { applyRefresh } from "../scripts/push-patches.mjs";
import { readFileSync, existsSync } from "node:fs";

test("applyRefresh: writes added files and overwrites updated ones; leaves unchanged alone", () => {
  const tpl = fakeTemplatesDir({
    "pipeline-branch-name.yml": "name: branch-name v2\n",
    "pipeline-doctor.yml":      "name: doctor v1\n",
  });
  const repo = fakeConsumer({
    "pipeline-branch-name.yml": "name: branch-name v1\n", // updated case
    // pipeline-doctor.yml missing — added case
  });
  const plan = planRefresh({ repoDir: repo, callerTemplatesDir: tpl });
  const written = applyRefresh({ plan, callerTemplatesDir: tpl, repoDir: repo });
  assert.equal(written.length, 2, "added + updated written");
  assert.equal(
    readFileSync(join(repo, ".github/workflows/pipeline-branch-name.yml"), "utf8"),
    "name: branch-name v2\n",
  );
  assert.ok(existsSync(join(repo, ".github/workflows/pipeline-doctor.yml")));
});

test("applyRefresh: no-op when plan is all-unchanged", () => {
  const body = "name: caller\n";
  const tpl  = fakeTemplatesDir({ "pipeline-branch-name.yml": body });
  const repo = fakeConsumer({ "pipeline-branch-name.yml": body });
  const plan = planRefresh({ repoDir: repo, callerTemplatesDir: tpl });
  const written = applyRefresh({ plan, callerTemplatesDir: tpl, repoDir: repo });
  assert.deepEqual(written, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 2 new failures, `applyRefresh` not exported.

- [ ] **Step 3: Implement `applyRefresh`**

Append to `scripts/push-patches.mjs`:

```javascript
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";

export function applyRefresh({ plan, callerTemplatesDir, repoDir }) {
  const written = [];
  const toWrite = [...plan.added, ...plan.updated];
  for (const name of toWrite) {
    const dest = join(repoDir, ".github", "workflows", name);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(callerTemplatesDir, name), dest);
    written.push(dest);
  }
  return written;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `# pass 14`.

- [ ] **Step 5: Commit**

```bash
git add scripts/push-patches.mjs tests/push-patches.test.mjs
git commit -m "feat(push-patches): applyRefresh writes added+updated callers"
```

---

## Task 6: `redactToken` + `run` helper — copy from fleet-doctor

**Files:**
- Modify: `00_repos/pipeline-fleet/scripts/push-patches.mjs`
- Modify: `00_repos/pipeline-fleet/tests/push-patches.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
import { redactToken } from "../scripts/push-patches.mjs";

test("redactToken: scrubs x-access-token:TOKEN@ patterns from error strings", () => {
  const dirty = "git clone https://x-access-token:ghs_AAAAbbbb1234@github.com/Org/repo.git failed: ...";
  const clean = redactToken(dirty);
  assert.equal(clean, "git clone https://x-access-token:***@github.com/Org/repo.git failed: ...");
});

test("redactToken: handles null/undefined gracefully", () => {
  assert.equal(redactToken(null), "");
  assert.equal(redactToken(undefined), "");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 2 new failures.

- [ ] **Step 3: Copy `redactToken` + `run` into push-patches.mjs**

Append to `scripts/push-patches.mjs`:

```javascript
import { spawnSync } from "node:child_process";

// Strip auth tokens out of any string that might land in logs or PR descriptions.
// `git clone https://x-access-token:TOKEN@github.com/...` puts the token in argv
// and any subsequent error message. Mirrors the helper in fleet-doctor.mjs.
export function redactToken(s) {
  return String(s ?? "").replace(/x-access-token:[^@\s]+@/g, "x-access-token:***@");
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `# pass 16`.

- [ ] **Step 5: Commit**

```bash
git add scripts/push-patches.mjs tests/push-patches.test.mjs
git commit -m "feat(push-patches): redactToken + run helper from fleet-doctor"
```

---

## Task 7: `preflightAutoPR` + `openRefreshPR` — git+gh side effects

**Files:**
- Modify: `00_repos/pipeline-fleet/scripts/push-patches.mjs`
- Modify: `00_repos/pipeline-fleet/tests/push-patches.test.mjs`

- [ ] **Step 1: Write the failing test (integration; spawns real git)**

Append:

```javascript
import { execSync } from "node:child_process";
import { preflightAutoPR } from "../scripts/push-patches.mjs";

function gitInit(dir) {
  execSync(`git init -q -b main`, { cwd: dir });
  execSync(`git config user.email test@example.com`, { cwd: dir });
  execSync(`git config user.name Test`, { cwd: dir });
  execSync(`git remote add origin https://example.com/x/y.git`, { cwd: dir });
  writef(join(dir, ".keep"), "");
  execSync(`git add .keep`, { cwd: dir });
  execSync(`git commit -q -m initial`, { cwd: dir });
}

test("preflightAutoPR: clean working tree, branch absent ⇒ passes", () => {
  const repo = mkdir(join(tmpdir(), "preflight-clean-"));
  gitInit(repo);
  assert.doesNotThrow(() => preflightAutoPR({ repoDir: repo, branch: "chore/refresh" }));
});

test("preflightAutoPR: dirty working tree ⇒ throws", () => {
  const repo = mkdir(join(tmpdir(), "preflight-dirty-"));
  gitInit(repo);
  writef(join(repo, "dirty.txt"), "uncommitted");
  assert.throws(
    () => preflightAutoPR({ repoDir: repo, branch: "chore/refresh" }),
    /clean working tree/i,
  );
});

test("preflightAutoPR: existing local branch ⇒ throws", () => {
  const repo = mkdir(join(tmpdir(), "preflight-branch-"));
  gitInit(repo);
  execSync(`git branch chore/refresh`, { cwd: repo });
  assert.throws(
    () => preflightAutoPR({ repoDir: repo, branch: "chore/refresh" }),
    /already exists/i,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 3 new failures.

- [ ] **Step 3: Implement `preflightAutoPR` (copy shape from install.mjs)**

Append:

```javascript
export function preflightAutoPR({ repoDir, branch }) {
  run("git", ["-C", repoDir, "rev-parse", "--show-toplevel"]);
  run("git", ["-C", repoDir, "remote", "get-url", "origin"]);
  const status = run("git", ["-C", repoDir, "status", "--porcelain"]);
  if (status.stdout?.trim()) {
    throw new Error(`push-patches needs a clean working tree in ${repoDir}; found uncommitted changes.`);
  }
  const r = spawnSync("git", ["-C", repoDir, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { stdio: "ignore" });
  if (r.status === 0) {
    throw new Error(`Branch \`${branch}\` already exists in ${repoDir}.`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `# pass 19`.

- [ ] **Step 5: Implement `openRefreshPR` (no direct unit test; covered by Task 9 integration)**

Append:

```javascript
import { relative } from "node:path";

function relativizePath(repoDir, absPath) {
  return relative(repoDir, absPath) || absPath;
}

export function openRefreshPR({ repoDir, branch, written, newVersion, plan }) {
  run("git", ["-C", repoDir, "checkout", "-b", branch]);
  run("git", ["-C", repoDir, "add", ...written.map((p) => relativizePath(repoDir, p))]);
  const summary = [
    plan.added.length    ? `add: ${plan.added.join(", ")}` : null,
    plan.updated.length  ? `update: ${plan.updated.join(", ")}` : null,
  ].filter(Boolean).join("; ");
  const title = `chore(pipeline-core): refresh caller workflows to ${newVersion}`;
  const body = [
    `## Summary`,
    ``,
    `Refreshes pipeline-core caller workflows to match \`leebaroneau/pipeline-core@${newVersion}\`.`,
    ``,
    `### Changed`,
    plan.added.length    ? `**Added** (${plan.added.length}):\n- ${plan.added.join("\n- ")}` : "",
    plan.updated.length  ? `**Updated** (${plan.updated.length}):\n- ${plan.updated.join("\n- ")}` : "",
    plan.removed.length  ? `**Note:** these caller files exist in this repo but are no longer in the upstream templates — left in place for your review:\n- ${plan.removed.join("\n- ")}` : "",
    ``,
    `Generated by \`pipeline-fleet/scripts/push-patches.mjs\`.`,
  ].filter(Boolean).join("\n");
  run("git", ["-C", repoDir, "commit", "-m", `${title}\n\n${summary}`]);
  run("git", ["-C", repoDir, "push", "-u", "origin", branch]);
  try {
    run("gh", ["pr", "create", "--head", branch, "--title", title, "--body", body], { cwd: repoDir });
  } catch (err) {
    process.stderr.write(`Branch pushed, but \`gh pr create\` failed: ${redactToken(err.message)}\n`);
    return null;
  }
  return run("gh", ["pr", "view", "--json", "url", "--jq", ".url"], { cwd: repoDir }).stdout.trim();
}
```

- [ ] **Step 6: Commit**

```bash
git add scripts/push-patches.mjs tests/push-patches.test.mjs
git commit -m "feat(push-patches): preflightAutoPR + openRefreshPR (git/gh side effects)"
```

---

## Task 8: `runPushPatches` — orchestrator (pure, dry-run mode)

**Files:**
- Modify: `00_repos/pipeline-fleet/scripts/push-patches.mjs`
- Modify: `00_repos/pipeline-fleet/tests/push-patches.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append:

```javascript
import { runPushPatches } from "../scripts/push-patches.mjs";

test("runPushPatches --dry-run: returns plan without mutating filesystem or opening PRs", async () => {
  // 1 fake org config + 1 fake consumer (in-tree clone, no remote)
  const orgsPath = withTempConfig({ orgs: [
    { name: "leebaroneau", retainer_status: "self", fleet_repo: "leebaroneau/pipeline-fleet" },
  ]});
  // 2 templates in a fake "pipeline-core" templates dir
  const tpl = fakeTemplatesDir({
    "pipeline-branch-name.yml": "name: branch-name v2\n",
    "pipeline-doctor.yml":      "name: doctor v1\n",
  });
  // The consumer has pipeline-branch-name.yml at v1 and is missing pipeline-doctor
  const consumerDir = fakeConsumer({ "pipeline-branch-name.yml": "name: branch-name v1\n" });
  // listConsumerRepos is injected; cloneConsumer also injected to return the prepared dir
  const summary = await runPushPatches({
    orgsConfigPath: orgsPath,
    callerTemplatesDir: tpl,
    dryRun: true,
    token: "fake",
    listConsumerRepos: async () => [{ owner: "leebaroneau", name: "lee-dashboard", branch: "main", tier: 1 }],
    cloneConsumer: async () => consumerDir,
  });
  assert.equal(summary.orgs.length, 1);
  assert.equal(summary.orgs[0].repos.length, 1);
  assert.deepEqual(summary.orgs[0].repos[0].plan.added,   ["pipeline-doctor.yml"]);
  assert.deepEqual(summary.orgs[0].repos[0].plan.updated, ["pipeline-branch-name.yml"]);
  assert.equal(summary.orgs[0].repos[0].prUrl, null, "dry-run does NOT open a PR");
  // Confirm filesystem was NOT mutated
  assert.equal(
    readFileSync(join(consumerDir, ".github/workflows/pipeline-branch-name.yml"), "utf8"),
    "name: branch-name v1\n",
    "dry-run leaves consumer untouched",
  );
});

test("runPushPatches: inactive org is skipped", async () => {
  const orgsPath = withTempConfig({ orgs: [
    { name: "alx-finance", retainer_status: "inactive", pinned_version: "v1.0.5", fleet_repo: "alx-finance/.github" },
  ]});
  const summary = await runPushPatches({
    orgsConfigPath: orgsPath,
    callerTemplatesDir: fakeTemplatesDir({}),
    dryRun: true,
    token: "fake",
    listConsumerRepos: async () => { throw new Error("should not be called for inactive orgs"); },
    cloneConsumer:     async () => { throw new Error("should not be called for inactive orgs"); },
  });
  assert.equal(summary.orgs.length, 0, "no org-level work for inactive orgs");
  assert.equal(summary.skippedOrgs.length, 1);
});

test("runPushPatches: --owner filter restricts to a single active org", async () => {
  const orgsPath = withTempConfig({ orgs: [
    { name: "leebaroneau",     retainer_status: "self",   fleet_repo: "leebaroneau/pipeline-fleet" },
    { name: "Haverford-Brands", retainer_status: "active", fleet_repo: "Haverford-Brands/.github" },
  ]});
  let calledFor = [];
  const summary = await runPushPatches({
    orgsConfigPath: orgsPath,
    callerTemplatesDir: fakeTemplatesDir({}),
    owners: ["Haverford-Brands"],
    dryRun: true,
    token: "fake",
    listConsumerRepos: async ({ owner }) => { calledFor.push(owner); return []; },
    cloneConsumer:     async () => { throw new Error("should not be called when consumer list is empty"); },
  });
  assert.deepEqual(calledFor, ["Haverford-Brands"]);
  assert.equal(summary.orgs.length, 1);
  assert.equal(summary.orgs[0].name, "Haverford-Brands");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 3 new failures, `runPushPatches` not exported.

- [ ] **Step 3: Implement `runPushPatches`**

Append:

```javascript
export async function runPushPatches({
  orgsConfigPath,
  callerTemplatesDir,
  owners,                  // optional: filter active orgs to this allowlist
  dryRun = false,
  newVersion = "v1",       // PR title/body label
  token = process.env.FLEET_PAT ?? process.env.GITHUB_TOKEN,
  // Injected dependencies (defaults are real):
  listConsumerRepos: listFn = listConsumerRepos,
  cloneConsumer: cloneFn,
  openPR: openFn = openRefreshPR,
}) {
  if (!token) throw new Error("runPushPatches needs FLEET_PAT or GITHUB_TOKEN.");
  const { active, skipped, invalid } = loadOrgs(orgsConfigPath);
  const filtered = owners?.length
    ? active.filter((o) => owners.includes(o.name))
    : active;

  const orgsOut = [];
  for (const org of filtered) {
    const consumers = await listFn({ owner: org.name, fleetRepo: org.fleet_repo, token });
    const repos = [];
    for (const c of consumers) {
      const repoDir = await cloneFn({ owner: c.owner, name: c.name, branch: c.branch, token });
      try {
        const plan = planRefresh({ repoDir, callerTemplatesDir });
        const willWrite = plan.added.length + plan.updated.length;
        if (willWrite === 0) {
          repos.push({ slug: `${c.owner}/${c.name}`, plan, prUrl: null, action: "noop" });
          continue;
        }
        if (dryRun) {
          repos.push({ slug: `${c.owner}/${c.name}`, plan, prUrl: null, action: "dry-run" });
          continue;
        }
        const branch = `chore/refresh-pipeline-core-${newVersion}`;
        preflightAutoPR({ repoDir, branch });
        const written = applyRefresh({ plan, callerTemplatesDir, repoDir });
        const prUrl = openFn({ repoDir, branch, written, newVersion, plan });
        repos.push({ slug: `${c.owner}/${c.name}`, plan, prUrl, action: "pr-opened" });
      } catch (err) {
        repos.push({ slug: `${c.owner}/${c.name}`, plan: null, prUrl: null, action: "error", error: redactToken(err.message) });
      }
    }
    orgsOut.push({ name: org.name, fleet_repo: org.fleet_repo, repos });
  }
  return { orgs: orgsOut, skippedOrgs: skipped, invalidOrgs: invalid };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `# pass 22`.

- [ ] **Step 5: Commit**

```bash
git add scripts/push-patches.mjs tests/push-patches.test.mjs
git commit -m "feat(push-patches): runPushPatches orchestrator + --dry-run + --owner filter"
```

---

## Task 9: Real `cloneConsumer` (shallow clone via FLEET_PAT)

**Files:**
- Modify: `00_repos/pipeline-fleet/scripts/push-patches.mjs`
- Modify: `00_repos/pipeline-fleet/tests/push-patches.test.mjs`

- [ ] **Step 1: Write the failing test (uses a real local bare repo as the "remote")**

Append:

```javascript
import { cloneConsumer } from "../scripts/push-patches.mjs";

function makeBareRemote() {
  // Create a working repo with content, then clone --bare to act as a "remote"
  const work = mkdir(join(tmpdir(), "work-"));
  execSync(`git init -q -b main`, { cwd: work });
  execSync(`git config user.email a@b`, { cwd: work });
  execSync(`git config user.name a`, { cwd: work });
  mkd(join(work, ".github/workflows"), { recursive: true });
  writef(join(work, ".github/workflows/pipeline-branch-name.yml"), "v1\n");
  execSync(`git add .`, { cwd: work });
  execSync(`git commit -q -m initial`, { cwd: work });
  const bare = mkdir(join(tmpdir(), "bare-")) + ".git";
  execSync(`git clone --bare ${work} ${bare}`);
  return bare;
}

test("cloneConsumer: shallow-clones the remote, returns the dir, .github/workflows intact", async () => {
  const bare = makeBareRemote();
  // cloneConsumer uses fileURLToHttp via `--url-override` (test seam) so we
  // don't actually hit github.com.
  const dir = await cloneConsumer({
    owner: "x", name: "y", branch: "main", token: "fake",
    urlOverride: `file://${bare}`,
  });
  assert.ok(existsSync(join(dir, ".github/workflows/pipeline-branch-name.yml")));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 1 new failure.

- [ ] **Step 3: Implement `cloneConsumer`**

Append:

```javascript
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

export async function cloneConsumer({ owner, name, branch = "main", token, urlOverride }) {
  const dir = mkdtempSync(join(tmpdir(), `push-patches-${name}-`));
  const url = urlOverride ?? `https://x-access-token:${token}@github.com/${owner}/${name}.git`;
  run("git", ["clone", "--depth", "1", "--single-branch", "--branch", branch, url, dir]);
  return dir;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `# pass 23`.

- [ ] **Step 5: Commit**

```bash
git add scripts/push-patches.mjs tests/push-patches.test.mjs
git commit -m "feat(push-patches): cloneConsumer shallow-clones via FLEET_PAT"
```

---

## Task 10: CLI entry point + integration test against real local pipeline-core templates

**Files:**
- Modify: `00_repos/pipeline-fleet/scripts/push-patches.mjs`
- Modify: `00_repos/pipeline-fleet/tests/push-patches.test.mjs`

- [ ] **Step 1: Write the integration test**

Append:

```javascript
test("integration: dry-run against 2 fake consumers reports 1 noop + 1 with adds", async () => {
  const orgsPath = withTempConfig({ orgs: [
    { name: "FakeOrg", retainer_status: "active", fleet_repo: "FakeOrg/.github" },
  ]});
  // Templates: 1 caller
  const tpl = fakeTemplatesDir({ "pipeline-branch-name.yml": "v2\n" });
  // Consumer A: already at v2 (noop). Consumer B: missing the caller (add).
  const consumerA = fakeConsumer({ "pipeline-branch-name.yml": "v2\n" });
  const consumerB = fakeConsumer({});
  const summary = await runPushPatches({
    orgsConfigPath: orgsPath,
    callerTemplatesDir: tpl,
    dryRun: true,
    token: "fake",
    listConsumerRepos: async () => [
      { owner: "FakeOrg", name: "A", branch: "main", tier: 1 },
      { owner: "FakeOrg", name: "B", branch: "main", tier: 1 },
    ],
    cloneConsumer: async ({ name }) => name === "A" ? consumerA : consumerB,
  });
  const actions = summary.orgs[0].repos.map((r) => r.action).sort();
  assert.deepEqual(actions, ["dry-run", "noop"]);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test`
Expected: `# pass 24`.

- [ ] **Step 3: Add the CLI shim**

Append to `scripts/push-patches.mjs`:

```javascript
// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { owners: [], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--orgs-config")      args.orgsConfigPath     = argv[++i];
    else if (a === "--templates")   args.callerTemplatesDir = argv[++i];
    else if (a === "--owner")       args.owners.push(argv[++i]);
    else if (a === "--new-version") args.newVersion         = argv[++i];
    else if (a === "--dry-run")     args.dryRun             = true;
    else if (a === "--help" || a === "-h") args.help        = true;
  }
  return args;
}

const HELP = `Usage: push-patches.mjs --orgs-config <path> --templates <path> [options]

Cascades pipeline-core caller-workflow updates to every consumer repo across
active retainer orgs. Opens one PR per repo if any caller has changed.

Required:
  --orgs-config <path>         config/orgs.json (pipeline-fleet)
  --templates <path>           pipeline-core/templates/caller-workflows/

Options:
  --owner <name>               Restrict to one active org. Repeatable.
  --new-version <ref>          Label shown in PR title/body (default: v1)
  --dry-run                    Plan only — no clones write back, no PRs open
  --help, -h                   Show this help

Auth: FLEET_PAT or GITHUB_TOKEN env var.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(HELP); return 0; }
  if (!args.orgsConfigPath || !args.callerTemplatesDir) {
    process.stderr.write("push-patches.mjs needs --orgs-config and --templates.\n");
    return 1;
  }
  const summary = await runPushPatches({
    orgsConfigPath:     args.orgsConfigPath,
    callerTemplatesDir: args.callerTemplatesDir,
    owners:             args.owners,
    dryRun:             args.dryRun,
    newVersion:         args.newVersion ?? "v1",
    cloneConsumer,
  });
  // Concise stdout summary
  for (const org of summary.orgs) {
    process.stdout.write(`\n[${org.name}] ${org.repos.length} consumer(s):\n`);
    for (const r of org.repos) {
      const tag = r.action === "pr-opened" ? `→ ${r.prUrl}` : `(${r.action})`;
      process.stdout.write(`  ${r.slug}  ${tag}\n`);
    }
  }
  for (const s of summary.skippedOrgs) {
    process.stdout.write(`\n[skip] ${s.name} (retainer_status=${s.retainer_status})\n`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/push-patches.mjs")) {
  main().then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`push-patches.mjs failed: ${redactToken(err.stack ?? err.message ?? err)}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Manually verify the CLI shim works**

Run from a checkout of pipeline-fleet:

```bash
cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet
FLEET_PAT="$(gh auth token)" node scripts/push-patches.mjs --help
```

Expected: HELP text prints, exit 0.

Then run a real dry-run against the live config and live pipeline-core templates:

```bash
FLEET_PAT="$(gh auth token)" node scripts/push-patches.mjs \
  --orgs-config config/orgs.json \
  --templates /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-core/templates/caller-workflows \
  --owner leebaroneau \
  --dry-run
```

Expected: Walks `leebaroneau/pipeline-fleet`'s own `config/repos.json` (which now has `lee-dashboard` + `template-agent`), clones each, plans, and reports `(noop)` for both (because both repos installed pipeline-core v1.0.11 already and templates haven't changed since). Exit 0. No PRs opened.

- [ ] **Step 5: Commit**

```bash
git add scripts/push-patches.mjs tests/push-patches.test.mjs
git commit -m "feat(push-patches): CLI entry + integration test against fake org"
```

---

## Task 11: PR + ship

**Files:**
- Push the branch
- Open PR on `leebaroneau/pipeline-fleet`

- [ ] **Step 1: Push the branch**

```bash
cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet
git push -u origin feat/push-patches-mjs
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --repo leebaroneau/pipeline-fleet --head feat/push-patches-mjs --base main \
  --title "feat: push-patches.mjs (patch cascade tool)" \
  --body "$(cat <<'EOF'
## Summary

Adds \`scripts/push-patches.mjs\`, the patch-cascade tool described in this repo's README under "Patch propagation."

When a new \`leebaroneau/pipeline-core\` release cuts, run this from a local pipeline-fleet checkout to fan out a "refresh caller workflows" PR across every active-org consumer.

## How it works

1. Reads \`config/orgs.json\` → partitions into active / skipped / invalid.
2. For each active org, fetches that org's \`.github/config/repos.json\` via the GitHub API.
3. For each consumer, shallow-clones via FLEET_PAT, diffs \`.github/workflows/pipeline-*.yml\` against \`pipeline-core/templates/caller-workflows/\`.
4. If anything is added/updated, branches, commits, pushes, and opens a PR titled \`chore(pipeline-core): refresh caller workflows to <new-version>\`.
5. Byte-equal callers ⇒ no PR. Inactive orgs ⇒ skipped entirely.

## Flags

- \`--dry-run\` — plan only, no PRs
- \`--owner <name>\` — restrict to a single active org (repeatable)
- \`--new-version <ref>\` — label for PR title/body (default \`v1\`)

## Test plan

- [x] 24 unit + integration tests, \`npm test\` green
- [x] Manual dry-run against leebaroneau org reports both consumers as \`(noop)\` (correct: they installed v1.0.11 already, templates haven't moved since)
- [ ] After merge, smoke against Haverford-Brands org with \`--dry-run\` to confirm 46 consumer plans render without error

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch the PR's CI go green**

Pipeline-fleet inherits pipeline-core caller workflows, so the new branch should pass: branch-name, issue-link (issue ref needed in body — add one if pipeline-fleet's pipeline-config requires it), merge-gate, results-gate, workflow-lint, validate-config, drift-scan.

- [ ] **Step 4: Squash-merge after CI green**

```bash
gh pr merge <PR_NUM> --repo leebaroneau/pipeline-fleet --squash --delete-branch
```

- [ ] **Step 5: Post-merge smoke**

```bash
cd /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-fleet
git checkout main && git pull
FLEET_PAT="$(gh auth token)" node scripts/push-patches.mjs \
  --orgs-config config/orgs.json \
  --templates /Users/leebaroneau/Documents/GitHub/lee-dashboard/00_repos/pipeline-core/templates/caller-workflows \
  --dry-run
```

Expected: All 5 active orgs walked (1 self + 4 active), 53 consumers planned (1 lee-dashboard + 1 template-agent + 46 Haverford + 2 ALX + 3 Genvest + 1 kwa), all `(noop)` because we just installed v1.0.11 callers via the fan-out. No PRs opened. Exit 0.

If any consumer reports `dry-run` (= would open a PR), that's a real-world drift signal worth investigating.

---

## Self-Review Checklist

- [ ] **Spec coverage:** Every constraint in the user's brief has a task.
  - "Read config/orgs.json" → Task 2 ✓
  - "For each ACTIVE org, open a PR in each consumer to refresh caller templates" → Tasks 4–8 ✓
  - "INACTIVE orgs: skip" → Task 8, test "inactive org is skipped" ✓
  - "Add NEW caller (e.g. v1.0.10 added pipeline-doctor.yml)" → Task 4 `added` ✓
  - "Existing caller's inputs change (v1.0.8 fix on pipeline-pr-labels.yml)" → Task 4 `updated` ✓
  - "Idempotent (byte-equal ⇒ no PR)" → Task 4 `unchanged` ✓ + Task 8 `action: "noop"` ✓
  - "--dry-run" → Task 8 + Task 10 ✓
  - "--owner <name>" → Task 8 + Task 10 ✓
  - "Must NOT touch pipeline-config.yml" → only `.github/workflows/pipeline-*.yml` is in scope; pipeline-config.yml is never on the writelist ✓
  - "One PR per repo, title `chore(pipeline-core): refresh caller workflows to <new-tag>`" → Task 7 `openRefreshPR` ✓
  - "Use `relativizePath()` from install.mjs" → Task 7 (copied locally rather than imported across repos to keep pipeline-fleet self-contained) ✓
  - "Token redaction" → Task 6 ✓

- [ ] **Placeholder scan:** All "TBD", "implement later", and similar removed. Every step shows the actual code. ✓

- [ ] **Type consistency:**
  - `planRefresh` returns `{ unchanged, updated, added, removed }` — same shape in every reference (Tasks 4, 5, 7, 8).
  - `runPushPatches` injects `cloneConsumer` (Task 8 default param). Task 9 implements `cloneConsumer` and Task 10's CLI passes it. Names match.
  - PR title format `chore(pipeline-core): refresh caller workflows to <new-version>` is identical in Task 7 implementation and Task 8 branch name (`chore/refresh-pipeline-core-<new-version>`). ✓

---

## Rollout sequence (post-merge)

1. **Cut a no-op pipeline-core release** (e.g. v1.0.12 with just a CHANGELOG entry) to exercise push-patches on a real release. Expected: every consumer reports `(noop)` because nothing in `templates/caller-workflows/` actually changed.
2. **Cut a real fix** (e.g. tweak one caller template). Expected: push-patches opens a PR in every consumer whose installed caller differs. Verify on 2–3 sample consumers before batch-merging the cascade PRs.
3. **Document the workflow** in `pipeline-fleet/README.md` — replace the "How patch propagation works" ASCII diagram's "→ open a PR" bullet with a link to the actual CLI invocation.
4. **Optional follow-up:** schedule push-patches as a fleet workflow that triggers on `release: published` for pipeline-core. Out of scope for v1.
