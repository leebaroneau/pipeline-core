#!/usr/bin/env node

const RESOLUTION_LABELS = new Set(["refuted", "duplicate", "wontfix", "cnr"]);
const CLOSURE_COMMANDS = /^\s*\/(refuted|duplicate|wontfix|cnr)(\s|$)/;
const RECENT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export function shouldRevertClose({ labels, recentComments, mergedPrLinked }) {
  if (mergedPrLinked) {
    return { revert: false };
  }

  if ((labels || []).some((l) => RESOLUTION_LABELS.has(l))) {
    return { revert: false };
  }

  const now = Date.now();
  const recent = (recentComments || []).find((c) => {
    const age = now - new Date(c.createdAt).getTime();
    return age <= RECENT_WINDOW_MS && CLOSURE_COMMANDS.test(c.body);
  });

  if (recent) {
    return { revert: false };
  }

  return {
    revert: true,
    message: "Issues must close via PR merge or a resolution slash command (`/refuted`, `/duplicate`, `/wontfix`, `/cnr`). Please re-close using one of those.",
  };
}
