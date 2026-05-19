import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discover, classifyRepo, keyOf } from "../scripts/discover.mjs";

// ─── classifyRepo (pure) ────────────────────────────────────────────────────

test("classifyRepo: archived repos are flagged archived (not candidates)", () => {
  const repo = { name: "old-app", archived: true, _owner: "OrgX" };
  const c = classifyRepo(repo, { managedKeys: new Set(), skippedKeys: new Set() });
  assert.equal(c, "archived");
});

test("classifyRepo: forks are flagged fork", () => {
  const repo = { name: "fork-of-thing", fork: true, _owner: "OrgX" };
  const c = classifyRepo(repo, { managedKeys: new Set(), skippedKeys: new Set() });
  assert.equal(c, "fork");
});

test("classifyRepo: managed repos returned as managed", () => {
  const repo = { name: "service-x", _owner: "OrgX" };
  const c = classifyRepo(repo, { managedKeys: new Set(["OrgX/service-x"]), skippedKeys: new Set() });
  assert.equal(c, "managed");
});

test("classifyRepo: skipped beats candidate", () => {
  const repo = { name: ".github", _owner: "OrgX" };
  const c = classifyRepo(repo, { managedKeys: new Set(), skippedKeys: new Set(["OrgX/.github"]) });
  assert.equal(c, "skipped");
});

test("classifyRepo: anything else is a candidate", () => {
  const repo = { name: "new-service", _owner: "OrgX" };
  const c = classifyRepo(repo, { managedKeys: new Set(), skippedKeys: new Set() });
  assert.equal(c, "candidate");
});

// ─── discover() end-to-end with a mock fetch ────────────────────────────────

function mockFetch(reposByEndpoint) {
  return async (url) => {
    for (const [pattern, payload] of Object.entries(reposByEndpoint)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          async json() { return payload; },
          async text() { return JSON.stringify(payload); },
        };
      }
    }
    return { ok: false, status: 404, async text() { return "Not Found"; }, async json() { return {}; } };
  };
}

function setupConfigDir({ managed = [], skipped = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "discover-config-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "repos.json"), JSON.stringify({ repos: managed }));
  writeFileSync(join(dir, "skip.json"), JSON.stringify({ repos: skipped }));
  return dir;
}

test("discover: partitions repos correctly across managed / skipped / candidate", async () => {
  const fetch = mockFetch({
    "orgs/OrgX/repos": [
      { name: "managed-svc",  owner: { login: "OrgX" }, archived: false, fork: false, visibility: "private", language: "TypeScript", updated_at: "2026-05-01T00:00:00Z" },
      { name: "skipped-meta", owner: { login: "OrgX" }, archived: false, fork: false, visibility: "private", language: null, updated_at: "2026-05-01T00:00:00Z" },
      { name: "new-thing",    owner: { login: "OrgX" }, archived: false, fork: false, visibility: "private", language: "Python", updated_at: "2026-05-15T00:00:00Z" },
      { name: "old-thing",    owner: { login: "OrgX" }, archived: true,  fork: false, visibility: "private", language: "Ruby", updated_at: "2025-01-01T00:00:00Z" },
      { name: "fork-thing",   owner: { login: "OrgX" }, archived: false, fork: true,  visibility: "private", language: "Go", updated_at: "2026-05-01T00:00:00Z" },
    ],
  });

  const configDir = setupConfigDir({
    managed: [{ owner: "OrgX", name: "managed-svc" }],
    skipped: [{ owner: "OrgX", name: "skipped-meta" }],
  });

  const result = await discover({ owner: "OrgX", token: "fake-token", configDir, fetch });
  assert.equal(result.counts.candidates, 1);
  assert.equal(result.candidates[0].name, "new-thing");
  assert.equal(result.counts.managed, 1);
  assert.equal(result.counts.skipped, 1);
});

test("discover: empty org returns zero candidates without throwing", async () => {
  const fetch = mockFetch({ "orgs/OrgY/repos": [] });
  const configDir = setupConfigDir();
  const result = await discover({ owner: "OrgY", token: "fake", configDir, fetch });
  assert.equal(result.counts.candidates, 0);
  assert.equal(result.candidates.length, 0);
});

test("discover: errors without owner / token / configDir", async () => {
  await assert.rejects(() => discover({ token: "x", configDir: "/tmp" }), /owner/);
  await assert.rejects(() => discover({ owner: "X", configDir: "/tmp" }), /token/);
  await assert.rejects(() => discover({ owner: "X", token: "y" }), /configDir/);
});

test("keyOf: owner/name normalization", () => {
  assert.equal(keyOf({ owner: "X", name: "y" }), "X/y");
});
