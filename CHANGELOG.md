# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v1.0.9] — 2026-05-19

### Fixed

- Fresh consumer installs failed `pipeline-drift-scan` with "Slash command /X is enabled but undocumented" because the slash-command doc check only looked at `README.md` and the lee-dashboard-specific `00_resources/pipeline-core/README.md`. The installer now writes `docs/pipeline-core.md` with the full slash-command vocabulary; both `check-drift.mjs` and `check-slash-command-docs.mjs` learn the new path. (#19)

### Added

- `scripts/generate-slash-docs.mjs` — generator that emits `docs/pipeline-core.md` from `scripts/lib/slash-commands.mjs`. Exposed as `make pipeline-generate-docs` so consumers can refresh the file after pipeline-core adds/removes commands.
- `tests/generate-slash-docs.test.mjs` (4 tests) + an install → drift-scan round-trip in `tests/install.test.mjs` that catches this class of friction in CI. (#19)

## [v1.0.8] — 2026-05-19

### Fixed

- `templates/caller-workflows/pipeline-pr-labels.yml` was passing an undeclared `config-path:` input to the reusable `pr-labels.yml`, which only accepts `labeler-config:`. GitHub Actions rejected the unknown input with `startup_failure`, silently breaking path-based PR labelling on every consumer install (including lee-dashboard) since v1.0.0. Removed the stray `config-path:` line. Found by the sandbox install validation that proved out v1.0.7 end-to-end. (#17)

### Added

- `tests/caller-inputs.test.mjs` — cross-references every caller template's `with:` keys against the declared `inputs:` on its supplier reusable workflow. Hard-fails CI on drift, preventing this class of `startup_failure` from ever reaching a consumer again. One test per caller template. (#17)

## [v1.0.7] — 2026-05-19

### Added

- `scripts/install.mjs` — one-shot installer (`make pipeline-bootstrap`) that wires Pipeline Core into a consumer repo: copies all 17 caller workflows (including the new `pipeline-doctor.yml`), renders a starter `pipeline-config.yml` with a derived `installation_id`, seeds `ISSUE_TEMPLATE/config.yml`, runs the labels/labeler/ISSUE_TEMPLATE generators so the install is doctor-clean out of the box, and optionally opens an install PR via `gh` (`--auto-pr`). Idempotent: refuses to overwrite an existing config; `--auto-pr` pre-flights working-tree cleanliness and branch availability before touching the filesystem. (org-wide rollout phase 1.1)
- Self-CI: new `.github/workflows/ci.yml` runs the test suite, config validation, and an end-to-end install → doctor round-trip against a scratch consumer on every PR and push to main. Closes the gap where pipeline-core's own PRs ran zero checks while downstream consumers depended on `@v1`. (org-wide rollout phase 1.2)
- Reusable `.github/workflows/doctor.yml` + caller template `templates/caller-workflows/pipeline-doctor.yml`. The reusable workflow runs the CLI doctor inside CI with `github-script`'s authenticated client wired into the branch-protection check, fails the job on doctor failure, and exposes `ok`/`report`/`result` outputs so an org-level fleet cron can aggregate health across all consumer repos. Optional `post-sticky: "true"` appends to a long-running tracker issue and auto-dedupes concurrent-run duplicates. (org-wide rollout phase 1.3 — finishes the deferred half of #4)

## [v1.0.6] — 2026-05-19

### Added

- `scripts/doctor.mjs` — non-mutating install doctor for consumer repos. Validates `pipeline-config.yml`, diffs generated artifacts against the current generators, verifies caller workflows reference the expected upstream and `@v1` (or pinned `@v1.x.y`), and optionally checks that branch protection on `main` requires `pipeline/merge-gate`. Plan-gated `403` responses from the GitHub branch-protection API are surfaced as a warning with a specific upgrade-or-make-public remediation rather than a failure. Exposed as `make pipeline-doctor` and runnable from any cloned consumer repo. (#4)

### Changed

- Bump `actions/setup-node` `v4` → `v6` and `actions/github-script` `v7` → `v8` in all reusable workflows. Both now run on Node 24, clearing the deprecation warnings ahead of the September 2026 Node 20 removal. (#11)

## [v1.0.0] — 2026-MM-DD

### Added

- Intake state machine: `Backlog → Triage → Selected for Development → Needs Info` with slash-command transitions
- Closure handlers: `/refuted`, `/duplicate`, `/wontfix`, `/cnr`, `/reopen`, UI-close-button revert
- 13 slash commands across intake, work, and closure phases
- 47 universal labels (priority, points, iteration, status, type, plus domain/component slots filled by consumer config)
- Five PR gates: branch-name, issue-link, PR-labels (actions/labeler@v5 wrapper), results-gate (soft mode for `type:experiment`), composite merge-gate
- PR-state workflow: opens PR → moves linked issue to In Experiment (type:experiment) or In Review (else)
- PR-closed workflow: merged → Done, unmerged → In Progress or Selected for Development
- `iteration:1`…`iteration:5` labels with `/iterate` swap and cap
- Self-maintenance: workflow-lint (six rules) and drift-scan (PR hard gate + cron soft signal)
- Config validation via JSON Schema Draft 2020-12 (AJV)
- Generators for `labels.yml`, `labeler.yml`, `ISSUE_TEMPLATE/*`

[Unreleased]: https://github.com/leebaroneau/pipeline-core/compare/v1.0.9...HEAD
[v1.0.9]: https://github.com/leebaroneau/pipeline-core/releases/tag/v1.0.9
[v1.0.8]: https://github.com/leebaroneau/pipeline-core/releases/tag/v1.0.8
[v1.0.7]: https://github.com/leebaroneau/pipeline-core/releases/tag/v1.0.7
[v1.0.6]: https://github.com/leebaroneau/pipeline-core/releases/tag/v1.0.6
[v1.0.0]: https://github.com/leebaroneau/pipeline-core/releases/tag/v1.0.0
