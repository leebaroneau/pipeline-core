import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  diffShims,
  refreshBranchName,
  listShimFiles,
  planRepoRefresh,
} from "../scripts/refresh.mjs";

test("diffShims: returns template shims absent from the repo", () => {
  const result = diffShims({
    templateFiles: ["pipeline-merge-gate.yml", "pipeline-add-to-project.yml", "pipeline-pr-state.yml"],
    presentFiles: ["pipeline-merge-gate.yml", "pipeline-pr-state.yml"],
  });
  assert.deepEqual(result.missing, ["pipeline-add-to-project.yml"]);
});

test("diffShims: empty when repo already has every template shim", () => {
  const result = diffShims({
    templateFiles: ["pipeline-merge-gate.yml"],
    presentFiles: ["pipeline-merge-gate.yml", "pipeline-extra.yml"],
  });
  assert.deepEqual(result.missing, []);
});

test("diffShims: sorts missing deterministically", () => {
  const result = diffShims({
    templateFiles: ["pipeline-z.yml", "pipeline-a.yml", "pipeline-m.yml"],
    presentFiles: [],
  });
  assert.deepEqual(result.missing, ["pipeline-a.yml", "pipeline-m.yml", "pipeline-z.yml"]);
});

test("refreshBranchName: matches the pipeline branch-name regex", () => {
  const branch = refreshBranchName(44);
  assert.equal(branch, "task/44-distribute-pipeline-shims");
  assert.match(branch, /^(bug|story|task|spike|experiment|epic)\/[0-9]+-[a-z0-9-]+$/);
});

test("listShimFiles: returns only pipeline-*.yml files, sorted", () => {
  const dir = mkdtempSync(join(tmpdir(), "refresh-shims-"));
  writeFileSync(join(dir, "pipeline-b.yml"), "x");
  writeFileSync(join(dir, "pipeline-a.yml"), "x");
  writeFileSync(join(dir, "README.md"), "x");
  writeFileSync(join(dir, "not-a-shim.yml"), "x");
  assert.deepEqual(listShimFiles(dir), ["pipeline-a.yml", "pipeline-b.yml"]);
});

test("listShimFiles: returns empty array for a missing directory", () => {
  assert.deepEqual(listShimFiles("/no/such/dir/anywhere"), []);
});

test("planRepoRefresh: skips when nothing is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "refresh-plan-ok-"));
  const wf = join(dir, ".github", "workflows");
  mkdirSync(wf, { recursive: true });
  writeFileSync(join(wf, "pipeline-merge-gate.yml"), "x");
  const plan = planRepoRefresh({
    repoDir: dir,
    templateFiles: ["pipeline-merge-gate.yml"],
  });
  assert.equal(plan.skip, true);
  assert.equal(plan.reason, "in-sync");
  assert.deepEqual(plan.missing, []);
});

test("planRepoRefresh: acts when a shim is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "refresh-plan-act-"));
  const wf = join(dir, ".github", "workflows");
  mkdirSync(wf, { recursive: true });
  writeFileSync(join(wf, "pipeline-merge-gate.yml"), "x");
  const plan = planRepoRefresh({
    repoDir: dir,
    templateFiles: ["pipeline-merge-gate.yml", "pipeline-add-to-project.yml"],
  });
  assert.equal(plan.skip, false);
  assert.deepEqual(plan.missing, ["pipeline-add-to-project.yml"]);
});

test("planRepoRefresh: skips when workflows dir is absent (repo not pipeline-installed)", () => {
  const dir = mkdtempSync(join(tmpdir(), "refresh-plan-noinstall-"));
  const plan = planRepoRefresh({
    repoDir: dir,
    templateFiles: ["pipeline-merge-gate.yml"],
  });
  assert.equal(plan.skip, true);
  assert.equal(plan.reason, "not-installed");
});
