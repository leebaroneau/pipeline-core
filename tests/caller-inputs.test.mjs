// Cross-reference test: for every caller template under
// `templates/pipeline-consumer-shim/`, every `with:` key it passes to a
// `uses:` target must be a declared `inputs:` on the target reusable
// workflow. GitHub Actions fails any caller that passes an unknown
// input with `startup_failure`, so this is a hard correctness check.
//
// Caught the pipeline-pr-labels.yml regression where the caller
// passed `config-path:` but the supplier only declares
// `labeler-config:` — every consumer install would have silently
// startup_failure'd pr-labels on every PR.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseWorkflowFile } from "../scripts/lib/workflow-yaml.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CALLERS_DIR = join(REPO_ROOT, "templates", "pipeline-consumer-shim");
const SUPPLIER_DIR = join(REPO_ROOT, ".github", "workflows");

function declaredInputs(supplierPath) {
  const wf = parseWorkflowFile(supplierPath);
  // `on:` may parse as the string "on" key OR sometimes as `true` (YAML 1.1
  // bool quirk). Tolerate both.
  const on = wf.on ?? wf[true];
  const inputs = on?.workflow_call?.inputs;
  if (!inputs) return null; // not a reusable workflow
  return new Set(Object.keys(inputs));
}

function callerUsesEntries(callerPath) {
  const wf = parseWorkflowFile(callerPath);
  const out = [];
  for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
    if (typeof job.uses !== "string") continue;
    out.push({ jobName, uses: job.uses, withKeys: Object.keys(job.with ?? {}) });
  }
  return out;
}

function localSupplierPathForUses(usesRef) {
  // e.g. "leebaroneau/pipeline-core/.github/workflows/pr-labels.yml@v1"
  const i = usesRef.indexOf("/.github/workflows/");
  if (i === -1) return null;
  const atIdx = usesRef.lastIndexOf("@");
  const filename = usesRef.slice(i + "/.github/workflows/".length, atIdx === -1 ? undefined : atIdx);
  return join(SUPPLIER_DIR, filename);
}

const callerFiles = readdirSync(CALLERS_DIR)
  .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
  .sort();

for (const file of callerFiles) {
  test(`caller ${file}: every with-key matches a declared input on its supplier`, () => {
    const callerPath = join(CALLERS_DIR, file);
    const entries = callerUsesEntries(callerPath);
    assert.ok(entries.length > 0, `${file}: no \`uses:\` jobs found`);

    for (const { jobName, uses, withKeys } of entries) {
      const supplierPath = localSupplierPathForUses(uses);
      if (!supplierPath) continue; // not pointing at this repo's reusable set
      const inputs = declaredInputs(supplierPath);
      assert.ok(inputs, `${file} job ${jobName}: supplier ${uses} is not a reusable workflow`);
      for (const k of withKeys) {
        assert.ok(
          inputs.has(k),
          `${file} job ${jobName}: passes \`with.${k}\` but ${uses} does not declare it (declared: ${[...inputs].join(", ") || "none"})`,
        );
      }
    }
  });
}
