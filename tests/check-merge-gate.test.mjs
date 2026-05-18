import assert from "node:assert/strict";
import test from "node:test";

import { checkMergeGate } from "../scripts/check-merge-gate.mjs";

function ctx({ branchName, issueLink, issueLabels, reviewCount, requiredReviews, ciStatuses }) {
  return {
    branchName: branchName ?? "experiment/42-add-domain-labels",
    prBody: issueLink === false ? "no link" : `Closes #${issueLink || 42}`,
    linkedIssue: issueLink === false
      ? null
      : {
          number: issueLink || 42,
          labels: issueLabels || ["status:review", "type:experiment", "domain:root"],
        },
    approvedReviews: reviewCount ?? 1,
    requiredReviews: requiredReviews ?? 1,
    ciStatuses: ciStatuses || [{ context: "validate-and-check-drift", state: "success" }],
  };
}

test("ok=true when all conditions pass", () => {
  const result = checkMergeGate(ctx({}));
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("ok=false when branch name doesn't match pattern", () => {
  const result = checkMergeGate(ctx({ branchName: "feature/x" }));
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /branch/i.test(f)));
});

test("ok=false when PR body has no issue link", () => {
  const result = checkMergeGate(ctx({ issueLink: false }));
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /issue link|Closes|Refs/i.test(f)));
});

test("ok=false when linked issue not in status:review", () => {
  const result = checkMergeGate(ctx({ issueLabels: ["status:in-progress", "type:experiment", "domain:root"] }));
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /status:review/.test(f)));
});

test("ok=false when approved reviews below required", () => {
  const result = checkMergeGate(ctx({ reviewCount: 0, requiredReviews: 1 }));
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /review/i.test(f)));
});

test("ok=false when CI status is failure", () => {
  const result = checkMergeGate(ctx({
    ciStatuses: [{ context: "validate-and-check-drift", state: "failure" }],
  }));
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /CI|status check/i.test(f)));
});

test("ok=false when CI status is pending", () => {
  const result = checkMergeGate(ctx({
    ciStatuses: [{ context: "validate-and-check-drift", state: "pending" }],
  }));
  assert.equal(result.ok, false);
});

test("CI statuses prefixed with `pipeline/` are NOT counted as required CI (they're our own gates)", () => {
  const result = checkMergeGate(ctx({
    ciStatuses: [
      { context: "validate-and-check-drift", state: "success" },
      { context: "pipeline/branch-name", state: "failure" },   // our own — ignored here
    ],
  }));
  // Branch name check is evaluated separately (via branchName); this CI list doesn't include it
  assert.equal(result.ok, true);
});

test("reports multiple failures at once", () => {
  const result = checkMergeGate(ctx({
    branchName: "feature/x",
    issueLink: false,
  }));
  assert.equal(result.ok, false);
  assert.ok(result.failures.length >= 2);
});
