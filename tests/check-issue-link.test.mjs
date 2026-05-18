import assert from "node:assert/strict";
import test from "node:test";

import { extractIssueRefs, checkIssueLink, ISSUE_LINK_REGEX } from "../scripts/check-issue-link.mjs";

test("ISSUE_LINK_REGEX matches all GitHub closing keywords", () => {
  for (const kw of ["Closes", "Fixes", "Resolves", "Refs", "closes", "FIXES"]) {
    const text = `${kw} #42 and other text`;
    const match = text.match(ISSUE_LINK_REGEX);
    assert.ok(match, `should match "${kw} #42"`);
  }
});

test("extractIssueRefs returns all referenced issue numbers", () => {
  const body = "This PR resolves a long-standing issue.\n\nCloses #42 and Refs #7.";
  const refs = extractIssueRefs(body);
  assert.deepEqual(refs.sort((a, b) => a - b), [7, 42]);
});

test("extractIssueRefs returns empty array on no refs", () => {
  assert.deepEqual(extractIssueRefs("just a regular PR description"), []);
});

test("extractIssueRefs deduplicates", () => {
  const body = "Closes #42 Refs #42 Fixes #42";
  assert.deepEqual(extractIssueRefs(body), [42]);
});

test("extractIssueRefs ignores cross-repo refs like owner/repo#42 (for now)", () => {
  // Spec 2 only handles same-repo refs; cross-repo is out of scope.
  const body = "Closes leebaroneau/lee-dashboard#42";
  // The pattern matches "#42" portion. We accept this as a same-repo ref.
  // If cross-repo handling is needed later, update the regex and this test.
  assert.deepEqual(extractIssueRefs(body), [42]);
});

test("checkIssueLink returns ok=true when at least one ref present", () => {
  const result = checkIssueLink("Closes #42");
  assert.equal(result.ok, true);
  assert.deepEqual(result.refs, [42]);
});

test("checkIssueLink returns ok=false with helpful message when no refs", () => {
  const result = checkIssueLink("This PR fixes something. Reviewers: please look at the new gateway.");
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /Closes #N|Refs #N/);
});

test("checkIssueLink handles null and undefined body", () => {
  assert.equal(checkIssueLink(null).ok, false);
  assert.equal(checkIssueLink(undefined).ok, false);
  assert.equal(checkIssueLink("").ok, false);
});
