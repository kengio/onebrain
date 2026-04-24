#!/usr/bin/env bun
// generate-marketplace-json.js — build marketplace.json for OneBrain plugin releases

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_JSON_PATH = resolve(ROOT, ".claude/plugins/onebrain/.claude-plugin/plugin.json");

// ─── Read plugin.json ─────────────────────────────────────────────────────
const plugin = JSON.parse(readFileSync(PLUGIN_JSON_PATH, "utf8"));

// ─── Resolve env vars (with fallbacks) ───────────────────────────────────
const VERSION = process.env.VERSION ?? plugin.version;
const RELEASE_DATE = process.env.RELEASE_DATE ?? new Date().toISOString().slice(0, 10);
const REPO = process.env.REPO ?? "kengio/onebrain";

// ─── Read sha256 for the plugin ZIP (optional — skip if not found) ────────
const SHA256_FILE = resolve(ROOT, `onebrain-plugin-v${VERSION}.sha256`);
let sha256 = null;
if (existsSync(SHA256_FILE)) {
  // sha256sum output: "<hash>  <filename>"
  const raw = readFileSync(SHA256_FILE, "utf8").trim();
  sha256 = raw.split(/\s+/)[0];
} else {
  console.warn(`[warn] SHA256 file not found: ${SHA256_FILE} — skipping sha256 field`);
}

// ─── Build marketplace.json ───────────────────────────────────────────────
const downloadUrl =
  `https://github.com/${REPO}/releases/download/v${VERSION}/onebrain-plugin-v${VERSION}.zip`;

const marketplace = {
  name: plugin.name,
  version: plugin.version,
  description: plugin.description,
  author: plugin.author,
  latestVersion: VERSION,
  releaseDate: RELEASE_DATE,
  downloadUrl,
  ...(sha256 !== null ? { sha256 } : {}),
};

// ─── Write + print ────────────────────────────────────────────────────────
const OUTPUT_PATH = resolve(ROOT, "marketplace.json");
const json = JSON.stringify(marketplace, null, 2);

writeFileSync(OUTPUT_PATH, json + "\n", "utf8");

console.log(json);
console.error(`[ok] marketplace.json written to ${OUTPUT_PATH}`);
