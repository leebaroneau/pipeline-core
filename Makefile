.PHONY: pipeline-install pipeline-test pipeline-validate pipeline-generate \
        pipeline-lint-workflows pipeline-check-drift pipeline-check-labels \
        pipeline-doctor

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
