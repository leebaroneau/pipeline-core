#!/usr/bin/env node

// scripts/update-tracker.mjs
//
// Reads `<state-dir>/results.json` (produced by fleet-doctor.mjs) and replaces
// the content between the `<!-- pipeline-fleet:tracker-start -->` and
// `<!-- pipeline-fleet:tracker-end -->` markers in a target README with a
// rendered status table. Idempotent and deterministic.

import { readFileSync, writeFileSync } from "node:fs";

const START_MARKER = "<!-- pipeline-fleet:tracker-start -->";
const END_MARKER = "<!-- pipeline-fleet:tracker-end -->";

export function renderTracker(summary) {
  if (!summary?.results?.length) {
    return "_No repos under management yet. Add entries to `config/repos.json` and the next daily run will populate this table._";
  }

  const lines = [];
  const { totals } = summary;
  lines.push(`**${totals.managed}** repo${totals.managed === 1 ? "" : "s"} under management · **${totals.ok}** OK · **${totals.failing}** failing · **${totals.warningsOnly}** with warnings`);
  lines.push("");
  lines.push(`_Updated ${summary.generatedAt}._`);
  lines.push("");
  lines.push("| Repo | Status | Failures | Warnings |");
  lines.push("| --- | --- | ---: | ---: |");

  const sorted = [...summary.results].sort((a, b) => {
    const score = (r) => (r.result?.ok ? (r.result.warnings?.length ? 1 : 2) : 0);
    return score(a) - score(b) || `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`);
  });

  for (const r of sorted) {
    const status = r.result?.ok
      ? (r.result.warnings?.length ? "⚠️ warn" : "✅ ok")
      : "❌ fail";
    const failures = r.result?.failures?.length ?? 0;
    const warnings = r.result?.warnings?.length ?? 0;
    lines.push(`| [\`${r.owner}/${r.name}\`](https://github.com/${r.owner}/${r.name}) | ${status} | ${failures} | ${warnings} |`);
  }
  return lines.join("\n");
}

export function spliceTracker({ readme, tracker, generatedAt }) {
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`README is missing tracker markers (${START_MARKER}, ${END_MARKER})`);
  }
  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);
  let out = `${before}\n${tracker}\n${after}`;
  out = out.replace(
    /_Updated by: `[^`]+`\. Last updated:.*?\._/,
    `_Updated by: \`scripts/update-tracker.mjs\`. Last updated: ${generatedAt}._`,
  );
  return out;
}

export function updateTracker({ resultsPath, readmePath }) {
  const summary = JSON.parse(readFileSync(resultsPath, "utf8"));
  const tracker = renderTracker(summary);
  const readme = readFileSync(readmePath, "utf8");
  const next = spliceTracker({ readme, tracker, generatedAt: summary.generatedAt });
  if (next !== readme) {
    writeFileSync(readmePath, next);
    return { updated: true };
  }
  return { updated: false };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/update-tracker.mjs")) {
  const resultsPath = process.env.RESULTS_PATH ?? process.argv[2] ?? "state/results.json";
  const readmePath = process.env.README_PATH ?? process.argv[3] ?? "README.md";
  try {
    const r = updateTracker({ resultsPath, readmePath });
    process.stdout.write(r.updated ? `Updated ${readmePath}\n` : `${readmePath} already up to date\n`);
  } catch (err) {
    process.stderr.write(`update-tracker.mjs failed: ${err.message}\n`);
    process.exit(1);
  }
}
