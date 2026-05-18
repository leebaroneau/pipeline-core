#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { loadConfig, ConfigLoadError } from "./lib/config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "schemas", "pipeline-config.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const ajvValidate = ajv.compile(schema);

export function validateConfig(config) {
  const errors = [];

  if (!ajvValidate(config)) {
    for (const err of ajvValidate.errors ?? []) {
      errors.push({
        path: err.instancePath || "/",
        message: err.message,
      });
    }
  }

  // Cross-field validations beyond what JSON schema can express
  if (Array.isArray(config?.domains) && Array.isArray(config?.path_mappings)) {
    const domainNames = new Set(config.domains.map((d) => d.name));
    const componentNames = new Set((config.components ?? []).map((c) => c.name));

    for (let i = 0; i < config.path_mappings.length; i++) {
      const mapping = config.path_mappings[i];
      for (const label of mapping.labels ?? []) {
        if (label.startsWith("domain:")) {
          const name = label.slice("domain:".length);
          if (!domainNames.has(name)) {
            errors.push({
              path: `/path_mappings/${i}/labels`,
              message: `path_mappings[${i}] references undeclared domain "${name}"`,
            });
          }
        } else if (label.startsWith("component:")) {
          const name = label.slice("component:".length);
          if (!componentNames.has(name)) {
            errors.push({
              path: `/path_mappings/${i}/labels`,
              message: `path_mappings[${i}] references undeclared component "${name}"`,
            });
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/validate-config.mjs")) {
  const configPath = process.argv[2] || ".github/pipeline-config.yml";
  try {
    const config = loadConfig(configPath);
    const result = validateConfig(config);
    if (result.valid) {
      console.log(`OK ${configPath} is valid (schema_version ${config.schema_version})`);
      process.exit(0);
    } else {
      console.error(`FAIL ${configPath} has ${result.errors.length} error(s):`);
      for (const err of result.errors) {
        console.error(`  - ${err.message}`);
      }
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof ConfigLoadError) {
      console.error(`FAIL ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
