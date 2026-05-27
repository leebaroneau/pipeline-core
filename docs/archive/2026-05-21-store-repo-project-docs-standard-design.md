# Store Repo Project Docs Standard Design

## Goal

Make site-specific project context discoverable inside the owning store repo so future LLM agents and human contributors can pick up implementation work without searching through `lee-dashboard` project capsules first.

## Problem

Haverford strategy and research work can currently live in brand project capsules under `haverford-brands/1_projects/active/`, while implementation work happens in individual store repos under `haverford-brands/00_repos/stores/`. That split is useful for broader research, but it can silo the distilled handoff away from the repo where the work is actually implemented.

For future LLM workers, the practical risk is that they open a store repo, search only theme files, and miss the implementation plan, issue context, keyword summary, or QA notes.

## Recommended Structure

Each Shopify theme repo should support this structure:

```text
docs/
  projects/
    README.md
    active/
      README.md
      issue-2-tube-laser-seo/
        README.md
        implementation-plan.md
        research-summary.md
        change-packet.md
    done/
      README.md
    archive/
      README.md
```

Status folders have clear meaning:

- `active/` contains current implementation work agents should inspect first.
- `done/` contains completed work worth keeping as precedent.
- `archive/` contains abandoned, superseded, or low-signal work.

Project folders should move between status folders as their lifecycle changes. The GitHub issue remains the stable source of truth and should be updated with the current project-doc path when a folder moves.

## Shopify Upload Guardrail

Every Shopify theme repo should include this rule in `.shopifyignore`:

```text
docs/**
```

That keeps project docs in Git while preventing Shopify CLI/theme uploads from sending docs to the theme.

App repos such as `quote.koenigmachinery.com.au` and `sales.koenigmachinery.com.au` should not need this Shopify-specific ignore rule unless they later become Shopify theme upload targets.

## Agent Routing Rule

Store-repo agents should follow this lookup order before implementation:

1. Read the nearest repo instructions, such as `AGENTS.md` or `CLAUDE.md`.
2. Check `docs/projects/active/README.md`.
3. Check the GitHub issue linked from the active project folder.
4. Only then inspect theme files or Shopify state.

Agents should not search `docs/projects/done/` or `docs/projects/archive/` unless the active project references precedent there, the user asks for historical context, or active context is missing.

## What Goes In Each Project Folder

Minimum files:

- `README.md`: status, GitHub issue, owner, dates, current decision state, next action.
- `implementation-plan.md`: practical site-change checklist.
- `research-summary.md`: distilled findings only, not raw paid API dumps.
- `change-packet.md`: exact Shopify/theme changes to apply or review.

Raw API responses, large exports, and broad research datasets should stay in the Haverford project capsule unless there is a strong implementation reason to copy a small processed summary into the owner repo.

## First Retrofit

Use the Koenig tube laser SEO work as the first example:

```text
haverford-brands/00_repos/stores/Koenigmachinery.com.au/docs/projects/active/issue-2-tube-laser-seo/
```

Copy only the distilled implementation pack:

- GitHub issue link
- implementation plan
- keyword intent summary
- competitor summary
- Shopify change packet

Keep paid raw DataForSEO, GA4, GSC and Clarity exports in:

```text
haverford-brands/1_projects/active/26-05-21-0952_Koenig-Tube-Laser-SEO/
```

## Skill Decision

This does not need to become a standalone Codex skill yet. The right first layer is an `AGENTS.md` rule because the behavior is repo-local routing, not a reusable capability.

Create a dedicated skill later if this pattern needs to be enforced across non-Haverford workstations, automatically scaffolded by agents, or reused outside Shopify store repos.

## Self-Review

- No placeholders remain.
- The structure separates active work from done and archived work for LLM search efficiency.
- The GitHub issue remains the permanent reference, while docs paths can move by lifecycle status.
- Shopify upload protection is explicit.
- The distinction between owner-repo implementation packs and Haverford research capsules is explicit.

