// scripts/pipeline/check-slash-command-docs.mjs
import { readFileSync } from "node:fs";

const DEFAULT_DOC_PATHS = [
  "README.md",
  "docs/pipeline-core.md",            // Consumer-friendly: dropped by the installer and re-generated via `make pipeline-generate-docs`.
  "00_resources/pipeline-core/README.md",  // Legacy lee-dashboard path; kept for backwards compat.
];

export function checkSlashCommandDocs({ commands, docs }) {
  const failures = [];
  const allDocText = Object.values(docs).join("\n");
  for (const cmd of commands) {
    if (cmd.status !== "enabled") continue;
    // Look for the command name wrapped in backticks (Markdown convention).
    const needle = `\`${cmd.name}\``;
    if (!allDocText.includes(needle)) {
      failures.push(`Slash command ${cmd.name} is enabled but undocumented (looked in ${Object.keys(docs).join(", ")}).`);
    }
  }
  return { ok: failures.length === 0, failures };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const { slashCommands } = await import("./lib/slash-commands.mjs");
  const docs = {};
  for (const p of DEFAULT_DOC_PATHS) {
    try {
      docs[p] = readFileSync(p, "utf8");
    } catch {
      // Doc file may not exist yet; skip silently.
    }
  }
  const result = checkSlashCommandDocs({ commands: slashCommands, docs });
  if (!result.ok) {
    console.error(result.failures.join("\n"));
    process.exit(1);
  }
  console.log("OK — every enabled slash command is documented.");
}
