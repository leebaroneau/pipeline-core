import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLabelCatalog } from "../scripts/check-label-catalog.mjs";

function fakeGithub(liveLabels) {
  return {
    rest: {
      issues: {
        listLabelsForRepo: async () => ({ data: liveLabels.map((name) => ({ name })) }),
      },
    },
  };
}

test("checkLabelCatalog ok when declared and live match exactly", async () => {
  const declared = [{ name: "type:bug" }, { name: "status:triage" }];
  const github = fakeGithub(["type:bug", "status:triage"]);
  const result = await checkLabelCatalog({ github, owner: "x", repo: "y", declaredLabels: declared });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missingInLive, []);
  assert.deepEqual(result.extraInLive, []);
});

test("checkLabelCatalog reports missingInLive when a declared label isn't on the repo", async () => {
  const declared = [{ name: "type:bug" }, { name: "missing-on-repo" }];
  const github = fakeGithub(["type:bug"]);
  const result = await checkLabelCatalog({ github, owner: "x", repo: "y", declaredLabels: declared });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingInLive, ["missing-on-repo"]);
  assert.deepEqual(result.extraInLive, []);
});

test("checkLabelCatalog reports extraInLive when the repo has an undeclared label", async () => {
  const declared = [{ name: "type:bug" }];
  const github = fakeGithub(["type:bug", "ad-hoc-label"]);
  const result = await checkLabelCatalog({ github, owner: "x", repo: "y", declaredLabels: declared });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingInLive, []);
  assert.deepEqual(result.extraInLive, ["ad-hoc-label"]);
});

test("checkLabelCatalog reports both directions when both diverge", async () => {
  const declared = [{ name: "type:bug" }, { name: "declared-only" }];
  const github = fakeGithub(["type:bug", "live-only"]);
  const result = await checkLabelCatalog({ github, owner: "x", repo: "y", declaredLabels: declared });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingInLive, ["declared-only"]);
  assert.deepEqual(result.extraInLive, ["live-only"]);
});
