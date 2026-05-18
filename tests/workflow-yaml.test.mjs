import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { parseWorkflowFile } from "../scripts/lib/workflow-yaml.mjs";

const FIX = join(import.meta.dirname, "fixtures");

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
