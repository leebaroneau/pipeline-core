# Pipeline Core

A config-driven, hypothesis-led production pipeline for any GitHub repo. Drive issues through `Backlog → Triage → Selected for Development → In Progress → In Experiment → In Review → Done` using labels, slash commands, and reusable workflows.

## Adoption (5 minutes)

1. Copy `templates/pipeline-config.yml.example` to your repo at `.github/pipeline-config.yml` and edit it (set your domains, components, path mappings).
2. Copy the caller workflows from `templates/caller-workflows/` to your repo at `.github/workflows/`.
3. Run the bootstrap workflow:
   ```bash
   gh workflow run pipeline-validate-config.yml
   gh workflow run pipeline-labels-sync.yml
   ```
4. Read the runbooks at `docs/runbooks/` to enable branch protection and verify the install.

## Components

- **Intake state machine** — labels-driven, no GraphQL required
- **PR gates** — branch-name, issue-link, path labels, merge-gate, results-gate
- **Slash commands** — `/ready`, `/grab`, `/release`, `/iterate`, `/refuted`, `/duplicate`, `/wontfix`, `/cnr`, `/block`, `/unblock`, `/park`, `/unpark`, `/reopen`, `/needs-info`, `/info-resolved`
- **Self-maintenance** — workflow-lint and drift-scan keep generated artifacts in sync

## Versioning

Callers pin to `@v1` (floating major). Breaking changes bump to `@v2`. See `CHANGELOG.md` for release notes.

## License

MIT. See `LICENSE`.

## Reference consumer

The reference consumer is `lee-dashboard` (the repo this was extracted from). Its caller workflows at `.github/workflows/pipeline-*.yml` are the canonical example of how to wire Pipeline Core into a downstream repo.
