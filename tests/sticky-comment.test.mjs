import assert from "node:assert/strict";
import test from "node:test";

import { postOrUpdateSticky, deleteSticky } from "../scripts/lib/sticky-comment.mjs";

function makeMockGithub({ comments = [] } = {}) {
  const calls = { create: [], update: [], delete: [] };
  return {
    calls,
    rest: {
      issues: {
        listComments: async () => ({ data: comments }),
        createComment: async (params) => {
          calls.create.push(params);
          const created = { id: 9000 + calls.create.length, body: params.body };
          comments.push(created);
          return { data: created };
        },
        updateComment: async (params) => {
          calls.update.push(params);
          const target = comments.find((c) => c.id === params.comment_id);
          if (target) target.body = params.body;
          return { data: target };
        },
        deleteComment: async (params) => {
          calls.delete.push(params);
          const idx = comments.findIndex((c) => c.id === params.comment_id);
          if (idx >= 0) comments.splice(idx, 1);
        },
      },
    },
  };
}

test("postOrUpdateSticky creates comment when none with marker exists", async () => {
  const github = makeMockGithub({ comments: [{ id: 1, body: "unrelated comment" }] });
  await postOrUpdateSticky({
    github, owner: "o", repo: "r", issue_number: 7,
    marker: "<!-- pipeline:results-warning -->",
    body: "Add ## Results to the linked issue.",
  });
  assert.equal(github.calls.create.length, 1);
  assert.equal(github.calls.update.length, 0);
  assert.match(github.calls.create[0].body, /^<!-- pipeline:results-warning -->/);
  assert.match(github.calls.create[0].body, /Add ## Results/);
});

test("postOrUpdateSticky updates existing comment when marker matches", async () => {
  const github = makeMockGithub({
    comments: [
      { id: 1, body: "<!-- pipeline:results-warning -->\n\nold message" },
    ],
  });
  await postOrUpdateSticky({
    github, owner: "o", repo: "r", issue_number: 7,
    marker: "<!-- pipeline:results-warning -->",
    body: "new message",
  });
  assert.equal(github.calls.create.length, 0);
  assert.equal(github.calls.update.length, 1);
  assert.match(github.calls.update[0].body, /new message/);
  assert.equal(github.calls.update[0].comment_id, 1);
});

test("postOrUpdateSticky is no-op when body identical", async () => {
  const identical = "<!-- pipeline:results-warning -->\n\nstable message";
  const github = makeMockGithub({ comments: [{ id: 1, body: identical }] });
  await postOrUpdateSticky({
    github, owner: "o", repo: "r", issue_number: 7,
    marker: "<!-- pipeline:results-warning -->",
    body: "stable message",
  });
  assert.equal(github.calls.create.length, 0);
  assert.equal(github.calls.update.length, 0);
});

test("postOrUpdateSticky distinguishes markers", async () => {
  const github = makeMockGithub({
    comments: [{ id: 1, body: "<!-- pipeline:merge-gate-failure -->\n\nmerge gate msg" }],
  });
  await postOrUpdateSticky({
    github, owner: "o", repo: "r", issue_number: 7,
    marker: "<!-- pipeline:results-warning -->",
    body: "results msg",
  });
  // Different marker → creates new comment, doesn't touch the merge-gate one
  assert.equal(github.calls.create.length, 1);
  assert.equal(github.calls.update.length, 0);
});

test("deleteSticky removes comment when marker matches", async () => {
  const github = makeMockGithub({
    comments: [
      { id: 1, body: "<!-- pipeline:results-warning -->\n\nold" },
      { id: 2, body: "unrelated" },
    ],
  });
  await deleteSticky({
    github, owner: "o", repo: "r", issue_number: 7,
    marker: "<!-- pipeline:results-warning -->",
  });
  assert.equal(github.calls.delete.length, 1);
  assert.equal(github.calls.delete[0].comment_id, 1);
});

test("deleteSticky is no-op when marker not found", async () => {
  const github = makeMockGithub({ comments: [{ id: 1, body: "unrelated" }] });
  await deleteSticky({
    github, owner: "o", repo: "r", issue_number: 7,
    marker: "<!-- pipeline:results-warning -->",
  });
  assert.equal(github.calls.delete.length, 0);
});
