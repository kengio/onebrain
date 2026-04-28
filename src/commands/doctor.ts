import { cancel, intro, log, outro, spinner as createSpinner } from '@clack/prompts';
import pc from 'picocolors';
import {
  type DoctorResult,
  type VaultConfig,
  checkFolders,
  checkHarnessBinary,
  checkOrphanCheckpoints,
  checkPluginFiles,
  checkQmdEmbeddings,
  checkSettingsHooks,
  checkVaultYml,
  checkVaultYmlKeys,
  loadVaultConfig,
} from '../lib/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoctorOptions {
  /** Vault root directory (default: process.cwd()). */
  vaultDir?: string;
  /** Whether stdout is a TTY (default: process.stdout.isTTY). */
  isTTY?: boolean;
  /** Auto-fix detected issues. */
  fix?: boolean;
  /** Injectable validators — real implementations are used when absent. */
  checkVaultYmlFn?: (vaultDir: string) => Promise<DoctorResult>;
  loadVaultConfigFn?: (vaultDir: string) => Promise<VaultConfig>;
  checkFoldersFn?: (vaultDir: string, config: VaultConfig) => Promise<DoctorResult>;
  checkHarnessBinaryFn?: (config: VaultConfig) => Promise<DoctorResult>;
  checkQmdEmbeddingsFn?: (config: VaultConfig) => Promise<DoctorResult>;
  checkOrphanCheckpointsFn?: (vaultDir: string, config: VaultConfig) => Promise<DoctorResult>;
  checkPluginFilesFn?: (vaultDir: string) => Promise<DoctorResult>;
  checkVaultYmlKeysFn?: (vaultDir: string) => Promise<DoctorResult>;
  checkSettingsHooksFn?: (vaultDir: string, config: VaultConfig) => Promise<DoctorResult>;
  registerHooksFn?: (vaultDir: string) => Promise<void>;
}

export interface DoctorCommandResult {
  ok: boolean;
  exitCode: number;
  errorCount: number;
  warningCount: number;
}

// ---------------------------------------------------------------------------
// Main runDoctor (pure, testable)
// ---------------------------------------------------------------------------

export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorCommandResult> {
  const vaultDir = opts.vaultDir ?? process.cwd();
  const isTTY = opts.isTTY ?? process.stdout.isTTY ?? false;

  const checkVaultYmlFn = opts.checkVaultYmlFn ?? checkVaultYml;
  const loadVaultConfigFn = opts.loadVaultConfigFn ?? loadVaultConfig;
  const checkFoldersFn = opts.checkFoldersFn ?? checkFolders;
  const checkHarnessBinaryFn = opts.checkHarnessBinaryFn ?? checkHarnessBinary;
  const checkQmdEmbeddingsFn = opts.checkQmdEmbeddingsFn ?? checkQmdEmbeddings;
  const checkOrphanCheckpointsFn = opts.checkOrphanCheckpointsFn ?? checkOrphanCheckpoints;
  const checkPluginFilesFn = opts.checkPluginFilesFn ?? checkPluginFiles;
  const checkVaultYmlKeysFn = opts.checkVaultYmlKeysFn ?? checkVaultYmlKeys;
  const checkSettingsHooksFn = opts.checkSettingsHooksFn ?? checkSettingsHooks;

  if (isTTY) {
    intro('OneBrain Doctor');
    log.message(pc.dim(vaultDir));
  }

  const vaultYmlResult = await checkVaultYmlFn(vaultDir);

  let config: VaultConfig = {
    folders: {
      inbox: '00-inbox',
      projects: '01-projects',
      areas: '02-areas',
      knowledge: '03-knowledge',
      resources: '04-resources',
      agent: '05-agent',
      archive: '06-archive',
      logs: '07-logs',
    },
  };

  if (vaultYmlResult.status === 'ok') {
    try {
      config = await loadVaultConfigFn(vaultDir);
    } catch {
      // If loading fails, use default config above
    }
  }

  const sp = isTTY ? null : createSpinner();
  sp?.start('Running vault health checks…');

  let foldersResult: DoctorResult;
  let harnessResult: DoctorResult;
  let qmdResult: DoctorResult;
  let orphanResult: DoctorResult;
  let pluginFilesResult: DoctorResult;
  let vaultYmlKeysResult: DoctorResult;
  let settingsHooksResult: DoctorResult;
  try {
    [foldersResult, harnessResult, qmdResult, orphanResult, pluginFilesResult, vaultYmlKeysResult, settingsHooksResult] =
      await Promise.all([
        checkFoldersFn(vaultDir, config),
        checkHarnessBinaryFn(config),
        checkQmdEmbeddingsFn(config),
        checkOrphanCheckpointsFn(vaultDir, config),
        checkPluginFilesFn(vaultDir),
        checkVaultYmlKeysFn(vaultDir),
        checkSettingsHooksFn(vaultDir, config),
      ]);
    sp?.stop();
  } catch (err) {
    sp?.stop('Health check failed');
    throw err;
  }

  const results = [
    vaultYmlResult,
    foldersResult,
    harnessResult,
    qmdResult,
    orphanResult,
    pluginFilesResult,
    vaultYmlKeysResult,
    settingsHooksResult,
  ];

  const errorCount = results.filter((r) => r.status === 'error').length;
  const warningCount = results.filter((r) => r.status === 'warn').length;

  printDoctorOutput(results, isTTY, errorCount, warningCount);

  if (opts.fix) {
    await applyFixes(vaultDir, results, isTTY, opts.registerHooksFn);
  }

  return {
    ok: errorCount === 0,
    exitCode: errorCount > 0 ? 1 : 0,
    errorCount,
    warningCount,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point — thin wrapper, calls process.exit
// ---------------------------------------------------------------------------

export async function doctorCommand(opts: DoctorOptions = {}): Promise<void> {
  const result = await runDoctor(opts);
  process.exit(result.exitCode);
}

// ---------------------------------------------------------------------------
// Formatting (clack-based)
// ---------------------------------------------------------------------------

function printDoctorOutput(
  results: DoctorResult[],
  isTTY: boolean,
  errorCount: number,
  warningCount: number,
): void {
  if (!isTTY) {
    // Keep existing non-TTY format (plain text)
    const lines: string[] = [];
    lines.push('OneBrain Doctor');
    lines.push('');
    for (const result of results) {
      const icon = result.status === 'ok' ? '[✓]' : result.status === 'warn' ? '[!]' : '[✗]';
      lines.push(`  ${icon} ${result.check.padEnd(20)} ${result.message}`);
      if (result.hint) lines.push(`        → ${result.hint}`);
    }
    lines.push('');
    if (errorCount > 0) lines.push(`Summary: ${errorCount} errors, ${warningCount} warnings`);
    else if (warningCount > 0) lines.push(`Summary: ${warningCount} warnings — ok to run`);
    else lines.push('Summary: All checks passed');
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }

  // TTY: use clack log functions
  for (const result of results) {
    const line = `${result.check.padEnd(20)} ${result.message}`;
    if (result.status === 'ok') log.success(line);
    else if (result.status === 'warn') log.warn(line);
    else log.error(line);
    if (result.hint) log.message(`→ ${result.hint}`, { symbol: ' ' });
  }

  // Summary via outro (ok/warn) or cancel (error)
  if (errorCount > 0) {
    cancel(`${errorCount} error(s) — fix before using`);
  } else if (warningCount > 0) {
    outro(`${warningCount} warning(s) — ok to run`);
  } else {
    outro('All checks passed');
  }
}

// ---------------------------------------------------------------------------
// Fix helpers (B3)
// ---------------------------------------------------------------------------

type FixFn = (vaultDir: string, registerHooksFn?: (vaultDir: string) => Promise<void>) => Promise<void>;

function isFixable(r: DoctorResult): boolean {
  return getFix(r) !== null;
}

function getFix(r: DoctorResult): FixFn | null {
  // settings-hooks → run register-hooks
  if (r.check === 'settings-hooks' && r.status === 'warn' && r.message !== 'settings.json contains invalid JSON') {
    return async (vaultDir, registerHooksFn) => {
      const fn = registerHooksFn ?? (async (dir: string) => {
        const { runRegisterHooks } = await import('./internal/register-hooks.js');
        await runRegisterHooks({ vaultDir: dir });
      });
      await fn(vaultDir);
    };
  }

  // vault.yml-keys: onebrain_version deprecated → remove it
  if (r.check === 'vault.yml-keys' && r.status === 'warn' && r.message.includes('onebrain_version')) {
    return async (vaultDir) => {
      const { readFile, writeFile, rename } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { parse, stringify } = await import('yaml');
      const vaultYmlPath = join(vaultDir, 'vault.yml');
      const text = await readFile(vaultYmlPath, 'utf8');
      const raw = (parse(text) ?? {}) as Record<string, unknown>;
      delete raw['onebrain_version'];
      const updated = stringify(raw, { lineWidth: 0 });
      const tmpPath = `${vaultYmlPath}.tmp`;
      await writeFile(tmpPath, updated, 'utf8');
      await rename(tmpPath, vaultYmlPath);
    };
  }

  // folders missing → mkdir -p
  if (r.check === 'folders' && r.status === 'warn' && r.hint) {
    return async (vaultDir) => {
      const { mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const missingStr = r.hint?.replace('Missing: ', '') ?? '';
      const missing = missingStr.split(', ').map((f) => f.trim()).filter(Boolean);
      for (const folder of missing) {
        await mkdir(join(vaultDir, folder), { recursive: true });
      }
    };
  }

  return null;
}

async function applyFixes(
  vaultDir: string,
  results: DoctorResult[],
  isTTY: boolean,
  registerHooksFn?: (vaultDir: string) => Promise<void>,
): Promise<void> {
  const fixable = results.filter((r) => r.status !== 'ok').filter(isFixable);

  if (fixable.length === 0) {
    if (isTTY) log.success('All checks passed — nothing to fix');
    else process.stdout.write('nothing to fix\n');
    return;
  }

  // TTY: confirm before applying
  if (isTTY) {
    const { confirm } = await import('@clack/prompts');
    const ok = await confirm({ message: `Apply ${fixable.length} fix(es)?` });
    if (!ok || ok === Symbol.for('clack:cancel')) return;
  }

  let fixed = 0;
  const unfixable: DoctorResult[] = [];

  for (const r of results) {
    if (r.status === 'ok') continue;
    const fix = getFix(r);
    if (!fix) {
      unfixable.push(r);
      continue;
    }
    try {
      await fix(vaultDir, registerHooksFn);
      fixed++;
      if (isTTY) log.success(`Fixed: ${r.check}`);
    } catch (err) {
      if (isTTY) log.warn(`Could not fix ${r.check}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (isTTY) {
    if (fixed > 0) log.success(`Fixed ${fixed} issue(s)`);
    if (unfixable.length > 0) {
      log.warn(`${unfixable.length} issue(s) require manual action:`);
      for (const r of unfixable) {
        log.message(`  ${r.check}: ${r.hint ?? 'no auto-fix available'}`, { symbol: ' ' });
      }
    }
    outro('Done');
  } else {
    process.stdout.write(`fixed: ${fixed}\n`);
    if (unfixable.length > 0) {
      process.stdout.write(`manual: ${unfixable.map((r) => r.check).join(', ')}\n`);
    }
  }
}
