#!/usr/bin/env bun
// check-version-sync.js — exits 1 if versions within each track are out of sync
//
// Two independent version tracks:
//   CLI track:    packages/cli + packages/core (npm binary releases)
//   Plugin track: plugin.json + CHANGELOG.md  (/update vault releases)

import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = new URL("..", import.meta.url).pathname;

function readJson(relPath) {
  const abs = resolve(ROOT, relPath);
  const data = JSON.parse(readFileSync(abs, "utf8"));
  if (typeof data.version !== "string" || !data.version) {
    throw new Error(`Missing or empty "version" field in ${relPath}`);
  }
  return data;
}

function readChangelogVersion(relPath) {
  const abs = resolve(ROOT, relPath);
  const content = readFileSync(abs, "utf8");
  const match = content.match(/^---\s*\n(?:.*\n)*?latest_version:\s*(\S+)\s*\n(?:.*\n)*?---/m);
  if (!match) {
    throw new Error(`Could not find latest_version in frontmatter of ${relPath}`);
  }
  return match[1];
}

const tracks = [
  {
    name: "CLI",
    sources: [
      { label: "packages/cli/package.json", get: () => readJson("packages/cli/package.json").version },
      { label: "packages/core/package.json", get: () => readJson("packages/core/package.json").version },
    ],
  },
  {
    name: "Plugin",
    sources: [
      { label: ".claude/plugins/onebrain/.claude-plugin/plugin.json", get: () => readJson(".claude/plugins/onebrain/.claude-plugin/plugin.json").version },
      { label: "CHANGELOG.md (latest_version)", get: () => readChangelogVersion("CHANGELOG.md") },
    ],
  },
];

let failed = false;

for (const track of tracks) {
  console.log(`\n${track.name} track:`);
  const results = track.sources.map(({ label, get }) => {
    try {
      const version = get();
      console.log(`  ${label}: ${version}`);
      return { label, version, error: null };
    } catch (err) {
      console.log(`  ${label}: ERROR — ${err.message}`);
      return { label, version: null, error: err.message };
    }
  });

  if (results.some((r) => r.error)) {
    console.error(`  ✗ Could not read one or more sources in ${track.name} track.`);
    failed = true;
    continue;
  }

  const versions = results.map((r) => r.version);
  const unique = [...new Set(versions)];

  if (unique.length === 1) {
    console.log(`  ✓ in sync: ${unique[0]}`);
  } else {
    console.error(`  ✗ Version mismatch in ${track.name} track:`);
    const expected = versions[0];
    for (const { label, version } of results) {
      if (version !== expected) {
        console.error(`    - ${label} is ${version} (expected ${expected})`);
      }
    }
    failed = true;
  }
}

console.log("");
process.exit(failed ? 1 : 0);
