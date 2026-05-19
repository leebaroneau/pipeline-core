.PHONY: pipeline-install pipeline-test pipeline-validate pipeline-generate \
        pipeline-lint-workflows pipeline-check-drift pipeline-check-labels \
        pipeline-doctor pipeline-bootstrap

pipeline-install:
	npm ci

pipeline-test:
	node --test 'tests/**/*.test.mjs'

pipeline-validate:
	node scripts/validate-config.mjs

pipeline-generate:
	node scripts/generate-labels.mjs
	node scripts/generate-labeler.mjs
	node scripts/generate-templates.mjs

pipeline-lint-workflows:
	node scripts/lint-workflows.mjs

pipeline-check-drift:
	node scripts/check-drift.mjs

pipeline-check-labels:
	node scripts/check-label-catalog.mjs

# Install doctor — read-only setup-health check for a consumer repo.
# Pass REPO=/path/to/consumer to point it elsewhere; defaults to cwd.
pipeline-doctor:
	node scripts/doctor.mjs --repo "$${REPO:-.}"

# Consumer installer — copies caller workflows + starter config into a repo.
# Pass REPO=/path/to/consumer (defaults to cwd) and INSTALLATION_ID=<slug>
# (defaults to repo dir name). Append AUTO_PR=1 to commit/push/open a PR.
pipeline-bootstrap:
	node scripts/install.mjs --repo "$${REPO:-.}" \
	  $${INSTALLATION_ID:+--installation-id $${INSTALLATION_ID}} \
	  $${CRON_TIMEZONE:+--cron-timezone $${CRON_TIMEZONE}} \
	  $${AUTO_PR:+--auto-pr}
