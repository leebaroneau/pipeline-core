# GitHub Roadmap Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved GitHub Projects roadmap set: one `All Active Work` board, one exact-owner roadmap per managed GitHub owner, and close older superseded project boards after coverage is verified.

**Architecture:** GitHub issues and PRs remain the source of truth. Live GitHub Project setup is performed with `gh project` commands, while `00_resources/github-roadmaps/roadmap-routes.json` declares which owner-based searches sync into each project. The existing sync script remains the routing engine; tests assert the approved route shape so label-only routing does not return by accident.

**Tech Stack:** GitHub CLI (`gh`), Node.js ESM, `node:test`, JSON config, GitHub Projects v2.

---

## File Structure

- Modify: `00_resources/github-roadmaps/roadmap-routes.json`
  - Responsibility: declare the project owner/number and owner-based search queries for each roadmap route.
- Modify: `00_resources/github-roadmaps/README.md`
  - Responsibility: document the final project names, URLs, routing rule, local sync commands, and cleanup rule.
- Modify: `scripts/sync-github-roadmaps.test.mjs`
  - Responsibility: test route helper behavior and assert that the checked-in route config matches the approved owner-based project set.
- No change: `scripts/sync-github-roadmaps.mjs`
  - Existing behavior already supports arbitrary query routes, deduplicates URLs, and adds missing project items.
- Live GitHub Projects:
  - Rename existing projects where their scope already matches the approved target set.
  - Create `kwa-nguyen Roadmap` if it does not already exist.
  - Close superseded projects #4 and #5 under `leebaroneau` after coverage is verified.

---

### Task 1: Prepare Live GitHub Project Names

**Files:**
- Live GitHub Projects only
- No repository files changed in this task

- [ ] **Step 1: Confirm GitHub authentication and scopes**

Run:

```bash
gh auth status
```

Expected: logged in as `leebaroneau` with `repo`, `read:org`, and `project` scopes.

- [ ] **Step 2: Capture current project inventory**

Run:

```bash
gh project list --owner leebaroneau --format json
gh project list --owner Haverford-Brands --format json
gh project list --owner alx-finance --format json
gh project list --owner Genvest-Property --format json
gh project list --owner kwa-nguyen --format json
```

Expected:

- `leebaroneau` has projects #2, #3, #4, and #5 open.
- `Haverford-Brands` has project #4 open.
- `alx-finance` has project #1 open.
- `Genvest-Property` has project #1 open.
- `kwa-nguyen` may have no project yet.

- [ ] **Step 3: Rename existing target projects**

Run:

```bash
gh project edit 2 --owner leebaroneau --title "All Active Work" --description "All active GitHub work across Lee's managed personal and organization owners."
gh project edit 3 --owner leebaroneau --title "leebaroneau Roadmap" --description "Roadmap for open issues and pull requests under Lee's personal GitHub account."
gh project edit 4 --owner Haverford-Brands --title "Haverford-Brands Roadmap" --description "Roadmap for open issues and pull requests under the Haverford-Brands organization."
gh project edit 1 --owner alx-finance --title "alx-finance Roadmap" --description "Roadmap for open issues and pull requests under the alx-finance organization."
gh project edit 1 --owner Genvest-Property --title "Genvest-Property Roadmap" --description "Roadmap for open issues and pull requests under the Genvest-Property organization."
```

Expected: each command exits successfully.

- [ ] **Step 4: Create or find the kwa-nguyen roadmap project**

Run:

```bash
export KWA_PROJECT_NUMBER="$(gh project list --owner kwa-nguyen --format json --jq '.projects[] | select(.title == "kwa-nguyen Roadmap" and .closed == false) | .number' | head -n 1)"
if [ -z "$KWA_PROJECT_NUMBER" ]; then
  export KWA_PROJECT_NUMBER="$(gh project create --owner kwa-nguyen --title "kwa-nguyen Roadmap" --format json --jq '.number')"
fi
printf 'kwa-nguyen Roadmap project number: %s\n' "$KWA_PROJECT_NUMBER"
test -n "$KWA_PROJECT_NUMBER"
```

Expected: prints a non-empty project number. Keep this shell variable available for Task 3 in the same terminal session.

- [ ] **Step 5: Verify target project names**

Run:

```bash
gh project view 2 --owner leebaroneau --format json --jq '{number,title,url}'
gh project view 3 --owner leebaroneau --format json --jq '{number,title,url}'
gh project view 4 --owner Haverford-Brands --format json --jq '{number,title,url}'
gh project view 1 --owner alx-finance --format json --jq '{number,title,url}'
gh project view 1 --owner Genvest-Property --format json --jq '{number,title,url}'
gh project view "$KWA_PROJECT_NUMBER" --owner kwa-nguyen --format json --jq '{number,title,url}'
```

Expected titles:

- `All Active Work`
- `leebaroneau Roadmap`
- `Haverford-Brands Roadmap`
- `alx-finance Roadmap`
- `Genvest-Property Roadmap`
- `kwa-nguyen Roadmap`

---

### Task 2: Write the Failing Route Config Test

**Files:**
- Modify: `scripts/sync-github-roadmaps.test.mjs`

- [ ] **Step 1: Add `loadConfig` to the existing imports**

Modify the import in `scripts/sync-github-roadmaps.test.mjs` so it reads:

```js
import {
  buildSearchArgs,
  extractProjectItemUrls,
  extractSearchUrls,
  loadConfig,
  planAdditions,
  validateConfig,
} from "./sync-github-roadmaps.mjs";
```

- [ ] **Step 2: Add a test for the approved owner-based routes**

Append this test to `scripts/sync-github-roadmaps.test.mjs`:

```js
test("roadmap routes use the approved owner-based project set", async () => {
  const config = await loadConfig("00_resources/github-roadmaps/roadmap-routes.json");
  const routes = new Map(config.routes.map((route) => [route.name, route]));

  assert.deepEqual([...routes.keys()], [
    "All Active Work",
    "leebaroneau Roadmap",
    "Haverford-Brands Roadmap",
    "alx-finance Roadmap",
    "Genvest-Property Roadmap",
    "kwa-nguyen Roadmap",
  ]);

  assert.deepEqual(routes.get("All Active Work")?.queries, [
    "user:leebaroneau is:open",
    "org:Haverford-Brands is:open",
    "org:alx-finance is:open",
    "org:Genvest-Property is:open",
    "org:kwa-nguyen is:open",
  ]);
  assert.deepEqual(routes.get("leebaroneau Roadmap")?.queries, ["user:leebaroneau is:open"]);
  assert.deepEqual(routes.get("Haverford-Brands Roadmap")?.queries, ["org:Haverford-Brands is:open"]);
  assert.deepEqual(routes.get("alx-finance Roadmap")?.queries, ["org:alx-finance is:open"]);
  assert.deepEqual(routes.get("Genvest-Property Roadmap")?.queries, ["org:Genvest-Property is:open"]);
  assert.deepEqual(routes.get("kwa-nguyen Roadmap")?.queries, ["org:kwa-nguyen is:open"]);

  for (const route of routes.values()) {
    assert.equal(typeof route.project.owner, "string");
    assert.ok(Number.isInteger(route.project.number));
    assert.ok(route.project.number > 0);
  }
});
```

- [ ] **Step 3: Run the test and verify it fails for the current config**

Run:

```bash
node --test scripts/sync-github-roadmaps.test.mjs
```

Expected: FAIL because the current config still uses `Lee Command Center`, `Lee Personal Roadmap`, label-based queries, and has no `kwa-nguyen Roadmap`.

---

### Task 3: Update Route Config and Roadmap Docs

**Files:**
- Modify: `00_resources/github-roadmaps/roadmap-routes.json`
- Modify: `00_resources/github-roadmaps/README.md`
- Test: `scripts/sync-github-roadmaps.test.mjs`

- [ ] **Step 1: Rewrite the route config from live project numbers**

Run this from the repository root in the same terminal session that has `KWA_PROJECT_NUMBER` from Task 1:

```bash
node --input-type=module <<'NODE'
import { readFile, writeFile } from "node:fs/promises";

const path = "00_resources/github-roadmaps/roadmap-routes.json";
const kwaNumber = Number(process.env.KWA_PROJECT_NUMBER);
if (!Number.isInteger(kwaNumber) || kwaNumber < 1) {
  throw new Error("KWA_PROJECT_NUMBER must be exported before updating roadmap-routes.json");
}

await readFile(path, "utf8");
const config = {
  version: 1,
  routes: [
    {
      name: "All Active Work",
      project: {
        owner: "leebaroneau",
        number: 2,
      },
      queries: [
        "user:leebaroneau is:open",
        "org:Haverford-Brands is:open",
        "org:alx-finance is:open",
        "org:Genvest-Property is:open",
        "org:kwa-nguyen is:open",
      ],
      limit: 100,
    },
    {
      name: "leebaroneau Roadmap",
      project: {
        owner: "leebaroneau",
        number: 3,
      },
      queries: ["user:leebaroneau is:open"],
      limit: 100,
    },
    {
      name: "Haverford-Brands Roadmap",
      project: {
        owner: "Haverford-Brands",
        number: 4,
      },
      queries: ["org:Haverford-Brands is:open"],
      limit: 100,
    },
    {
      name: "alx-finance Roadmap",
      project: {
        owner: "alx-finance",
        number: 1,
      },
      queries: ["org:alx-finance is:open"],
      limit: 100,
    },
    {
      name: "Genvest-Property Roadmap",
      project: {
        owner: "Genvest-Property",
        number: 1,
      },
      queries: ["org:Genvest-Property is:open"],
      limit: 100,
    },
    {
      name: "kwa-nguyen Roadmap",
      project: {
        owner: "kwa-nguyen",
        number: kwaNumber,
      },
      queries: ["org:kwa-nguyen is:open"],
      limit: 100,
    },
  ],
};

await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
NODE
```

Expected: `roadmap-routes.json` is rewritten with six routes and the live `kwa-nguyen` project number.

- [ ] **Step 2: Replace the roadmap README with the captured project number**

Run:

```bash
node --input-type=module <<'NODE'
import { writeFile } from "node:fs/promises";

const kwaNumber = Number(process.env.KWA_PROJECT_NUMBER);
if (!Number.isInteger(kwaNumber) || kwaNumber < 1) {
  throw new Error("KWA_PROJECT_NUMBER must be exported before updating README.md");
}

await writeFile(
  "00_resources/github-roadmaps/README.md",
  `# GitHub Roadmaps

This folder is the routing layer for GitHub roadmap sync.

Issues and pull requests remain the source of truth. GitHub Projects are visibility boards. Owner-based routing decides whether an item appears on a roadmap; labels remain useful for filtering and lifecycle status inside the project views.

## Projects

- All Active Work: https://github.com/users/leebaroneau/projects/2
- leebaroneau Roadmap: https://github.com/users/leebaroneau/projects/3
- Haverford-Brands Roadmap: https://github.com/orgs/Haverford-Brands/projects/4
- alx-finance Roadmap: https://github.com/orgs/alx-finance/projects/1
- Genvest-Property Roadmap: https://github.com/orgs/Genvest-Property/projects/1
- kwa-nguyen Roadmap: https://github.com/orgs/kwa-nguyen/projects/${kwaNumber}

## Routing

The sync adds every matching open issue or PR to the owner-specific roadmap and also to \`All Active Work\`.

- \`user:leebaroneau is:open\`
- \`org:Haverford-Brands is:open\`
- \`org:alx-finance is:open\`
- \`org:Genvest-Property is:open\`
- \`org:kwa-nguyen is:open\`

## Labels

Use these labels as filters and lifecycle signals:

- \`brand:personal\`
- \`brand:haverford\`
- \`brand:alx\`
- \`brand:genvest\`
- \`area:paperclip\`
- \`type:feature\`
- \`type:upstream-tracking\`
- \`status:needs-pr\`
- \`status:pr-open\`
- \`status:needs-verification\`
- \`status:done\`

Missing labels should not prevent an open issue or PR from appearing on the appropriate roadmap.

## Cleanup

Older project boards should not remain as parallel planning surfaces once their active items are visible through the target roadmap set.

Current cleanup candidates:

- \`leebaroneau\` project #4, \`Marketing Projects\`
- \`leebaroneau\` project #5, \`Pipeline Core (lee-dashboard)\`

Close those projects only after checking that their active item URLs are visible in the target project set.

## Running Locally

\`\`\`bash
node --test scripts/sync-github-roadmaps.test.mjs
node scripts/sync-github-roadmaps.mjs --dry-run
node scripts/sync-github-roadmaps.mjs
\`\`\`

The script uses the local \`gh\` authentication when run on your machine.

## GitHub Actions Secret

The workflow expects a repository secret named \`ROADMAP_SYNC_TOKEN\` on \`leebaroneau/lee-dashboard\`. Use a token that can read the target repos and update GitHub Projects.

Required scopes for a classic token:

- \`repo\`
- \`read:org\`
- \`project\`
`,
);
NODE
```

- [ ] **Step 3: Run the route tests**

Run:

```bash
node --test scripts/sync-github-roadmaps.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Review the file diff**

Run:

```bash
git diff -- scripts/sync-github-roadmaps.test.mjs 00_resources/github-roadmaps/roadmap-routes.json 00_resources/github-roadmaps/README.md
```

Expected:

- test import includes `loadConfig`;
- a new config-shape test exists;
- route names use the approved project names;
- queries are owner-based;
- README names and URLs match the target project set.

- [ ] **Step 5: Commit route config, docs, and tests**

Run:

```bash
git add scripts/sync-github-roadmaps.test.mjs 00_resources/github-roadmaps/roadmap-routes.json 00_resources/github-roadmaps/README.md
git commit -m "feat: align github roadmap projects"
```

Expected: commit succeeds.

---

### Task 4: Dry-Run and Apply the Roadmap Sync

**Files:**
- Live GitHub Projects only
- No repository files changed in this task

- [ ] **Step 1: Run a dry-run sync**

Run:

```bash
node scripts/sync-github-roadmaps.mjs --dry-run
```

Expected: JSON summary for six routes. `dryRun` is `true`; any logged additions say `Would add`.

- [ ] **Step 2: Run the real sync**

Run:

```bash
node scripts/sync-github-roadmaps.mjs
```

Expected: JSON summary for six routes. Missing open issue/PR URLs are added to their owner roadmap and to `All Active Work`.

- [ ] **Step 3: Verify target project item counts**

Run:

```bash
gh project item-list 2 --owner leebaroneau --limit 1000 --format json --jq '.totalCount'
gh project item-list 3 --owner leebaroneau --limit 1000 --format json --jq '.totalCount'
gh project item-list 4 --owner Haverford-Brands --limit 1000 --format json --jq '.totalCount'
gh project item-list 1 --owner alx-finance --limit 1000 --format json --jq '.totalCount'
gh project item-list 1 --owner Genvest-Property --limit 1000 --format json --jq '.totalCount'
gh project item-list "$KWA_PROJECT_NUMBER" --owner kwa-nguyen --limit 1000 --format json --jq '.totalCount'
```

Expected: counts are numeric. `All Active Work` should be at least as large as the largest owner-specific roadmap.

- [ ] **Step 4: Spot-check route coverage**

Run:

```bash
gh search issues user:leebaroneau is:open --include-prs --limit 5 --json url --jq '.[].url'
gh search issues org:Haverford-Brands is:open --include-prs --limit 5 --json url --jq '.[].url'
gh search issues org:alx-finance is:open --include-prs --limit 5 --json url --jq '.[].url'
gh search issues org:Genvest-Property is:open --include-prs --limit 5 --json url --jq '.[].url'
gh search issues org:kwa-nguyen is:open --include-prs --limit 5 --json url --jq '.[].url'
```

Expected: any returned URLs are visible in the relevant owner roadmap after sync. Returned URLs from any owner are also visible in `All Active Work`.

---

### Task 5: Close Superseded Older Projects

**Files:**
- Live GitHub Projects only
- No repository files changed in this task

- [ ] **Step 1: Compare old project item URLs against new roadmap URLs**

Run:

```bash
mkdir -p /tmp/github-roadmap-project-check
gh project item-list 4 --owner leebaroneau --limit 1000 --format json --jq '.items[].content.url // empty' | sort -u > /tmp/github-roadmap-project-check/old-marketing-projects.txt
gh project item-list 5 --owner leebaroneau --limit 1000 --format json --jq '.items[].content.url // empty' | sort -u > /tmp/github-roadmap-project-check/old-pipeline-core.txt
cat /tmp/github-roadmap-project-check/old-marketing-projects.txt /tmp/github-roadmap-project-check/old-pipeline-core.txt | sort -u > /tmp/github-roadmap-project-check/old-combined.txt

gh project item-list 2 --owner leebaroneau --limit 1000 --format json --jq '.items[].content.url // empty' | sort -u > /tmp/github-roadmap-project-check/all-active-work.txt
gh project item-list 3 --owner leebaroneau --limit 1000 --format json --jq '.items[].content.url // empty' | sort -u > /tmp/github-roadmap-project-check/leebaroneau-roadmap.txt
cat /tmp/github-roadmap-project-check/all-active-work.txt /tmp/github-roadmap-project-check/leebaroneau-roadmap.txt | sort -u > /tmp/github-roadmap-project-check/new-combined.txt

comm -23 /tmp/github-roadmap-project-check/old-combined.txt /tmp/github-roadmap-project-check/new-combined.txt
```

Expected: no output from `comm`. Any output means an old project has an item not visible in the new target boards; stop and add those URLs to the correct roadmap before closing old projects.

- [ ] **Step 2: Close the superseded old projects**

Run only after Step 1 prints no missing URLs:

```bash
gh project close 4 --owner leebaroneau
gh project close 5 --owner leebaroneau
```

Expected: both commands exit successfully.

- [ ] **Step 3: Verify old projects are closed and target projects remain open**

Run:

```bash
gh project list --owner leebaroneau --format json --jq '.projects[] | {number,title,closed}'
```

Expected:

- `All Active Work` is open.
- `leebaroneau Roadmap` is open.
- `Marketing Projects` is closed or absent from the open-project list.
- `Pipeline Core (lee-dashboard)` is closed or absent from the open-project list.

---

### Task 6: Final Verification

**Files:**
- Repository tests and live GitHub Projects

- [ ] **Step 1: Run the local test suite for roadmap sync**

Run:

```bash
node --test scripts/sync-github-roadmaps.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run a final dry-run**

Run:

```bash
node scripts/sync-github-roadmaps.mjs --dry-run
```

Expected: six-route summary. Additions may be zero if the real sync already ran.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: no uncommitted changes from this implementation. Existing unrelated dirty files may still appear; do not revert them.

- [ ] **Step 4: Report final project URLs**

Collect these with:

```bash
gh project view 2 --owner leebaroneau --format json --jq '.url'
gh project view 3 --owner leebaroneau --format json --jq '.url'
gh project view 4 --owner Haverford-Brands --format json --jq '.url'
gh project view 1 --owner alx-finance --format json --jq '.url'
gh project view 1 --owner Genvest-Property --format json --jq '.url'
gh project view "$KWA_PROJECT_NUMBER" --owner kwa-nguyen --format json --jq '.url'
```

Expected: six GitHub Project URLs, one per approved target project.

---

## Self-Review

- Spec coverage: covered project renaming, exact owner names, `kwa-nguyen` creation, owner-based routes, README updates, tests, sync dry-run/real run, and older project closure after coverage verification.
- Dynamic-value check: `KWA_PROJECT_NUMBER` is captured by an explicit command and used consistently in commands and config generation.
- Type consistency: config routes keep the existing `{ name, project: { owner, number }, queries, limit }` shape validated by `validateConfig`.
