# {{OWNER}} — Pipeline Core fleet

This `.github` repo houses {{OWNER}}'s fleet of Pipeline Core consumers. The daily cron audits every repo listed in `config/repos.json`, suggests new ones, and updates the tracker below.

## Status

<!-- pipeline-fleet:tracker-start -->
_No repos under management yet. Add entries to `config/repos.json` and the next daily run will populate this table._
<!-- pipeline-fleet:tracker-end -->

_Updated by: `scripts/update-tracker.mjs`. Last updated: never._

## How this works

- **`.github/workflows/fleet.yml`** — daily cron + `workflow_dispatch`. Calls `leebaroneau/pipeline-core/.github/workflows/fleet.yml@v1`, scoped to this org.
- **`config/repos.json`** — allowlist of repos under management. Add a row to start auditing a new repo.
- **`config/skip.json`** — denylist of repos intentionally excluded. Add a row to silence discovery alerts for repos that don't need pipeline-core.
- **`state/results.json`** — last fleet-doctor sweep output. Committed back by the cron.
- **`state/discovery.json`** — last discovery sweep output (unmanaged repos in this org).

## Manual operations

```bash
# Trigger an immediate sweep without waiting for the cron:
gh workflow run "Fleet — doctor + discover" --repo {{OWNER}}/.github

# Discover-only (find new repos but don't audit existing):
gh workflow run "Fleet — doctor + discover" --repo {{OWNER}}/.github -f mode=discover
```

## Auth

The cron needs a `FLEET_PAT` secret on this repo: a Personal Access Token (Classic) with `repo`, `read:org`, and `workflow` scopes, scoped to {{OWNER}}.
