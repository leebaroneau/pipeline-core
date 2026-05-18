#!/usr/bin/env node

// Merge-gate composite check. Spec 2 §6.5.
// Evaluates all conditions in one pass and reports every failure.

import { checkBranchName } from "./check-branch-name.mjs";
import { checkIssueLink } from "./check-issue-link.mjs";

const SELF_CI_CONTEXTS = new Set(["merge-gate / evaluate"]);

export function checkMergeGate({
  branchName,
  prBody,
  linkedIssue,
  approvedReviews,
  requiredReviews,
  ciStatuses,
}) {
  const failures = [];

  const branchResult = checkBranchName(branchName);
  if (!branchResult.ok) {
    failures.push(`branch name: ${branchResult.reasons[0]}`);
  }

  const linkResult = checkIssueLink(prBody);
  if (!linkResult.ok) {
    failures.push(`issue link: ${linkResult.reasons[0]}`);
  } else if (!linkedIssue) {
    failures.push(`issue link: referenced issue not found or closed.`);
  }

  if (linkedIssue) {
    const labels = linkedIssue.labels || [];
    if (!labels.includes("status:review")) {
      const currentStatus = labels.find((l) => l.startsWith("status:")) || "no status";
      failures.push(`linked issue must be in status:review, but is in ${currentStatus}.`);
    }
  }

  if ((approvedReviews ?? 0) < (requiredReviews ?? 1)) {
    failures.push(`PR has ${approvedReviews ?? 0} approving review(s); ${requiredReviews ?? 1} required.`);
  }

  // CI statuses: ignore our own pipeline/* checks (those are handled separately).
  // All non-pipeline status checks must be success.
  const ciList = ciStatuses || [];
  const failingCi = ciList
    .filter((s) => !s.context.startsWith("pipeline/"))
    .filter((s) => !SELF_CI_CONTEXTS.has(s.context))
    .filter((s) => s.state !== "success");
  if (failingCi.length > 0) {
    const names = failingCi.map((s) => `${s.context} (${s.state})`).join(", ");
    failures.push(`required CI status check(s) not green: ${names}`);
  }

  return { ok: failures.length === 0, failures };
}
