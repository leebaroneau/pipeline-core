import { test } from "node:test";
import assert from "node:assert/strict";

import { assertNoDiscoveryCandidates } from "../scripts/check-discovery-candidates.mjs";

test("assertNoDiscoveryCandidates: passes when discovery has no candidates", () => {
  const result = assertNoDiscoveryCandidates({
    owner: "OrgX",
    candidates: [],
    counts: { candidates: 0 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.candidateCount, 0);
});

test("assertNoDiscoveryCandidates: fails with actionable repo list when candidates exist", () => {
  assert.throws(
    () => assertNoDiscoveryCandidates({
      owner: "OrgX",
      candidates: [
        { owner: "OrgX", name: "new-api", visibility: "private", primaryLanguage: "TypeScript" },
        { owner: "OrgX", name: "data-dump", visibility: "private", primaryLanguage: null },
      ],
      counts: { candidates: 2 },
    }),
    (err) => {
      assert.match(err.message, /Unmanaged active repos found for OrgX/);
      assert.match(err.message, /OrgX\/new-api/);
      assert.match(err.message, /OrgX\/data-dump/);
      assert.match(err.message, /install Pipeline Core or add an explicit skip reason/);
      assert.equal(err.candidateCount, 2);
      return true;
    },
  );
});
