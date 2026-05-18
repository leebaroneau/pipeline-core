import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, ConfigLoadError } from "../scripts/lib/config.mjs";

test("loadConfig parses a minimal valid YAML config", () => {
  const dir = mkdtempSync(join(tmpdir(), "pipeline-test-"));
  const path = join(dir, "pipeline-config.yml");
  writeFileSync(
    path,
    [
      "schema_version: 1",
      "deployment:",
      "  installation_id: test-deploy",
      "  cron_timezone: UTC",
      "domains:",
      "  - name: alpha",
      "components:",
      "  - name: api",
      "path_mappings:",
      "  - paths: ['src/**']",
      "    labels: ['domain:alpha']",
      "",
    ].join("\n"),
  );

  const config = loadConfig(path);
  assert.equal(config.schema_version, 1);
  assert.equal(config.deployment.installation_id, "test-deploy");
  assert.equal(config.domains[0].name, "alpha");
  assert.equal(config.components[0].name, "api");
  assert.deepEqual(config.path_mappings[0].labels, ["domain:alpha"]);

  rmSync(dir, { recursive: true, force: true });
});

test("loadConfig throws ConfigLoadError on missing file", () => {
  assert.throws(() => loadConfig("/nonexistent/path/pipeline-config.yml"), ConfigLoadError);
});

test("loadConfig throws ConfigLoadError on invalid YAML", () => {
  const dir = mkdtempSync(join(tmpdir(), "pipeline-test-"));
  const path = join(dir, "pipeline-config.yml");
  writeFileSync(path, "schema_version: 1\n  invalid: indentation: here");

  assert.throws(() => loadConfig(path), ConfigLoadError);

  rmSync(dir, { recursive: true, force: true });
});

test("loadConfig throws ConfigLoadError when YAML is not an object", () => {
  const dir = mkdtempSync(join(tmpdir(), "pipeline-test-"));
  const path = join(dir, "pipeline-config.yml");
  writeFileSync(path, "just a string\n");

  assert.throws(() => loadConfig(path), ConfigLoadError);

  rmSync(dir, { recursive: true, force: true });
});
