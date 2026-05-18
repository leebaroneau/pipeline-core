import assert from "node:assert/strict";
import test from "node:test";
import { universalLabels } from "../scripts/lib/universal-labels.mjs";

test("universalLabels includes all type:* labels", () => {
  const names = universalLabels.map((l) => l.name);
  for (const t of ["bug", "story", "task", "spike", "experiment", "epic"]) {
    assert.ok(names.includes(`type:${t}`), `missing type:${t}`);
  }
});

test("universalLabels includes all resolution flag labels", () => {
  const names = universalLabels.map((l) => l.name);
  for (const r of ["refuted", "duplicate", "wontfix", "cnr"]) {
    assert.ok(names.includes(r), `missing ${r}`);
  }
});

test("universalLabels includes source:notion", () => {
  const names = universalLabels.map((l) => l.name);
  assert.ok(names.includes("source:notion"));
});

test("every universal label has name, color, description", () => {
  for (const label of universalLabels) {
    assert.equal(typeof label.name, "string", `${label.name}: name must be string`);
    assert.match(label.color, /^[0-9a-f]{6}$/i, `${label.name}: color must be 6 hex chars`);
    assert.equal(typeof label.description, "string", `${label.name}: description must be string`);
    assert.ok(label.description.length > 0, `${label.name}: description must be non-empty`);
  }
});
