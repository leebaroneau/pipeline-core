#!/usr/bin/env node

import { getCommand } from "./lib/slash-commands.mjs";

const COMMAND_RE = /^\s*\/([a-z-]+)\s*(.*?)\s*$/i;

function parseArgs(commandName, rawArgs) {
  const cmd = getCommand(`/${commandName}`);
  if (!cmd) return null;

  const args = {};
  let remaining = rawArgs;

  // Detect --skip-triage flag for /reopen
  if (cmd.args.includes("skipTriage")) {
    const flagRe = /(^|\s)--skip-triage(\s|$)/;
    if (flagRe.test(remaining)) {
      args.skipTriage = true;
      remaining = remaining.replace(flagRe, " ").trim();
    } else {
      args.skipTriage = false;
    }
  }

  // The remaining text fills the FIRST non-flag arg, if any
  const stringArg = cmd.args.find((a) => a !== "skipTriage");
  if (stringArg) {
    args[stringArg] = remaining.trim();
  }

  return args;
}

export function parseSlashCommand(comment) {
  if (typeof comment !== "string") return null;
  const firstLine = comment.split("\n")[0];
  const match = firstLine.match(COMMAND_RE);
  if (!match) return null;

  const name = `/${match[1].toLowerCase()}`;
  const rawArgs = match[2] || "";

  const cmd = getCommand(name);
  if (!cmd) return null;

  const args = parseArgs(match[1].toLowerCase(), rawArgs);
  return { name, rawArgs, args };
}
