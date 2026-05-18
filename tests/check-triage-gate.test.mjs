import assert from "node:assert/strict";
import test from "node:test";

import { checkTriageGate } from "../scripts/check-triage-gate.mjs";

test("ok=true when all 3 required label namespaces present", () => {
  const result = checkTriageGate({ labels: ["domain:alpha", "component:api", "type:bug"] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});

test("ok=false when domain:* missing", () => {
  const result = checkTriageGate({ labels: ["component:api", "type:bug"] });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /domain:/i);
});

test("ok=false when component:* missing", () => {
  const result = checkTriageGate({ labels: ["domain:alpha", "type:bug"] });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /component:/i);
});

test("ok=false when type:* missing", () => {
  const result = checkTriageGate({ labels: ["domain:alpha", "component:api"] });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /type:/i);
});

test("ok=false when more than one type:* present", () => {
  const result = checkTriageGate({ labels: ["domain:alpha", "component:api", "type:bug", "type:story"] });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /exactly one type/i);
});

test("multiple domain:* and component:* labels are OK", () => {
  const result = checkTriageGate({
    labels: ["domain:alpha", "domain:beta", "component:api", "component:ui", "type:experiment"],
  });
  assert.equal(result.ok, true);
});
