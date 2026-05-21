# Pipeline Core — System Architecture

| | |
|---|---|
| **Status** | Live as of 2026-05-21 (pipeline-core v1.1.0) |
| **Authoritative for** | The structure of the system: layers, components, flows, credentials, and what is or isn't part of it |
| **Audience** | A new contributor (or future-you) who needs to hold the system in their head |

> Pipeline Core is a **GitHub-Actions-native framework**. It does not replace GitHub Actions — it builds on top of it. Reading this doc is the fastest way to understand what is and isn't ours, and where each piece runs.

---

## 1. What Pipeline Core actually is

A set of reusable GitHub Actions workflows packaged as a versioned framework, plus the tooling to install them into a consumer repo and keep them in sync over time. When a PR opens on a consumer repo, GitHub fires reusable workflows hosted in `leebaroneau/pipeline-core`; those workflows enforce a uniform set of gates (branch naming, issue linkage, merge gate, label catalogue, slash commands, etc.). Each consumer repo carries thin caller workflows in `.github/workflows/pipeline-*.yml` — typically 10 lines each — that pin to `@v1` (floating major) and delegate the actual work upstream.

The "fleet" half of the system (`leebaroneau/pipeline-fleet` plus a `.github` repo in each retainer org) handles operations: which repos are managed, daily audits for drift, and patch cascades when a new pipeline-core version ships.

The runtime layer (Coolify apps on the Haverford droplet) handles compute: a self-hosted runner pool that picks up GitHub Actions jobs from the Haverford-Brands org, and a one-shot daily container that runs the fleet sweep.

## 2. The five layers

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Layer 1: FRAMEWORK                                                           │
│   leebaroneau/pipeline-core      18 reusable workflows + installer +         │
│                                  273-test self-CI + slash command docs       │
│                                  Releases drive @v1 floating tag             │
└──────────────────────────────────────────────────────────────────────────────┘
                                  ↑
                                  │ @v1 reference
                                  │
┌──────────────────────────────────────────────────────────────────────────────┐
│ Layer 2: CONTROL PLANE                                                       │
│   leebaroneau/pipeline-fleet     Retainer registry (config/orgs.json)        │
│                                  + push-patches.mjs (patch cascade)          │
│                                  + Docker Compose packages for runners       │
│                                  + leebaroneau's own fleet config            │
└──────────────────────────────────────────────────────────────────────────────┘
                                  ↑
                                  │ governs
                                  │
┌──────────────────────────────────────────────────────────────────────────────┐
│ Layer 3: FLEET REPOS (one per retainer org)                                  │
│   Haverford-Brands/.github       46 repos under management                   │
│   ALX-Finance/.github            2 repos                                     │
│   Genvest-Property/.github       3 repos                                     │
│   kwa-nguyen/.github             1 repo                                      │
│   (leebaroneau: no .github; pipeline-fleet IS its fleet, 2 repos)            │
└──────────────────────────────────────────────────────────────────────────────┘
                                  ↑
                                  │ tracks via config/repos.json
                                  │
┌──────────────────────────────────────────────────────────────────────────────┐
│ Layer 4: CONSUMER REPOS                                                      │
│   54 repos total carry .github/workflows/pipeline-*.yml callers              │
│   Each caller is ~10 lines and points at leebaroneau/pipeline-core/.../@v1   │
└──────────────────────────────────────────────────────────────────────────────┘
                                  ↑
                                  │ dispatches jobs to (GitHub Actions)
                                  │
┌──────────────────────────────────────────────────────────────────────────────┐
│ Layer 5: RUNTIME                                                             │
│   Haverford droplet · Coolify · 2 apps:                                      │
│     • actions-runner-haverford       2× ephemeral self-hosted runners        │
│     • pipeline-fleet-runner-haverford  daily fleet sweep (one-shot)          │
│   Droplet cron: /etc/cron.d/pipeline-fleet-runner-haverford  @ 22:00 UTC     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 3. Component reference

### 3.1 Framework — `leebaroneau/pipeline-core` (public)

- **What it owns:** 18 reusable GitHub Actions workflows in `.github/workflows/*.yml` (everything except `ci.yml` which is the repo's own internal CI), the installer (`scripts/install.mjs`), the doctor (`scripts/doctor.mjs`), discover, fleet-doctor, generate-templates, slash-command vocabulary, label catalogue, the test suite (273 tests at last count), and caller-workflow templates under `templates/`.
- **What changes here propagates everywhere:** every consumer repo on `@v1` picks up new releases on their next workflow run. A new minor like `v1.1.0` (which added the `runner` input) ships to 54 consumer repos with zero per-repo edits.
- **Self-CI:** `ci.yml` runs on every PR + push to main. It is NOT a reusable workflow — it doesn't have a `workflow_call` trigger. It tests this repo's own code so a regression in v1.x doesn't quietly poison every consumer.
- **Releases drive `@v1`:** `v1.0.x` and `v1.1.x` are annotated tags. `v1` is a floating major tag that always points at the latest stable. Consumers pin `@v1`. Floating tag is force-moved on each release.

### 3.2 Control plane — `leebaroneau/pipeline-fleet` (public)

- **Retainer registry:** `config/orgs.json` lists every org pipeline-core manages, their lifecycle status (`self`, `active`, `inactive`), and which pinned version (if any) they're frozen at.
- **Patch cascade:** `scripts/push-patches.mjs` reads the registry, fetches caller-workflow templates from a chosen pipeline-core ref, and opens PRs on each active retainer's consumer repos to refresh their callers.
- **Runner packages:** Two Docker Compose files:
  - `docker-compose.coolify.yml` — the one-shot fleet sweep runner.
  - `docker-compose.actions-runner.yml` — the long-running ephemeral GitHub Actions runner pool.
- **leebaroneau's own fleet:** unlike other retainers, leebaroneau doesn't have a separate `.github` repo. Its `config/repos.json` lives here. By design — pipeline-fleet is the platform-owner's repo.

### 3.3 Fleet repos — `<retainer>/.github` (private, one per retainer)

Each retainer has a `.github` repo with the same shape:

- `config/repos.json` — list of consumer repos under management for this retainer.
- `config/skip.json` — repos to exclude from audits.
- `state/results.json` — last fleet sweep audit results.
- `README.md` — auto-rendered tracker showing each managed repo's status (OK / warn / fail).
- `.github/workflows/fleet.yml` — caller for pipeline-core's reusable `fleet.yml`. On Haverford this is `workflow_dispatch:`-only (the cron moved to Coolify). On other retainers it's still cron-scheduled.

The `FLEET_PAT` secret on each `.github` repo gives the fleet runner permission to commit state updates back.

### 3.4 Consumer repos — the 54 (mostly private)

Each managed repo has, somewhere in `.github/workflows/`:

- 16 `pipeline-*.yml` caller workflows (a subset, depending on which features are enabled per repo).
- `.github/pipeline-config.yml` — per-repo config (label catalogue, reviewer policy, slash commands, branching rules).
- `.github/labeler.yml` — auto-labeling rules.
- `docs/pipeline-core.md` — generated slash-command reference.

Each `pipeline-*.yml` caller is ~10 lines. None of them contain logic — they just `uses: leebaroneau/pipeline-core/.github/workflows/<x>.yml@v1` with a `with:` block of inputs. The actual logic lives upstream.

### 3.5 Runtime — Coolify apps on the Haverford droplet

| App | UUID | Lifecycle | Purpose |
|---|---|---|---|
| `actions-runner-haverford` | `n4nk5f910zvdn5xtsy9qf264` | Long-running, `restart: unless-stopped` | 2 ephemeral runner containers. Each registers as a self-hosted runner with Haverford-Brands org, picks up one job, exits, then auto-restarts clean. |
| `pipeline-fleet-runner-haverford` | `amh9g4786u2d3g34c5nxsdw3` | One-shot, `restart: "no"` | Runs daily at 22:00 UTC. Clones Haverford-Brands/.github, clones pipeline-core@v1, runs fleet-doctor + discover + update-tracker, commits state back. |
| Droplet cron `/etc/cron.d/pipeline-fleet-runner-haverford` | n/a | System cron | At 22:00 UTC, `curl POST $COOLIFY_API_URL/api/v1/deploy?uuid=$APP` re-launches the one-shot fleet runner. |

Other retainers (ALX, Genvest, kwa-nguyen, leebaroneau-own) currently still run their fleet sweep on GitHub Actions cron — they haven't been migrated. They also have no self-hosted runner pool. Their consumer callers carry an explicit `runner: '["ubuntu-latest"]'` override so v1.1.0's self-hosted default doesn't break them.

## 4. Lifecycle: a single PR's CI run, end to end

This is the most useful mental model to hold. **Pipeline Core does not replace GitHub Actions.** It uses GitHub Actions everywhere — for events, dispatch, status reporting, branch protection. The only thing that changed in v1.1.0 is *where the compute runs*. Everything else (triggers, hooks, statuses, the Actions UI) is identical to any other GitHub Actions repo.

Trace through a PR on `Haverford-Brands/Catnets.sg`:

```
[Developer]      git push origin feature-branch
                 gh pr create
                       │
                       ▼
[GitHub]         Receives push. Detects pull_request event. Looks at
                 Catnets.sg/.github/workflows/pipeline-*.yml callers.
                 Each caller declares `on: pull_request: types: [opened, ...]`.
                       │
                       ▼
                 For each matching caller, GitHub queues a workflow run.
                 The caller says: `uses: leebaroneau/pipeline-core/.github/
                 workflows/branch-name.yml@v1` — so GitHub fetches that
                 reusable workflow at the @v1 tag (currently v1.1.0).
                       │
                       ▼
                 The reusable workflow declares `jobs.check.runs-on:
                 ${{ fromJSON(inputs.runner) }}`. Default is
                 ["self-hosted", "retainer"]. So GitHub looks for an
                 idle runner registered to Haverford-Brands org with
                 BOTH labels self-hosted AND retainer.
                       │
                       ▼
[Coolify droplet]  runner-2 container (idle, labels include both) is matched.
                   GitHub dispatches the job to it. Runner pulls the job
                   spec, checks out the caller repo + checks out pipeline-core
                   at the resolved ref, runs the reusable workflow's steps.
                       │
                       ▼
                   The check-branch-name.mjs script runs. It posts a
                   commit status `pipeline/branch-name` (success/failure)
                   to GitHub via the github-script action.
                       │
                       ▼
                   Job ends. The runner-2 container exits with status 0.
                   Docker's restart: unless-stopped fires; a brand-new
                   runner-2 container spawns, registers as a fresh runner
                   instance, returns to idle. (Ephemeral pattern: no
                   state from PR #100 can leak into PR #101.)
                       │
                       ▼
[GitHub]         Receives the commit status. Updates the PR's check list.
                 If branch protection requires `pipeline/branch-name`
                 to be green, GitHub blocks merge until it passes.
                       │
                       ▼
[Developer]      Sees the red/green tick on the PR in the GitHub UI.
                 Identical UX to any other GitHub Actions setup.
```

**Key insight: every arrow in that diagram is GitHub Actions.** The only thing that changed when v1.1.0 shipped is which physical machine handled the "runner picks up the job" step. Before: a GitHub-hosted Ubuntu VM (counts against the org's billing quota). After: a Docker container on the Haverford droplet (free for private repos). Same workflow file, same triggers, same status checks, same branch protection rules, same Actions log UI.

## 5. GitHub Actions vs. self-hosted runner — who does what

A common source of confusion. The split is precise:

| Concern | GitHub Actions does it | Self-hosted runner does it |
|---|---|---|
| Receives webhook events (push, PR open, comment, schedule) | ✅ | |
| Parses `.github/workflows/*.yml` files | ✅ | |
| Decides which workflows fire for an event | ✅ | |
| Resolves `uses: <org>/<repo>/<path>@<ref>` references | ✅ | |
| Queues jobs and matches them to runners by labels | ✅ | |
| Maintains the Actions UI (logs, retry buttons, history) | ✅ | |
| Receives commit status updates and writes to the PR | ✅ | |
| Enforces branch protection rules | ✅ | |
| Computes who can dispatch a workflow (`workflow_dispatch` permission) | ✅ | |
| **Actually runs the job's shell commands** | | ✅ |
| Provides the OS environment for the job (Ubuntu, Node, git, etc.) | | ✅ |
| Holds repository contents during checkout | | ✅ |
| Reports stdout/stderr lines back to GitHub for the log UI | | ✅ |

Notice the asymmetry: GitHub does ten things, the runner does four. The runner is "rented compute." The rest is GitHub's. When we say we "moved off GitHub Actions," what we actually mean is we moved the right column — the compute — from GitHub's Ubuntu VMs onto our droplet. The left column — orchestration — never moved.

## 6. Why hooks/triggers don't need to change

A reasonable question: "If we're running our own infrastructure, shouldn't we be receiving webhooks ourselves and dispatching jobs ourselves?" No. That's a different architecture entirely (self-hosted CI like Drone, Jenkins, Buildkite, or rolling your own). It would mean:

- Setting up our own webhook receiver.
- Maintaining a job queue.
- Writing PR commit statuses back to GitHub via the REST API.
- Building or reusing a UI to show job logs.
- Wiring branch protection against our own status names.
- Managing concurrency, retries, secrets, caching, all from scratch.

We don't want that. We want everything GitHub gives us for free — the UI, the status check integration, the branch protection wiring, the events, the log streaming, the secret handling — and we just want to pay GitHub less for the rented compute under it. That's what self-hosted runners are designed for. We register a runner with GitHub, GitHub keeps dispatching, we just provide the machine that picks up the dispatched jobs.

So: **the pipeline reacts to the same hooks and triggers as any GitHub Actions setup.** Pull request open. Push. Comment. Workflow dispatch. Schedule cron. The "self-hosted" half just means GitHub looks for a runner with our labels instead of using one of its own.

The one exception in our stack is the daily fleet sweep on Haverford-Brands. That used to be a `schedule: cron` trigger on a GitHub-Actions-hosted runner. We disabled the schedule on that workflow and replaced it with a droplet-level cron that calls Coolify's deploy API directly. So that one daily job DOES bypass GitHub Actions entirely — but it doesn't need GitHub's orchestration (it doesn't write commit statuses on a PR; it just runs an audit and pushes a commit). It's the exception that proves the rule.

## 7. Credentials in play

| Secret | Where | Scope | Purpose |
|---|---|---|---|
| `FLEET_PAT` | `Haverford-Brands/.github` GH Actions secret + Coolify env on pipeline-fleet-runner-haverford | `repo` + `read:org` | Fleet runner clones + pushes back to `Haverford-Brands/.github` |
| `haverford-coolify-actions-runner` | Coolify env on actions-runner-haverford + your local `.env` | `admin:org` | The runner pool's PAT for registering with the org |
| `COOLIFY_API_TOKEN` | `haverford-brands/.env` (local-only) | Coolify-side, not GitHub | Lets the platform owner manage Coolify apps via API |

All three are classic PATs at present. Each is tracked for migration to a GitHub App in the follow-up issues (`leebaroneau/pipeline-fleet#6` for FLEET_PAT, `#13` for the runner pool PAT).

## 8. What is NOT Pipeline Core

For mental separation:

- **Paperclip** + **Hermes** (the agent platform). Separate Coolify apps. Separate concern. Pipeline Core's audit happens to know they exist (they're in `config/repos.json`) but the pipeline doesn't run their CI; it audits whether their caller workflows are present and pinned correctly.
- **The product code** in `service-Auth-Gate`, `Marketing-Ops`, `app-Gateway`, `service-Haverford-Dev-API`, the Catnets storefronts, etc. These are consumers OF the pipeline; they're not in the pipeline.
- **lee-dashboard** — the workspace/index repo. Consumes pipeline-core via 16 caller workflows but isn't part of the framework.
- **The 16 caller workflow files** inside each consumer repo's `.github/workflows/pipeline-*.yml`. They are *generated* artifacts of `scripts/install.mjs`. Owned upstream by pipeline-core. Consumer repos don't normally edit them — they get updated via `push-patches.mjs` when pipeline-core releases a new version.

## 9. Operational runbooks

| Action | Reference |
|---|---|
| Deploy the runner pool on a new retainer's Coolify | `leebaroneau/pipeline-fleet/docs/self-hosted-runner-pool.md` |
| Deploy the fleet sweep runner on a new retainer's Coolify | `leebaroneau/pipeline-fleet/docs/retainer-hosted-fleet-runner.md` |
| Onboard a new consumer repo to the pipeline | `leebaroneau/pipeline-core/scripts/install.mjs --repo <repo>` |
| Audit which repos drifted from upstream | Trigger the fleet workflow manually: `gh workflow run "Fleet — doctor + discover" --repo <retainer>/.github` |
| Cut a new pipeline-core release | Tag `v1.X.Y` annotated, force-move `v1` floating tag, publish GitHub release with notes |
| Rotate a FLEET_PAT or runner PAT | See `docs/self-hosted-runner-pool.md` §Token Rotation in pipeline-fleet |
| Decommission a retainer | See `docs/retainer-hosted-fleet-runner.md` §Offboarding in pipeline-fleet |

## 10. Roadmap

Active and queued work, by repo:

- `leebaroneau/pipeline-fleet#6` — harden FLEET_PAT scope (classic → fine-grained → GitHub App)
- `leebaroneau/pipeline-fleet#12` — runner pool health watchdog cron
- `leebaroneau/pipeline-fleet#13` — runner pool GitHub App migration (pairs with #6)
- `leebaroneau/pipeline-fleet#14` — pin `myoung34/github-runner` to a specific image tag (currently `:latest`)
- `leebaroneau/pipeline-core#24` — Notion sync for GitHub project visibility (Haverford ops)
- `leebaroneau/pipeline-core#25` — move Spec 3 handoff doc out of lee-dashboard
