# Store Repo Project Docs Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize how Haverford Shopify store repos keep active, done and archived project context close to the owning repo without uploading those docs to Shopify.

**Architecture:** Keep durable brand/workspace instructions in `AGENTS.md` and `MEMORY.md`, but put site-specific implementation packs inside the owning store repo under `docs/projects/`. Use `.shopifyignore` as the Shopify upload boundary and `docs/projects/active/README.md` as the first LLM lookup point for current work.

**Tech Stack:** Markdown, Shopify theme repos, `.shopifyignore`, Node.js for repeatable scaffold validation.

---

### Task 1: Write the Haverford Store Project Docs Standard

**Files:**
- Create: `haverford-brands/00_resources/standards/store-project-docs.md`

- [ ] **Step 1: Create the standard document**

Create `haverford-brands/00_resources/standards/store-project-docs.md` with this content:

```markdown
# Store Project Docs Standard

## Purpose

Store-specific implementation context belongs in the owning store repo so humans and LLM agents can pick up work without searching Haverford project capsules first.

The Haverford project capsules remain useful for broad research, paid API data, strategy exploration and cross-brand context. The store repo gets the distilled implementation pack needed to do the work.

## Required Structure

Each Shopify theme repo should support:

```text
docs/
  projects/
    README.md
    active/
      README.md
      <project-folder>/
        README.md
        implementation-plan.md
        research-summary.md
        change-packet.md
    done/
      README.md
    archive/
      README.md
```

## Status Folder Meanings

- `active/`: current work. Agents must check this first before editing a store repo.
- `done/`: completed work worth retaining as precedent.
- `archive/`: abandoned, superseded or low-signal work.

Move project folders between status folders as their lifecycle changes. Update the linked GitHub issue with the new path when a folder moves.

## Minimum Project Files

- `README.md`: status, GitHub issue, owner, dates, decision state and next action.
- `implementation-plan.md`: practical site-change checklist.
- `research-summary.md`: distilled findings only.
- `change-packet.md`: exact Shopify or theme changes to apply or review.

## Shopify Upload Boundary

All Shopify theme repos must include this in `.shopifyignore`:

```text
docs/**
```

This keeps docs tracked in Git but out of Shopify theme uploads.

## Agent Lookup Rule

Before implementing in a store repo:

1. Read the nearest repo instructions.
2. Check `docs/projects/active/README.md`.
3. Open the GitHub issue linked from the active project.
4. Inspect theme files or Shopify state.

Do not search `docs/projects/done/` or `docs/projects/archive/` unless active context references them, the user asks for historical context, or active context is missing.

## AGENTS.md And MEMORY.md

Do not delete cascading `AGENTS.md` and `MEMORY.md` files wholesale.

Use them for routing rules, durable decisions, brand-wide facts and project-specific context that future agents must load before work. Remove or avoid scaffold files only when they carry no signal.

The boundary is:

- `AGENTS.md`: behavior and routing instructions.
- `MEMORY.md`: durable facts and decisions.
- `docs/projects/`: implementation packs tied to a repo and GitHub issue.
- `haverford-brands/1_projects/`: broader research capsules and raw datasets.
```

- [ ] **Step 2: Verify the standard has no placeholders**

Run:

```bash
rg "TODO|TBD|fill in|placeholder" haverford-brands/00_resources/standards/store-project-docs.md
```

Expected: no output.

### Task 2: Update Store-Level Agent Instructions

**Files:**
- Modify: `haverford-brands/00_repos/stores/AGENTS.md`

- [ ] **Step 1: Replace the placeholder store instructions**

Replace `haverford-brands/00_repos/stores/AGENTS.md` with:

```markdown
# Haverford Store Repos

## Purpose

This folder contains Haverford-owned storefront repos. Most folders are Shopify Liquid theme repos. App repos such as `quote.koenigmachinery.com.au` and `sales.koenigmachinery.com.au` are not Shopify theme upload targets.

## Memory

See `MEMORY.md` for context that persists across store repos.

## Project Docs Standard

Before implementing in any Shopify theme repo, check for current project context in:

```text
docs/projects/active/README.md
```

Use the standard in `../../00_resources/standards/store-project-docs.md`.

Store-specific implementation packs belong inside the owning repo under:

```text
docs/projects/active/<project-folder>/
```

Completed work moves to `docs/projects/done/`. Superseded or abandoned work moves to `docs/projects/archive/`.

Keep the linked GitHub issue as the stable source of truth and update it when a project folder moves.

## Shopify Ignore Rule

Shopify theme repos should include this in `.shopifyignore`:

```text
docs/**
```

This keeps repo docs tracked in Git while preventing Shopify theme uploads from sending docs to Shopify.

## AGENTS.md And MEMORY.md Boundary

Do not delete useful cascading `AGENTS.md` and `MEMORY.md` files just because implementation packs now live in repos.

Use:

- `AGENTS.md` for behavior, routing and repo-specific instructions.
- `MEMORY.md` for durable decisions and context.
- `docs/projects/` for issue-specific implementation packs.

Remove scaffold files only when they carry no real instruction or memory.
```

- [ ] **Step 2: Verify the instruction references resolve**

Run:

```bash
test -f haverford-brands/00_resources/standards/store-project-docs.md
test -f haverford-brands/00_repos/stores/AGENTS.md
```

Expected: both commands exit 0.

### Task 3: Add Repeatable Scaffold Script

**Files:**
- Create: `haverford-brands/00_resources/scripts/scaffold-store-project-docs.mjs`

- [ ] **Step 1: Create the script**

Create `haverford-brands/00_resources/scripts/scaffold-store-project-docs.mjs` with this behavior:

- Find store repos under `haverford-brands/00_repos/stores/`.
- Skip non-theme app repos that do not have `.shopifyignore`.
- Create `docs/projects/README.md`, `active/README.md`, `done/README.md`, and `archive/README.md` if missing.
- Add `docs/**` to `.shopifyignore` if missing.
- Do not overwrite existing project docs.

- [ ] **Step 2: Syntax check the script**

Run:

```bash
node --check haverford-brands/00_resources/scripts/scaffold-store-project-docs.mjs
```

Expected: no output and exit 0.

### Task 4: Run Store Repo Scaffold

**Files:**
- Modify: `.shopifyignore` in Shopify theme repos under `haverford-brands/00_repos/stores/`
- Create: `docs/projects/README.md`
- Create: `docs/projects/active/README.md`
- Create: `docs/projects/done/README.md`
- Create: `docs/projects/archive/README.md`

- [ ] **Step 1: Run the scaffold script**

Run:

```bash
node haverford-brands/00_resources/scripts/scaffold-store-project-docs.mjs
```

Expected: script reports updated Shopify theme repos and skips `quote.koenigmachinery.com.au` and `sales.koenigmachinery.com.au`.

- [ ] **Step 2: Confirm all Shopify theme repos now have project docs**

Run:

```bash
for d in haverford-brands/00_repos/stores/*; do [ -f "$d/.shopifyignore" ] || continue; test -f "$d/docs/projects/active/README.md" || echo "missing $d"; done
```

Expected: no output.

- [ ] **Step 3: Confirm all Shopify theme repos ignore docs**

Run:

```bash
for d in haverford-brands/00_repos/stores/*; do [ -f "$d/.shopifyignore" ] || continue; rg -q '^docs/\*\*$' "$d/.shopifyignore" || echo "missing docs ignore $d"; done
```

Expected: no output.

### Task 5: Retrofit Koenig Tube Laser Project Into Owner Repo

**Files:**
- Create: `haverford-brands/00_repos/stores/Koenigmachinery.com.au/docs/projects/active/issue-2-tube-laser-seo/README.md`
- Create: `haverford-brands/00_repos/stores/Koenigmachinery.com.au/docs/projects/active/issue-2-tube-laser-seo/implementation-plan.md`
- Create: `haverford-brands/00_repos/stores/Koenigmachinery.com.au/docs/projects/active/issue-2-tube-laser-seo/research-summary.md`
- Create: `haverford-brands/00_repos/stores/Koenigmachinery.com.au/docs/projects/active/issue-2-tube-laser-seo/change-packet.md`

- [ ] **Step 1: Copy distilled implementation context**

Create the Koenig project folder using distilled content from:

```text
haverford-brands/1_projects/active/26-05-21-0952_Koenig-Tube-Laser-SEO/deliverables/github-issue-site-implementation.md
haverford-brands/1_projects/active/26-05-21-0952_Koenig-Tube-Laser-SEO/deliverables/shopify-site-update-handoff.md
haverford-brands/1_projects/active/26-05-21-0952_Koenig-Tube-Laser-SEO/deliverables/google-competitor-report.md
haverford-brands/1_projects/active/26-05-21-0952_Koenig-Tube-Laser-SEO/research/processed/2026-05-21T01-15-58-007Z-competitor-refresh-keyword-volumes.csv
```

- [ ] **Step 2: Update Koenig active project index**

Add the project to:

```text
haverford-brands/00_repos/stores/Koenigmachinery.com.au/docs/projects/active/README.md
```

Expected entry:

```markdown
- [Issue #2: Tube Laser SEO Implementation](issue-2-tube-laser-seo/) - collection and product page SEO/UX updates.
```

### Task 6: Update GitHub Issue With Owner-Repo Docs Path

**Files:**
- No local file changes required.

- [ ] **Step 1: Comment on GitHub issue #2**

Run:

```bash
gh issue comment 2 --repo Haverford-Brands/Koenigmachinery.com.au --body "Owner-repo implementation pack added at: \`docs/projects/active/issue-2-tube-laser-seo/\`. Future agents should check that folder before editing theme files. Google Ads remains out of scope for this issue."
```

Expected: comment URL returned.

### Task 7: Verification

**Files:**
- All files touched in Tasks 1-6.

- [ ] **Step 1: Check generated docs for placeholders**

Run:

```bash
rg "TODO|TBD|fill in|placeholder" haverford-brands/00_resources/standards/store-project-docs.md haverford-brands/00_repos/stores/Koenigmachinery.com.au/docs/projects
```

Expected: no output.

- [ ] **Step 2: Check status**

Run:

```bash
git status --short haverford-brands/00_resources/standards/store-project-docs.md haverford-brands/00_resources/scripts/scaffold-store-project-docs.mjs haverford-brands/00_repos/stores/AGENTS.md haverford-brands/00_repos/stores/Koenigmachinery.com.au/docs
```

Expected: only intended files shown.

## Self-Review

- Spec coverage: covers store docs structure, lifecycle folders, Shopify ignore guardrail, agent lookup rule, Koenig first retrofit and AGENTS/MEMORY boundary.
- Placeholder scan: no `TODO`, `TBD` or fill-in instructions are intentionally left in the implementation outputs.
- Type consistency: all paths use `docs/projects/active|done|archive`; the Koenig issue folder is consistently `issue-2-tube-laser-seo`.

