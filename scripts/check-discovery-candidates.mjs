#!/usr/bin/env node

import { readFileSync } from "node:fs";

export function loadDiscoveryState(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatCandidate(candidate) {
  const language = candidate.primaryLanguage || "unknown language";
  const visibility = candidate.visibility || "unknown visibility";
  return `- ${candidate.owner}/${candidate.name} (${visibility}, ${language})`;
}

export function assertNoDiscoveryCandidates(discovery) {
  const candidates = Array.isArray(discovery?.candidates) ? discovery.candidates : [];
  if (!candidates.length) {
    return { ok: true, candidateCount: 0 };
  }

  const owner = discovery.owner ?? "unknown owner";
  const err = new Error([
    `Unmanaged active repos found for ${owner}: ${candidates.length}`,
    "",
    ...candidates.map(formatCandidate),
    "",
    "Each non-archived, non-fork repo must either install Pipeline Core or add an explicit skip reason.",
  ].join("\n"));
  err.candidateCount = candidates.length;
  err.candidates = candidates;
  throw err;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/check-discovery-candidates.mjs")) {
  const discoveryPath = process.env.DISCOVERY_PATH ?? process.argv[2] ?? "state/discovery.json";
  try {
    const discovery = loadDiscoveryState(discoveryPath);
    assertNoDiscoveryCandidates(discovery);
    process.stdout.write(`No unmanaged active repos in ${discovery.owner ?? discoveryPath}.\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
