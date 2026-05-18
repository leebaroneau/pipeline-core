#!/usr/bin/env node

// PR-body issue-link validator. Spec 2 §6.2.
// Accepts GitHub's standard closing keywords plus "Refs" (non-closing reference).

export const ISSUE_LINK_REGEX = /\b(closes|fixes|resolves|refs)\s+(?:[a-z0-9-]+\/[a-z0-9-_.]+)?#(\d+)/gi;

export function extractIssueRefs(body) {
  if (typeof body !== "string" || body.length === 0) return [];
  const refs = new Set();
  for (const match of body.matchAll(ISSUE_LINK_REGEX)) {
    refs.add(parseInt(match[2], 10));
  }
  return [...refs].sort((a, b) => a - b);
}

export function checkIssueLink(body) {
  const refs = extractIssueRefs(body);
  if (refs.length === 0) {
    return {
      ok: false,
      refs: [],
      reasons: [
        "PR body must reference an issue with `Closes #N`, `Fixes #N`, `Resolves #N`, or `Refs #N`. See https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue",
      ],
    };
  }
  return { ok: true, refs, reasons: [] };
}
