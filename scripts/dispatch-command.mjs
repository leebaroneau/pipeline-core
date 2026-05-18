#!/usr/bin/env node

import { getCommand } from "./lib/slash-commands.mjs";

function rejectMessage(command, reason) {
  return `Command \`${command.name}\` rejected: ${reason}`;
}

export function planDispatch(ctx) {
  const cmd = getCommand(ctx.command.name);
  if (!cmd) {
    return {
      action: "reject",
      message: `Unknown command: ${ctx.command.name}`,
    };
  }

  if (cmd.status === "parsed-and-rejected") {
    return {
      action: "reject",
      message: `Command \`${cmd.name}\` is recognized but not enabled in this phase (Foundation, Spec 1). It is enabled in **Spec 2 — PR Integration**. ${cmd.description}`,
    };
  }

  if (!cmd.allowedActors.includes(ctx.actorKind)) {
    return {
      action: "reject",
      message: rejectMessage(cmd, `requires actor kind in [${cmd.allowedActors.join(", ")}], but caller is "${ctx.actorKind}".`),
    };
  }

  if (cmd.allowedFrom !== null && !cmd.allowedFrom.includes(ctx.issue.state)) {
    return {
      action: "reject",
      message: rejectMessage(cmd, `requires state in [${cmd.allowedFrom.join(", ")}], but current state is "${ctx.issue.state}".`),
    };
  }

  // Closure commands
  if (cmd.targetState === "Done") {
    const labelMap = {
      "/refuted": "refuted",
      "/duplicate": "duplicate",
      "/wontfix": "wontfix",
      "/cnr": "cnr",
    };
    const argText =
      cmd.name === "/refuted" ? ctx.command.args.why :
      cmd.name === "/duplicate" ? `Duplicate of ${ctx.command.args.of}` :
      cmd.name === "/wontfix" ? ctx.command.args.why :
      "Cannot reproduce";

    return {
      action: "transition",
      targetState: "Done",
      applyLabel: labelMap[cmd.name],
      closeWithReason: cmd.name === "/duplicate" ? "not_planned" : "completed",
      commentBody: `Closed by \`${ctx.actor}\` via \`${cmd.name}\`. ${argText}`,
    };
  }

  // /reopen
  if (cmd.name === "/reopen") {
    return {
      action: "reopen",
      targetState: ctx.command.args.skipTriage ? "Selected for Development" : "Triage",
      removeResolutionLabels: true,
      commentBody: `Reopened by \`${ctx.actor}\`${ctx.command.args.skipTriage ? " (skipping re-triage)" : ""}: ${ctx.command.args.why}`,
    };
  }

  // /ready triggers the ready-gate evaluator (which the workflow runs)
  if (cmd.name === "/ready") {
    return {
      action: "transition",
      targetState: "Selected for Development",
      runReadyGate: true,
    };
  }

  // /grab — claim issue, assign caller, default iteration:1
  if (cmd.name === "/grab") {
    return {
      action: "transition",
      targetState: "In Progress",
      assignActor: true,
      applyLabel: "iteration:1",
      commentBody: `\`${ctx.actor}\` grabbed this issue. Iteration 1 begins.`,
    };
  }

  // /release — un-assign caller, return to Selected for Development
  if (cmd.name === "/release") {
    return {
      action: "transition",
      targetState: "Selected for Development",
      unassignActor: true,
      commentBody: `\`${ctx.actor}\` released this issue back to Selected for Development.`,
    };
  }

  // /iterate — increment iteration label, move from In Review to In Progress
  if (cmd.name === "/iterate") {
    const reason = ctx.command.args.reason;
    if (!reason || reason.trim().length === 0) {
      return {
        action: "reject",
        message: "`/iterate` requires a reason. Example: `/iterate data refuted hypothesis; trying a refined approach`.",
      };
    }
    return {
      action: "transition",
      targetState: "In Progress",
      incrementIteration: true,
      requirePermission: cmd.requirePermission,
      commentBody: `\`${ctx.actor}\` started a new iteration: ${reason}`,
    };
  }

  // /unblock and /unpark: Foundation has no persisted history, so we cannot truly restore
  // the prior state. Fall back to Triage. Spec 2 will read Projects v2 Iteration history.
  if (cmd.targetState === "__previous") {
    return {
      action: "transition",
      targetState: "Triage",
      commentBody: `\`${cmd.name}\` invoked by \`${ctx.actor}\`. Returning to Triage (Foundation has no state history; Spec 2 will restore prior state via Projects v2).`,
    };
  }

  // Side-state transitions (/block, /park, /needs-info, /info-resolved)
  const argText = Object.entries(ctx.command.args)
    .filter(([k, v]) => v && k !== "skipTriage")
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

  return {
    action: "transition",
    targetState: cmd.targetState,
    commentBody: `\`${cmd.name}\` invoked by \`${ctx.actor}\`${argText ? `. ${argText}` : ""}.`,
  };
}
