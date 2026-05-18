import { readFileSync } from "node:fs";
import yaml from "js-yaml";

export class ConfigLoadError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "ConfigLoadError";
    this.cause = cause;
  }
}

export function loadConfig(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new ConfigLoadError(`Cannot read config at ${path}: ${err.message}`, err);
  }
  try {
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new ConfigLoadError(`Config at ${path} did not parse to an object`);
    }
    return parsed;
  } catch (err) {
    if (err instanceof ConfigLoadError) throw err;
    throw new ConfigLoadError(`Invalid YAML in ${path}: ${err.message}`, err);
  }
}
