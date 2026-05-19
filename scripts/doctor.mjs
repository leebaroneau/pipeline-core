#!/usr/bin/env node

// scripts/doctor.mjs
//
// Install doctor for Pipeline Core consumer repos. Non-mutating. Checks:
//   1. .github/pipeline-config.yml exists and validates
//   2. Generated artifacts (labels.yml, labeler.yml, ISSUE_TEMPLATE/*) match the
//      generators' current output for the consumer's config
//   3. Caller workflows reference the expected upstream and major tag
//   4. (optional, when an octokit is wired) branch protection requires
//      `pipeline/merge-gate` — with a specific remediation message for
//      GitHub plan-gated 403 responses on private repos
//
// Designed so each check is a pure function the tests can drive directly.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { loadConfig, ConfigLoadError } from "./lib/config.mjs";
import { validateConfig } from "./validate-config.mjs";
import { buildLabelsYaml } from "./generate-labels.mjs";
import { buildLabelerYaml } from "./generate-labeler.mjs";
import { buildTemplate } from "./generate-templates.mjs";

const DEFAULT_UPSTREAM = "leebaroneau/pipeline-core";
const DEFAULT_MAJOR = "v1";
const DEFAULT_BRANCH = "main";
const DEFAULT_REQUIRED_CHECK = "pipeline/merge-gate";

// ─── Check 1: config exists & validates ─────────────────────────────────────

export function checkConfig({ repoDir, configPath = ".github/pipeline-config.yml" }) {
  const fullPath = join(repoDir, configPath);
  if (!existsSync(fullPath)) {
    return {
      ok: false,
      failures: [
        {
          check: "config",
          message: `Missing ${configPath}`,
          remediation: `Copy templates/pipeline-config.yml.example from pipeline-core into ${configPath} and edit it.`,
        },
      ],
    };
  }
  let config;
  try {
    config = loadConfig(fullPath);
  } catch (err) {
    if (err instanceof ConfigLoadError) {
      return {
        ok: false,
        failures: [{ check: "config", message: err.message, remediation: "Fix the YAML syntax in pipeline-config.yml." }],
      };
    }
    throw err;
  }
  const result = validateConfig(config);
  if (!result.valid) {
    return {
      ok: false,
      failures: result.errors.map((e) => ({
        check: "config",
        message: `pipeline-config.yml ${e.path}: ${e.message}`,
        remediation: "Edit pipeline-config.yml to satisfy the schema.",
      })),
    };
  }
  return { ok: true, config };
}

// ─── Check 2: generated artifacts match what the generators emit now ────────

export function checkArtifactDrift({ repoDir, config, templateSkeletonsDir }) {
  const failures = [];
  const warnings = [];

  // labels.yml
  const labelsCommitted = join(repoDir, ".github", "labels.yml");
  if (!existsSync(labelsCommitted)) {
    failures.push({
      check: "artifacts",
      message: ".github/labels.yml is missing",
      remediation: "Run `make pipeline-generate` (or the equivalent generator command) to produce it.",
    });
  } else {
    const expected = buildLabelsYaml(config);
    const committed = readFileSync(labelsCommitted, "utf8");
    if (committed !== expected) {
      failures.push({
        check: "artifacts",
        message: ".github/labels.yml is out of sync with pipeline-config.yml",
        remediation: "Run `make pipeline-generate` to regenerate.",
        diff: simpleDiff(committed, expected),
      });
    }
  }

  // labeler.yml
  const labelerCommitted = join(repoDir, ".github", "labeler.yml");
  if (!existsSync(labelerCommitted)) {
    failures.push({
      check: "artifacts",
      message: ".github/labeler.yml is missing",
      remediation: "Run `make pipeline-generate` to produce it.",
    });
  } else {
    const expected = buildLabelerYaml(config);
    const committed = readFileSync(labelerCommitted, "utf8");
    if (committed !== expected) {
      failures.push({
        check: "artifacts",
        message: ".github/labeler.yml is out of sync with pipeline-config.yml",
        remediation: "Run `make pipeline-generate` to regenerate.",
        diff: simpleDiff(committed, expected),
      });
    }
  }

  // ISSUE_TEMPLATE/*.yml — requires the skeletons that ship inside pipeline-core.
  // Surface explicitly when they aren't available so this isn't silently a no-op.
  if (!templateSkeletonsDir || !existsSync(templateSkeletonsDir)) {
    warnings.push({
      check: "artifacts",
      message: "ISSUE_TEMPLATE drift check skipped: pipeline-core template skeletons not found",
      remediation: "Run the doctor from a checkout of pipeline-core (which provides scripts/templates/) so ISSUE_TEMPLATE files can be verified.",
    });
  } else {
    const skeletons = readdirSync(templateSkeletonsDir).filter((f) => f.endsWith(".yml.template"));
    for (const skel of skeletons) {
      const outName = skel.replace(/\.template$/, "");
      const committed = join(repoDir, ".github", "ISSUE_TEMPLATE", outName);
      if (!existsSync(committed)) {
        failures.push({
          check: "artifacts",
          message: `.github/ISSUE_TEMPLATE/${outName} is missing`,
          remediation: "Run `make pipeline-generate` to produce it.",
        });
        continue;
      }
      const skeleton = readFileSync(join(templateSkeletonsDir, skel), "utf8");
      const expected = buildTemplate(skeleton, config);
      const got = readFileSync(committed, "utf8");
      if (got !== expected) {
        failures.push({
          check: "artifacts",
          message: `.github/ISSUE_TEMPLATE/${outName} is out of sync with pipeline-config.yml`,
          remediation: "Run `make pipeline-generate` to regenerate.",
          diff: simpleDiff(got, expected),
        });
      }
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}

function simpleDiff(a, b) {
  // Compact diff: just the first few mismatched lines, not a full unified diff.
  const al = a.split("\n");
  const bl = b.split("\n");
  const out = [];
  const max = Math.max(al.length, bl.length);
  let shown = 0;
  for (let i = 0; i < max && shown < 6; i++) {
    if (al[i] !== bl[i]) {
      if (al[i] !== undefined) out.push(`- ${al[i]}`);
      if (bl[i] !== undefined) out.push(`+ ${bl[i]}`);
      shown++;
    }
  }
  return out.join("\n");
}

// ─── Check 3: caller workflows point at the expected upstream and major ─────

// Matches: `uses: foo`, `uses: 'foo'`, `uses: "foo"`; strips surrounding quotes.
const USES_RE = /^\s*uses:\s*["']?([^\s#"']+)["']?/gm;

// Acceptable refs: the floating major (e.g. `v1`) or any release in that line
// (e.g. `v1.0.5`). Reject `v1.foo`, `v1-rc1`, `v1.x`, etc.
function isAcceptableRef(ref, major) {
  if (ref === major) return true;
  // major.minor.patch with optional pre-release like -rc.1
  const escaped = major.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\.\\d+\\.\\d+(?:[-+][\\w.]+)?$`).test(ref);
}

export function checkCallerWorkflows({
  repoDir,
  upstream = DEFAULT_UPSTREAM,
  major = DEFAULT_MAJOR,
  workflowsDir = ".github/workflows",
  knownWorkflows = null, // optional Set of valid reusable-workflow filenames (e.g. "merge-gate.yml"). When null, the existence check is skipped with a warning.
}) {
  const dir = join(repoDir, workflowsDir);
  if (!existsSync(dir)) {
    return {
      ok: false,
      failures: [
        {
          check: "callers",
          message: `${workflowsDir} does not exist`,
          remediation: `Copy caller workflows from templates/caller-workflows/ in pipeline-core into ${workflowsDir}/.`,
        },
      ],
    };
  }

  const callerFiles = readdirSync(dir)
    .filter((f) => f.startsWith("pipeline-") && (f.endsWith(".yml") || f.endsWith(".yaml")));

  if (callerFiles.length === 0) {
    return {
      ok: false,
      failures: [
        {
          check: "callers",
          message: `No pipeline-*.yml caller workflows found in ${workflowsDir}/`,
          remediation: `Copy caller workflows from templates/caller-workflows/ in pipeline-core into ${workflowsDir}/.`,
        },
      ],
    };
  }

  const failures = [];
  const warnings = [];
  const expectedPrefix = `${upstream}/.github/workflows/`;

  if (!knownWorkflows) {
    warnings.push({
      check: "callers",
      message: "Reusable-workflow filename validation skipped: caller did not provide the known-workflows set",
      remediation: "Run the doctor from a checkout of pipeline-core so it can compare consumer caller targets to templates/caller-workflows/.",
    });
  }

  for (const file of callerFiles) {
    const content = readFileSync(join(dir, file), "utf8");
    const usesMatches = [...content.matchAll(USES_RE)].map((m) => m[1]);
    const pipelineUses = usesMatches.filter((u) => u.includes("/.github/workflows/"));

    if (pipelineUses.length === 0) {
      failures.push({
        check: "callers",
        message: `${workflowsDir}/${file} has no \`uses:\` referencing a reusable workflow`,
        remediation: `Replace the job body with \`uses: ${upstream}/.github/workflows/<workflow>.yml@${major}\`.`,
      });
      continue;
    }

    for (const u of pipelineUses) {
      if (!u.startsWith(expectedPrefix)) {
        failures.push({
          check: "callers",
          message: `${workflowsDir}/${file} references \`${u}\`, expected upstream \`${upstream}\``,
          remediation: `Update the \`uses:\` line to start with \`${expectedPrefix}\`.`,
        });
        continue;
      }
      const atIdx = u.lastIndexOf("@");
      if (atIdx === -1) {
        failures.push({
          check: "callers",
          message: `${workflowsDir}/${file} references \`${u}\` without an \`@<ref>\` pin`,
          remediation: `Pin the caller to \`@${major}\` (or a full \`@${major}.x.y\` release).`,
        });
        continue;
      }
      const ref = u.slice(atIdx + 1);
      if (!isAcceptableRef(ref, major)) {
        failures.push({
          check: "callers",
          message: `${workflowsDir}/${file} references \`${u}\` (ref \`${ref}\`), expected \`@${major}\` or \`@${major}.x.y\``,
          remediation: `Update the ref to \`@${major}\` so the caller floats on the current major.`,
        });
        continue;
      }
      // Cross-check: does the target reusable workflow filename actually exist
      // upstream? This catches typos like `merge-gat.yml` that would otherwise
      // silently fail at run time.
      if (knownWorkflows) {
        const targetName = u.slice(expectedPrefix.length, atIdx);
        if (!knownWorkflows.has(targetName)) {
          failures.push({
            check: "callers",
            message: `${workflowsDir}/${file} references \`${targetName}\` which is not a known reusable workflow in ${upstream}`,
            remediation: `Fix the typo, or copy a caller from \`templates/caller-workflows/\` that targets a real workflow.`,
          });
        }
      }
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}

// ─── Check 4: branch protection (optional, requires octokit) ────────────────

// Caller passes a tiny interface so we don't have to bring in @octokit/rest as
// a runtime dep. In a workflow we use actions/github-script's `github` client;
// from a workstation CLI you can construct any thing with the same shape.
//
//   octokit.rest.repos.getBranchProtection({ owner, repo, branch }) → { required_status_checks: { contexts: [...] } } or throws
//
// On 403 the implementation should throw an Error whose `.status === 403` and
// whose `.message` we surface as remediation context.

export async function checkBranchProtection({ octokit, owner, repo, branch = DEFAULT_BRANCH, requiredCheck = DEFAULT_REQUIRED_CHECK }) {
  if (!octokit) {
    return { ok: true, skipped: true, reason: "no octokit provided" };
  }
  try {
    const { data } = await octokit.rest.repos.getBranchProtection({ owner, repo, branch });
    const contexts = data?.required_status_checks?.contexts ?? data?.required_status_checks?.checks?.map((c) => c.context) ?? [];
    if (!contexts.includes(requiredCheck)) {
      return {
        ok: false,
        failures: [
          {
            check: "branchProtection",
            message: `Branch \`${branch}\` does not require \`${requiredCheck}\` (found: ${contexts.length ? contexts.join(", ") : "no required checks"})`,
            remediation: `In Settings → Branches, edit the rule for \`${branch}\` and add \`${requiredCheck}\` to "Require status checks to pass before merging".`,
          },
        ],
      };
    }
    return { ok: true };
  } catch (err) {
    if (err?.status === 404) {
      return {
        ok: false,
        failures: [
          {
            check: "branchProtection",
            message: `No branch protection rule on \`${branch}\``,
            remediation: `In Settings → Branches, add a protection rule for \`${branch}\` that requires \`${requiredCheck}\`.`,
          },
        ],
      };
    }
    if (err?.status === 403) {
      // 403 can be either:
      //   (a) plan-gated — private repo without the GitHub plan that exposes
      //       branch protection. GitHub returns a message containing
      //       "Upgrade" or "make this repository public". This is an external
      //       constraint, not a consumer-repo config gap — warn, don't fail.
      //   (b) a missing-permission scope on the token (e.g. token doesn't
      //       have `administration:read`). That's a fixable config issue —
      //       fail loudly so the operator addresses it.
      const msg = err?.message ?? "";
      const isPlanGated = /upgrade|public|advanced security|paid plan/i.test(msg);
      if (isPlanGated) {
        return {
          ok: true,
          warnings: [
            {
              check: "branchProtection",
              message: `Cannot read branch protection for \`${owner}/${repo}@${branch}\`: GitHub returned 403 (plan-gated)`,
              remediation: "Branch protection on private repos requires GitHub Pro/Team/Enterprise (or a public repo). Until then, `pipeline/merge-gate` remains advisory — keep merging through the PR UI manually after CI passes.",
              detail: msg,
            },
          ],
        };
      }
      return {
        ok: false,
        failures: [
          {
            check: "branchProtection",
            message: `Cannot read branch protection for \`${owner}/${repo}@${branch}\`: GitHub returned 403`,
            remediation: "Ensure the token has the `administration:read` (or equivalent) scope and that the user has admin access to the repo.",
            detail: msg,
          },
        ],
      };
    }
    throw err;
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

export async function runDoctor(opts) {
  const {
    repoDir = ".",
    configPath = ".github/pipeline-config.yml",
    upstream = DEFAULT_UPSTREAM,
    major = DEFAULT_MAJOR,
    workflowsDir = ".github/workflows",
    templateSkeletonsDir,
    knownWorkflows,
    octokit,
    owner,
    repo,
    branch = DEFAULT_BRANCH,
    requiredCheck = DEFAULT_REQUIRED_CHECK,
  } = opts ?? {};

  const failures = [];
  const warnings = [];
  const checks = {};

  const configResult = checkConfig({ repoDir, configPath });
  checks.config = configResult;
  if (!configResult.ok) {
    failures.push(...configResult.failures);
    // Without a valid config we can't run drift, but we can still check callers
    // and branch protection — fall through with config-dependent steps skipped.
  }

  if (configResult.ok) {
    const driftResult = checkArtifactDrift({ repoDir, config: configResult.config, templateSkeletonsDir });
    checks.artifacts = driftResult;
    if (driftResult.failures) failures.push(...driftResult.failures);
    if (driftResult.warnings) warnings.push(...driftResult.warnings);
  } else {
    checks.artifacts = { ok: false, skipped: true, reason: "config invalid" };
  }

  const callersResult = checkCallerWorkflows({ repoDir, upstream, major, workflowsDir, knownWorkflows });
  checks.callers = callersResult;
  if (callersResult.failures) failures.push(...callersResult.failures);
  if (callersResult.warnings) warnings.push(...callersResult.warnings);

  if (octokit && owner && repo) {
    const bpResult = await checkBranchProtection({ octokit, owner, repo, branch, requiredCheck });
    checks.branchProtection = bpResult;
    if (bpResult.failures) failures.push(...bpResult.failures);
    if (bpResult.warnings) warnings.push(...bpResult.warnings);
  } else {
    checks.branchProtection = { ok: true, skipped: true, reason: "no octokit/owner/repo provided" };
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    checks,
  };
}

// Discover the set of valid reusable-workflow filenames by parsing each caller
// template under `templates/caller-workflows/` and extracting the workflow file
// each one `uses:`. This is the source of truth shipped with pipeline-core.
export function discoverKnownWorkflows(callerTemplatesDir) {
  if (!existsSync(callerTemplatesDir)) return null;
  const out = new Set();
  for (const file of readdirSync(callerTemplatesDir).filter((f) => f.endsWith(".yml"))) {
    const body = readFileSync(join(callerTemplatesDir, file), "utf8");
    for (const m of body.matchAll(USES_RE)) {
      const u = m[1];
      const i = u.indexOf("/.github/workflows/");
      if (i === -1) continue;
      const atIdx = u.lastIndexOf("@");
      if (atIdx === -1) continue;
      out.add(u.slice(i + "/.github/workflows/".length, atIdx));
    }
  }
  return out;
}

export function formatReport(result) {
  const lines = [];
  lines.push("Pipeline Core install doctor");
  lines.push("============================");

  for (const [name, label] of [
    ["config", "Config"],
    ["artifacts", "Artifacts"],
    ["callers", "Caller workflows"],
    ["branchProtection", "Branch protection"],
  ]) {
    const c = result.checks[name];
    if (!c) continue;
    const hasWarnings = (c.warnings ?? []).length > 0;
    const hasFailures = (c.failures ?? []).length > 0 || c.ok === false;
    if (c.skipped) {
      lines.push(`[SKIP] ${label}: ${c.reason}`);
    } else if (!hasFailures && hasWarnings) {
      lines.push(`[WARN] ${label}`);
    } else if (!hasFailures) {
      lines.push(`[OK]   ${label}`);
    } else {
      lines.push(`[FAIL] ${label}`);
    }
  }

  if (result.failures.length) {
    lines.push("");
    lines.push("Failures:");
    for (const f of result.failures) {
      lines.push(`  - [${f.check}] ${f.message}`);
      if (f.remediation) lines.push(`      → ${f.remediation}`);
      if (f.diff) lines.push(f.diff.split("\n").map((l) => `      ${l}`).join("\n"));
    }
  }
  if (result.warnings.length) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of result.warnings) {
      lines.push(`  - [${w.check}] ${w.message}`);
      if (w.remediation) lines.push(`      → ${w.remediation}`);
    }
  }

  lines.push("");
  lines.push(`Summary: ${result.failures.length} failure(s), ${result.warnings.length} warning(s)`);
  return lines.join("\n");
}

// ─── CLI entry ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") args.repoDir = argv[++i];
    else if (a === "--config") args.configPath = argv[++i];
    else if (a === "--upstream") args.upstream = argv[++i];
    else if (a === "--major") args.major = argv[++i];
    else if (a === "--workflows-dir") args.workflowsDir = argv[++i];
    else if (a === "--owner") args.owner = argv[++i];
    else if (a === "--repo-name") args.repo = argv[++i];
    else if (a === "--branch") args.branch = argv[++i];
    else if (a === "--required-check") args.requiredCheck = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

const HELP = `Usage: doctor.mjs [options]

Checks a Pipeline Core consumer repo for setup health. Non-mutating.

Options:
  --repo <dir>            Consumer repo root (default: cwd)
  --config <path>         Config path relative to --repo (default: .github/pipeline-config.yml)
  --upstream <owner/repo> Expected upstream (default: ${DEFAULT_UPSTREAM})
  --major <tag>           Expected major (default: ${DEFAULT_MAJOR})
  --workflows-dir <path>  Workflows dir relative to --repo (default: .github/workflows)
  --branch <name>         Protected branch to inspect (default: ${DEFAULT_BRANCH})
  --required-check <name> Required check context (default: ${DEFAULT_REQUIRED_CHECK})
  --json                  Emit JSON instead of human text
  --help, -h              Show this help

Branch protection requires API access; pass GITHUB_TOKEN and --owner/--repo-name
to enable it, otherwise that check is skipped.

Exit code: 0 if all checks pass (warnings are non-fatal), 1 if any fail.
`;

async function makeOctokitFromEnv(owner, repo) {
  if (!owner || !repo) return null;
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  // Minimal octokit shape: fetch-based, no @octokit/rest dep required.
  return {
    rest: {
      repos: {
        async getBranchProtection({ owner, repo, branch }) {
          const url = `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`;
          const res = await fetch(url, {
            headers: {
              authorization: `Bearer ${token}`,
              accept: "application/vnd.github+json",
              "user-agent": "pipeline-core-doctor",
            },
          });
          if (!res.ok) {
            const body = await res.text();
            const err = new Error(`${res.status} ${res.statusText}: ${body}`);
            err.status = res.status;
            throw err;
          }
          return { data: await res.json() };
        },
      },
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/doctor.mjs")) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  // Default skeleton dir: the one inside this very script's tree.
  const scriptDir = new URL(".", import.meta.url).pathname;
  const skeletonsDir = args.templateSkeletonsDir ?? join(scriptDir, "templates");
  // Default known-workflows source: pipeline-core's caller templates.
  const callerTemplatesDir = join(scriptDir, "..", "templates", "caller-workflows");
  const knownWorkflows = discoverKnownWorkflows(callerTemplatesDir);

  const octokit = await makeOctokitFromEnv(args.owner, args.repo);
  const result = await runDoctor({
    ...args,
    templateSkeletonsDir: skeletonsDir,
    knownWorkflows,
    octokit,
  });

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(formatReport(result) + "\n");
  }
  process.exit(result.ok ? 0 : 1);
}
