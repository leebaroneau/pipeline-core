import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  deriveInstallationId,
  renderStarterConfig,
  planInstall,
  applyInstall,
  generateArtifactsForInstall,
} from "../scripts/install.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CONFIG_EXAMPLE = join(REPO_ROOT, "templates", "pipeline-config.yml.example");
const EXAMPLE_TEXT = readFileSync(CONFIG_EXAMPLE, "utf8");

// ─── deriveInstallationId ───────────────────────────────────────────────────

test("deriveInstallationId: kebab-cases a typical repo dir name", () => {
  assert.equal(deriveInstallationId("/path/to/service-Haverford-Dev-API"), "service-haverford-dev-api");
});

test("deriveInstallationId: strips dots and weird chars", () => {
  assert.equal(deriveInstallationId("/path/to/Catnets.com.au"), "catnets-com-au");
});

test("deriveInstallationId: pads short names to satisfy 2-char minimum", () => {
  const id = deriveInstallationId("a");
  assert.ok(id.length >= 2, `expected >= 2 chars, got "${id}"`);
});

test("deriveInstallationId: truncates to 64 chars", () => {
  const huge = "/x/" + "a".repeat(200);
  assert.ok(deriveInstallationId(huge).length <= 64);
});

test("deriveInstallationId: truncation never leaves a trailing hyphen (schema requires alnum end)", () => {
  // 65 alnum chars then `--` would get truncated to 64 ending in `-`.
  const tricky = "/x/" + "a".repeat(63) + "--";
  const id = deriveInstallationId(tricky);
  assert.doesNotMatch(id, /-$/, `id should not end with hyphen: ${id}`);
});

test("deriveInstallationId: all-punctuation basename returns a valid fallback", () => {
  const id = deriveInstallationId("/x/....");
  assert.match(id, /^[a-z0-9][a-z0-9-]*[a-z0-9]$/, `id must match schema regex: ${id}`);
});

test("deriveInstallationId: single-char basename returns a valid ≥2-char id", () => {
  const id = deriveInstallationId("/x/a");
  assert.ok(id.length >= 2);
  assert.match(id, /^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
});

// ─── renderStarterConfig ────────────────────────────────────────────────────

test("renderStarterConfig: substitutes installation_id while preserving the trailing comment", () => {
  const out = renderStarterConfig({ exampleText: EXAMPLE_TEXT, installationId: "test-repo" });
  assert.match(out, /^\s*installation_id:\s*test-repo\s*#/m);
  // The comment text from the example should still be present after the substitution.
  assert.match(out, /installation_id:\s*test-repo\s*# Lowercase slug/);
});

test("renderStarterConfig: substitutes cron_timezone when provided", () => {
  const out = renderStarterConfig({
    exampleText: EXAMPLE_TEXT,
    installationId: "x",
    cronTimezone: "Australia/Brisbane",
  });
  assert.match(out, /cron_timezone:\s*Australia\/Brisbane/);
});

test("renderStarterConfig: leaves cron_timezone alone when not provided", () => {
  const out = renderStarterConfig({ exampleText: EXAMPLE_TEXT, installationId: "x" });
  // The example ships with America/New_York.
  assert.match(out, /cron_timezone:\s*America\/New_York/);
});

// ─── planInstall ────────────────────────────────────────────────────────────

test("planInstall: clean repo → ops list covers config, all callers, and ISSUE_TEMPLATE/config.yml", () => {
  const dir = mkdtempSync(join(tmpdir(), "install-clean-"));
  const plan = planInstall({ repoDir: dir });
  assert.ok(plan.ok, JSON.stringify(plan));

  const kinds = plan.ops.map((o) => o.kind);
  assert.ok(kinds.includes("config"), "expected a config op");
  assert.ok(kinds.includes("issue-config"), "expected an issue-config op");
  const callerCount = kinds.filter((k) => k === "caller").length;
  assert.ok(callerCount >= 10, `expected many caller workflows, got ${callerCount}`);
});

test("planInstall: existing pipeline-config.yml → conflict, no ops", () => {
  const dir = mkdtempSync(join(tmpdir(), "install-conflict-"));
  mkdirSync(join(dir, ".github"), { recursive: true });
  writeFileSync(join(dir, ".github", "pipeline-config.yml"), "schema_version: 1\n");
  const plan = planInstall({ repoDir: dir });
  assert.ok(plan.conflict, "expected conflict");
  assert.match(plan.conflict, /pipeline-config\.yml already exists/);
});

test("planInstall: existing caller workflow → conflict (no partial installs)", () => {
  const dir = mkdtempSync(join(tmpdir(), "install-caller-conflict-"));
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  writeFileSync(join(dir, ".github", "workflows", "pipeline-merge-gate.yml"), "name: existing\n");
  const plan = planInstall({ repoDir: dir });
  assert.ok(plan.conflict, "expected conflict");
  assert.match(plan.conflict, /pipeline-merge-gate\.yml/);
});

// ─── applyInstall (end-to-end on a temp dir) ────────────────────────────────

test("applyInstall: writes all files and renders installation_id into the config", () => {
  const dir = mkdtempSync(join(tmpdir(), "install-apply-"));
  const plan = planInstall({ repoDir: dir });
  assert.ok(plan.ok);

  const written = applyInstall({ ops: plan.ops, installationId: "demo-app" });
  assert.equal(written.length, plan.ops.length);

  const config = readFileSync(join(dir, ".github", "pipeline-config.yml"), "utf8");
  assert.match(config, /installation_id:\s*demo-app/);

  assert.ok(existsSync(join(dir, ".github", "workflows", "pipeline-merge-gate.yml")));
  assert.ok(existsSync(join(dir, ".github", "ISSUE_TEMPLATE", "config.yml")));
});

test("applyInstall: produces a config that the validator accepts (end-to-end smoke)", async () => {
  const { loadConfig } = await import("../scripts/lib/config.mjs");
  const { validateConfig } = await import("../scripts/validate-config.mjs");

  const dir = mkdtempSync(join(tmpdir(), "install-validates-"));
  const plan = planInstall({ repoDir: dir });
  applyInstall({ ops: plan.ops, installationId: "smoke-test" });

  const config = loadConfig(join(dir, ".github", "pipeline-config.yml"));
  const result = validateConfig(config);
  assert.ok(result.valid, `expected starter config to be valid out of the box; errors: ${JSON.stringify(result.errors)}`);
});

test("applyInstall: a freshly installed repo passes the doctor's config + callers checks", async () => {
  const { checkConfig, checkCallerWorkflows, discoverKnownWorkflows } = await import("../scripts/doctor.mjs");
  const callerTemplatesDir = join(REPO_ROOT, "templates", "caller-workflows");
  const known = discoverKnownWorkflows(callerTemplatesDir);

  const dir = mkdtempSync(join(tmpdir(), "install-doctor-roundtrip-"));
  const plan = planInstall({ repoDir: dir });
  applyInstall({ ops: plan.ops, installationId: "round-trip" });

  const cfg = checkConfig({ repoDir: dir });
  assert.ok(cfg.ok, JSON.stringify(cfg.failures, null, 2));

  const callers = checkCallerWorkflows({ repoDir: dir, knownWorkflows: known });
  assert.ok(callers.ok, JSON.stringify(callers.failures, null, 2));
});

// ─── generateArtifactsForInstall + full doctor round-trip ──────────────────

test("generateArtifactsForInstall: produces labels.yml, labeler.yml, all ISSUE_TEMPLATE/*.yml", () => {
  const dir = mkdtempSync(join(tmpdir(), "install-gen-"));
  const plan = planInstall({ repoDir: dir });
  applyInstall({ ops: plan.ops, installationId: "gen-test" });

  const generated = generateArtifactsForInstall({ repoDir: dir });
  assert.ok(generated.some((p) => p.endsWith(".github/labels.yml")));
  assert.ok(generated.some((p) => p.endsWith(".github/labeler.yml")));
  // All 4 issue templates (bug, improvement, spike, experiment) get generated.
  const issueCount = generated.filter((p) => p.includes(".github/ISSUE_TEMPLATE/") && p.endsWith(".yml")).length;
  assert.ok(issueCount >= 4, `expected >= 4 ISSUE_TEMPLATE files, got ${issueCount}`);
});

test("install + generate: full doctor (artifacts included) passes end-to-end", async () => {
  const { runDoctor, discoverKnownWorkflows, formatReport } = await import("../scripts/doctor.mjs");
  const callerTemplatesDir = join(REPO_ROOT, "templates", "caller-workflows");
  const known = discoverKnownWorkflows(callerTemplatesDir);

  const dir = mkdtempSync(join(tmpdir(), "install-full-doctor-"));
  const plan = planInstall({ repoDir: dir });
  applyInstall({ ops: plan.ops, installationId: "full-roundtrip" });
  generateArtifactsForInstall({ repoDir: dir });

  const result = await runDoctor({
    repoDir: dir,
    templateSkeletonsDir: join(REPO_ROOT, "scripts", "templates"),
    knownWorkflows: known,
  });
  assert.ok(result.ok, `expected doctor to pass on a freshly installed+generated repo. Got:\n${formatReport(result)}`);
  assert.equal(result.failures.length, 0);
});
