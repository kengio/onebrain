#!/usr/bin/env bun
/**
 * sync-gemini-extension — copy shared OneBrain plugin assets into the
 * bundled Gemini extension folder.
 *
 * The Gemini extension at `.claude/plugins/onebrain/gemini/` ships its own
 * copy of skills/, agents/, INSTRUCTIONS.md, and references/gemini-tools.md
 * so it works as a self-contained `gemini extensions link` target. Re-run
 * this script after editing any sibling source file in the plugin so the
 * extension copy stays in sync.
 *
 * Run from repo root:
 *   bun scripts/sync-gemini-extension.ts
 */

import { cp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PLUGIN_ROOT = resolve('.claude/plugins/onebrain');
const EXTENSION_ROOT = join(PLUGIN_ROOT, 'gemini');

interface SyncEntry {
  src: string;
  dst: string;
  kind: 'dir' | 'file';
}

const ENTRIES: SyncEntry[] = [
  { src: 'skills', dst: 'skills', kind: 'dir' },
  { src: 'agents', dst: 'agents', kind: 'dir' },
  { src: 'INSTRUCTIONS.md', dst: 'INSTRUCTIONS.md', kind: 'file' },
  { src: 'references/gemini-tools.md', dst: 'references/gemini-tools.md', kind: 'file' },
];

async function syncEntry(entry: SyncEntry): Promise<void> {
  const srcPath = join(PLUGIN_ROOT, entry.src);
  const dstPath = join(EXTENSION_ROOT, entry.dst);

  if (entry.kind === 'dir') {
    // Replace the destination directory wholesale so renamed/deleted files
    // in the source don't leave stale copies behind.
    await rm(dstPath, { recursive: true, force: true });
    await cp(srcPath, dstPath, { recursive: true });
  } else {
    // Files: ensure parent dir exists, then copy.
    await mkdir(join(EXTENSION_ROOT, ...entry.dst.split('/').slice(0, -1)), { recursive: true });
    await cp(srcPath, dstPath);
  }
  console.log(`synced ${entry.src} → gemini/${entry.dst}`);
}

async function main(): Promise<void> {
  for (const entry of ENTRIES) {
    await syncEntry(entry);
  }
  console.log('\ngemini extension assets in sync.');
  console.log('commit the changes if any files were updated.');
}

main().catch((err) => {
  process.stderr.write(
    `sync-gemini-extension: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
