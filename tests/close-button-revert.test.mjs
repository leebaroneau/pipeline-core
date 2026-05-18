import assert from "node:assert/strict";
import test from "node:test";

import { shouldRevertClose } from "../scripts/close-button-revert.mjs";

const CLOSURE_LABELS = ["refuted", "duplicate", "wontfix", "cnr"];
const RECENT_COMMENT = (cmd) => ({ body: cmd, createdAt: new Date(Date.now() - 30 * 1000).toISOString() });
const OLD_COMMENT = (cmd) => ({ body: cmd, createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() });

test("does NOT revert when a resolution label is present", () => {
  for (const label of CLOSURE_LABELS) {
    const result = shouldRevertClose({
      labels: ["type:bug", label],
      recentComments: [],
      mergedPrLinked: false,
    });
    assert.equal(result.revert, false, `should not revert when ${label} present`);
  }
});

test("does NOT revert when a closure command was issued in the last 2 minutes", () => {
  for (const cmd of ["/refuted reason", "/duplicate #1", "/wontfix x", "/cnr"]) {
    const result = shouldRevertClose({
      labels: ["type:bug"],
      recentComments: [RECENT_COMMENT(cmd)],
      mergedPrLinked: false,
    });
    assert.equal(result.revert, false, `should not revert with recent ${cmd}`);
  }
});

test("DOES revert when closed without resolution label, no recent command, no merged PR", () => {
  const result = shouldRevertClose({
    labels: ["type:bug"],
    recentComments: [],
    mergedPrLinked: false,
  });
  assert.equal(result.revert, true);
  assert.match(result.message, /must close via PR merge or a resolution slash command/i);
});

test("does NOT revert when a merged PR closes via Closes #N (mergedPrLinked: true)", () => {
  const result = shouldRevertClose({
    labels: ["type:bug"],
    recentComments: [],
    mergedPrLinked: true,
  });
  assert.equal(result.revert, false);
});

test("does NOT revert if old command was issued (>2 min ago) — staleness check passes; revert", () => {
  const result = shouldRevertClose({
    labels: ["type:bug"],
    recentComments: [OLD_COMMENT("/refuted reason from way before")],
    mergedPrLinked: false,
  });
  assert.equal(result.revert, true);
});
