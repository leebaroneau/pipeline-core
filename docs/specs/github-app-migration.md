# Spec: migrate fleet auth from personal PATs to an org-owned GitHub App

Status: planned · Tracking: #46 (epic), #47 (workflow refactor)

## Problem

All pipeline-core fleet automation currently authenticates with personal access tokens bound to the `@leebaroneau` personal account:

- `FLEET_PAT` — cross-repo clone / discover / refresh (fleet sweep)
- `ADD_TO_PROJECT_PAT` — org ProjectV2 write (issue → roadmap auto-add)

This couples org automation to one person's account (offboarding/disable kills the fleet), uses long-lived broad-scope classic PATs, and recently leaked a token via a misnamed org secret. A single org-owned GitHub App fixes all three.

## Goal

One GitHub App ("pipeline-bot"), org-owned, installed per org on the managed repo set, replacing both PATs and the Coolify runner's token. Short-lived (1h) installation tokens minted at runtime; least-privilege scoped permissions; no personal-account dependency.

> GitHub constraint: you cannot drive 5 orgs' events/schedules from one repo. Each org keeps a thin `.github` caller shim. The achievable end state is **one source template (pipeline-core) + generated thin shims + one App + zero personal PATs** — not literally one repo.

## Verified App permission set

Adversarially verified against GitHub docs + the pipeline-core code paths.

| Scope | Permission | Level | Why |
|---|---|---|---|
| Repository | Metadata | read | baseline |
| Repository | Contents | write | fleet refresh: clone + push branches |
| Repository | Issues | read+write | refresh: create tracking issues; **read is mandatory for add-to-project on PRIVATE repos** (else "Resource not accessible by integration") |
| Repository | Pull requests | read+write | refresh: open PRs |
| Repository | **Administration** | **read** | doctor's branch-protection check (`GET /repos/{o}/{r}/branches/{b}/protection`). Classic PAT carried this implicitly; the App will not unless granted — omitting it flips every private repo's audit to red on cutover |
| Organization | Projects | read+write | add-to-project ProjectV2 write |
| Organization | Members | read | discover: list org repos / read:org |

- **Install scope:** selected repositories (the managed set in each org's `repos.json`), not "all repos" — smaller workflow-exfiltration surface.
- **Subscribed events:** issues (opened, reopened).

## Runtime mechanism

Each reusable workflow mints a token with `actions/create-github-app-token@v3`, scoped to the caller's owner:

```yaml
- name: Mint App token
  id: app-token
  if: ${{ inputs.app-id != '' }}
  continue-on-error: true            # a failed mint must NOT abort the job
  uses: actions/create-github-app-token@v3
  with:
    app-id: ${{ inputs.app-id }}                       # from vars.PIPELINE_BOT_APP_ID
    private-key: ${{ secrets.PIPELINE_BOT_PRIVATE_KEY }}
    owner: ${{ github.repository_owner }}              # owner-scoped → spans installed repos
```

Consumers then use `${{ steps.app-token.outputs.token || secrets.<PAT> }}`. The fallback only works because the mint step is `continue-on-error` — see Cutover trap #1.

- App ID is non-secret → org **variable** `PIPELINE_BOT_APP_ID`.
- Private key is sensitive → org **secret** `PIPELINE_BOT_PRIVATE_KEY`.

## Cutover traps (must-fix, from adversarial review)

1. **`|| PAT` does not catch a failed mint.** When `create-github-app-token` errors (App not installed, missing permission, key/ID mismatch, propagation lag) the step *fails and the job aborts* — `||` only falls back on an empty string, never a failed step. The mint step **must** be `continue-on-error: true`, and the App must be installed + permissioned **before** the private key is stored in an org (so the mint isn't enabled against a not-yet-ready App).
2. **Do not move `v1` early.** `refresh.mjs` distributes consumer shims pinned `@v1` and itself runs `@v1`. Moving `v1` to the App-aware commit flips all 5 orgs' auth and redistributes the App-forwarding shim org-wide at once. Cut `v1.x`, pin only the pilot org, and move `v1` at final cutover.
3. **The live daily sweep is the Coolify `pipeline-fleet` container, not Actions.** The GitHub `fleet.yml` is a manual `workflow_dispatch` fallback. The scheduled sweep runs on the Coolify retainer runner consuming `FLEET_PAT` via its own env. Migrating `fleet.yml` alone does **not** migrate the live sweep. Decision: **keep the container, swap its `FLEET_PAT` env for an App installation token** (option A), and prove it green for 2–3 daily cycles before revoking the classic PAT.

## Security posture

- **Better than PATs:** org-owned (survives offboarding), 1h auto-rotated tokens, least-privilege, bot-attributable in audit log.
- **Residual risk — key concentration:** the same private key in 5 org secret stores means a compromise of any one org's secrets (or a malicious workflow in any installed repo) can mint tokens for all 5 by enumerating installations. Mitigations: install on selected repos only; restrict org-secret read access; consider splitting into two Apps along a trust boundary (e.g. Lee-controlled orgs vs client orgs) if warranted.
- **Rotation must be atomic + verified:** generate new key → update all org secrets → confirm mint with new key in each org → delete old key from App settings → confirm old key no longer mints. GitHub allows multiple active keys, so an un-deleted old key stays valid. Script this in the runbook.

## Migration sequence

1. **Refactor** reusable workflows + shims to mint App tokens with `continue-on-error` + PAT fallback (#47). Merge — inert until an org is configured.
2. Cut a **`v1.x`** tag for the App-aware commit (do **not** move `v1`).
3. **Create the App**, install on the **pilot** org (selected repos). Verify Projects:write end-to-end from a **private** repo **before** storing the key.
4. Store `PIPELINE_BOT_APP_ID` (var) + `PIPELINE_BOT_PRIVATE_KEY` (secret) in the pilot org; pin the pilot org's shims `@v1.x`.
5. **Soak:** confirm private-repo add-to-project + branch-protection read are green for 2–3 cycles. Diff `results.json` against the last PAT run — no new `403`s.
6. **Swap the Coolify `pipeline-fleet` runner's `FLEET_PAT` env → App token;** soak the daily sweep 2–3 cycles.
7. Roll **org-by-org**; move `v1` to the App-aware commit at final cutover.
8. **Decommission:** delete `FLEET_PAT` / `ADD_TO_PROJECT_PAT` org secrets + revoke the classic PATs — **only after** the Coolify runner is confirmed on App auth.

## Out of scope

- Splitting into multiple Apps (revisit if the single-key blast radius proves unacceptable).
- Replacing the Coolify runner with scheduled GitHub Actions (option B — deferred; we keep the container and swap its token).
