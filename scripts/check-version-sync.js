#!/usr/bin/env node
// check-version-sync.js — exits 1 if any version field is out of sync

import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = new URL("..", import.meta.url).pathname;

function readJson(relPath) {
  const abs = resolve(ROOT, relPath);
  return JSON.parse(readFileSync(abs, "utf8"));
}

function readChangelogVersion(relPath) {
  const abs = resolve(ROOT, relPath);
  const content = readFileSync(abs, "utf8");
  // Parse YAML frontmatter: ---\nlatest_version: X.Y.Z\n---
  const match = content.match(/^---\s*\n(?:.*\n)*?latest_version:\s*(\S+)\s*\n(?:.*\n)*?---/m);
  if (!match) {
    throw new Error(`Could not find latest_version in frontmatter of ${relPath}`);
  }
  return match[1];
}

const sources = [
  { label: "packages/cli/package.json", get: () => readJson("packages/cli/package.json").version },
  { label: "packages/core/package.json", get: () => readJson("packages/core/package.json").version },
  { label: ".claude/plugins/onebrain/.claude-plugin/plugin.json", get: () => readJson(".claude/plugins/onebrain/.claude-plugin/plugin.json").version },
  { label: "CHANGELOG.md (latest_version)", get: () => readChangelogVersion("CHANGELOG.md") },
];

const results = sources.map(({ label, get }) => {
  try {
    const version = get();
    console.log(`  ${label}: ${version}`);
    return { label, version, error: null };
  } catch (err) {
    console.log(`  ${label}: ERROR — ${err.message}`);
    return { label, version: null, error: err.message };
  }
});

const versions = results.map((r) => r.version).filter(Boolean);
const unique = [...new Set(versions)];

if (results.some((r) => r.error)) {
  console.error("\n✗ Version sync check failed: could not read one or more sources.");
  process.exit(1);
}

if (unique.length === 1) {
  console.log(`\n✓ all versions in sync: ${unique[0]}`);
  process.exit(0);
} else {
  console.error("\n✗ Version mismatch detected:");
  for (const { label, version } of results) {
    if (version !== unique[0]) {
      console.error(`  - ${label} is ${version} (expected ${unique[0]})`);
    }
  }
  process.exit(1);
}
