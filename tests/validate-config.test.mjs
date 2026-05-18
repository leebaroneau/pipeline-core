import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig } from "../scripts/validate-config.mjs";

const validConfig = {
  schema_version: 1,
  deployment: { installation_id: "test-deploy", cron_timezone: "UTC" },
  domains: [{ name: "alpha" }],
  components: [{ name: "api" }],
  path_mappings: [{ paths: ["src/**"], labels: ["domain:alpha"] }],
};

test("validateConfig accepts a valid minimal config", () => {
  const result = validateConfig(validConfig);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateConfig rejects a config missing schema_version", () => {
  const bad = { ...validConfig };
  delete bad.schema_version;
  const result = validateConfig(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /schema_version/.test(e.message)));
});

test("validateConfig rejects schema_version != 1", () => {
  const result = validateConfig({ ...validConfig, schema_version: 2 });
  assert.equal(result.valid, false);
});

test("validateConfig rejects invalid domain name", () => {
  const result = validateConfig({
    ...validConfig,
    domains: [{ name: "Invalid Name With Spaces" }],
  });
  assert.equal(result.valid, false);
});

test("validateConfig rejects path_mappings with unknown label namespace", () => {
  const result = validateConfig({
    ...validConfig,
    path_mappings: [{ paths: ["src/**"], labels: ["type:bug"] }],
  });
  assert.equal(result.valid, false);
});

test("validateConfig rejects unknown top-level keys", () => {
  const result = validateConfig({ ...validConfig, extra: "nope" });
  assert.equal(result.valid, false);
});

test("validateConfig rejects path_mappings referencing undeclared domain", () => {
  const result = validateConfig({
    ...validConfig,
    path_mappings: [{ paths: ["src/**"], labels: ["domain:nonexistent"] }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /undeclared/.test(e.message)));
});

test("validateConfig rejects path_mappings referencing undeclared component", () => {
  const result = validateConfig({
    ...validConfig,
    path_mappings: [{ paths: ["src/**"], labels: ["component:nonexistent"] }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /undeclared/.test(e.message)));
});
