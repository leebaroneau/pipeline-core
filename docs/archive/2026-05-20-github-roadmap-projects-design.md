# GitHub Roadmap Projects Design

Date: 2026-05-20

## Goal

Create one GitHub Projects layer that gives Lee a clean view of all active GitHub work, plus one roadmap per managed GitHub owner. Issues and pull requests remain the source of truth; projects are visibility boards.

## Project Set

The project names should mirror the GitHub owner names so they are obvious in GitHub's project picker.

| Project | Owner | Scope |
|---|---|---|
| All Active Work | `leebaroneau` | Open issues and PRs across every managed owner |
| leebaroneau Roadmap | `leebaroneau` | Open issues and PRs under Lee's personal GitHub account |
| Haverford-Brands Roadmap | `Haverford-Brands` | Open issues and PRs under the Haverford-Brands org |
| alx-finance Roadmap | `alx-finance` | Open issues and PRs under the alx-finance org |
| Genvest-Property Roadmap | `Genvest-Property` | Open issues and PRs under the Genvest-Property org |
| kwa-nguyen Roadmap | `kwa-nguyen` | Open issues and PRs under the kwa-nguyen org |

Existing projects can be renamed rather than recreated when they already represent the right scope.

## Project Cleanup

After the target project set exists, any older open GitHub Project that is not part of the target set should be closed or archived, not kept as a parallel planning surface.

Current cleanup candidates from the 2026-05-20 GitHub inventory:

| Owner | Project | Number | Cleanup action |
|---|---|---:|---|
| `leebaroneau` | Marketing Projects | 4 | Close/archive after confirming its tracked items are visible through `All Active Work` and the owner roadmaps |
| `leebaroneau` | Pipeline Core (lee-dashboard) | 5 | Close/archive after confirming no unique active items need migration |

Do not delete issues or pull requests. Project cleanup only removes superseded project boards as planning surfaces.

## Routing Rules

The sync layer should add each matching open issue or PR to:

1. the owner-specific roadmap for its GitHub owner;
2. `All Active Work`, so Lee has one cross-owner command center.

The initial source filter should be owner-based rather than label-only:

- `user:leebaroneau is:open`
- `org:Haverford-Brands is:open`
- `org:alx-finance is:open`
- `org:Genvest-Property is:open`
- `org:kwa-nguyen is:open`

Labels such as `brand:haverford`, `brand:personal`, `status:needs-pr`, and `status:needs-verification` should remain useful filters inside projects, but missing labels should not hide active work from the roadmap.

## Data Flow

1. `00_resources/github-roadmaps/roadmap-routes.json` declares the target projects and their GitHub search queries.
2. `scripts/sync-github-roadmaps.mjs` reads the config.
3. For each project route, it lists existing project item URLs.
4. It searches GitHub for matching open issues and PRs.
5. It adds missing URLs to the route's project.
6. It does not close issues, alter labels, change project fields, or mark work complete.

## Implementation Notes

- Rename existing projects through `gh project edit` where possible:
  - `Lee Command Center` -> `All Active Work`
  - `Lee Personal Roadmap` -> `leebaroneau Roadmap`
- Keep current project numbers when the scope is already correct.
- Add or verify the missing `kwa-nguyen Roadmap` project before adding it to config.
- Close/archive older open projects that are not in the target project set after their items are covered by the new routes.
- Update README project links and naming.
- Update tests to cover owner-based queries and the `kwa-nguyen` route.
- Run the roadmap sync in dry-run mode before applying changes.

## Error Handling

- If a project does not exist, the setup step should stop with a clear message that includes the owner and desired name.
- If an older project contains items that are not found by the new owner-based routes, stop and list those URLs before closing the project.
- If GitHub search or project item listing fails, the script should preserve the existing failure behavior and surface the underlying `gh` error.
- If duplicate URLs appear across search results, the script should continue deduplicating before adding items.

## Verification

- `node --test scripts/sync-github-roadmaps.test.mjs`
- `node scripts/sync-github-roadmaps.mjs --dry-run`
- Confirm the GitHub project names and URLs:
  - `gh project view <number> --owner <owner> --format json`
- After a real sync, spot-check that:
  - an open `leebaroneau` issue appears in both `All Active Work` and `leebaroneau Roadmap`;
  - an open org issue appears in both `All Active Work` and that org's roadmap;
  - `kwa-nguyen` has its own roadmap route.
- Confirm obsolete projects are closed/archived only after their active items are visible in the target project set.
