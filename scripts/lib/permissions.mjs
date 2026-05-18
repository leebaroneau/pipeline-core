// GitHub collaborator permission helpers.
// Permission hierarchy (lowest → highest): none < read < triage < write < maintain < admin

export const PERMISSION_RANK = {
  none: 0,
  read: 1,
  triage: 2,
  write: 3,
  maintain: 4,
  admin: 5,
};

export function hasMinimumPermission(actual, required) {
  const a = PERMISSION_RANK[actual] ?? PERMISSION_RANK.none;
  const r = PERMISSION_RANK[required] ?? PERMISSION_RANK.none;
  return a >= r;
}

export async function getActorPermission({ github, owner, repo, username }) {
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
      owner, repo, username,
    });
    return data.permission;
  } catch (err) {
    if (err.status === 404) {
      return "none";
    }
    throw err;
  }
}
