import assert from "node:assert/strict";
import test from "node:test";

import { PERMISSION_RANK, hasMinimumPermission, getActorPermission } from "../scripts/lib/permissions.mjs";

test("PERMISSION_RANK orders GitHub permissions correctly", () => {
  assert.ok(PERMISSION_RANK.admin > PERMISSION_RANK.maintain);
  assert.ok(PERMISSION_RANK.maintain > PERMISSION_RANK.write);
  assert.ok(PERMISSION_RANK.write > PERMISSION_RANK.triage);
  assert.ok(PERMISSION_RANK.triage > PERMISSION_RANK.read);
  assert.ok(PERMISSION_RANK.read > PERMISSION_RANK.none);
});

test("hasMinimumPermission returns true for equal or higher permission", () => {
  assert.equal(hasMinimumPermission("admin", "triage"), true);
  assert.equal(hasMinimumPermission("maintain", "triage"), true);
  assert.equal(hasMinimumPermission("write", "triage"), true);
  assert.equal(hasMinimumPermission("triage", "triage"), true);
});

test("hasMinimumPermission returns false for lower permission", () => {
  assert.equal(hasMinimumPermission("read", "triage"), false);
  assert.equal(hasMinimumPermission("none", "triage"), false);
});

test("hasMinimumPermission handles unknown permission as none", () => {
  assert.equal(hasMinimumPermission("bogus", "triage"), false);
});

test("getActorPermission queries the GitHub API and returns permission string", async () => {
  const github = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async ({ owner, repo, username }) => {
          assert.equal(owner, "o");
          assert.equal(repo, "r");
          assert.equal(username, "alice");
          return { data: { permission: "write" } };
        },
      },
    },
  };
  const perm = await getActorPermission({ github, owner: "o", repo: "r", username: "alice" });
  assert.equal(perm, "write");
});

test("getActorPermission returns 'none' when API throws 404", async () => {
  const github = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async () => {
          const err = new Error("Not Found");
          err.status = 404;
          throw err;
        },
      },
    },
  };
  const perm = await getActorPermission({ github, owner: "o", repo: "r", username: "stranger" });
  assert.equal(perm, "none");
});
