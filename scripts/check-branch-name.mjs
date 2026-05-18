#!/usr/bin/env node

// Branch-name validator. Spec 2 §6.1.
// Pattern: <type>/<issue-#>-<slug> where:
//   - type ∈ {bug, story, task, spike, experiment, epic}
//   - issue-# is one or more digits
//   - slug is lowercase letters, digits, and hyphens (no underscores)

export const BRANCH_NAME_REGEX = /^(bug|story|task|spike|experiment|epic)\/[0-9]+-[a-z0-9]+(-[a-z0-9]+)*$/;

export function checkBranchName(branchName) {
  if (typeof branchName !== "string" || branchName.length === 0) {
    return { ok: false, reasons: ["Branch name is empty or undefined."] };
  }
  if (!BRANCH_NAME_REGEX.test(branchName)) {
    return {
      ok: false,
      reasons: [
        `Branch name "${branchName}" does not match the required pattern \`<type>/<issue-#>-<slug>\`. Valid types: bug, story, task, spike, experiment, epic. Example: \`experiment/42-add-domain-labels\`.`,
      ],
    };
  }
  return { ok: true, reasons: [] };
}
