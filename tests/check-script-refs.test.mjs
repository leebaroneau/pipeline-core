import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { checkScriptRefs } from "../scripts/check-script-refs.mjs";

const FIX = join(import.meta.dirname, "fixtures");

test("checkScriptRefs ok when all referenced scripts exist", () => {
  const result = checkScriptRefs({
    workflows: [{ path: join(FIX, "good-workflow.yml"), filename: "pipeline-good-example.yml" }],
    scriptExists: () => true,
  });
  assert.equal(result.ok, true);
});

test("checkScriptRefs reports missing scripts", () => {
  const result = checkScriptRefs({
    workflows: [{ path: join(FIX, "bad-missing-script.yml"), filename: "pipeline-bad-missing.yml" }],
    scriptExists: (p) => !p.endsWith("does-not-exist.mjs"),
  });
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /does-not-exist\.mjs/);
});
