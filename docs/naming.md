# Pipeline naming schema

Authoritative naming convention for every pipeline-related artifact across all retainer orgs. New repos, Coolify apps, container services, and template folders should follow this schema; existing artifacts may keep their names under the carve-outs listed below.

## Schema

```
Template (canonical source):
    template-pipeline-<slug>             when a standalone repo
    templates/pipeline-<slug>/           when a folder under pipeline-core

Deployable source (built by Coolify):
    deploy/pipeline-<slug>/              when a folder under pipeline-core

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
| Runner-pool deployable source | `deploy/pipeline-runner-pool/` |
| Notion connector source (later) | `deploy/pipeline-notion-sync/` |
| The org GitHub App | `pipeline-bot` (automation identity — see Deployable sources) |

## Deployable sources

Issue #49 introduced a third artifact class that the original two-way template/instance split didn't cover: **in-repo source for a deployable unit that Coolify builds in place**. These differ from templates and need their own home.

### `deploy/pipeline-<slug>/` — built, not copied

```
templates/pipeline-<slug>/    canonical source that is COPIED into consumer repos
                              (caller shims, fleet config). Nothing builds it here.

deploy/pipeline-<slug>/       canonical source that is BUILT IN PLACE by Coolify
                              (a deployable unit: image, compose stack, worker).
                              Coolify points at this subfolder as its base dir.
```

The distinction is mechanical, not cosmetic:

- A `templates/` folder is a **donor**. Its files get distributed to other repos (e.g. fleet refresh writes `pipeline-add-to-project.yml` into each consumer). The folder itself is never deployed.
- A `deploy/` folder is a **build target**. Coolify is pointed at it (Base Directory `/deploy/pipeline-<slug>`, Watch Paths `deploy/pipeline-<slug>/**`) and builds only that subfolder, ignoring the rest of `pipeline-core`. The folder itself never gets copied anywhere.

Example: `deploy/pipeline-runner-pool/` holds `docker-compose.actions-runner.yml`, `runner.Dockerfile`, and its `README.md`. Coolify builds it; nothing copies it.

### Deployed instances keep the standard instance name

A `deploy/pipeline-<slug>/` source produces one branded Coolify app **per org**, named with the usual instance schema — `pipeline-<brand>-<slug>`. The `deploy/` prefix is a source-location convention only; it does **not** leak into the deployed name.

| Source (in repo) | Deployed instance (Coolify, per org) |
|---|---|
| `deploy/pipeline-runner-pool/` | `pipeline-haverford-runner-pool`, `pipeline-alx-runner-pool`, … |

All those apps point at the same repo + base dir, differing only by their per-org config (e.g. `RUNNER_OWNER`/`APP_LOGIN` and labels).

### Connector pattern — external sync workers

Connectors that sync pipeline state to an external system (Notion, etc.) are deployable sources too, with a target-named slug:

```
deploy/pipeline-<target>-sync/    →    pipeline-<brand>-<target>-sync
```

Example: `deploy/pipeline-notion-sync/` → `pipeline-haverford-notion-sync`. `<target>` is the external system being synced to (`notion`, not the tech inside). One source folder, one branded instance per org that opts in.

### `pipeline-bot` — automation identity, not an instance

The org-owned GitHub App is named **`pipeline-bot`** — flat, no brand segment. This is deliberate and is an explicit exception to the instance schema:

- It is **one** App, installed across all orgs (multi-install), not one App per org.
- It represents an **automation identity** (the credential the workflows and runner registration act under), not a deployed-per-brand instance.
- Therefore it is **NOT** `pipeline-<brand>-bot`. A brand segment would falsely imply one App per org and break the "single credential across all orgs" model.

(Fallback `pipeline-bot-lb` if the global App name is already taken — App names are globally unique on GitHub.)

### Runner labels

Self-hosted runner labels follow: `self-hosted, linux, retainer[, <brand>]`. The `<brand>` label is optional and only added when a job needs to target a specific org's pool; the base three are always present.

### runner-pool vs fleet — do not conflate

These are two different slugs for two different concerns. They live in different artifact classes and must not be merged:

| Concern | Slug | Class | Where | What it is |
|---|---|---|---|---|
| **Compute** | `runner-pool` | Deployable source | `deploy/pipeline-runner-pool/` | The self-hosted Actions runner pool that *runs* jobs (e.g. the fleet sweep) at $0 Actions minutes. |
| **Management / sweep** | `fleet` | Template | `templates/pipeline-fleet/` | The fleet state, managed-repos config, and sweep scripts that *manage* the 53 repos. |

The sweep (`fleet`) is work that *gets run on* the pool (`runner-pool`); the pool is the compute the sweep runs on. Same physical droplet, different jobs, different slugs. Never name a runner pool `…-fleet` or a fleet artifact `…-runner-pool`.

## Carve-outs

Two artifacts deliberately don't follow the schema and never will:

1. **`leebaroneau/pipeline-core`** keeps its canonical short name. It IS the framework brand. Renaming it to `template-pipeline-core` would obscure what it is the same way renaming "React" to "template-frontend-react" would.
2. **`<org>/.github`** is mandated by GitHub for org-default workflow location. The repo's *contents* are conceptually `pipeline-<brand>-fleet`, but the repo name itself cannot change.

A third name is an explicit exception rather than a carve-out: **`pipeline-bot`** (the GitHub App) is flat by design because it is a single multi-install automation identity, not a per-brand instance — see Deployable sources above.

## When this applies

| Artifact type | Apply the schema? |
|---|---|
| New GitHub repo | Yes |
| New Coolify app | Yes |
| New Docker service / container name (where you control it) | Yes |
| Deployable source folder inside `pipeline-core` | Yes — `deploy/pipeline-<slug>/` |
| Template (donor) folder inside `pipeline-core` | Yes — `templates/pipeline-<slug>/` |
| Folder inside a repo | Only top-level slug-style folders (e.g. `templates/pipeline-fleet/`, `deploy/pipeline-runner-pool/`); subfolders inside a repo don't need the `pipeline-` prefix because context makes it obvious |
| Workflow file inside a consumer repo (e.g. `pipeline-merge-gate.yml`) | Already follows a `pipeline-<slug>.yml` convention; keep it |

## When NOT to rename existing artifacts

Renaming carries real cost — broken refs, webhook re-targets, doc updates, deploy-config drift. Only rename existing artifacts when ALL of:

- The rename is cheap (single API call, no consumer rewiring, no incoming webhook changes)
- The current name is actively confusing or makes future artifacts harder to discover
- You're already touching the artifact for a separate reason

Otherwise: let existing names stand and apply the schema going forward.
