import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildTemplate } from "../scripts/generate-templates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

const skeleton = `name: Test
body:
  - type: dropdown
    id: domain
    attributes:
      label: Domain(s)
      multiple: true
      options: __DOMAIN_OPTIONS__
  - type: dropdown
    id: component
    attributes:
      label: Component(s)
      multiple: true
      options: __COMPONENT_OPTIONS__
`;

const sampleConfig = {
  domains: [{ name: "alpha" }, { name: "beta" }],
  components: [{ name: "api" }],
};

test("buildTemplate replaces __DOMAIN_OPTIONS__ placeholder", () => {
  const out = buildTemplate(skeleton, sampleConfig);
  assert.ok(!out.includes("__DOMAIN_OPTIONS__"));
  assert.ok(out.includes("- alpha"));
  assert.ok(out.includes("- beta"));
});

test("buildTemplate replaces __COMPONENT_OPTIONS__ placeholder", () => {
  const out = buildTemplate(skeleton, sampleConfig);
  assert.ok(!out.includes("__COMPONENT_OPTIONS__"));
  assert.ok(out.includes("- api"));
});

test("buildTemplate emits options as inline YAML array", () => {
  const out = buildTemplate(skeleton, sampleConfig);
  // Options should appear as a properly-indented list under `options:`.
  // The literal "options:" line is followed by indented list items.
  assert.match(out, /options:\s*\n\s+- alpha/);
});

test("buildTemplate emits a 'Do not edit' header comment", () => {
  const out = buildTemplate(skeleton, sampleConfig);
  assert.match(out, /^# This file is GENERATED/m);
});

test("buildTemplate is deterministic", () => {
  assert.equal(buildTemplate(skeleton, sampleConfig), buildTemplate(skeleton, sampleConfig));
});

test("generate-templates.mjs CLI accepts custom out-dir as argv[3]", () => {
  const dir = mkdtempSync(join(tmpdir(), "tpl-"));
  const result = spawnSync("node", [
    "scripts/pipeline/generate-templates.mjs",
    ".github/pipeline-config.yml",
    dir,
  ], { encoding: "utf8", cwd: REPO_ROOT });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(existsSync(join(dir, "improvement.yml")), "improvement.yml created in custom out-dir");
  assert.ok(existsSync(join(dir, "bug.yml")), "bug.yml created in custom out-dir");
});
