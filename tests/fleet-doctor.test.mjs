import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadRepos } from "../scripts/fleet-doctor.mjs";

test("loadRepos: parses the {repos: [...]} wrapper form and defaults branch/tier", () => {
  const dir = mkdtempSync(join(tmpdir(), "fleet-load-"));
  const path = join(dir, "repos.json");
  writeFileSync(path, JSON.stringify({
    repos: [
      { owner: "A", name: "b" },
      { owner: "C", name: "d", branch: "develop", tier: 2 },
    ],
  }));
  const repos = loadRepos(path);
  assert.equal(repos.length, 2);
  assert.equal(repos[0].branch, "main");
  assert.equal(repos[0].tier, 1);
  assert.equal(repos[1].branch, "develop");
  assert.equal(repos[1].tier, 2);
});

test("loadRepos: parses the bare-array form", () => {
  const dir = mkdtempSync(join(tmpdir(), "fleet-load-array-"));
  const path = join(dir, "repos.json");
  writeFileSync(path, JSON.stringify([{ owner: "A", name: "b" }]));
  const repos = loadRepos(path);
  assert.equal(repos[0].owner, "A");
});

test("loadRepos: throws when an entry is missing owner/name", () => {
  const dir = mkdtempSync(join(tmpdir(), "fleet-load-bad-"));
  const path = join(dir, "repos.json");
  writeFileSync(path, JSON.stringify({ repos: [{ owner: "A" }] }));
  assert.throws(() => loadRepos(path), /owner\/name/);
});
