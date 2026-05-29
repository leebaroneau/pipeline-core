# Runner-pool consolidation & one-repo pipeline — design

> **SUPERSEDED (2026-05-30):** The runner-pool consolidation was reverted in favour of keyless GitHub-hosted runners. Haverford runs the pipeline on GitHub-hosted at ~0 billable minutes; the GitHub App + Coolify added key-management overhead for no benefit. The deploy/pipeline-runner-pool/ artifacts were removed (restorable from PR #50). Self-host a specific heavy repo only if it threatens the Actions minute cap.

- **Date:** 2026-05-29
- **Status:** Draft for review
- **Owner:** Lee
- **Repo:** `leebaroneau/pipeline-core`
- **Related issues:** #46 (epic: org-owned GitHub App), #47 (App tokens for add-to-project + fleet), #42/#43 (add-to-project, shipped), #24 (Notion visibility, later)

## Problem

Pipeline tooling is spread across multiple repos and concepts that have to be held in
your head separately: the core reusable workflows (`pipeline-core`), the runner pool
and fleet state (`pipeline-fleet`), the project-sync worker (`notion-github-sync`), and
the consumer templates. The goal is **one repo** that holds everything needed to run the
pipeline, so the "shape" is defined once and never re-remembered, and so a single thing
can be pointed at Coolify to build only the part that needs building.

Two hard requirements surfaced during design:

1. **Everything must filter to one org Project board**, in sync with all issues across all
   repos and orgs, so work is trackable on one page.
2. **Self-hosted runners must stay** — they exist to reduce GitHub Actions minutes (the
   fleet sweep clones+doctors 53 repos on a schedule; agent PR volume is high). Self-hosted
   runners bill $0 Actions minutes; only the droplet costs, and droplets already exist.

## Goals

- Consolidate the runner-pool deploy artifacts into `pipeline-core` so the repo is
  self-contained and Coolify-deployable from a subfolder.
- Authenticate runner registration via an org-owned GitHub App (`pipeline-bot`),
  removing the personal `admin:org` PAT.
- Keep the one-page tracking working: every issue lands on one org Project board.
- Align all naming under the existing `docs/naming.md` schema; extend the schema to cover
  the new artifact classes (deploy folders, the App, connectors).

## Non-goals (YAGNI)

- **Notion mirror / connector** (`deploy/pipeline-notion-sync/`, #24) — deferred. The org
  Project board is the page for now. The connector is a later, opt-in addition that follows
  the same monorepo-deploy pattern.
- **Dissolving the rest of `pipeline-fleet`** (its fleet state, managed-repos config, sweep
  scripts) — out of scope. This design moves only the *deployable* runner artifacts. The
  remainder is a separate decision.
- **Renaming `pipeline-core`** — carve-out in the naming schema; it stays.
- **Migrating workflow API calls to App tokens (Layer B, #47)** — separate PR. This design
  covers runner *registration* auth only.

## Current state

Already shipped (do not rebuild):

- `.github/workflows/add-to-project.yml` + `templates/pipeline-consumer-shim/pipeline-add-to-project.yml`
  (PR #43). Adds issues to an org Project board on open/reopen. Targets the board by **URL**
  (`vars.ADD_TO_PROJECT_URL`), authed by `secrets.ADD_TO_PROJECT_PAT`. Per-repo override via
  `org_project.url` in `pipeline-config.yml`. `runner` input defaults to
  `["self-hosted", "retainer"]`.
- Fleet refresh write-mode (#45) — distributes missing caller shims to managed repos.
- `docs/naming.md` — the naming schema (PR #43/#31).

Separate today (to be consolidated / left, per scope):

- `leebaroneau/pipeline-fleet` holds `docker-compose.actions-runner.yml` +
  `runner.Dockerfile` (the deployable) **and** fleet state/config/sweep scripts (left).
- `leebaroneau/notion-github-sync` holds the project-sync worker (deferred).

## Architecture

Two layers, decoupled. The container is *not* the thing that manages all repos — the
workflows + the App are.

### Layer 1 — management (covers all repos/orgs, zero containers)

- Pipeline gate + sync workflows run on **GitHub-hosted** runners by default.
- **One GitHub App, `pipeline-bot`**, installed across all orgs — the single credential the
  workflows use to act across every repo/org.
- **One org Project board** is the page. The `add-to-project` workflow funnels every issue
  to it. Board title is user-chosen and **not** a pipeline artifact (the workflow references
  the board by URL only); it is out of the naming schema's scope.

### Layer 2 — compute (self-hosted runners, opt-in, per-org)

- A GitHub Actions runner registers to **one scope** (repo / org / enterprise); it cannot
  span orgs. So self-hosted runners are **per-org**, one pool per org.
- Within an org, one pool serves **all** repos in that org.
- Deployed from `pipeline-core/deploy/pipeline-runner-pool/` to each retainer's existing
  Coolify/droplet. Marginal infra cost ≈ $0 (droplets are sunk cost); the win is $0 Actions
  minutes on the minute-heavy jobs (the fleet sweep).
- Only orgs with a real minute-burn driver get a pool. Everything else stays GitHub-hosted.

### Authentication

Two credentials, two jobs:

| Credential | Used for | Why this one |
|---|---|---|
| GitHub App `pipeline-bot` | Runner registration (`APP_ID`/`APP_PRIVATE_KEY`/`APP_LOGIN`); later, Layer-B workflow tokens (#47) | Org-owned, scoped, rotating; no personal PAT |
| Classic PAT (`repo` + `project`) | Cross-org Project board writes (`ADD_TO_PROJECT_PAT`) | **Only** single token that spans multiple orgs — see constraint below |

**Cross-org board constraint (load-bearing).** `actions/add-to-project` needs one token that
can both *read the issue* (its repo's org) and *write the board* (the board's org). A GitHub
App installation token and a fine-grained PAT are each scoped to **one** org. The only single
token that spans all orgs you belong to is a **classic PAT** (`repo` + `project`). This is why
#47 (pure-App add-to-project) is still open. For a solo operator writing to their own
board across their own orgs, a classic PAT as an org secret is the accepted answer; the
"kill personal PATs" goal (#46) targets org automation, not a personal tracking board.

### Coolify deploy mechanism

Point Coolify at `pipeline-core`; it builds only the runner-pool subfolder, ignores the rest:

| Coolify field | Value | Effect |
|---|---|---|
| Build Pack | Docker Compose | compose app |
| Base Directory | `/deploy/pipeline-runner-pool` | build context root; rest of repo invisible |
| Docker Compose Location | `docker-compose.actions-runner.yml` | relative to base dir |
| Watch Paths | `deploy/pipeline-runner-pool/**` | pushes only redeploy on changes here; `scripts/`, `.github/`, `templates/`, `docs/`, `tests/` changes do **not** trigger a rebuild |

Gotchas:
- Compose `build.context: .` resolves to the base directory; `runner.Dockerfile` sits beside
  the compose. Works after the move.
- App private key (`.pem`, multiline) and all secrets go in as **Coolify app vars**
  (set in the UI), never stored in the compose. Reference required vars as
  `${VAR:?reason}`; never use `${VAR:-default}` — Coolify's parser mangles the `:-`
  fallback form and seeds the default as the single editable value.
- No custom `networks:` in compose — breaks Traefik.
- One Coolify app per org; all point at the same repo + base dir, differing only by
  `RUNNER_OWNER`/`APP_LOGIN` + labels.

## Naming

Aligned to `docs/naming.md` (extended by this work):

| Artifact | Name |
|---|---|
| The repo | `pipeline-core` (carve-out; unchanged) |
| Runner-pool source (in repo) | `deploy/pipeline-runner-pool/` |
| Runner-pool deployed (Coolify) | `pipeline-<brand>-runner-pool` |
| Fleet sweep template | `templates/pipeline-fleet/` (unchanged — sweep ≠ runner) |
| Connector source (later) | `deploy/pipeline-notion-sync/` → `pipeline-<brand>-notion-sync` |
| GitHub App | `pipeline-bot` (one App, multi-install; fallback `pipeline-bot-lb` if taken) |
| Project-sync secret / var | `ADD_TO_PROJECT_PAT` / `ADD_TO_PROJECT_URL` (kept — established contract) |
| Runner labels | `self-hosted, linux, retainer[, <brand>]` |

`docs/naming.md` gains a section codifying: `deploy/pipeline-<slug>/` for deployable source
folders, the `pipeline-<target>-sync` connector pattern, and the `pipeline-bot` App.

## Components (this PR)

`pipeline-core/deploy/pipeline-runner-pool/`:

1. **`docker-compose.actions-runner.yml`** — two ephemeral runner services. Registration via
   GitHub App: `APP_ID`, `APP_PRIVATE_KEY`, `APP_LOGIN` (replacing `ACCESS_TOKEN`),
   `RUNNER_SCOPE=org`, `ORG_NAME=${RUNNER_OWNER}`, `LABELS` default
   `self-hosted,linux,retainer`. `EPHEMERAL=true`, `restart: unless-stopped`.
2. **`runner.Dockerfile`** — `myoung34/github-runner:latest` + `docker.io` CLI (parser only;
   no `docker.sock` mount). Verbatim from `pipeline-fleet`.
3. **`README.md`** — Coolify settings table (above) + ported runbook: verify, scale (add a
   `runner-N` block), App-key rotation, decommission, failure handling.

Plus: **`docs/naming.md`** — extended with the new artifact classes.

## Data flow

1. Issue opened in any managed repo → `pipeline-add-to-project` shim fires →
   `add-to-project.yml` resolves the board URL (repo config or org var) → adds the issue to
   the org board using the classic PAT. Runs on hosted (override) or self-hosted.
2. Scheduled fleet sweep → runs on the self-hosted pool (per org) → $0 Actions minutes.
3. Runner container boots → uses `pipeline-bot` App creds → mints an org registration token →
   registers ephemeral runner → runs one job → exits → restarts clean.

## Sequencing

The add-to-project shim defaults `runs-on` to `["self-hosted", "retainer"]`. If distributed
before a pool is online, those jobs queue forever. Decouple:

1. **Board live now:** distribute the shim with `runner: '["ubuntu-latest"]'` override (the
   add-to-project job is seconds — negligible minutes). Board works immediately, no container.
2. **Runner pool for the sweep:** deploy `pipeline-runner-pool` where minutes actually burn,
   and route the sweep (and any heavy gates) to it.

## Implementation scope

**This PR (pipeline-core, code):** the 4 files above. Issue → branch
`task/<#>-consolidate-runner-pool-deploy` → PR with `Fixes #<#>` (pipeline workflow).

**Parallel setup (Lee, no code):**
- Create `pipeline-bot` App (Org perms: Self-hosted runners RW; +Contents/Issues/PRs for
  Layer B later), install on each org, generate the private key.
- Create the org Project board.
- Mint the classic PAT (`repo` + `project`); set `ADD_TO_PROJECT_PAT` + `ADD_TO_PROJECT_URL`
  per org.
- Run fleet refresh write-mode to distribute the add-to-project shim.

**Follow-ups (separate PRs):** retire the runner artifacts from `pipeline-fleet`
(its own repo); Layer-B App tokens (#47); Notion connector (#24).

## Testing / verification

- `docker compose -f deploy/pipeline-runner-pool/docker-compose.actions-runner.yml config`
  parses clean.
- After Coolify deploy: two runners appear Idle at
  `https://github.com/organizations/<org>/settings/actions/runners`; a job targeting
  `runs-on: [self-hosted, retainer]` flips one to Active, completes, container restarts.
- Watch Paths verified: a push touching only `scripts/` does not trigger a Coolify redeploy.
- An issue opened in a managed repo appears on the org board within a minute.

## Risks / open questions

- `pipeline-bot` global name may be taken → fallback `pipeline-bot-lb`.
- GitHub App org permission for runner registration is "Self-hosted runners: RW"; if the
  registration-token endpoint 403s on some org config, also grant "Administration: RW".
- Image pinned to `myoung34/github-runner:latest` — pin a tag if upstream breaks.
