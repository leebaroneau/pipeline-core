// scripts/pipeline/check-script-refs.mjs
import { existsSync } from "node:fs";
import { parseWorkflowFile } from "./lib/workflow-yaml.mjs";
import { referencedScriptsExist } from "./lib/workflow-lint-rules.mjs";

export function checkScriptRefs({ workflows, scriptExists }) {
  const failures = [];
  for (const { path, filename } of workflows) {
    const wf = parseWorkflowFile(path);
    const result = referencedScriptsExist(wf, { filename, scriptExists });
    if (!result.ok) failures.push(...result.failures);
  }
  return {
    ok: failures.length === 0,
    failures,
  };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const { discoverWorkflows } = await import("./lint-workflows.mjs");
  const workflows = discoverWorkflows();
  const result = checkScriptRefs({
    workflows,
    scriptExists: (p) => existsSync(p),
  });
  if (!result.ok) {
    console.error(result.failures.join("\n"));
    process.exit(1);
  }
  console.log(`OK — all script references in ${workflows.length} workflows resolve.`);
}
