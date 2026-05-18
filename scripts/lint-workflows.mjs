// scripts/pipeline/lint-workflows.mjs
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseWorkflowFile } from "./lib/workflow-yaml.mjs";
import {
  requireExplicitPermissions,
  noBroadContentsWrite,
  noUnknownSecrets,
  pinnedReusableWorkflowVersions,
  workflowNameConvention,
  referencedScriptsExist,
} from "./lib/workflow-lint-rules.mjs";

const RULES = [
  requireExplicitPermissions,
  noBroadContentsWrite,
  noUnknownSecrets,
  pinnedReusableWorkflowVersions,
  workflowNameConvention,
  referencedScriptsExist,
];

export function lintWorkflows({ workflows, scriptExists }) {
  const allFailures = [];
  for (const { path, filename } of workflows) {
    const wf = parseWorkflowFile(path);
    const ctx = { filename, scriptExists };
    for (const rule of RULES) {
      const result = rule(wf, ctx);
      if (!result.ok) allFailures.push(...result.failures);
    }
  }
  return {
    ok: allFailures.length === 0,
    failures: allFailures,
    commentBody: allFailures.length === 0
      ? ""
      : `## Workflow lint failures\n\n${allFailures.map((f) => `- \`${f}\``).join("\n")}\n\nFix the workflows above and push again.`,
  };
}

export function discoverWorkflows(dir = ".github/workflows") {
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f) && !f.startsWith(".") && f !== "gitkeep")
    .map((f) => ({ path: join(dir, f), filename: f }));
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const workflows = discoverWorkflows();
  const result = lintWorkflows({
    workflows,
    scriptExists: (p) => existsSync(p),
  });
  if (!result.ok) {
    console.error(result.commentBody);
    process.exit(1);
  }
  console.log(`OK — ${workflows.length} workflows pass all lint rules.`);
}
