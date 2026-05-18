import assert from "node:assert/strict";
import test from "node:test";

import { checkBranchName, BRANCH_NAME_REGEX } from "../scripts/check-branch-name.mjs";

test("BRANCH_NAME_REGEX matches valid patterns", () => {
  assert.match("bug/42-fix-login", BRANCH_NAME_REGEX);
  assert.match("story/100-checkout-flow", BRANCH_NAME_REGEX);
  assert.match("task/7-refactor-router", BRANCH_NAME_REGEX);
  assert.match("spike/15-evaluate-libs", BRANCH_NAME_REGEX);
  assert.match("experiment/1-domain-labels", BRANCH_NAME_REGEX);
  assert.match("epic/9-payments", BRANCH_NAME_REGEX);
});

test("BRANCH_NAME_REGEX rejects invalid patterns", () => {
  assert.doesNotMatch("main", BRANCH_NAME_REGEX);
  assert.doesNotMatch("feature/42", BRANCH_NAME_REGEX);             // unknown type
  assert.doesNotMatch("bug/fix-login", BRANCH_NAME_REGEX);          // missing issue #
  assert.doesNotMatch("bug/42", BRANCH_NAME_REGEX);                 // missing slug
  assert.doesNotMatch("bug/42-", BRANCH_NAME_REGEX);                // empty slug
  assert.doesNotMatch("Bug/42-fix", BRANCH_NAME_REGEX);             // uppercase type
  assert.doesNotMatch("bug/42-Fix-Login", BRANCH_NAME_REGEX);       // uppercase slug
  assert.doesNotMatch("bug/42-fix_login", BRANCH_NAME_REGEX);       // underscore not allowed
});

test("checkBranchName returns ok=true for valid branch", () => {
  const result = checkBranchName("bug/42-fix-login");
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});

test("checkBranchName returns ok=false with reason for invalid branch", () => {
  const result = checkBranchName("feature/bad");
  assert.equal(result.ok, false);
  assert.ok(result.reasons.length > 0);
  assert.match(result.reasons[0], /<type>\/<issue-#>-<slug>/);
});
