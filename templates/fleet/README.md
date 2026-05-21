# {{OWNER}} — Pipeline Core fleet

This `.github` repo houses {{OWNER}}'s fleet of Pipeline Core consumers. Preferred runtime: deploy `leebaroneau/pipeline-fleet` as a retainer-hosted Coolify runner. This `.github` workflow remains as a manual fallback only, so scheduled sweeps do not run in both GitHub Actions and Coolify.

## Status

<!-- pipeline-fleet:tracker-start -->
_No repos under management yet. Add entries to `config/repos.json`; the retainer-hosted runner or a manual fallback run will populate this table._
<!-- pipeline-fleet:tracker-end -->

_Updated by: `scripts/update-tracker.mjs`. Last updated: never._

## How this works

- **`.github/workflows/fleet.yml`** — manual `workflow_dispatch` fallback. Calls `leebaroneau/pipeline-core/.github/workflows/fleet.yml@v1`, scoped to this org.
- **`config/repos.json`** — allowlist of repos under management. Add a row to start auditing a new repo.
- **`config/skip.json`** — denylist of repos intentionally excluded. Add a row to silence discovery alerts for repos that don't need pipeline-core.
- **`state/results.json`** — last fleet-doctor sweep output. Updated by the retainer-hosted runner or manual fallback workflow.
- **`state/discovery.json`** — last discovery sweep output (unmanaged repos in this org).

## Manual operations

```bash
# Trigger a manual fallback sweep:
gh workflow run "Fleet — doctor + discover" --repo {{OWNER}}/.github

# Discover-only (find new repos but don't audit existing):
gh workflow run "Fleet — doctor + discover" --repo {{OWNER}}/.github -f mode=discover
```

## Auth

The manual fallback workflow needs a `FLEET_PAT` secret on this repo: a Personal Access Token (Classic) with `repo` and `read:org` scopes, scoped to {{OWNER}}.
