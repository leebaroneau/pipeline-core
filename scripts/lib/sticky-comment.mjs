// Sticky-comment helper. Idempotent post-or-update of a single comment per (issue, marker).
// Markers are HTML comments (invisible in rendered Markdown) used to locate the sticky on later events.
// See spec §11.2 for the marker registry.

export async function postOrUpdateSticky({ github, owner, repo, issue_number, marker, body }) {
  if (!marker.startsWith("<!--") || !marker.endsWith("-->")) {
    throw new Error(`Sticky marker must be an HTML comment: ${marker}`);
  }
  const fullBody = `${marker}\n\n${body}`;

  const { data: comments } = await github.rest.issues.listComments({
    owner, repo, issue_number, per_page: 100,
  });
  const existing = comments.find((c) => c.body && c.body.startsWith(marker));

  if (existing) {
    if (existing.body === fullBody) {
      return existing.id; // no change
    }
    await github.rest.issues.updateComment({
      owner, repo, comment_id: existing.id, body: fullBody,
    });
    return existing.id;
  }

  const { data: created } = await github.rest.issues.createComment({
    owner, repo, issue_number, body: fullBody,
  });
  return created.id;
}

export async function deleteSticky({ github, owner, repo, issue_number, marker }) {
  const { data: comments } = await github.rest.issues.listComments({
    owner, repo, issue_number, per_page: 100,
  });
  const existing = comments.find((c) => c.body && c.body.startsWith(marker));
  if (existing) {
    await github.rest.issues.deleteComment({
      owner, repo, comment_id: existing.id,
    });
  }
}
