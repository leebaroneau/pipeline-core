// scripts/pipeline/lib/workflow-lint-rules.mjs
// Each rule: (parsedWorkflow, ctx) => { ok, failures }
// ctx provides filename (basename, e.g. "pipeline-foo.yml") and optionally scriptExists(path).

export const ALLOWLIST_CONTENTS_WRITE = ["pipeline-labels-sync", "labels-sync"];
const ALLOWED_SECRETS = new Set(["GITHUB_TOKEN"]);
const PINNED_TAG_RE = /@v\d+(\.\d+)?(\.\d+)?$/;

function jobs(wf) {
  return Object.entries(wf.jobs ?? {});
}

export function requireExplicitPermissions(wf, ctx) {
  const failures = [];
  // Workflow-level permissions apply to every job by default — that's an explicit declaration.
  const workflowHasPermissions = wf.permissions != null;
  for (const [jobName, job] of jobs(wf)) {
    // A reusable-workflow caller job uses `uses:` and doesn't need permissions here —
    // the caller's permissions are declared at the calling job level by GitHub.
    if (job.uses && !job.steps) continue;
    if (!job.permissions && !workflowHasPermissions) {
      failures.push(`${ctx.filename}: job '${jobName}' missing permissions: block (no workflow-level permissions either)`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function noBroadContentsWrite(wf, ctx) {
  const failures = [];
  const basename = ctx.filename.replace(/\.ya?ml$/, "");
  const allowed = ALLOWLIST_CONTENTS_WRITE.includes(basename);
  for (const [jobName, job] of jobs(wf)) {
    const perms = job.permissions ?? {};
    if (perms.contents === "write" && !allowed) {
      failures.push(`${ctx.filename}: job '${jobName}' uses contents: write but '${basename}' is not in ALLOWLIST_CONTENTS_WRITE`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function noUnknownSecrets(wf, ctx) {
  const failures = [];
  const seen = new Set();
  const text = JSON.stringify(wf);
  const re = /\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].toUpperCase();
    if (ALLOWED_SECRETS.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    failures.push(`${ctx.filename}: references unknown secret '${m[1]}' (only GITHUB_TOKEN allowed)`);
  }
  return { ok: failures.length === 0, failures };
}

export function pinnedReusableWorkflowVersions(wf, ctx) {
  const failures = [];
  for (const [jobName, job] of jobs(wf)) {
    if (!job.uses) continue;
    if (!PINNED_TAG_RE.test(job.uses)) {
      failures.push(`${ctx.filename}: job '${jobName}' uses '${job.uses}' — unpinned (use @vN or @vN.N.N tag)`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function workflowNameConvention(wf, ctx) {
  const failures = [];
  // Mirror uses bare names (triage-gate.yml); consumer repos use pipeline- prefix.
  // Accept either form.
  if (!/^(pipeline-)?[a-z][a-z-]*\.ya?ml$/.test(ctx.filename)) {
    failures.push(`${ctx.filename}: filename must be lowercase-kebab.yml`);
  }
  if (wf.name && !/^(pipeline |Pipeline (?:— |- ))/.test(wf.name)) {
    failures.push(`${ctx.filename}: top-level name '${wf.name}' must start with 'pipeline ' or 'Pipeline — '`);
  }
  return { ok: failures.length === 0, failures };
}

export function referencedScriptsExist(wf, ctx) {
  const failures = [];
  const scriptExists = ctx.scriptExists ?? (() => true);
  const text = JSON.stringify(wf);
  // Match both consumer-repo paths (scripts/pipeline/...) and
  // mirror paths (.pipeline-core/scripts/...).
  const re = /node\s+((?:\.pipeline-core\/)?scripts\/(?:pipeline\/)?[\w./-]+\.mjs)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const rawPath = m[1];
    // .pipeline-core/scripts/... paths are resolved at install time in the caller's
    // repo; from the mirror's CWD they map to scripts/... (strip the .pipeline-core/ prefix).
    const checkPath = rawPath.startsWith(".pipeline-core/")
      ? rawPath.slice(".pipeline-core/".length)
      : rawPath;
    if (!scriptExists(checkPath)) {
      failures.push(`${ctx.filename}: references missing script '${rawPath}'`);
    }
  }
  return { ok: failures.length === 0, failures };
}
