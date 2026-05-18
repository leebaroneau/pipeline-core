#!/usr/bin/env node

// Per-type required body section headers. Headers must literally appear in the body.
const REQUIREMENTS = {
  improvement: ["### Hypothesis", "### Acceptance Criteria", "### Test Data Required", "### Out of Scope"],
  experiment: ["### Hypothesis", "### Acceptance Criteria", "### Test Data Required", "### Success Metric", "### Out of Scope"],
  bug: ["### Expected Behavior", "### Actual Behavior", "### Steps to Reproduce", "### Out of Scope"],
  spike: ["### Question", "### Out of Scope"],
};

export function checkReadyGate(issue, { type }) {
  const reasons = [];

  if (issue.projectStatus !== "Triage") {
    reasons.push(`Cannot move to Selected for Development: issue is not in Triage (current: ${issue.projectStatus}).`);
    return { ok: false, reasons };
  }

  const required = REQUIREMENTS[type];
  if (!required) {
    reasons.push(`Unknown issue type "${type}"; expected one of: ${Object.keys(REQUIREMENTS).join(", ")}`);
    return { ok: false, reasons };
  }

  const body = issue.body || "";
  for (const header of required) {
    if (!body.includes(header)) {
      reasons.push(`Missing body section: ${header}`);
    }
  }

  const labels = issue.labels || [];
  if (!labels.some((l) => l.startsWith("domain:"))) {
    reasons.push("Missing at least one `domain:*` label.");
  }
  if (!labels.some((l) => l.startsWith("component:"))) {
    reasons.push("Missing at least one `component:*` label.");
  }
  const typeLabels = labels.filter((l) => l.startsWith("type:"));
  if (typeLabels.length === 0) {
    reasons.push("Missing `type:*` label.");
  } else if (typeLabels.length > 1) {
    reasons.push(`Exactly one type:* label allowed; got ${typeLabels.length}: ${typeLabels.join(", ")}`);
  }

  if (!issue.priority) {
    reasons.push("`Priority` Projects field not set.");
  }
  if (!issue.storyPoints) {
    reasons.push("`Story Points` Projects field not set.");
  }

  return { ok: reasons.length === 0, reasons };
}
