// scripts/pipeline/check-drift.mjs
// Top-level drift orchestrator. Composes:
//   - artifact diff (generated vs committed for labels.yml, labeler.yml, ISSUE_TEMPLATE/*)
//   - check-script-refs (workflows reference scripts that exist on disk)
//   - check-slash-command-docs (enabled commands are documented)
//   - check-label-catalog (declared catalog vs live GitHub labels — only when octokit provided)

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { checkScriptRefs } from "./check-script-refs.mjs";
import { checkSlashCommandDocs } from "./check-slash-command-docs.mjs";
import { discoverWorkflows } from "./lint-workflows.mjs";

export function compareGeneratedArtifact({ committedPath, generatedPath }) {
  const committed = readFileSync(committedPath, "utf8");
  const generated = readFileSync(generatedPath, "utf8");
  if (committed === generated) {
    return { ok: true };
  }
  // Use system diff for human-readable output. The diff exits non-zero when files differ
  // (which is the case we're in here), so we capture stdout from the thrown error.
  let diff = "(no diff captured)";
  try {
    execSync(`diff -u "${committedPath}" "${generatedPath}"`, { encoding: "utf8" });
    // Unreachable: strings differ, so diff exits non-zero.
  } catch (e) {
    diff = e.stdout?.toString() ?? diff;
  }
  return { ok: false, diff };
}

const ARTIFACT_PAIRS = (tmpDir) => [
  { committed: ".github/labels.yml", generated: `${tmpDir}/labels.yml`, label: "labels.yml" },
  { committed: ".github/labeler.yml", generated: `${tmpDir}/labeler.yml`, label: "labeler.yml" },
  { committed: ".github/ISSUE_TEMPLATE/improvement.yml", generated: `${tmpDir}/ISSUE_TEMPLATE/improvement.yml`, label: "ISSUE_TEMPLATE/improvement.yml" },
  { committed: ".github/ISSUE_TEMPLATE/bug.yml", generated: `${tmpDir}/ISSUE_TEMPLATE/bug.yml`, label: "ISSUE_TEMPLATE/bug.yml" },
  { committed: ".github/ISSUE_TEMPLATE/spike.yml", generated: `${tmpDir}/ISSUE_TEMPLATE/spike.yml`, label: "ISSUE_TEMPLATE/spike.yml" },
  { committed: ".github/ISSUE_TEMPLATE/experiment.yml", generated: `${tmpDir}/ISSUE_TEMPLATE/experiment.yml`, label: "ISSUE_TEMPLATE/experiment.yml" },
];

export async function runFullDriftScan({ tmpDir, octokit, owner, repo, fs }) {
  // 1. Artifact diffs.
  const artifactDrifts = [];
  for (const a of ARTIFACT_PAIRS(tmpDir)) {
    const result = compareGeneratedArtifact({ committedPath: a.committed, generatedPath: a.generated });
    if (!result.ok) artifactDrifts.push({ ...a, diff: result.diff });
  }

  // 2. Script-ref check.
  const workflows = discoverWorkflows();
  const scriptRefs = checkScriptRefs({
    workflows,
    scriptExists: (p) => fs.existsSync(p),
  });

  // 3. Slash-command doc check.
  const { slashCommands } = await import("./lib/slash-commands.mjs");
  const docs = {};
  // docs/pipeline-core.md is what the installer drops by default; README.md
  // is the consumer's main entry point; 00_resources/... is the legacy
  // lee-dashboard path retained for backwards compatibility.
  for (const p of ["README.md", "docs/pipeline-core.md", "00_resources/pipeline-core/README.md"]) {
    try { docs[p] = fs.readFileSync(p, "utf8"); } catch { /* skip */ }
  }
  const slashDocs = checkSlashCommandDocs({ commands: slashCommands, docs });

  // 4. Label-catalog reconcile (only when octokit is wired; CLI runs without auth skip this).
  let labelCatalog = { ok: true, missingInLive: [], extraInLive: [] };
  let labelReport = "";
  if (octokit && owner && repo) {
    const { checkLabelCatalog, formatLabelCatalogReport } = await import("./check-label-catalog.mjs");
    const declaredLabels = await loadDeclaredLabels(".github/labels.yml");
    labelCatalog = await checkLabelCatalog({ github: octokit, owner, repo, declaredLabels });
    if (!labelCatalog.ok) {
      labelReport = formatLabelCatalogReport(labelCatalog);
    }
  }

  const ok = artifactDrifts.length === 0
    && scriptRefs.ok
    && slashDocs.ok
    && labelCatalog.ok;

  return {
    ok,
    artifactDrifts,
    scriptRefs,
    slashDocs,
    labelCatalog,
    report: formatReport({ artifactDrifts, scriptRefs, slashDocs, labelReport }),
  };
}

async function loadDeclaredLabels(path) {
  const yaml = (await import("js-yaml")).default;
  return yaml.load(readFileSync(path, "utf8")) ?? [];
}

function formatReport({ artifactDrifts, scriptRefs, slashDocs, labelReport }) {
  const sections = [];
  if (artifactDrifts.length > 0) {
    sections.push(`## Generated artifact drift\n\n${artifactDrifts.map((a) => `### ${a.label}\n\n\`\`\`diff\n${a.diff}\n\`\`\``).join("\n\n")}`);
  }
  if (!scriptRefs.ok) {
    sections.push(`## Missing script references\n\n${scriptRefs.failures.map((f) => `- \`${f}\``).join("\n")}`);
  }
  if (!slashDocs.ok) {
    sections.push(`## Undocumented enabled slash commands\n\n${slashDocs.failures.map((f) => `- ${f}`).join("\n")}`);
  }
  if (labelReport) {
    sections.push(`## Label catalog drift\n\n${labelReport}`);
  }
  return sections.join("\n\n");
}
