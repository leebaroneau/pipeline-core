#!/usr/bin/env node

const RESOLUTION_LABELS = new Set(["refuted", "duplicate", "wontfix", "cnr"]);
const CLOSURE_COMMANDS = /^\s*\/(refuted|duplicate|wontfix|cnr)(\s|$)/;
const RECENT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const MERGE_REFERENCE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

function timestampMs(event) {
  const value = event.created_at || event.createdAt;
  return value ? new Date(value).getTime() : NaN;
}

export function hasMergedPrClosureEvent(timelineEvents = []) {
  if (timelineEvents.some((event) => event.event === "closed" && event.commit_id != null)) {
    return true;
  }

  const closedAt = timelineEvents
    .filter((event) => event.event === "closed")
    .map(timestampMs)
    .filter((time) => !Number.isNaN(time));

  if (closedAt.length === 0) {
    return false;
  }

  return timelineEvents
    .filter((event) => event.event === "referenced" && event.commit_id != null)
    .map(timestampMs)
    .filter((time) => !Number.isNaN(time))
    .some((referenceTime) =>
      closedAt.some((closeTime) => Math.abs(referenceTime - closeTime) <= MERGE_REFERENCE_WINDOW_MS)
    );
}

export function shouldRevertClose({ labels, recentComments, mergedPrLinked, timelineEvents }) {
  if (mergedPrLinked || hasMergedPrClosureEvent(timelineEvents)) {
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
