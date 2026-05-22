# Pipeline naming schema

Authoritative naming convention for every pipeline-related artifact across all retainer orgs. New repos, Coolify apps, container services, and template folders should follow this schema; existing artifacts may keep their names under the carve-outs listed below.

## Schema

```
Template (canonical source):
    template-pipeline-<slug>             when a standalone repo
    templates/pipeline-<slug>/           when a folder under pipeline-core

Instance (deployed / branded):
    pipeline-<brand>-<slug>              repos, Coolify apps, containers, services
```

### Field rules

- **`<slug>`** is what the artifact *does*, not what tech it uses. Examples: `core`, `fleet`, `runner-pool`, `consumer-shim`, `ci`.
- **`<brand>`** is the short brand slug, not the full GitHub org name. Examples: `haverford`, `alx`, `genvest`, `kwa`, `leebaroneau`.
- All lowercase. Hyphens between words. No underscores.

### Worked examples

| Concept | Schema name |
|---|---|
| Framework repo | `leebaroneau/pipeline-core` (canonical brand — see carve-outs) |
| Lee's own fleet repo | `leebaroneau/pipeline-fleet` |
| Haverford runner pool (Coolify) | `pipeline-haverford-runner-pool` |
| Hypothetical ALX runner pool | `pipeline-alx-runner-pool` |
| Hypothetical Haverford CI cache | `pipeline-haverford-ci-cache` |
| Fleet template folder | `templates/pipeline-fleet/` |
| Consumer-shim template folder | `templates/pipeline-consumer-shim/` |

## Carve-outs

Two artifacts deliberately don't follow the schema and never will:

1. **`leebaroneau/pipeline-core`** keeps its canonical short name. It IS the framework brand. Renaming it to `template-pipeline-core` would obscure what it is the same way renaming "React" to "template-frontend-react" would.
2. **`<org>/.github`** is mandated by GitHub for org-default workflow location. The repo's *contents* are conceptually `pipeline-<brand>-fleet`, but the repo name itself cannot change.

## When this applies

| Artifact type | Apply the schema? |
|---|---|
| New GitHub repo | Yes |
| New Coolify app | Yes |
| New Docker service / container name (where you control it) | Yes |
| Folder inside a repo | Only top-level slug-style folders (e.g. `templates/pipeline-fleet/`); subfolders inside a repo don't need the `pipeline-` prefix because context makes it obvious |
| Workflow file inside a consumer repo (e.g. `pipeline-merge-gate.yml`) | Already follows a `pipeline-<slug>.yml` convention; keep it |

## When NOT to rename existing artifacts

Renaming carries real cost — broken refs, webhook re-targets, doc updates, deploy-config drift. Only rename existing artifacts when ALL of:

- The rename is cheap (single API call, no consumer rewiring, no incoming webhook changes)
- The current name is actively confusing or makes future artifacts harder to discover
- You're already touching the artifact for a separate reason

Otherwise: let existing names stand and apply the schema going forward.
