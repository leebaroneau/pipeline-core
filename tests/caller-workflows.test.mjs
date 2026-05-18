import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const CALLER_WORKFLOWS_DIR = "templates/caller-workflows";

function callerWorkflowFiles() {
  return readdirSync(CALLER_WORKFLOWS_DIR)
    .filter((name) => name.endsWith(".yml"))
    .sort()
    .map((name) => join(CALLER_WORKFLOWS_DIR, name));
}

test("caller workflows do not watch deleted consumer-local pipeline implementation paths", () => {
  const offenders = callerWorkflowFiles().filter((path) =>
    readFileSync(path, "utf8").includes("scripts/pipeline"),
  );

  assert.deepEqual(offenders, []);
});
