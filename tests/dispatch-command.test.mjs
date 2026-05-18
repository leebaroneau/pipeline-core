import assert from "node:assert/strict";
import test from "node:test";

import { planDispatch } from "../scripts/dispatch-command.mjs";

function ctx({ command, issueState, actor, actorKind, issueType }) {
  return {
    command, // already-parsed: { name, args }
    issue: {
      state: issueState || "Triage",
      type: issueType || "improvement",
    },
    actor: actor || "lee-barone",
    actorKind: actorKind || "human", // 'human' or 'agent'
  };
}

test("rejects when actor not in allowedActors", () => {
  // /ready is human-only
  const plan = planDispatch(ctx({ command: { name: "/ready", args: {} }, actorKind: "agent" }));
  assert.equal(plan.action, "reject");
  assert.match(plan.message, /human/i);
});

test("rejects when issue state not in allowedFrom", () => {
  // /ready requires Triage
  const plan = planDispatch(ctx({ command: { name: "/ready", args: {} }, issueState: "Backlog" }));
  assert.equal(plan.action, "reject");
  assert.match(plan.message, /Triage/);
});

test("allows /ready when in Triage and actor is human; sets ranReadyGate=true", () => {
  const plan = planDispatch(ctx({ command: { name: "/ready", args: {} } }));
  assert.equal(plan.action, "transition");
  assert.equal(plan.runReadyGate, true);
  assert.equal(plan.targetState, "Selected for Development");
});

test("allows /needs-info from Triage; sets reason from args.what", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/needs-info", args: { what: "screenshot please" } },
      issueState: "Triage",
    }),
  );
  assert.equal(plan.action, "transition");
  assert.equal(plan.targetState, "Needs Info");
  assert.equal(plan.commentBody.includes("screenshot please"), true);
});

test("/refuted always allowed (allowedFrom is null), sets closure resolution", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/refuted", args: { why: "data showed no lift" } },
      issueState: "In Review",
    }),
  );
  assert.equal(plan.action, "transition");
  assert.equal(plan.targetState, "Done");
  assert.equal(plan.applyLabel, "refuted");
  assert.equal(plan.closeWithReason, "completed");
});

test("/duplicate sets duplicate label and includes linked issue", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/duplicate", args: { of: "#42" } },
      issueState: "Triage",
    }),
  );
  assert.equal(plan.action, "transition");
  assert.equal(plan.applyLabel, "duplicate");
  assert.equal(plan.commentBody.includes("#42"), true);
});

test("/reopen with skipTriage=true targets Selected for Development", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/reopen", args: { skipTriage: true, why: "regressed" } },
      issueState: "Done",
    }),
  );
  assert.equal(plan.action, "reopen");
  assert.equal(plan.targetState, "Selected for Development");
});

test("/reopen without skipTriage targets Triage", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/reopen", args: { skipTriage: false, why: "still happening" } },
      issueState: "Done",
    }),
  );
  assert.equal(plan.action, "reopen");
  assert.equal(plan.targetState, "Triage");
});

test("/reopen rejected for agent actors in Phase 1", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/reopen", args: { skipTriage: false, why: "x" } },
      issueState: "Done",
      actorKind: "agent",
    }),
  );
  assert.equal(plan.action, "reject");
  assert.match(plan.message, /human/i);
});

test("/block captures reason in comment body", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/block", args: { reason: "waiting on legal review" } },
      issueState: "Selected for Development",
    }),
  );
  assert.equal(plan.action, "transition");
  assert.equal(plan.targetState, "Blocked");
  assert.equal(plan.commentBody.includes("waiting on legal review"), true);
});

test("unknown command returns reject", () => {
  const plan = planDispatch(ctx({ command: { name: "/unknown", args: {} } }));
  assert.equal(plan.action, "reject");
});

test("/unblock from Blocked falls back to Triage in Foundation", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/unblock", args: {} },
      issueState: "Blocked",
    }),
  );
  assert.equal(plan.action, "transition");
  assert.equal(plan.targetState, "Triage");
  assert.match(plan.commentBody, /Triage/);
});

test("/unpark from On Hold falls back to Triage in Foundation", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/unpark", args: {} },
      issueState: "On Hold",
    }),
  );
  assert.equal(plan.action, "transition");
  assert.equal(plan.targetState, "Triage");
});

test("/grab from Selected for Development transitions to In Progress + assigns caller", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/grab", args: {} },
      issueState: "Selected for Development",
    }),
  );
  assert.equal(plan.action, "transition");
  assert.equal(plan.targetState, "In Progress");
  assert.equal(plan.assignActor, true);
  assert.equal(plan.applyLabel, "iteration:1");
});

test("/grab is rejected if issue not in Selected for Development", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/grab", args: {} },
      issueState: "Triage",
    }),
  );
  assert.equal(plan.action, "reject");
});

test("/release from In Progress transitions to Selected for Development + un-assigns caller", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/release", args: {} },
      issueState: "In Progress",
    }),
  );
  assert.equal(plan.action, "transition");
  assert.equal(plan.targetState, "Selected for Development");
  assert.equal(plan.unassignActor, true);
});

test("/iterate from In Review increments iteration label + moves to In Progress", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/iterate", args: { reason: "data refuted hypothesis" } },
      issueState: "In Review",
    }),
  );
  assert.equal(plan.action, "transition");
  assert.equal(plan.targetState, "In Progress");
  assert.equal(plan.incrementIteration, true);
  assert.match(plan.commentBody, /data refuted hypothesis/);
});

test("/iterate carries requirePermission directive", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/iterate", args: { reason: "x" } },
      issueState: "In Review",
    }),
  );
  assert.equal(plan.requirePermission, "triage");
});

test("/iterate without reason is rejected", () => {
  const plan = planDispatch(
    ctx({
      command: { name: "/iterate", args: {} },
      issueState: "In Review",
    }),
  );
  assert.equal(plan.action, "reject");
  assert.match(plan.message, /reason/i);
});
