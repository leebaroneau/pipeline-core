import assert from "node:assert/strict";
import test from "node:test";

import { parseSlashCommand } from "../scripts/parse-slash-command.mjs";

test("returns null on non-command comments", () => {
  assert.equal(parseSlashCommand("Hello, this is just a comment"), null);
  assert.equal(parseSlashCommand("/something then more text\nand a second line"), null);
  // Note: commands must be on first line.
  assert.equal(parseSlashCommand("line one\n/ready"), null);
});

test("parses /ready (no args)", () => {
  const parsed = parseSlashCommand("/ready");
  assert.deepEqual(parsed, { name: "/ready", rawArgs: "", args: {} });
});

test("parses /needs-info with free-form text arg", () => {
  const parsed = parseSlashCommand("/needs-info missing reproduction steps and a screenshot");
  assert.equal(parsed.name, "/needs-info");
  assert.equal(parsed.args.what, "missing reproduction steps and a screenshot");
});

test("parses /block with reason arg", () => {
  const parsed = parseSlashCommand("/block waiting on dependency review by ops team");
  assert.equal(parsed.name, "/block");
  assert.equal(parsed.args.reason, "waiting on dependency review by ops team");
});

test("parses /duplicate with #N issue ref", () => {
  const parsed = parseSlashCommand("/duplicate #42");
  assert.equal(parsed.name, "/duplicate");
  assert.equal(parsed.args.of, "#42");
});

test("parses /park with until arg", () => {
  const parsed = parseSlashCommand("/park 2026-06-15 — after the brand refresh");
  assert.equal(parsed.name, "/park");
  assert.equal(parsed.args.until, "2026-06-15 — after the brand refresh");
});

test("parses /reopen with --skip-triage flag and reason", () => {
  const parsed = parseSlashCommand("/reopen --skip-triage flaky test came back");
  assert.equal(parsed.name, "/reopen");
  assert.equal(parsed.args.skipTriage, true);
  assert.equal(parsed.args.why, "flaky test came back");
});

test("parses /reopen without flag", () => {
  const parsed = parseSlashCommand("/reopen still happening for new users");
  assert.equal(parsed.name, "/reopen");
  assert.equal(parsed.args.skipTriage, false);
  assert.equal(parsed.args.why, "still happening for new users");
});

test("returns null for unknown commands", () => {
  assert.equal(parseSlashCommand("/nonexistent"), null);
});

test("ignores leading/trailing whitespace and case in command name", () => {
  const parsed = parseSlashCommand("  /Ready   ");
  assert.equal(parsed.name, "/ready");
});
