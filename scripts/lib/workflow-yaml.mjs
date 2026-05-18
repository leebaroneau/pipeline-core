// scripts/pipeline/lib/workflow-yaml.mjs
import { readFileSync } from "node:fs";
import yaml from "js-yaml";

export function parseWorkflowFile(path) {
  const raw = readFileSync(path, "utf8");
  return yaml.load(raw);
}
