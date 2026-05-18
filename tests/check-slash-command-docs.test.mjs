import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSlashCommandDocs } from "../scripts/check-slash-command-docs.mjs";

test("checkSlashCommandDocs ok when every enabled command is documented", () => {
  const commands = [
    { name: "/grab", status: "enabled" },
    { name: "/release", status: "enabled" },
  ];
  const docs = { "README.md": "Documented: `/grab` and `/release`." };
  const result = checkSlashCommandDocs({ commands, docs });
  assert.equal(result.ok, true);
});

test("checkSlashCommandDocs ignores disabled commands", () => {
  const commands = [
    { name: "/grab", status: "enabled" },
    { name: "/parked", status: "parsed-and-rejected" },
  ];
  const docs = { "README.md": "Documented: `/grab`." };
  const result = checkSlashCommandDocs({ commands, docs });
  assert.equal(result.ok, true);
});

test("checkSlashCommandDocs reports missing documentation", () => {
  const commands = [
    { name: "/grab", status: "enabled" },
    { name: "/release", status: "enabled" },
  ];
  const docs = { "README.md": "Documented: `/grab`." };
  const result = checkSlashCommandDocs({ commands, docs });
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /\/release.*undocumented/i);
});

test("checkSlashCommandDocs accepts docs across multiple files", () => {
  const commands = [
    { name: "/grab", status: "enabled" },
    { name: "/release", status: "enabled" },
  ];
  const docs = {
    "README.md": "Documented: `/grab`.",
    "00_resources/pipeline-core/README.md": "Also: `/release`.",
  };
  const result = checkSlashCommandDocs({ commands, docs });
  assert.equal(result.ok, true);
});
