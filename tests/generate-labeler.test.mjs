import assert from "node:assert/strict";
import test from "node:test";
import yaml from "js-yaml";

import { buildLabelerYaml } from "../scripts/generate-labeler.mjs";

const sampleConfig = {
  schema_version: 1,
  deployment: { installation_id: "x", cron_timezone: "UTC" },
  domains: [{ name: "alpha" }, { name: "beta" }],
  components: [{ name: "api" }],
  path_mappings: [
    { paths: ["src/alpha/**"], labels: ["domain:alpha"] },
    { paths: ["src/beta/**", "lib/beta/**"], labels: ["domain:beta", "component:api"] },
    { paths: [".github/workflows/**"], labels: ["component:api"] },
  ],
};

test("buildLabelerYaml returns a YAML string", () => {
  const out = buildLabelerYaml(sampleConfig);
  assert.equal(typeof out, "string");
});

test("output uses actions/labeler@v5 format: label -> list of changed-files matchers", () => {
  const out = buildLabelerYaml(sampleConfig);
  const parsed = yaml.load(out);
  assert.ok(parsed["domain:alpha"], "domain:alpha entry missing");
  // v5 expects: label: [{changed-files: [{any-glob-to-any-file: [paths...]}]}]
  const entry = parsed["domain:alpha"];
  assert.ok(Array.isArray(entry));
  assert.ok(entry[0]["changed-files"]);
});

test("labels with multiple path mappings are merged", () => {
  const out = buildLabelerYaml({
    ...sampleConfig,
    path_mappings: [
      { paths: ["src/api/**"], labels: ["component:api"] },
      { paths: ["lib/api/**"], labels: ["component:api"] },
    ],
  });
  const parsed = yaml.load(out);
  const entry = parsed["component:api"];
  // Both globs should be present in the matchers
  const allGlobs = entry.flatMap((m) => m["changed-files"]?.flatMap((c) => c["any-glob-to-any-file"]) ?? []);
  assert.ok(allGlobs.includes("src/api/**"));
  assert.ok(allGlobs.includes("lib/api/**"));
});

test("output is deterministic", () => {
  assert.equal(buildLabelerYaml(sampleConfig), buildLabelerYaml(sampleConfig));
});
