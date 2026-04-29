/**
 * orphan-scan — internal command
 *
 * Scans the logs folder for unmerged checkpoint files (orphans).
 * An orphan is a checkpoint whose session was never wrapped up via /wrapup.
 *
 * Output: JSON { orphan_count: N }
 * Exit code always 0.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrphanScanResult = {
  orphan_count: number;
};

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter from markdown text.
 * Returns parsed object or null if no valid frontmatter.
 */
function parseFrontmatter(rawText: string): Record<string, unknown> | null {
  const text = rawText.replace(/\r\n/g, '\n');
  if (!text.startsWith('---')) return null;
  const endIdx = text.indexOf('\n---', 3);
  if (endIdx === -1) return null;
  const fm = text.slice(3, endIdx).trim();
  try {
    const parsed = parse(fm);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Month directory helpers
// ---------------------------------------------------------------------------

/**
 * Get current and previous month as { thisYear, thisMonth, prevYear, prevMonth }
 * All values are zero-padded strings.
 */
function getMonthParts(now: Date = new Date()): {
  thisYear: string;
  thisMonth: string;
  prevYear: string;
  prevMonth: string;
} {
  const thisYear = String(now.getFullYear());
  const thisMonth = String(now.getMonth() + 1).padStart(2, '0');

  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYear = String(prevDate.getFullYear());
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');

  return { thisYear, thisMonth, prevYear, prevMonth };
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
// Core scan logic
// ---------------------------------------------------------------------------

/**
 * Check whether a given date has a manually-run session log (non-auto-saved).
 * Returns true if such a log exists.
 */
async function hasManualSessionLog(monthDir: string, date: string): Promise<boolean> {
  const files = await listMdFiles(monthDir);
  const sessionLogs = files.filter(
    (f) => f.startsWith(date) && !f.includes('-checkpoint-') && f.endsWith('.md'),
  );

  for (const logName of sessionLogs) {
    try {
      const content = await readFile(join(monthDir, logName), 'utf8');
      const fm = parseFrontmatter(content);
      // auto-saved: true → written by auto-summary, NOT a wrapup log → keep scanning
      if (fm && (fm['auto-saved'] === true || fm['auto-saved'] === 'true')) continue;
      // Either no frontmatter or auto-saved is false/absent → this is a manual wrapup log
      return true;
    } catch {
      // Can't read — skip
    }
  }
  return false;
}

/**
 * Scan one month directory for orphan checkpoints.
 * Returns a set of orphan session tokens (one per distinct session).
 */
async function scanMonthDir(
  monthDir: string,
  currentToken: string,
  today: string,
  seenTokens: Set<string>,
): Promise<number> {
  const files = await listMdFiles(monthDir);
  const checkpoints = files.filter((f) => f.includes('-checkpoint-') && f.endsWith('.md'));

  let count = 0;

  for (const fname of checkpoints) {
    // Filename format: YYYY-MM-DD-{token}-checkpoint-{NN}.md
    const dateMatch = fname.match(/^(\d{4}-\d{2}-\d{2})-/);
    if (!dateMatch) continue;
    const fdate = dateMatch[1] ?? '';

    // Extract token: everything between date- prefix and -checkpoint-
    const afterDate = fname.slice(fdate.length + 1); // strip "YYYY-MM-DD-"
    const cpIdx = afterDate.indexOf('-checkpoint-');
    if (cpIdx === -1) continue;
    const ftoken = afterDate.slice(0, cpIdx);
    if (!ftoken) continue;

    // Skip today's checkpoints — not orphans yet
    if (fdate === today) continue;

    // Skip current session's own checkpoints
    if (ftoken === currentToken) continue;

    // Skip tokens already counted (dedup across multiple checkpoint files per session)
    if (seenTokens.has(ftoken)) continue;

    // Skip if a manual session log covers this date
    if (await hasManualSessionLog(monthDir, fdate)) continue;

    // Orphan confirmed
    seenTokens.add(ftoken);
    count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// runOrphanScan (testable core)
// ---------------------------------------------------------------------------

/**
 * Core logic for orphan-scan.
 * @param logsFolder - absolute path to logs folder
 * @param sessionToken - current session token to exclude
 * @returns OrphanScanResult
 */
export async function runOrphanScan(
  logsFolder: string,
  sessionToken: string,
): Promise<OrphanScanResult> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { thisYear, thisMonth, prevYear, prevMonth } = getMonthParts();

  const monthDirs: Array<{ year: string; month: string }> = [
    { year: thisYear, month: thisMonth },
    { year: prevYear, month: prevMonth },
  ];

  // Dedup tokens across both month dirs
  const seenTokens = new Set<string>();
  let totalOrphans = 0;

  for (const { year, month } of monthDirs) {
    const monthDir = join(logsFolder, year, month);
    totalOrphans += await scanMonthDir(monthDir, sessionToken, today, seenTokens);
  }

  return { orphan_count: totalOrphans };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Run orphan-scan as a CLI command: print JSON to stdout, always exit 0.
 */
export async function orphanScanCommand(logsFolder: string, sessionToken: string): Promise<void> {
  const result = await runOrphanScan(logsFolder, sessionToken);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
