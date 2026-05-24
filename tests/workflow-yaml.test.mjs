import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWorkflowFile } from "../scripts/lib/workflow-yaml.mjs";

const FIX = join(import.meta.dirname, "fixtures");
const ROOT = join(import.meta.dirname, "..");

test("parseWorkflowFile reads a valid workflow", () => {
  const wf = parseWorkflowFile(join(FIX, "good-workflow.yml"));
  assert.equal(wf.name, "pipeline good example");
  assert.ok(wf.jobs);
});

test("parseWorkflowFile throws on missing file", () => {
  assert.throws(
    () => parseWorkflowFile(join(FIX, "does-not-exist.yml")),
    /ENOENT|no such file/i,
  );
});

test("issue-templated guard accepts Task issue titles", () => {
  const workflow = readFileSync(join(ROOT, ".github/workflows/issue-templated.yml"), "utf8");
  const prefixList = workflow.match(/const KNOWN_PREFIXES = \[(.+)\];/)?.[1] ?? "";
  assert.match(prefixList, /'Task:'/);
});

test("fleet workflow fails on unmanaged candidates after committing state", () => {
  const workflow = readFileSync(join(ROOT, ".github/workflows/fleet.yml"), "utf8");
  const commitStep = workflow.indexOf("Commit state + README updates");
  const candidateGate = workflow.indexOf("Enforce no unmanaged active repos");

  assert.match(workflow, /fail-on-candidates/);
  assert.ok(commitStep > 0, "expected fleet workflow to commit state");
  assert.ok(candidateGate > commitStep, "candidate gate should run after state has been committed");
  assert.match(workflow, /check-discovery-candidates\.mjs/);
});
