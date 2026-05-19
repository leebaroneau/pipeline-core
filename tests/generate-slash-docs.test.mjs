import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSlashDocs } from "../scripts/generate-slash-docs.mjs";
import { slashCommands } from "../scripts/lib/slash-commands.mjs";
import { checkSlashCommandDocs } from "../scripts/check-slash-command-docs.mjs";

test("buildSlashDocs: contains every enabled slash command in backtick form", () => {
  const docs = buildSlashDocs();
  for (const cmd of slashCommands) {
    if (cmd.status !== "enabled") continue;
    assert.ok(
      docs.includes(`\`${cmd.name}\``),
      `expected docs to mention \`${cmd.name}\` in backticks`,
    );
  }
});

test("buildSlashDocs: output satisfies checkSlashCommandDocs end-to-end", () => {
  const docs = buildSlashDocs();
  const result = checkSlashCommandDocs({
    commands: slashCommands,
    docs: { "docs/pipeline-core.md": docs },
  });
  assert.ok(result.ok, `expected check to pass; failures: ${result.failures.join("; ")}`);
});

test("buildSlashDocs: deterministic — two calls produce identical output", () => {
  assert.equal(buildSlashDocs(), buildSlashDocs());
});

test("buildSlashDocs: skips status='parsed-and-rejected' commands", () => {
  const docs = buildSlashDocs([
    { name: "/yes", status: "enabled", allowedFrom: ["X"], allowedActors: ["human"], targetState: "Y", description: "yes" },
    { name: "/no", status: "parsed-and-rejected", allowedFrom: ["X"], allowedActors: ["human"], targetState: "Z", description: "no" },
  ]);
  assert.ok(docs.includes("`/yes`"));
  assert.ok(!docs.includes("`/no`"));
});
