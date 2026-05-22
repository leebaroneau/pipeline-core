import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkConfig,
  checkArtifactDrift,
  checkCallerWorkflows,
  checkBranchProtection,
  discoverKnownWorkflows,
  runDoctor,
  formatReport,
} from "../scripts/doctor.mjs";
import { buildLabelsYaml } from "../scripts/generate-labels.mjs";
import { buildLabelerYaml } from "../scripts/generate-labeler.mjs";
import { buildTemplate } from "../scripts/generate-templates.mjs";
import { loadConfig } from "../scripts/lib/config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EXAMPLE_CONFIG = join(REPO_ROOT, "templates", "pipeline-config.yml.example");
const SKELETON_DIR = join(REPO_ROOT, "scripts", "templates");
const CALLER_TEMPLATES_DIR = join(REPO_ROOT, "templates", "pipeline-consumer-shim");
const KNOWN_WORKFLOWS = discoverKnownWorkflows(CALLER_TEMPLATES_DIR);

// Build a complete, valid consumer repo on disk. Returns the path.
function scaffoldCleanConsumer({ upstream = "leebaroneau/pipeline-core", major = "v1" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "doctor-clean-"));
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  mkdirSync(join(dir, ".github", "ISSUE_TEMPLATE"), { recursive: true });

  // 1. Config: copy the example verbatim.
  copyFileSync(EXAMPLE_CONFIG, join(dir, ".github", "pipeline-config.yml"));
  const config = loadConfig(join(dir, ".github", "pipeline-config.yml"));

  // 2. Generate the artifacts the doctor will diff against.
  writeFileSync(join(dir, ".github", "labels.yml"), buildLabelsYaml(config));
  writeFileSync(join(dir, ".github", "labeler.yml"), buildLabelerYaml(config));
  for (const skel of readdirSync(SKELETON_DIR).filter((f) => f.endsWith(".yml.template"))) {
    const outName = skel.replace(/\.template$/, "");
    const skeleton = readFileSync(join(SKELETON_DIR, skel), "utf8");
    writeFileSync(join(dir, ".github", "ISSUE_TEMPLATE", outName), buildTemplate(skeleton, config));
  }

  // 3. One caller workflow pointing at the expected upstream + major.
  writeFileSync(
    join(dir, ".github", "workflows", "pipeline-merge-gate.yml"),
    [
      "name: Pipeline — merge-gate",
      "on: pull_request",
      "jobs:",
      "  merge-gate:",
      `    uses: ${upstream}/.github/workflows/merge-gate.yml@${major}`,
      "    with:",
      "      config-path: .github/pipeline-config.yml",
      "",
    ].join("\n"),
  );

  return { dir, config };
}

// ─── checkConfig ────────────────────────────────────────────────────────────

test("checkConfig: clean install passes", () => {
  const { dir } = scaffoldCleanConsumer();
  const result = checkConfig({ repoDir: dir });
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
  assert.equal(result.config.schema_version, 1);
});

test("checkConfig: missing config fails with a copy-the-example remediation", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-noconfig-"));
  const result = checkConfig({ repoDir: dir });
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].check, "config");
  assert.match(result.failures[0].message, /Missing .github\/pipeline-config\.yml/);
  assert.match(result.failures[0].remediation, /pipeline-config\.yml\.example/);
});

test("checkConfig: invalid config (schema violation) reports per-error failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-badconfig-"));
  mkdirSync(join(dir, ".github"), { recursive: true });
  // Schema requires domains/components/path_mappings, etc. Strip them all.
  writeFileSync(
    join(dir, ".github", "pipeline-config.yml"),
    "schema_version: 1\ndeployment:\n  installation_id: x\n  cron_timezone: UTC\n",
  );
  const result = checkConfig({ repoDir: dir });
  assert.equal(result.ok, false);
  assert.ok(result.failures.length >= 1, "expected at least one schema failure");
  assert.ok(result.failures.every((f) => f.check === "config"));
});

// ─── checkArtifactDrift ─────────────────────────────────────────────────────

test("checkArtifactDrift: clean install passes", () => {
  const { dir, config } = scaffoldCleanConsumer();
  const result = checkArtifactDrift({ repoDir: dir, config, templateSkeletonsDir: SKELETON_DIR });
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
});

test("checkArtifactDrift: drift in labels.yml is reported with a diff and remediation", () => {
  const { dir, config } = scaffoldCleanConsumer();
  // Corrupt the labels.yml committed in the consumer repo.
  writeFileSync(join(dir, ".github", "labels.yml"), "labels: [DRIFTED]\n");
  const result = checkArtifactDrift({ repoDir: dir, config, templateSkeletonsDir: SKELETON_DIR });
  assert.equal(result.ok, false);
  const labelsFailure = result.failures.find((f) => f.message.includes("labels.yml"));
  assert.ok(labelsFailure, "expected a labels.yml failure");
  assert.match(labelsFailure.remediation, /pipeline-generate/);
  assert.ok(labelsFailure.diff && labelsFailure.diff.length > 0, "expected a diff snippet");
});

// ─── checkCallerWorkflows ───────────────────────────────────────────────────

test("checkCallerWorkflows: clean install (expected upstream + @v1) passes", () => {
  const { dir } = scaffoldCleanConsumer();
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: KNOWN_WORKFLOWS });
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
});

test("checkCallerWorkflows: clean install also accepts pinned @v1.x.y refs", () => {
  const { dir } = scaffoldCleanConsumer({ major: "v1.0.5" });
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: KNOWN_WORKFLOWS }); // expects @v1; @v1.0.5 should be accepted
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
});

test("checkCallerWorkflows: rejects nonsense refs in the major line like @v1.foo", () => {
  const { dir } = scaffoldCleanConsumer({ major: "v1.foo" });
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: KNOWN_WORKFLOWS });
  assert.equal(result.ok, false);
  assert.match(result.failures[0].message, /ref `v1\.foo`/);
});

test("checkCallerWorkflows: handles quoted uses: values", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-quoted-"));
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  writeFileSync(
    join(dir, ".github", "workflows", "pipeline-merge-gate.yml"),
    'jobs:\n  merge-gate:\n    uses: "leebaroneau/pipeline-core/.github/workflows/merge-gate.yml@v1"\n',
  );
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: KNOWN_WORKFLOWS });
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
});

test("checkCallerWorkflows: catches typo in the reusable workflow filename", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-typo-"));
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  writeFileSync(
    join(dir, ".github", "workflows", "pipeline-merge-gate.yml"),
    "jobs:\n  merge-gate:\n    uses: leebaroneau/pipeline-core/.github/workflows/merge-gat.yml@v1\n",
  );
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: KNOWN_WORKFLOWS });
  assert.equal(result.ok, false);
  assert.match(result.failures[0].message, /not a known reusable workflow/);
});

test("checkCallerWorkflows: emits a warning when knownWorkflows is null (skipped typo check)", () => {
  const { dir } = scaffoldCleanConsumer();
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: null });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].message, /filename validation skipped/);
});

test("checkCallerWorkflows: wrong upstream is reported with remediation", () => {
  const { dir } = scaffoldCleanConsumer({ upstream: "someone-else/pipeline-core" });
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: KNOWN_WORKFLOWS }); // expects leebaroneau/pipeline-core
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].check, "callers");
  assert.match(result.failures[0].message, /someone-else\/pipeline-core/);
  assert.match(result.failures[0].remediation, /leebaroneau\/pipeline-core/);
});

test("checkCallerWorkflows: wrong major (@v2 when v1 expected) is reported", () => {
  const { dir } = scaffoldCleanConsumer({ major: "v2" });
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: KNOWN_WORKFLOWS });
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].check, "callers");
  assert.match(result.failures[0].message, /ref `v2`/);
});

test("checkCallerWorkflows: missing @ref is reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-noref-"));
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  writeFileSync(
    join(dir, ".github", "workflows", "pipeline-merge-gate.yml"),
    "jobs:\n  merge-gate:\n    uses: leebaroneau/pipeline-core/.github/workflows/merge-gate.yml\n",
  );
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: KNOWN_WORKFLOWS });
  assert.equal(result.ok, false);
  assert.match(result.failures[0].message, /without an `@<ref>` pin/);
});

test("checkCallerWorkflows: no pipeline-*.yml files at all → failure with copy remediation", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-empty-"));
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  const result = checkCallerWorkflows({ repoDir: dir, knownWorkflows: KNOWN_WORKFLOWS });
  assert.equal(result.ok, false);
  assert.match(result.failures[0].remediation, /templates\/pipeline-consumer-shim/);
});

// ─── checkBranchProtection ──────────────────────────────────────────────────

function octokitReturning(data) {
  return { rest: { repos: { getBranchProtection: async () => ({ data }) } } };
}

function octokitThrowing({ status, message }) {
  return {
    rest: {
      repos: {
        getBranchProtection: async () => {
          const err = new Error(message);
          err.status = status;
          throw err;
        },
      },
    },
  };
}

test("checkBranchProtection: required check present → ok", async () => {
  const octokit = octokitReturning({
    required_status_checks: { contexts: ["pipeline/merge-gate", "ci/build"] },
  });
  const result = await checkBranchProtection({ octokit, owner: "o", repo: "r" });
  assert.equal(result.ok, true);
});

test("checkBranchProtection: required check missing → fail with settings remediation", async () => {
  const octokit = octokitReturning({
    required_status_checks: { contexts: ["ci/build"] },
  });
  const result = await checkBranchProtection({ octokit, owner: "o", repo: "r" });
  assert.equal(result.ok, false);
  assert.match(result.failures[0].message, /does not require `pipeline\/merge-gate`/);
  assert.match(result.failures[0].remediation, /Settings → Branches/);
});

test("checkBranchProtection: 404 (no rule at all) → fail with add-rule remediation", async () => {
  const octokit = octokitThrowing({ status: 404, message: "Not Found" });
  const result = await checkBranchProtection({ octokit, owner: "o", repo: "r" });
  assert.equal(result.ok, false);
  assert.match(result.failures[0].message, /No branch protection rule/);
});

test("checkBranchProtection: 403 (plan-gated) → warning, not failure, with plan-upgrade remediation", async () => {
  const octokit = octokitThrowing({
    status: 403,
    message: "Upgrade or make this repository public to use this feature.",
  });
  const result = await checkBranchProtection({ octokit, owner: "o", repo: "r" });
  // Plan-gated is not a hard failure — it's a known external constraint.
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].check, "branchProtection");
  assert.match(result.warnings[0].message, /403 \(plan-gated\)/);
  assert.match(result.warnings[0].remediation, /GitHub Pro\/Team\/Enterprise/);
});

test("checkBranchProtection: 403 with non-plan-gated body → failure (token scope issue, not external)", async () => {
  const octokit = octokitThrowing({
    status: 403,
    message: "Resource not accessible by integration",
  });
  const result = await checkBranchProtection({ octokit, owner: "o", repo: "r" });
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /returned 403/);
  assert.match(result.failures[0].remediation, /administration:read/);
});

test("checkBranchProtection: no octokit → skipped (not a failure)", async () => {
  const result = await checkBranchProtection({ octokit: null, owner: "o", repo: "r" });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});

// ─── runDoctor orchestrator ─────────────────────────────────────────────────

test("runDoctor: clean install with no octokit → fully ok, branch protection skipped", async () => {
  const { dir } = scaffoldCleanConsumer();
  const result = await runDoctor({
    repoDir: dir,
    templateSkeletonsDir: SKELETON_DIR,
    knownWorkflows: KNOWN_WORKFLOWS,
  });
  assert.equal(result.ok, true, formatReport(result));
  assert.equal(result.failures.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.checks.branchProtection.skipped, true);
});

test("runDoctor: drift + bad caller + plan-gated 403 → ok=false (drift+caller), with one warning", async () => {
  const { dir, config } = scaffoldCleanConsumer({ upstream: "wrong/repo" });
  // Introduce drift too.
  writeFileSync(join(dir, ".github", "labels.yml"), "drifted\n");
  void config;

  const octokit = octokitThrowing({
    status: 403,
    message: "Upgrade or make this repository public to use this feature.",
  });

  const result = await runDoctor({
    repoDir: dir,
    templateSkeletonsDir: SKELETON_DIR,
    knownWorkflows: KNOWN_WORKFLOWS,
    octokit,
    owner: "o",
    repo: "r",
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.check === "callers"), "expected callers failure");
  assert.ok(result.failures.some((f) => f.check === "artifacts"), "expected artifacts failure");
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].check, "branchProtection");
});

test("runDoctor: clean install without knownWorkflows → ok=true with a single skipped-typo-check warning", async () => {
  const { dir } = scaffoldCleanConsumer();
  const result = await runDoctor({ repoDir: dir, templateSkeletonsDir: SKELETON_DIR });
  assert.equal(result.ok, true, formatReport(result));
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].check, "callers");
});

test("formatReport: includes [OK]/[FAIL]/[WARN]/[SKIP] markers and a summary line", async () => {
  const { dir } = scaffoldCleanConsumer();
  const result = await runDoctor({
    repoDir: dir,
    templateSkeletonsDir: SKELETON_DIR,
    knownWorkflows: KNOWN_WORKFLOWS,
  });
  const text = formatReport(result);
  assert.match(text, /\[OK\]\s+Config/);
  assert.match(text, /\[OK\]\s+Caller workflows/);
  assert.match(text, /\[SKIP\]\s+Branch protection/);
  assert.match(text, /Summary: 0 failure\(s\), 0 warning\(s\)/);
});

// ─── discoverKnownWorkflows ─────────────────────────────────────────────────

test("discoverKnownWorkflows: pipeline-core's own caller templates yield merge-gate.yml etc.", () => {
  const set = discoverKnownWorkflows(CALLER_TEMPLATES_DIR);
  assert.ok(set, "expected a non-null Set");
  assert.ok(set.has("merge-gate.yml"), "expected merge-gate.yml in known set");
  assert.ok(set.has("validate-config.yml"), "expected validate-config.yml in known set");
});

test("discoverKnownWorkflows: missing dir returns null", () => {
  const set = discoverKnownWorkflows("/nonexistent/path/for/doctor/test");
  assert.equal(set, null);
});

// ─── Additional artifact-drift coverage (labeler.yml, ISSUE_TEMPLATE) ──────

test("checkArtifactDrift: drift in labeler.yml is reported with a diff", () => {
  const { dir, config } = scaffoldCleanConsumer();
  writeFileSync(join(dir, ".github", "labeler.yml"), "labeler: drifted\n");
  const result = checkArtifactDrift({ repoDir: dir, config, templateSkeletonsDir: SKELETON_DIR });
  assert.equal(result.ok, false);
  const fail = result.failures.find((f) => f.message.includes("labeler.yml"));
  assert.ok(fail, "expected a labeler.yml failure");
  assert.ok(fail.diff && fail.diff.length > 0);
});

test("checkArtifactDrift: missing ISSUE_TEMPLATE file is reported", () => {
  const { dir, config } = scaffoldCleanConsumer();
  // Remove one of the generated issue templates.
  const target = join(dir, ".github", "ISSUE_TEMPLATE", "bug.yml");
  writeFileSync(target, ""); // truncate to introduce drift
  const driftResult = checkArtifactDrift({ repoDir: dir, config, templateSkeletonsDir: SKELETON_DIR });
  assert.equal(driftResult.ok, false);
  assert.ok(driftResult.failures.some((f) => f.message.includes("bug.yml")));
});

test("checkArtifactDrift: missing skeletons dir → warning, not silent skip", () => {
  const { dir, config } = scaffoldCleanConsumer();
  const result = checkArtifactDrift({ repoDir: dir, config, templateSkeletonsDir: undefined });
  // labels.yml + labeler.yml still validate (no failures), but the templates
  // step emits a warning so the operator knows it didn't run.
  assert.equal(result.ok, true);
  assert.ok(result.warnings.length >= 1);
  assert.match(result.warnings[0].message, /ISSUE_TEMPLATE drift check skipped/);
});
