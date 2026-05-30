import assert from "node:assert/strict";
import test from "node:test";

import { shouldRevertClose, hasMergedPrClosureEvent } from "../scripts/close-button-revert.mjs";

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

test("does NOT revert when GitHub records a PR merge as a nearby referenced commit event", () => {
  const result = shouldRevertClose({
    labels: ["type:bug"],
    recentComments: [],
    timelineEvents: [
      { event: "closed", commit_id: null, created_at: "2026-05-18T23:51:57Z" },
      { event: "referenced", commit_id: "0ea7d28981191bbb36f5ac92848084fc8e7565c6", created_at: "2026-05-18T23:51:57Z" },
    ],
  });
  assert.equal(result.revert, false);
});

test("DOES revert when an old referenced commit is unrelated to the close event", () => {
  const result = shouldRevertClose({
    labels: ["type:bug"],
    recentComments: [],
    timelineEvents: [
      { event: "referenced", commit_id: "0ea7d28981191bbb36f5ac92848084fc8e7565c6", created_at: "2026-05-18T22:00:00Z" },
      { event: "closed", commit_id: null, created_at: "2026-05-18T23:51:57Z" },
    ],
  });
  assert.equal(result.revert, true);
});

test("does NOT revert if old command was issued (>2 min ago) — staleness check passes; revert", () => {
  const result = shouldRevertClose({
    labels: ["type:bug"],
    recentComments: [OLD_COMMENT("/refuted reason from way before")],
    mergedPrLinked: false,
  });
  assert.equal(result.revert, true);
});

// Regression for the squash-merge PR-body close (e.g. template-agent #194):
// GitHub auto-closes via "Fixes #N" in a SQUASHED PR body — the resulting `closed`
// timeline event has commit_id:null and the only PR link is a `cross-referenced`
// event, so the timeline heuristic alone cannot see it. The workflow resolves this
// via GraphQL (ClosedEvent.closer) and passes mergedPrLinked, which must win.
test("squash-merge PR-body close: timeline heuristic misses it, mergedPrLinked saves it", () => {
  const timelineEvents = [
    { event: "cross-referenced", commit_id: null, created_at: "2026-05-29T21:50:40Z" },
    { event: "closed", commit_id: null, created_at: "2026-05-29T21:50:46Z" },
  ];
  // The timeline-only path genuinely cannot detect this close (documents the gap).
  assert.equal(hasMergedPrClosureEvent(timelineEvents), false);
  // With mergedPrLinked resolved true by the workflow, the closure stands.
  assert.equal(
    shouldRevertClose({ labels: ["type:bug"], recentComments: [], mergedPrLinked: true, timelineEvents }).revert,
    false
  );
});
