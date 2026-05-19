# Pipeline Core

A config-driven, hypothesis-led production pipeline for any GitHub repo. Drive issues through `Backlog → Triage → Selected for Development → In Progress → In Experiment → In Review → Done` using labels, slash commands, and reusable workflows.

## Adoption (5 minutes)

From a clone of this repo, pointed at your consumer:

```bash
make pipeline-bootstrap REPO=/path/to/your/repo
# or, to commit + push + open an install PR via gh:
make pipeline-bootstrap REPO=/path/to/your/repo AUTO_PR=1
```

This drops a starter `.github/pipeline-config.yml`, all 16 caller workflows, and the `ISSUE_TEMPLATE/config.yml`. Edit `pipeline-config.yml` (domains, components, path mappings), then in the consumer repo:

```bash
gh workflow run pipeline-validate-config.yml
gh workflow run pipeline-labels-sync.yml
```

To verify the install:

```bash
make pipeline-doctor REPO=/path/to/your/repo
```

## Components

- **Intake state machine** — labels-driven, no GraphQL required
- **PR gates** — branch-name, issue-link, path labels, merge-gate, results-gate
- **Slash commands** — `/ready`, `/grab`, `/release`, `/iterate`, `/refuted`, `/duplicate`, `/wontfix`, `/cnr`, `/block`, `/unblock`, `/park`, `/unpark`, `/reopen`, `/needs-info`, `/info-resolved`
- **Self-maintenance** — workflow-lint and drift-scan keep generated artifacts in sync
- **Install doctor** — `make pipeline-doctor` (or `node scripts/doctor.mjs --repo /path/to/consumer`) does a non-mutating setup-health check on a consumer repo: config validation, artifact drift, caller upstream/major pin, and (with `GITHUB_TOKEN`) branch-protection enforcement

## Versioning

Callers pin to `@v1` (floating major). Breaking changes bump to `@v2`. See `CHANGELOG.md` for release notes.

## License

MIT. See `LICENSE`.

## Reference consumer

The reference consumer is `lee-dashboard` (the repo this was extracted from). Its caller workflows at `.github/workflows/pipeline-*.yml` are the canonical example of how to wire Pipeline Core into a downstream repo.
