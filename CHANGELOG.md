# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/leebaroneau/pipeline-core/compare/v1.0.0...HEAD
[v1.0.0]: https://github.com/leebaroneau/pipeline-core/releases/tag/v1.0.0
