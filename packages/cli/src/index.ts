#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { checkpointCommand } from './internal/checkpoint.js';
import { migrateCommand } from './internal/migrate.js';
import { orphanScanCommand } from './internal/orphan-scan.js';
import { qmdReindexCommand } from './internal/qmd-reindex.js';
import { registerHooksCommand } from './internal/register-hooks.js';
import { resolveSessionToken, sessionInitCommand } from './internal/session-init.js';
import { vaultSyncCommand } from './internal/vault-sync.js';

// BUILD_VERSION and BUILD_DATE are injected as string literals at compile time
// via `bun build --define BUILD_VERSION='"x.y.z"'`. When running without --define
// (e.g. `bun run src/index.ts` during development), the identifiers are undeclared
// at runtime, and the typeof guard falls back to the dev placeholder.
declare const BUILD_VERSION: string;
declare const BUILD_DATE: string;
const VERSION = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : '0.0.0-dev';
const RELEASE_DATE = typeof BUILD_DATE !== 'undefined' ? BUILD_DATE : 'dev';

// Force UTF-8 for string writes to stdout/stderr on Windows.
// Fixes garbling of unicode chars (·, —) in piped output (e.g. JSON read by Claude).
// Does not change the console code page — Windows Terminal handles UTF-8 natively;
// legacy cmd.exe consoles require `chcp 65001` separately.
if (process.platform === 'win32') {
  process.stdout.setDefaultEncoding('utf8');
  process.stderr.setDefaultEncoding('utf8');
}

const VERSION_STRING = `OneBrain v${VERSION} — released ${RELEASE_DATE}`;

// Handle no-args case before commander parses anything.
if (process.argv.slice(2).length === 0) {
  console.log(VERSION_STRING);
  console.log('Run `onebrain help` for available commands.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Vault root auto-detect
// ---------------------------------------------------------------------------

/**
 * Walk up from startDir looking for vault.yml.
 * Returns the first directory containing vault.yml, or startDir if not found.
 */
function findVaultRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, 'vault.yml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir; // filesystem root — fall back to startDir
    dir = parent;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('onebrain')
  .description('OneBrain CLI — personal AI OS for Obsidian')
  .version(VERSION_STRING, '-v, --version');

// ── User-facing commands ──────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a new OneBrain vault')
  .option('--vault-dir <path>', 'vault root directory (default: cwd)')
  .option('--harness <harness>', 'harness type: claude-code | gemini | direct')
  .option('--force', 'overwrite existing vault.yml without prompting')
  .action(async (opts: { vaultDir?: string; harness?: string; force?: boolean }) => {
    await initCommand({
      vaultDir: opts.vaultDir,
      harness: opts.harness as 'claude-code' | 'gemini' | 'direct' | undefined,
      force: opts.force,
    });
  });

program
  .command('update')
  .description('Update OneBrain plugin files from GitHub')
  .option('--check', 'show what would change and exit without making changes')
  .option('--channel <channel>', 'update channel: stable | next')
  .action(async (opts: { check?: boolean; channel?: string }) => {
    await updateCommand({
      check: opts.check,
      channel: opts.channel as 'stable' | 'next' | undefined,
    });
  });

program
  .command('doctor')
  .description('Run vault health checks and report issues')
  .action(async () => {
    const vaultRoot = process.cwd();
    await doctorCommand({ vaultDir: vaultRoot, binaryVersion: VERSION });
  });

program
  .command('help')
  .description('Show this help message')
  .action(() => {
    program.help();
  });

// ── Internal hidden commands (not shown in --help) ────────────────────────────

program
  .command('session-init', { hidden: true })
  .description('Emit session token and datetime (called by Claude Code hook)')
  .option('--vault-dir <path>', 'vault root directory (default: auto-detect from cwd)')
  .action(async (opts: { vaultDir?: string }) => {
    const vaultRoot = opts.vaultDir ?? findVaultRoot(process.cwd());
    await sessionInitCommand(vaultRoot);
  });

program
  .command('orphan-scan', { hidden: true })
  .description('Scan for orphaned checkpoint files in logs folder')
  .argument('<logs_folder>', 'path to logs folder')
  .argument('<session_token>', 'current session token to exclude')
  .action(async (logsFolder: string, sessionToken: string) => {
    await orphanScanCommand(logsFolder, sessionToken);
  });

program
  .command('checkpoint', { hidden: true })
  .description('Handle checkpoint lifecycle (stop/precompact/postcompact/reset)')
  .argument('<mode>', 'stop | precompact | postcompact | reset')
  .option('--vault-dir <path>', 'vault root directory (default: auto-detect from cwd)')
  .action(async (mode: string, opts: { vaultDir?: string }) => {
    const token = await resolveSessionToken();
    const vaultRoot = opts.vaultDir ?? findVaultRoot(process.cwd());
    await checkpointCommand(mode, token, vaultRoot);
  });

program
  .command('qmd-reindex', { hidden: true })
  .description('Trigger qmd index rebuild')
  .action(async () => {
    const vaultRoot = process.cwd();
    await qmdReindexCommand(vaultRoot);
  });

program
  .command('vault-sync', { hidden: true })
  .description('Sync plugin files from GitHub to vault')
  .argument('[vault_root]', 'vault root directory (default: cwd)')
  .option('--branch <branch>', 'override branch (main | next)')
  .action(async (vaultRoot: string | undefined, opts: { branch?: string }) => {
    const root = vaultRoot ?? process.cwd();
    await vaultSyncCommand(root, { branch: opts.branch });
  });

program
  .command('register-hooks', { hidden: true })
  .description('Install Claude Code hooks into settings.json')
  .option('--vault-dir <path>', 'vault root directory (default: cwd)')
  .action(async (opts: { vaultDir?: string }) => {
    await registerHooksCommand(opts.vaultDir);
  });

program
  .command('migrate', { hidden: true })
  .description('Run one-time migration scripts')
  .argument('<name>', 'migration name: backfill-recapped')
  .action(async (name: string) => {
    await migrateCommand(name);
  });

program.parse(process.argv);
