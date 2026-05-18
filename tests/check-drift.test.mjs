import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareGeneratedArtifact } from "../scripts/check-drift.mjs";

test("compareGeneratedArtifact ok when committed matches generated", () => {
  const dir = mkdtempSync(join(tmpdir(), "drift-"));
  writeFileSync(join(dir, "a.yml"), "labels: []\n");
  writeFileSync(join(dir, "b.yml"), "labels: []\n");
  const result = compareGeneratedArtifact({
    committedPath: join(dir, "a.yml"),
    generatedPath: join(dir, "b.yml"),
  });
  assert.equal(result.ok, true);
});

test("compareGeneratedArtifact reports drift", () => {
  const dir = mkdtempSync(join(tmpdir(), "drift-"));
  writeFileSync(join(dir, "a.yml"), "labels: [old]\n");
  writeFileSync(join(dir, "b.yml"), "labels: [new]\n");
  const result = compareGeneratedArtifact({
    committedPath: join(dir, "a.yml"),
    generatedPath: join(dir, "b.yml"),
  });
  assert.equal(result.ok, false);
  assert.match(result.diff, /old/);
  assert.match(result.diff, /new/);
});
