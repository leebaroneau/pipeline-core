import { test } from "node:test";
import assert from "node:assert/strict";

import { renderTracker, spliceTracker } from "../scripts/update-tracker.mjs";

const sample = {
  generatedAt: "2026-05-19T03:00:00Z",
  totals: { managed: 3, ok: 1, failing: 1, warningsOnly: 1 },
  results: [
    { owner: "X", name: "good", result: { ok: true, failures: [], warnings: [] } },
    { owner: "Y", name: "warn", result: { ok: true, failures: [], warnings: [{ check: "branchProtection" }] } },
    { owner: "Z", name: "fail", result: { ok: false, failures: [{ check: "callers" }], warnings: [] } },
  ],
};

test("renderTracker: sorts failing first, warning-only middle, ok last", () => {
  const table = renderTracker(sample);
  const lines = table.split("\n");
  const failIdx = lines.findIndex((l) => l.includes("Z/fail"));
  const warnIdx = lines.findIndex((l) => l.includes("Y/warn"));
  const okIdx = lines.findIndex((l) => l.includes("X/good"));
  assert.ok(failIdx < warnIdx && warnIdx < okIdx, `unexpected order: fail=${failIdx} warn=${warnIdx} ok=${okIdx}`);
});

test("renderTracker: shows status emojis and counts in the summary row", () => {
  const table = renderTracker(sample);
  assert.match(table, /\*\*3\*\* repos under management/);
  assert.match(table, /\*\*1\*\* OK/);
  assert.match(table, /\*\*1\*\* failing/);
  assert.match(table, /✅ ok/);
  assert.match(table, /⚠️ warn/);
  assert.match(table, /❌ fail/);
});

test("renderTracker: empty summary returns the empty-state message", () => {
  const table = renderTracker({ results: [], totals: { managed: 0, ok: 0, failing: 0, warningsOnly: 0 }, generatedAt: "now" });
  assert.match(table, /No repos under management yet/);
});

test("spliceTracker: replaces content between markers and updates last-updated line", () => {
  const readme = [
    "# Fleet",
    "",
    "<!-- pipeline-fleet:tracker-start -->",
    "old tracker content",
    "<!-- pipeline-fleet:tracker-end -->",
    "",
    "_Updated by: `scripts/update-tracker.mjs`. Last updated: never._",
  ].join("\n");

  const out = spliceTracker({ readme, tracker: "NEW", generatedAt: "2026-05-19T03:00:00Z" });
  assert.match(out, /<!-- pipeline-fleet:tracker-start -->\nNEW\n<!-- pipeline-fleet:tracker-end -->/);
  assert.match(out, /Last updated: 2026-05-19T03:00:00Z/);
  assert.ok(!out.includes("old tracker content"));
});

test("spliceTracker: throws if markers are missing", () => {
  assert.throws(() => spliceTracker({ readme: "no markers", tracker: "x", generatedAt: "n" }), /missing tracker markers/);
});
