# pipeline-runner-pool

Self-hosted, ephemeral **GitHub Actions runner pool** for a retainer org, deployed
from this repo via Coolify. The orchestration layer (workflows, commit statuses,
branch protection, the org Project board) stays on GitHub; only the **CI compute**
moves onto a retainer's existing droplet.

**Why it exists:** self-hosted runners bill **$0 GitHub Actions minutes**. The only
cost is the droplet, which is already a sunk cost on each retainer. The minute-heavy
driver is the scheduled fleet sweep (clone + doctor 53 repos) plus high agent PR
volume; routing those jobs to a self-hosted pool keeps hosted minutes at zero.

**Opt-in, per org.** A GitHub Actions runner registers to exactly **one scope**
(repo / org / enterprise) and cannot span orgs, so pools are **per-org** — one pool
serves all repos in that org. Only orgs with a real minute-burn driver get a pool;
everything else stays on GitHub-hosted runners. Each pool is **one Coolify app**
(`pipeline-<brand>-runner-pool`), and all apps point at the **same repo + base dir**,
differing only by `RUNNER_OWNER` / `APP_LOGIN` and labels.

This folder contains:

- `docker-compose.actions-runner.yml` — two ephemeral runner services (`runner-1`,
  `runner-2`). Each registers with the org on boot, runs exactly one job, exits, and
  is auto-restarted clean.
- `runner.Dockerfile` — `myoung34/github-runner:latest` plus the `docker.io` Debian
  package (CLI parser only) so jobs that validate compose files (`docker compose
  config`) can run on the pool. The Docker daemon socket is **not** mounted — that
  would give every CI job effective root on the host. The CLI binary alone is harmless
  without a reachable daemon.
- `README.md` — this file.

## Coolify deploy settings

Point Coolify at `pipeline-core`. With the settings below it builds **only** this
subfolder and ignores the rest of the repo.

| Coolify field | Value | Effect |
| :---- | :---- | :---- |
| Build Pack | `Docker Compose` | Treats the resource as a compose app. |
| Base Directory | `/deploy/pipeline-runner-pool` | Build context root; the rest of the repo is invisible to the build. `build.context: .` in the compose resolves to this dir, where `runner.Dockerfile` sits. |
| Docker Compose Location | `docker-compose.actions-runner.yml` | Relative to the base directory. |
| Watch Paths | `deploy/pipeline-runner-pool/**` | Pushes redeploy **only** on changes here. Changes to `scripts/`, `.github/`, `templates/`, `docs/`, `tests/` do **not** trigger a rebuild. |

Notes:

- Do **not** add a custom `networks:` block to the compose — it breaks Traefik.
- After editing any app var in the Coolify UI, trigger a **fresh deploy** (not just a
  restart). Runtime injection happens via the regenerated `.env` at container start.

## Required Coolify app vars

Set these in the Coolify app's **Environment Variables** UI. They are runtime-injected:
every value appears as a `${VAR}` token in the compose so Coolify auto-detects, seeds,
and gates each one. Required vars use the `${VAR:?...}` form so a deploy **fails fast**
(rather than launching a broken container) if Coolify has not injected a value.

| Var | Required | Set to | Notes |
| :---- | :---- | :---- | :---- |
| `APP_ID` | yes | `pipeline-bot` numeric App ID | The JWT `iss` claim. |
| `APP_PRIVATE_KEY` | yes | `pipeline-bot` private key — **full PEM contents** | NOT a file path. The literal `-----BEGIN ... PRIVATE KEY----- ... -----END ... PRIVATE KEY-----` block, newlines preserved. Tick **Multiline** + **Literal** so newlines and `$` survive intact. |
| `APP_LOGIN` | yes | The org login the App is installed on | Equals the org in `RUNNER_OWNER`. Set explicitly to avoid an installation-lookup miss if the org's GitHub login differs in casing/value from `RUNNER_OWNER`. |
| `RUNNER_OWNER` | yes | The retainer org name (e.g. `Haverford-Brands`) | Becomes `ORG_NAME`; the runner registration endpoint is `…/orgs/${RUNNER_OWNER}/actions/runners/registration-token`. Also forms each runner name (`${RUNNER_OWNER}-runner-1`, `-runner-2`). |
| `RUNNER_LABELS` | yes | `self-hosted,linux,retainer` (pool default), or append the brand, e.g. `self-hosted,linux,retainer,haverford` | Gated with `${RUNNER_LABELS:?...}`. **Required** because the pipeline workflows target `runs-on: [self-hosted, retainer]` — if the pool registered with empty/missing labels, those jobs would queue forever. We do not use `${VAR:-default}` (Coolify's parser mangles the `:-` form). |

**Do NOT set `ACCESS_TOKEN` or `RUNNER_TOKEN`.** The App-auth flow *produces* the
access token internally: `myoung34/github-runner` mints a short-lived org registration
token from `APP_ID` / `APP_PRIVATE_KEY` / `APP_LOGIN` at boot. Supplying your own token
conflicts with that flow.

> **Warning — never use `${VAR:-default}` in the compose, and never store a secret value
> in the file.** Coolify resolves the `:-` default at parse time and seeds it as the single
> editable value in the UI, and its parser has real bugs mangling the `:-` fallback form
> (capturing the trailing `}`, choking on `:- . /` characters) that break deploys. Reference
> required values with `${VAR:?reason}` (require-gating only — it seeds nothing), and set
> every value in the Coolify UI. Secrets (the PEM) live only in the UI, never in the
> committed compose.

## GitHub App setup (pointer)

Registration auth is the org-owned GitHub App **`pipeline-bot`** (one App, multi-install),
replacing the personal `admin:org` PAT.

- **Org permission:** **Self-hosted runners → Read and write**
  (`organization_self_hosted_runners: write`). This is what the registration-token
  endpoint requires.
- **Fallback:** if the registration-token endpoint 403s on some org config, also grant
  **Administration → Read and write** (broader; the classic repo-admin path).
- **Install per org:** install `pipeline-bot` on each org that gets a pool, then generate
  the private key (used as `APP_PRIVATE_KEY`).

(See `docs/specs/2026-05-29-runner-pool-consolidation-design.md` and `docs/naming.md`
for the full App rationale and naming schema.)

## Runbook

### Verify

After the first Coolify deploy:

1. Two runners appear at
   `https://github.com/organizations/<org>/settings/actions/runners`, named
   `<RUNNER_OWNER>-runner-1` and `<RUNNER_OWNER>-runner-2`. (The name comes from
   `RUNNER_OWNER`, the GitHub org name — distinct from the short brand slug in the
   Coolify app name.)
2. Both are **Idle** initially.
3. Submit a job targeting `runs-on: [self-hosted, retainer]`. One runner flips to
   **Active**, completes the job, and the container auto-restarts clean.
4. **Watch Paths check:** a push touching only `scripts/` (outside this folder) does
   **not** trigger a Coolify redeploy.

You can also validate the compose locally before deploy:

```bash
docker compose -f deploy/pipeline-runner-pool/docker-compose.actions-runner.yml config
```

### Scale

Each runner uses ~1 CPU + ~1.5 GiB RAM during a job.

- **Add a slot:** copy the `runner-2` service block to a new `runner-3` block, change
  the `RUNNER_NAME` suffix to `${RUNNER_OWNER}-runner-3`, commit, push. Coolify
  auto-deploys.
- **Remove a slot:** delete the service block, commit, push. Coolify auto-deploys and
  the removed runner deregisters on shutdown.

### App private-key rotation

The `pipeline-bot` private key (`APP_PRIVATE_KEY`) should be rotated on a schedule or
on any suspected compromise:

1. In the GitHub App settings for `pipeline-bot`, **generate a new private key** (and
   delete the old one). `APP_ID` and `APP_LOGIN` do not change.
2. In each affected org's Coolify app, update the `APP_PRIVATE_KEY` var with the new
   full PEM contents. Keep **Multiline** + **Literal** ticked.
3. **Redeploy** the Coolify app (not just restart — env updates only re-inject on a
   fresh deploy). Both runners restart and re-register using a fresh installation token
   minted from the new key.

### Decommission

If a retainer no longer needs a self-hosted pool:

1. Update consumer caller workflows to pass `runner: '["ubuntu-latest"]'` (or rely on
   pipeline-core's `runner` input fallback). Use the fleet refresh write-mode to fan
   out the change so queued jobs move back to hosted runners.
2. Stop the Coolify app (Settings → Stop).
3. Deregister both runners at
   `https://github.com/organizations/<org>/settings/actions/runners` (or let them age
   out — once stopped, GitHub eventually marks them Offline).
4. If this was the last pool using `pipeline-bot` on that org, remove the App
   installation. The private key need only be revoked if it is no longer used anywhere.

### Failure handling

| Symptom | Mitigation |
| :---- | :---- |
| Both runners offline | Coolify usually auto-restarts within ~60s. If not, trigger a **redeploy** from the Coolify UI (or `GET /api/v1/deploy?uuid=<app-uuid>`) — this regenerates the `.env` with the injected app vars. A manual `docker compose up -d` over SSH fails the `:?` gates: those vars exist only in Coolify's generated `.env`, not a plain shell. |
| One runner stuck | `docker restart <runner-container-name>`. Ephemeral mode (`EPHEMERAL=true`) makes restart safe — it re-registers a fresh runner. |
| Deploy fails fast with `APP_ID is required` / `APP_PRIVATE_KEY is required` / `RUNNER_OWNER is required` | A required app var is unset in Coolify. Set it (PEM as Multiline+Literal) and redeploy. The `:?` gate is doing its job — it stopped a broken container from launching. |
| Registration 403 / token endpoint forbidden | `pipeline-bot` is missing **Self-hosted runners: Read and write** on the org, or not installed on that org. Grant the permission (fallback: also add **Administration: RW**) and redeploy. |
| App private key expired / rotated out | Rotate per **App private-key rotation** above. |
| Deploy fails fast with `RUNNER_LABELS is required` | `RUNNER_LABELS` is unset in Coolify. Set it (e.g. `self-hosted,linux,retainer,<brand>`) and redeploy. The `:?` gate prevents a pool registering with empty labels — which would silently queue every `[self-hosted, retainer]` job. |
| Runner registers but jobs still queue | `RUNNER_LABELS` is missing `retainer` (or a typo). The workflows target `runs-on: [self-hosted, retainer]`; fix the value in the Coolify UI and redeploy. |
| Workflow broken on self-hosted but works on hosted | Edit the affected consumer caller to pass `runner: '["ubuntu-latest"]'`, then investigate and ship a pipeline-core fix separately. |
| Image (`myoung34/github-runner:latest`) breaks unexpectedly | Pin `runner.Dockerfile`'s `FROM` to a known-good tag instead of `:latest`. |

## One pool per org

A pool serves exactly one org. To run pools for multiple orgs, create **one Coolify app
per org** — all pointing at the **same repo + base directory** (`/deploy/pipeline-runner-pool`)
— and differ only by:

- `RUNNER_OWNER` (and matching `APP_LOGIN`) — the org each pool registers to.
- `RUNNER_LABELS` — typically appending the brand (e.g. `…,retainer,haverford`).

The Coolify app name follows the schema `pipeline-<brand>-runner-pool` (e.g.
`pipeline-haverford-runner-pool`). See `docs/naming.md` in this repo for the full schema.