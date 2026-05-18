#!/usr/bin/env node

export function checkTriageGate(issue) {
  const reasons = [];
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

  return { ok: reasons.length === 0, reasons };
}
