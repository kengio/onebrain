/**
 * migrate — internal command
 *
 * Runs one-time migration scripts to update vault state.
 * Currently supports `backfill-recapped` migration.
 *
 * Output: plain text summary (not JSON)
 * Exit code: always 0 (internal pattern)
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadVaultConfig } from '../../lib/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MigrateResult = {
  backfilled: number;
  skipped: number;
};

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter from markdown text.
 * Returns { frontmatter object, remainingText } or null if no valid frontmatter.
 */
function parseFrontmatterWithRest(rawText: string): {
  frontmatter: Record<string, unknown>;
  rest: string;
} | null {
  const text = rawText.replace(/\r\n/g, '\n');
  if (!text.startsWith('---')) return null;

  // Require closing --- to be followed by newline or end-of-string (bare --- line only).
  // Rejects lines like ---foo or ---some-separator as false closers.
  const endMatch = /\n---(\n|$)/.exec(text.slice(3));
  if (!endMatch) return null;
  const endIdx = 3 + endMatch.index;
  const rest = text.slice(endIdx + endMatch[0].length);

  const fmText = text.slice(3, endIdx).trim();

  try {
    const parsed = parse(fmText);
    if (parsed && typeof parsed === 'object') {
      return {
        frontmatter: parsed as Record<string, unknown>,
        rest,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File listing helper
// ---------------------------------------------------------------------------

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((e) => e.endsWith('.md'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// runBackfillRecapped (testable core)
// ---------------------------------------------------------------------------

/**
 * Core logic for backfill-recapped migration.
 * Scans session logs at `[logsFolder]/session/YYYY/MM/` and adds
 * `recapped: <today-date>` to frontmatter where missing.
 *
 * Post-v2.4.0: session logs live under `session/YYYY/MM/`, not at the
 * `logsFolder` top level. Caller (`/update`) always runs the 07-logs
 * structure migration (Step 0) before invoking this, so by the time
 * we walk, the new layout is in place.
 *
 * @param logsFolder - absolute path to logs folder
 * @param cutoffDate - ISO date string (YYYY-MM-DD); skip logs with date > cutoffDate
 * @returns MigrateResult with backfilled and skipped counts
 */
export async function runBackfillRecapped(
  logsFolder: string,
  cutoffDate?: string,
): Promise<MigrateResult> {
  const today = new Date().toISOString().slice(0, 10);
  let backfilled = 0;
  let skipped = 0;

  // List all year directories under session/ (post-v2.4.0 layout).
  const sessionRoot = join(logsFolder, 'session');
  let yearDirs: string[] = [];
  try {
    yearDirs = await readdir(sessionRoot);
  } catch {
    // session/ doesn't exist (fresh vault, no session logs yet, or
    // pre-v2.4.0 vault that hasn't run the structure migration).
    // Return empty — nothing to backfill.
    return { backfilled: 0, skipped: 0 };
  }

  for (const yearDir of yearDirs) {
    const yearPath = join(sessionRoot, yearDir);

    // List all month directories under year
    let monthDirs: string[] = [];
    try {
      monthDirs = await readdir(yearPath);
    } catch {
      continue;
    }

    for (const monthDir of monthDirs) {
      const monthPath = join(yearPath, monthDir);
      const files = await listMdFiles(monthPath);

      for (const fname of files) {
        const fpath = join(monthPath, fname);

        // Whitelist: only session logs get the `recapped:` frontmatter
        // backfill. The logs folder also contains `*-checkpoint-*.md`,
        // `*-update-vX.Y.Z.md`, and `*-weekly.md` — none of which carry
        // a `recapped:` field by convention. The previous blacklist
        // (`-checkpoint-` only) silently mutated update + weekly log
        // frontmatter with a meaningless `recapped:` value.
        if (!fname.includes('-session-')) {
          continue;
        }

        // Skip logs newer than cutoff (YYYY-MM-DD prefix from filename)
        if (cutoffDate) {
          const dateMatch = fname.match(/^(\d{4}-\d{2}-\d{2})/);
          if (dateMatch?.[1] !== undefined && dateMatch[1] > cutoffDate) {
            continue;
          }
        }

        try {
          const content = await readFile(fpath, 'utf8');
          const parsed = parseFrontmatterWithRest(content);

          if (!parsed) {
            // No frontmatter or malformed
            process.stderr.write(`migrate: ${fname} — malformed frontmatter\n`);
            skipped++;
            continue;
          }

          const { frontmatter, rest } = parsed;

          // Skip if already has recapped
          if (frontmatter['recapped'] !== undefined) {
            continue;
          }

          // Add recapped field
          frontmatter['recapped'] = today;

          // Rebuild file with updated frontmatter
          const updatedFm = stringify(frontmatter);
          const updatedContent = `---\n${updatedFm}---\n${rest}`;

          await writeFile(fpath, updatedContent, 'utf8');
          backfilled++;
        } catch (error) {
          process.stderr.write(`migrate: error processing ${fname}: ${error}\n`);
          skipped++;
        }
      }
    }
  }

  return { backfilled, skipped };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Run migrate as a CLI command.
 * Currently supports 'backfill-recapped' migration.
 * Always exits 0 (internal pattern).
 */
export async function migrateCommand(
  migrationName: string,
  cutoffDate?: string,
  vaultDir?: string,
): Promise<void> {
  try {
    const vaultRoot = vaultDir ?? process.cwd();
    const config = await loadVaultConfig(vaultRoot);
    const logsFolder = join(vaultRoot, config.folders.logs);

    if (migrationName === 'backfill-recapped') {
      const result = await runBackfillRecapped(logsFolder, cutoffDate);
      process.stdout.write(`backfilled: ${result.backfilled} files, skipped: ${result.skipped}\n`);
    } else {
      process.stderr.write(`migrate: unknown migration '${migrationName}'\n`);
    }
  } catch (error) {
    process.stderr.write(`migrate: ${error}\n`);
  }
}
