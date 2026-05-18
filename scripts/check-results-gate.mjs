#!/usr/bin/env node

// Results-gate validator. Spec 2 §6.4 (soft mode).
// Applicable only to issues with type:experiment label.
// Checks for a non-empty ## Results section in the issue body.

// NOTE: The spec regex used \Z (PCRE end-of-string anchor) which is not valid
// in JavaScript. Replaced with a two-regex approach: locate the ## Results
// heading with /^##\s+Results\s*$/m then slice content until the next ^## or
// end-of-string. This faithfully captures the same section boundary intent.

const RESULTS_HEADING = /^##\s+Results\s*$/m;
const NEXT_H2 = /^##\s/m;

/**
 * Extract the content of the first "## Results" section from `body`.
 * Returns null if the heading is absent, or the trimmed content string.
 */
function extractResultsSection(body) {
  const headingMatch = RESULTS_HEADING.exec(body);
  if (!headingMatch) return null;

  const afterHeading = body.slice(headingMatch.index + headingMatch[0].length);
  const nextH2 = NEXT_H2.exec(afterHeading);
  const sectionBody = nextH2
    ? afterHeading.slice(0, nextH2.index)
    : afterHeading;

  return sectionBody.trim();
}

/**
 * Check the results gate for an issue.
 *
 * @param {{ body?: string, labels?: string[] }} issue
 * @returns {{ ok: boolean, applicable: boolean, reasons: string[] }}
 */
export function checkResultsGate({ body, labels } = {}) {
  const labelList = labels || [];
  const isExperiment = labelList.includes("type:experiment");

  if (!isExperiment) {
    return { ok: true, applicable: false, reasons: [] };
  }

  if (typeof body !== "string" || body.length === 0) {
    return {
      ok: false,
      applicable: true,
      reasons: ["Issue body is missing — cannot find ## Results section."],
    };
  }

  const sectionContent = extractResultsSection(body);

  if (sectionContent === null) {
    return {
      ok: false,
      applicable: true,
      reasons: [
        "Issue body is missing the `## Results` section. Add it before opening the PR for review.",
      ],
    };
  }

  if (sectionContent.length === 0) {
    return {
      ok: false,
      applicable: true,
      reasons: [
        "## Results section is empty. Populate it with the experiment's outcome (Confirmed / Refuted / Inconclusive + evidence).",
      ],
    };
  }

  return { ok: true, applicable: true, reasons: [] };
}
