// scripts/pipeline/check-label-catalog.mjs
// Compares declared catalog (labels.yml content) vs live GitHub repo labels.

export async function checkLabelCatalog({ github, owner, repo, declaredLabels }) {
  // listLabelsForRepo paginates at 100; for now assume <100 labels (current: 47).
  // If catalog grows beyond 100, add pagination.
  const { data: liveLabels } = await github.rest.issues.listLabelsForRepo({
    owner, repo, per_page: 100,
  });

  const declaredNames = new Set(declaredLabels.map((l) => l.name));
  const liveNames = new Set(liveLabels.map((l) => l.name));

  const missingInLive = [...declaredNames].filter((n) => !liveNames.has(n)).sort();
  const extraInLive = [...liveNames].filter((n) => !declaredNames.has(n)).sort();

  return {
    ok: missingInLive.length === 0 && extraInLive.length === 0,
    missingInLive,
    extraInLive,
  };
}

export function formatLabelCatalogReport({ missingInLive, extraInLive }) {
  const sections = [];
  if (missingInLive.length > 0) {
    sections.push(`### Declared but missing on repo\n\n${missingInLive.map((n) => `- \`${n}\``).join("\n")}\n\n(Labels-sync should apply these — check if the workflow last ran successfully.)`);
  }
  if (extraInLive.length > 0) {
    sections.push(`### On repo but not declared\n\n${extraInLive.map((n) => `- \`${n}\``).join("\n")}\n\n(Either add them to \`labels.yml\` or remove them from the repo.)`);
  }
  return sections.join("\n\n");
}
