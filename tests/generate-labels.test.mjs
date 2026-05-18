import assert from "node:assert/strict";
import test from "node:test";
import yaml from "js-yaml";

import { buildLabelsYaml } from "../scripts/generate-labels.mjs";
import { universalLabels } from "../scripts/lib/universal-labels.mjs";

const sampleConfig = {
  schema_version: 1,
  deployment: { installation_id: "x", cron_timezone: "UTC" },
  domains: [{ name: "alpha" }, { name: "beta" }],
  components: [{ name: "api" }, { name: "ui" }],
  path_mappings: [],
};

test("buildLabelsYaml returns a YAML string", () => {
  const out = buildLabelsYaml(sampleConfig);
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});

test("generated YAML includes every universal label", () => {
  const out = buildLabelsYaml(sampleConfig);
  const parsed = yaml.load(out);
  assert.ok(Array.isArray(parsed));
  const names = parsed.map((l) => l.name);
  for (const u of universalLabels) {
    assert.ok(names.includes(u.name), `missing universal label ${u.name}`);
  }
});

test("generated YAML includes one domain:* per config domain", () => {
  const out = buildLabelsYaml(sampleConfig);
  const parsed = yaml.load(out);
  const domainNames = parsed.filter((l) => l.name.startsWith("domain:")).map((l) => l.name);
  assert.deepEqual(domainNames.sort(), ["domain:alpha", "domain:beta"].sort());
});

test("generated YAML includes one component:* per config component", () => {
  const out = buildLabelsYaml(sampleConfig);
  const parsed = yaml.load(out);
  const compNames = parsed.filter((l) => l.name.startsWith("component:")).map((l) => l.name);
  assert.deepEqual(compNames.sort(), ["component:api", "component:ui"].sort());
});

test("each label has name, color, description fields", () => {
  const out = buildLabelsYaml(sampleConfig);
  const parsed = yaml.load(out);
  for (const label of parsed) {
    assert.ok(label.name, `label missing name: ${JSON.stringify(label)}`);
    assert.match(label.color, /^[0-9a-f]{6}$/i, `bad color for ${label.name}`);
    assert.ok(label.description, `${label.name} missing description`);
  }
});

test("output is deterministic — same config produces same YAML byte-for-byte", () => {
  const a = buildLabelsYaml(sampleConfig);
  const b = buildLabelsYaml(sampleConfig);
  assert.equal(a, b);
});
