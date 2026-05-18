import assert from "node:assert/strict";
import test from "node:test";

import { slashCommands, getCommand } from "../scripts/lib/slash-commands.mjs";

test("slashCommands is a non-empty array", () => {
  assert.ok(Array.isArray(slashCommands));
  assert.ok(slashCommands.length > 0);
});

test("each command has name, phase, allowedFrom (or null), targetState (or null), allowedActors, args, status", () => {
  for (const cmd of slashCommands) {
    assert.equal(typeof cmd.name, "string");
    assert.match(cmd.name, /^\/[a-z-]+$/, `${cmd.name}: must be /lowercase-with-dashes`);
    assert.ok(["foundation", "pr-integration", "deferred"].includes(cmd.phase), `${cmd.name}: phase`);
    assert.ok(Array.isArray(cmd.allowedFrom) || cmd.allowedFrom === null, `${cmd.name}: allowedFrom`);
    assert.ok(typeof cmd.targetState === "string" || cmd.targetState === null, `${cmd.name}: targetState`);
    assert.ok(Array.isArray(cmd.allowedActors), `${cmd.name}: allowedActors`);
    assert.ok(["enabled", "parsed-and-rejected"].includes(cmd.status), `${cmd.name}: status`);
  }
});

test("foundation-phase commands are status: enabled", () => {
  for (const cmd of slashCommands) {
    if (cmd.phase === "foundation") {
      assert.equal(cmd.status, "enabled", `${cmd.name} should be enabled`);
    }
  }
});

test("pr-integration-phase commands are status: enabled (after Spec 2)", () => {
  for (const cmd of slashCommands) {
    if (cmd.phase === "pr-integration") {
      assert.equal(cmd.status, "enabled", `${cmd.name} should be enabled after Spec 2`);
    }
  }
});

test("getCommand returns the command record for a name", () => {
  const ready = getCommand("/ready");
  assert.equal(ready.name, "/ready");
});

test("getCommand returns undefined for unknown commands", () => {
  assert.equal(getCommand("/nonexistent"), undefined);
});

test("vocabulary includes the closure commands", () => {
  const names = slashCommands.map((c) => c.name);
  for (const n of ["/refuted", "/duplicate", "/wontfix", "/cnr", "/reopen"]) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});

test("vocabulary includes the side-state commands", () => {
  const names = slashCommands.map((c) => c.name);
  for (const n of ["/block", "/unblock", "/park", "/unpark", "/needs-info", "/info-resolved"]) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});

test("vocabulary includes the work commands (status enabled in Spec 2)", () => {
  for (const n of ["/grab", "/release", "/iterate"]) {
    const cmd = getCommand(n);
    assert.ok(cmd, `missing ${n}`);
    assert.equal(cmd.status, "enabled", `${n} should be enabled after Spec 2`);
  }
});

test("/iterate carries requirePermission: triage", () => {
  const cmd = getCommand("/iterate");
  assert.equal(cmd.requirePermission, "triage");
});

test("/iterate.allowedActors includes 'human' and 'agent'", () => {
  const cmd = getCommand("/iterate");
  assert.ok(cmd.allowedActors.includes("human"));
  assert.ok(cmd.allowedActors.includes("agent"));
});
