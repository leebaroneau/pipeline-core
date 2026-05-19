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

test("discover: falls back to /users only on a 404 from /orgs (personal accounts)", async () => {
  const seen = [];
  const fetch = async (url) => {
    seen.push(url);
    if (url.includes("orgs/personal")) {
      return { ok: false, status: 404, async text() { return "Not Found"; }, async json() { return {}; } };
    }
    if (url.includes("users/personal")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [{ name: "my-thing", owner: { login: "personal" }, archived: false, fork: false, visibility: "public", language: "TS", updated_at: "2026-05-19T00:00:00Z" }];
        },
        async text() { return ""; },
      };
    }
    return { ok: false, status: 500, async text() { return ""; }, async json() { return {}; } };
  };
  const configDir = setupConfigDir();
  const result = await discover({ owner: "personal", token: "fake", configDir, fetch });
  assert.equal(result.counts.candidates, 1);
  assert.ok(seen.some((u) => u.includes("orgs/personal")), "should have tried /orgs first");
  assert.ok(seen.some((u) => u.includes("users/personal")), "should have fallen back to /users");
});

test("discover: does NOT fall back on 403/429/etc — those are real failures", async () => {
  const fetch = async (url) => {
    if (url.includes("orgs/OrgZ")) {
      return { ok: false, status: 403, async text() { return "rate limit / not authorized"; }, async json() { return {}; } };
    }
    // If we WERE to fall back, /users would return success — assertion should NOT see this path.
    return {
      ok: true,
      status: 200,
      async json() { return []; },
      async text() { return ""; },
    };
  };
  const configDir = setupConfigDir();
  await assert.rejects(
    () => discover({ owner: "OrgZ", token: "fake", configDir, fetch }),
    /403/,
    "a 403 from /orgs should surface as an error, not get masked by /users fallback",
  );
});

test("discover: errors without owner / token / configDir", async () => {
  await assert.rejects(() => discover({ token: "x", configDir: "/tmp" }), /owner/);
  await assert.rejects(() => discover({ owner: "X", configDir: "/tmp" }), /token/);
  await assert.rejects(() => discover({ owner: "X", token: "y" }), /configDir/);
});

test("keyOf: owner/name normalization", () => {
  assert.equal(keyOf({ owner: "X", name: "y" }), "X/y");
});
