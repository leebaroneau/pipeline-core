import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadRepos, redactToken } from "../scripts/fleet-doctor.mjs";

test("loadRepos: parses {repos: [...]} wrapper form and defaults branch/tier", () => {
  const dir = mkdtempSync(join(tmpdir(), "fleet-load-"));
  const path = join(dir, "repos.json");
  writeFileSync(path, JSON.stringify({
    repos: [
      { owner: "A", name: "b" },
      { owner: "C", name: "d", branch: "develop", tier: 2 },
    ],
  }));
  const { repos, invalid } = loadRepos(path);
  assert.equal(repos.length, 2);
  assert.equal(invalid.length, 0);
  assert.equal(repos[0].branch, "main");
  assert.equal(repos[0].tier, 1);
  assert.equal(repos[1].branch, "develop");
  assert.equal(repos[1].tier, 2);
});

test("loadRepos: parses bare-array form", () => {
  const dir = mkdtempSync(join(tmpdir(), "fleet-load-array-"));
  const path = join(dir, "repos.json");
  writeFileSync(path, JSON.stringify([{ owner: "A", name: "b" }]));
  const { repos } = loadRepos(path);
  assert.equal(repos[0].owner, "A");
});

test("loadRepos: partitions bad rows into invalid[] instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "fleet-load-bad-"));
  const path = join(dir, "repos.json");
  writeFileSync(path, JSON.stringify({
    repos: [
      { owner: "A", name: "b" },
      { owner: "X" },                       // missing name
      { owner: "C", name: "d" },
    ],
  }));
  const { repos, invalid } = loadRepos(path);
  assert.equal(repos.length, 2, "valid rows should still be loaded");
  assert.equal(invalid.length, 1);
  assert.match(invalid[0].reason, /owner\/name/);
});

// ─── redactToken (security-critical) ────────────────────────────────────────

test("redactToken: scrubs x-access-token URLs (any token value)", () => {
  const url = "https://x-access-token:ghp_supersecret123ABC@github.com/foo/bar.git";
  const out = redactToken(`git clone exited 128: fatal: not found at ${url}`);
  assert.ok(!out.includes("ghp_supersecret123ABC"), `token leaked: ${out}`);
  assert.match(out, /x-access-token:\*\*\*@github\.com/);
});

test("redactToken: handles multiple URLs in one string", () => {
  const out = redactToken("https://x-access-token:AAA@github.com/x/y https://x-access-token:BBB@github.com/x/z");
  assert.ok(!out.includes("AAA"));
  assert.ok(!out.includes("BBB"));
});

test("redactToken: passes through strings with no token URL", () => {
  assert.equal(redactToken("plain text"), "plain text");
  assert.equal(redactToken(""), "");
  assert.equal(redactToken(null), "");
});
