import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  requireExplicitPermissions,
  noBroadContentsWrite,
  noUnknownSecrets,
  pinnedReusableWorkflowVersions,
  workflowNameConvention,
  referencedScriptsExist,
  ALLOWLIST_CONTENTS_WRITE,
} from "../scripts/lib/workflow-lint-rules.mjs";
import { parseWorkflowFile } from "../scripts/lib/workflow-yaml.mjs";

const FIX = join(import.meta.dirname, "fixtures");
const good = () => parseWorkflowFile(join(FIX, "good-workflow.yml"));
const badNoPerm = () => parseWorkflowFile(join(FIX, "bad-no-permissions.yml"));
const badContents = () => parseWorkflowFile(join(FIX, "bad-contents-write.yml"));
const badSecret = () => parseWorkflowFile(join(FIX, "bad-unknown-secret.yml"));
const badUnpinned = () => parseWorkflowFile(join(FIX, "bad-unpinned-version.yml"));
const badMissing = () => parseWorkflowFile(join(FIX, "bad-missing-script.yml"));

// requireExplicitPermissions
test("requireExplicitPermissions passes when every job has permissions", () => {
  const result = requireExplicitPermissions(good(), { filename: "good-workflow.yml" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("requireExplicitPermissions fails when a job lacks permissions", () => {
  const result = requireExplicitPermissions(badNoPerm(), { filename: "bad-no-permissions.yml" });
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /example.*missing permissions/i);
});

// noBroadContentsWrite
test("noBroadContentsWrite passes on contents:read", () => {
  const result = noBroadContentsWrite(good(), { filename: "good-workflow.yml" });
  assert.equal(result.ok, true);
});

test("noBroadContentsWrite fails on contents:write outside allowlist", () => {
  const result = noBroadContentsWrite(badContents(), { filename: "bad-contents-write.yml" });
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /contents: write.*allowlist/i);
});

test("noBroadContentsWrite passes on contents:write inside allowlist", () => {
  const wf = badContents();
  const result = noBroadContentsWrite(wf, { filename: "pipeline-labels-sync.yml" });
  assert.equal(result.ok, true);
});

test("ALLOWLIST_CONTENTS_WRITE includes pipeline-labels-sync", () => {
  assert.ok(ALLOWLIST_CONTENTS_WRITE.includes("pipeline-labels-sync"));
});

// noUnknownSecrets
test("noUnknownSecrets passes when only GITHUB_TOKEN is used", () => {
  const result = noUnknownSecrets(good(), { filename: "good-workflow.yml" });
  assert.equal(result.ok, true);
});

test("noUnknownSecrets fails when non-GITHUB_TOKEN secret is referenced", () => {
  const result = noUnknownSecrets(badSecret(), { filename: "bad-unknown-secret.yml" });
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /NOT_GITHUB_TOKEN/);
});

// pinnedReusableWorkflowVersions
test("pinnedReusableWorkflowVersions passes when no reusable-workflow uses", () => {
  const result = pinnedReusableWorkflowVersions(good(), { filename: "good-workflow.yml" });
  assert.equal(result.ok, true);
});

test("pinnedReusableWorkflowVersions fails on @main", () => {
  const result = pinnedReusableWorkflowVersions(badUnpinned(), { filename: "bad-unpinned-version.yml" });
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /@main.*unpinned/i);
});

test("pinnedReusableWorkflowVersions passes on @v1", () => {
  const wf = { jobs: { caller: { uses: "org/repo/.github/workflows/x.yml@v1" } } };
  const result = pinnedReusableWorkflowVersions(wf, { filename: "passing.yml" });
  assert.equal(result.ok, true);
});

test("pinnedReusableWorkflowVersions passes on @v1.2.3", () => {
  const wf = { jobs: { caller: { uses: "org/repo/.github/workflows/x.yml@v1.2.3" } } };
  const result = pinnedReusableWorkflowVersions(wf, { filename: "passing.yml" });
  assert.equal(result.ok, true);
});

// workflowNameConvention
test("workflowNameConvention passes when filename and name match", () => {
  const result = workflowNameConvention(good(), { filename: "pipeline-good-example.yml" });
  assert.equal(result.ok, true);
});

test("workflowNameConvention accepts bare filename (no pipeline- prefix)", () => {
  const result = workflowNameConvention(good(), { filename: "triage-gate.yml" });
  assert.equal(result.ok, true);
});

test("workflowNameConvention fails when filename has uppercase or weird chars", () => {
  const result = workflowNameConvention(good(), { filename: "Triage_Gate.yml" });
  assert.equal(result.ok, false);
});

// referencedScriptsExist
test("referencedScriptsExist passes when referenced scripts exist", () => {
  const result = referencedScriptsExist(good(), {
    filename: "good-workflow.yml",
    scriptExists: () => true,
  });
  assert.equal(result.ok, true);
});

test("referencedScriptsExist fails when referenced script does not exist", () => {
  const result = referencedScriptsExist(badMissing(), {
    filename: "bad-missing-script.yml",
    scriptExists: (p) => !p.endsWith("does-not-exist.mjs"),
  });
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /does-not-exist\.mjs/);
});

test("noUnknownSecrets dedupes the same unknown secret used multiple times", () => {
  const wf = {
    jobs: {
      a: {
        permissions: { contents: "read" },
        env: { K1: "${{ secrets.MY_KEY }}", K2: "${{ secrets.MY_KEY }}" },
      },
      b: {
        permissions: { contents: "read" },
        env: { K3: "${{ secrets.MY_KEY }}" },
      },
    },
  };
  const result = noUnknownSecrets(wf, { filename: "x.yml" });
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
});

test("noUnknownSecrets treats lowercase github_token as allowed", () => {
  const wf = {
    jobs: {
      a: {
        permissions: { contents: "read" },
        env: { GH: "${{ secrets.github_token }}" },
      },
    },
  };
  const result = noUnknownSecrets(wf, { filename: "x.yml" });
  assert.equal(result.ok, true);
});

test("noUnknownSecrets catches lowercase unknown secrets", () => {
  const wf = {
    jobs: {
      a: {
        permissions: { contents: "read" },
        env: { GH: "${{ secrets.my_pat }}" },
      },
    },
  };
  const result = noUnknownSecrets(wf, { filename: "x.yml" });
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /my_pat/);
});

test("requireExplicitPermissions accepts workflow-level permissions", () => {
  const wf = parseWorkflowFile(join(FIX, "good-workflow-toplevel-permissions.yml"));
  const result = requireExplicitPermissions(wf, { filename: "pipeline-top-level.yml" });
  assert.equal(result.ok, true);
});

test("workflowNameConvention accepts 'Pipeline — ' capitalisation", () => {
  const wf = parseWorkflowFile(join(FIX, "good-workflow-toplevel-permissions.yml"));
  const result = workflowNameConvention(wf, { filename: "pipeline-top-level.yml" });
  assert.equal(result.ok, true);
});

test("workflowNameConvention accepts 'Pipeline - ' (ASCII hyphen)", () => {
  const wf = { name: "Pipeline - hyphen variant", jobs: {} };
  const result = workflowNameConvention(wf, { filename: "pipeline-hyphen.yml" });
  assert.equal(result.ok, true);
});

test("workflowNameConvention still fails on completely unrelated name", () => {
  const wf = { name: "Some Other Name", jobs: {} };
  const result = workflowNameConvention(wf, { filename: "pipeline-x.yml" });
  assert.equal(result.ok, false);
});
