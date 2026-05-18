import assert from "node:assert/strict";
import test from "node:test";

import { checkReadyGate } from "../scripts/check-ready-gate.mjs";

function issue({ body, labels, projectStatus, priority, storyPoints }) {
  return {
    body: body || "",
    labels: labels || [],
    projectStatus: projectStatus || "Triage",
    priority: priority || null,
    storyPoints: storyPoints || null,
  };
}

test("returns ok=false if not in Triage state", () => {
  const result = checkReadyGate(issue({ projectStatus: "Backlog" }), { type: "improvement" });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /not in Triage/i);
});

test("returns ok=true for an improvement with all required sections + metadata", () => {
  const body = [
    "### Hypothesis",
    "If we ship X, Y improves.",
    "### Acceptance Criteria",
    "- [ ] A",
    "### Test Data Required",
    "TBD",
    "### Out of Scope",
    "Z",
  ].join("\n\n");
  const result = checkReadyGate(
    issue({
      body,
      labels: ["domain:alpha", "component:api", "type:experiment"],
      projectStatus: "Triage",
      priority: "Medium",
      storyPoints: "M",
    }),
    { type: "improvement" },
  );
  assert.equal(result.ok, true, `expected ok=true, got reasons: ${result.reasons.join("; ")}`);
});

test("returns ok=false when hypothesis section is missing for improvement type", () => {
  const body = [
    "### Acceptance Criteria",
    "- [ ] A",
    "### Test Data Required",
    "TBD",
    "### Out of Scope",
    "Z",
  ].join("\n\n");
  const result = checkReadyGate(
    issue({
      body,
      labels: ["domain:alpha", "component:api", "type:experiment"],
      projectStatus: "Triage",
      priority: "Medium",
      storyPoints: "M",
    }),
    { type: "improvement" },
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /Hypothesis/);
});

test("returns ok=false when no domain label is present", () => {
  const body = [
    "### Hypothesis", "x",
    "### Acceptance Criteria", "x",
    "### Test Data Required", "x",
    "### Out of Scope", "x",
  ].join("\n\n");
  const result = checkReadyGate(
    issue({
      body,
      labels: ["component:api", "type:experiment"],
      projectStatus: "Triage",
      priority: "Medium",
      storyPoints: "M",
    }),
    { type: "improvement" },
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /domain:/i);
});

test("returns ok=false when no priority is set", () => {
  const body = [
    "### Hypothesis", "x",
    "### Acceptance Criteria", "x",
    "### Test Data Required", "x",
    "### Out of Scope", "x",
  ].join("\n\n");
  const result = checkReadyGate(
    issue({
      body,
      labels: ["domain:alpha", "component:api", "type:experiment"],
      projectStatus: "Triage",
      priority: null,
      storyPoints: "M",
    }),
    { type: "improvement" },
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /Priority/i);
});

test("bug template doesn't require hypothesis but does require expected/actual/repro", () => {
  const body = [
    "### Expected Behavior", "should not crash",
    "### Actual Behavior", "crashes",
    "### Steps to Reproduce", "1. open the page",
    "### Out of Scope", "Z",
  ].join("\n\n");
  const result = checkReadyGate(
    issue({
      body,
      labels: ["domain:alpha", "component:api", "type:bug"],
      projectStatus: "Triage",
      priority: "High",
      storyPoints: "S",
    }),
    { type: "bug" },
  );
  assert.equal(result.ok, true, `expected ok=true, got: ${result.reasons.join("; ")}`);
});

test("spike requires only Question and Out of Scope", () => {
  const body = [
    "### Question", "what's the right schema?",
    "### Out of Scope", "Z",
  ].join("\n\n");
  const result = checkReadyGate(
    issue({
      body,
      labels: ["domain:alpha", "component:api", "type:spike"],
      projectStatus: "Triage",
      priority: "Low",
      storyPoints: "S",
    }),
    { type: "spike" },
  );
  assert.equal(result.ok, true, `expected ok=true, got: ${result.reasons.join("; ")}`);
});
