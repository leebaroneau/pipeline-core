export const universalLabels = [
  // type:* — Atlassian Jira issue types + this pipeline's experiment addition
  { name: "type:bug", color: "d73a4a", description: "Something broken (Jira: Bug)" },
  { name: "type:story", color: "0e8a16", description: "New user-facing capability (Jira: Story)" },
  { name: "type:task", color: "bfdadc", description: "Internal work: refactor, docs, infra (Jira: Task)" },
  { name: "type:spike", color: "fbca04", description: "Pure investigation; no acceptance criteria yet (Jira: Spike)" },
  { name: "type:experiment", color: "8957e5", description: "Hypothesis-driven change with measurable outcome" },
  { name: "type:epic", color: "fb8500", description: "Parent of multiple issues (Jira: Epic)" },

  // Resolution flags applied at closure
  { name: "refuted", color: "8b0000", description: "Closed: hypothesis refuted (evidence recorded in issue body)" },
  { name: "duplicate", color: "cccccc", description: "Closed: duplicate of another issue" },
  { name: "wontfix", color: "cccccc", description: "Closed: won't fix" },
  { name: "cnr", color: "cccccc", description: "Closed: cannot reproduce" },

  // Source flags
  { name: "source:notion", color: "9ec5fe", description: "Created via the Notion Submission Layer (Phase 2)" },

  // Status fallback labels (used when Projects v2 board is not configured)
  { name: "status:backlog", color: "ededed", description: "Status: Backlog (fallback — prefer Projects v2 Status field)" },
  { name: "status:triage", color: "fbca04", description: "Status: Triage" },
  { name: "status:needs-info", color: "f9d0c4", description: "Status: Needs Info" },
  { name: "status:selected", color: "0e8a16", description: "Status: Selected for Development" },
  { name: "status:in-progress", color: "1d76db", description: "Status: In Progress" },
  { name: "status:experimenting", color: "8957e5", description: "Status: In Experiment" },
  { name: "status:review", color: "5319e7", description: "Status: In Review" },
  { name: "status:blocked", color: "b60205", description: "Status: Blocked" },
  { name: "status:on-hold", color: "808080", description: "Status: On Hold" },
  { name: "status:done", color: "0e8a16", description: "Status: Done" },

  // Priority fallback labels (used when Projects v2 board is not configured)
  { name: "priority:highest", color: "b60205", description: "Priority: Highest (Jira terminology — drop everything)" },
  { name: "priority:high", color: "d93f0b", description: "Priority: High" },
  { name: "priority:medium", color: "fbca04", description: "Priority: Medium (default)" },
  { name: "priority:low", color: "0e8a16", description: "Priority: Low" },

  // Story Points fallback labels (T-shirt sizes, used when Projects v2 board is not configured)
  { name: "points:xs", color: "c2e0c6", description: "Story Points: XS (trivial, <1 hour)" },
  { name: "points:s", color: "8fd19e", description: "Story Points: S (small, half-day)" },
  { name: "points:m", color: "5cb85c", description: "Story Points: M (medium, 1-2 days)" },
  { name: "points:l", color: "3d8b3d", description: "Story Points: L (large, 3-5 days)" },
  { name: "points:xl", color: "1d5a1d", description: "Story Points: XL (huge — consider splitting)" },

  // Iteration tracking (Spec 2 §8). Cap at 5 — beyond is a smell signaling refute + replan.
  { name: "iteration:1", color: "e0e0e0", description: "Iteration 1 — first attempt at the hypothesis" },
  { name: "iteration:2", color: "c0c0c0", description: "Iteration 2 — first re-loop after refuted attempt" },
  { name: "iteration:3", color: "a0a0a0", description: "Iteration 3 — getting concerning; consider refuting" },
  { name: "iteration:4", color: "808080", description: "Iteration 4 — high cost; strong signal the hypothesis is wrong" },
  { name: "iteration:5", color: "606060", description: "Iteration 5 — max; refute and re-plan instead of iterating again" },
];
