<!-- pipeline-core-agent-instructions:start -->
## Pipeline Core Repo Ownership

This repo owns the code in this checkout. All GitHub issues, branches, commits, and PRs for work in this repo must be created in this repository.

Do not create tracking issues or implementation PRs in `lee-dashboard` unless the change is dashboard-owned. If an agent starts from `lee-dashboard` context, it must first resolve the owner repo, then run GitHub commands with `--repo <owner>/<repo>` or work from this checkout.

Pipeline Core workflow:
1. Create the GitHub issue first with a `type:` label and a human-readable title prefix such as `Task:`, `Bug:`, or `Feature request:`.
2. Branch as `<type>/<issue-number>-<slug>`, for example `task/123-update-agent-routing`.
3. Open the PR with `Fixes #<issue-number>` in the body.
<!-- pipeline-core-agent-instructions:end -->
