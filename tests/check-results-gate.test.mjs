import assert from "node:assert/strict";
import test from "node:test";

import { checkResultsGate } from "../scripts/check-results-gate.mjs";

test("ok=false when issue is type:experiment and no ## Results section", () => {
  const result = checkResultsGate({
    body: "### Hypothesis\nx\n### Acceptance Criteria\ny",
    labels: ["type:experiment"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /## Results/);
});

test("ok=false when ## Results section is empty or whitespace only", () => {
  const result = checkResultsGate({
    body: "## Results\n\n   \n",
    labels: ["type:experiment"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /## Results section is empty/);
});

test("ok=true when ## Results section has non-trivial content", () => {
  const result = checkResultsGate({
    body: "## Results\n\nConfirmed: domain labels reduced time-to-first-review by 38%.",
    labels: ["type:experiment"],
  });
  assert.equal(result.ok, true);
});

test("ok=true (gate not applicable) for non-experiment types", () => {
  for (const type of ["bug", "story", "task", "spike", "epic"]) {
    const result = checkResultsGate({
      body: "anything",
      labels: [`type:${type}`],
    });
    assert.equal(result.ok, true, `type:${type} should skip the gate`);
    assert.equal(result.applicable, false);
  }
});

test("ok=true with applicable=true for experiment with populated Results", () => {
  const result = checkResultsGate({
    body: "## Results\n\nRefuted — see Iteration 2.",
    labels: ["type:experiment"],
  });
  assert.equal(result.ok, true);
  assert.equal(result.applicable, true);
});

test("handles missing labels array", () => {
  const result = checkResultsGate({ body: "x" });
  assert.equal(result.ok, true);
  assert.equal(result.applicable, false);
});
