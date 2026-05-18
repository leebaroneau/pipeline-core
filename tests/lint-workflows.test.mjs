import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { lintWorkflows } from "../scripts/lint-workflows.mjs";

const FIX = join(import.meta.dirname, "fixtures");

test("lintWorkflows on good fixture returns ok", () => {
  const result = lintWorkflows({
    workflows: [{ path: join(FIX, "good-workflow.yml"), filename: "pipeline-good-example.yml" }],
    scriptExists: () => true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("lintWorkflows on bad-no-permissions reports the failure", () => {
  const result = lintWorkflows({
    workflows: [{ path: join(FIX, "bad-no-permissions.yml"), filename: "pipeline-bad-no-permissions.yml" }],
    scriptExists: () => true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /missing permissions/i);
});

test("lintWorkflows aggregates failures across multiple workflows", () => {
  const result = lintWorkflows({
    workflows: [
      { path: join(FIX, "bad-no-permissions.yml"), filename: "pipeline-bad-no-permissions.yml" },
      { path: join(FIX, "bad-contents-write.yml"), filename: "pipeline-bad-contents-write.yml" },
    ],
    scriptExists: () => true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.length >= 2);
});

test("lintWorkflows formats sticky-comment body when failures present", () => {
  const result = lintWorkflows({
    workflows: [{ path: join(FIX, "bad-no-permissions.yml"), filename: "pipeline-bad-no-permissions.yml" }],
    scriptExists: () => true,
  });
  assert.ok(result.commentBody.includes("## Workflow lint failures"));
  assert.ok(result.commentBody.includes("missing permissions"));
});
