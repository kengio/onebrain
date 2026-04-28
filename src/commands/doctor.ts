import { cancel, spinner as createSpinner, outro } from '@clack/prompts';
import pc from 'picocolors';
import {
  type DoctorResult,
  type VaultConfig,
  checkFolders,
  checkOrphanCheckpoints,
  checkPluginFiles,
  checkQmdEmbeddings,
  checkSettingsHooks,
  checkVaultYml,
  checkVaultYmlKeys,
  loadVaultConfig,
} from '../lib/index.js';
import { printBanner, resolveBinaryVersion } from './internal/cli-banner.js';

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
  const checkQmdEmbeddingsFn = opts.checkQmdEmbeddingsFn ?? checkQmdEmbeddings;
  const checkOrphanCheckpointsFn = opts.checkOrphanCheckpointsFn ?? checkOrphanCheckpoints;
  const checkPluginFilesFn = opts.checkPluginFilesFn ?? checkPluginFiles;
  const checkVaultYmlKeysFn = opts.checkVaultYmlKeysFn ?? checkVaultYmlKeys;
  const checkSettingsHooksFn = opts.checkSettingsHooksFn ?? checkSettingsHooks;

  if (isTTY) {
    const binaryVersion = resolveBinaryVersion();
    await printBanner();
    process.stdout.write(
      `${pc.bold('OneBrain')} ${pc.dim('Doctor')}  ${pc.dim(`v${binaryVersion}`)}  ${pc.dim('—')} ${pc.cyan(vaultDir)}\n`,
    );
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

  const sp = isTTY ? createSpinner() : null;
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  let foldersResult: DoctorResult;
  let qmdResult: DoctorResult;
  let orphanResult: DoctorResult;
  let pluginFilesResult: DoctorResult;
  let vaultYmlKeysResult: DoctorResult;
  let settingsHooksResult: DoctorResult;
  try {
    if (isTTY) {
      // Sequential with spinner updates so each check is visible
      sp?.start('📋  Checking vault.yml…');
      await delay(80);
      foldersResult = await checkFoldersFn(vaultDir, config);
      sp?.message('📁  Checking folders…');
      await delay(80);
      qmdResult = await checkQmdEmbeddingsFn(config);
      sp?.message('🔍  Checking qmd…');
      await delay(80);
      orphanResult = await checkOrphanCheckpointsFn(vaultDir, config);
      sp?.message('📍  Checking checkpoints…');
      await delay(80);
      pluginFilesResult = await checkPluginFilesFn(vaultDir);
      sp?.message('📦  Checking plugin files…');
      await delay(80);
      vaultYmlKeysResult = await checkVaultYmlKeysFn(vaultDir);
      sp?.message('⚙️   Checking settings…');
      await delay(80);
      settingsHooksResult = await checkSettingsHooksFn(vaultDir, config);
    } else {
      [
        foldersResult,
        qmdResult,
        orphanResult,
        pluginFilesResult,
        vaultYmlKeysResult,
        settingsHooksResult,
      ] = await Promise.all([
        checkFoldersFn(vaultDir, config),
        checkQmdEmbeddingsFn(config),
        checkOrphanCheckpointsFn(vaultDir, config),
        checkPluginFilesFn(vaultDir),
        checkVaultYmlKeysFn(vaultDir),
        checkSettingsHooksFn(vaultDir, config),
      ]);
    }
    sp?.stop('Checks complete');
  } catch (err) {
    sp?.stop('Health check failed');
    throw err;
  }

  const results = [
    vaultYmlResult,
    foldersResult,
    qmdResult,
    orphanResult,
    pluginFilesResult,
    vaultYmlKeysResult,
    settingsHooksResult,
  ];

  const errorCount = results.filter((r) => r.status === 'error').length;
  const warningCount = results.filter((r) => r.status === 'warn').length;

  const hasFixable = results.some((r) => r.status !== 'ok' && getFix(r) !== null);
  const showFixHint = !opts.fix && hasFixable;
  printDoctorOutput(results, isTTY, errorCount, warningCount, showFixHint);

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
  showFixHint: boolean,
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
    if (showFixHint) lines.push('hint: run onebrain doctor --fix to auto-fix issues');
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  // TTY: compact output — no per-line blank lines
  const bar = pc.cyan('│');
  process.stdout.write(`${bar}\n`);
  for (const result of results) {
    const icon =
      result.status === 'ok'
        ? pc.green('◆')
        : result.status === 'warn'
          ? pc.yellow('▲')
          : pc.red('■');
    const check =
      result.status === 'ok'
        ? pc.dim(result.check.padEnd(20))
        : result.status === 'warn'
          ? pc.yellow(result.check.padEnd(20))
          : pc.bold(pc.red(result.check.padEnd(20)));
    const msg =
      result.status === 'ok'
        ? pc.dim(result.message)
        : result.status === 'warn'
          ? pc.yellow(result.message)
          : pc.red(result.message);
    process.stdout.write(`${bar}  ${icon}  ${check}  ${msg}\n`);
    if (result.hint) process.stdout.write(`${bar}      ${pc.dim(`→ ${result.hint}`)}\n`);
  }
  process.stdout.write(`${bar}\n`);

  // Summary via outro (ok/warn) or cancel (error)
  if (errorCount > 0) {
    cancel(`${errorCount} error(s) — fix before using`);
  } else if (warningCount > 0) {
    outro(`${warningCount} warning(s) — ok to run`);
  } else {
    outro('All checks passed');
  }

  if (showFixHint) {
    process.stdout.write(`\n→ Run ${pc.cyan('onebrain doctor --fix')} to auto-fix issues\n`);
  }
}

// ---------------------------------------------------------------------------
// Fix helpers (B3)
// ---------------------------------------------------------------------------

type FixFn = (
  vaultDir: string,
  registerHooksFn?: (vaultDir: string) => Promise<void>,
) => Promise<void>;

function isFixable(r: DoctorResult): boolean {
  return getFix(r) !== null;
}

function getFix(r: DoctorResult): FixFn | null {
  // settings-hooks → run register-hooks
  if (
    r.check === 'settings-hooks' &&
    r.status === 'warn' &&
    r.message !== 'settings.json contains invalid JSON'
  ) {
    return async (vaultDir, registerHooksFn) => {
      const fn =
        registerHooksFn ??
        (async (dir: string) => {
          const { runRegisterHooks } = await import('./internal/register-hooks.js');
          await runRegisterHooks({ vaultDir: dir });
        });
      await fn(vaultDir);
    };
  }

  // vault.yml-keys: deprecated keys → remove them
  if (
    r.check === 'vault.yml-keys' &&
    r.status === 'warn' &&
    (r.message.includes('onebrain_version') ||
      r.message.includes('deprecated key: method') ||
      r.message.includes('runtime.harness'))
  ) {
    return async (vaultDir) => {
      const { readFile, writeFile, rename } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { parse, stringify } = await import('yaml');
      const vaultYmlPath = join(vaultDir, 'vault.yml');
      const text = await readFile(vaultYmlPath, 'utf8');
      const raw = (parse(text) ?? {}) as Record<string, unknown>;
      if (r.message.includes('onebrain_version')) raw['onebrain_version'] = undefined;
      if (r.message.includes('deprecated key: method')) raw['method'] = undefined;
      if (r.message.includes('runtime.harness')) {
        const runtime = raw['runtime'] as Record<string, unknown> | undefined;
        if (runtime) {
          runtime['harness'] = undefined;
          if (Object.keys(runtime).filter((k) => runtime[k] !== undefined).length === 0) {
            raw['runtime'] = undefined;
          }
        }
      }
      const updated = stringify(raw, { lineWidth: 0 });
      const tmpPath = `${vaultYmlPath}.tmp`;
      await writeFile(tmpPath, updated, 'utf8');
      await rename(tmpPath, vaultYmlPath);
    };
  }

  // qmd-embeddings: unembedded docs → qmd update + qmd embed
  if (r.check === 'qmd-embeddings' && r.status === 'warn' && r.message.includes('unembedded')) {
    return async (vaultDir) => {
      const { join } = await import('node:path');
      const { parse: parseYaml } = await import('yaml');
      const { readFile } = await import('node:fs/promises');
      const raw = parseYaml(await readFile(join(vaultDir, 'vault.yml'), 'utf8')) as Record<
        string,
        unknown
      >;
      const collection = raw['qmd_collection'] as string | undefined;
      if (!collection) return;

      const qmd =
        Bun.which('qmd') ??
        Bun.which('qmd', {
          PATH: `${process.env['HOME'] ?? ''}/.bun/bin:${process.env['PATH'] ?? ''}`,
        });
      if (!qmd) return;

      // Step 1: index
      await Bun.spawn([qmd, 'update', '-c', collection], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;

      // Step 2: embed
      await Bun.spawn([qmd, 'embed'], {
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
    };
  }

  // folders missing → mkdir -p
  if (r.check === 'folders' && r.status === 'warn' && r.hint) {
    return async (vaultDir) => {
      const { mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const missingStr = r.hint?.replace('Missing: ', '') ?? '';
      const missing = missingStr
        .split(', ')
        .map((f) => f.trim())
        .filter(Boolean);
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
    if (isTTY) process.stdout.write(`${pc.green('◆')} All checks passed — nothing to fix\n`);
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
      if (isTTY) process.stdout.write(`${pc.green('◆')} Fixed: ${r.check}\n`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (isTTY) {
        process.stdout.write(`${pc.yellow('▲')} Could not fix ${r.check}: ${errMsg}\n`);
      } else {
        process.stderr.write(`doctor: fix failed for ${r.check}: ${errMsg}\n`);
      }
    }
  }

  if (isTTY) {
    if (fixed > 0) process.stdout.write(`${pc.green('◆')} Fixed ${fixed} issue(s)\n`);
    if (unfixable.length > 0) {
      process.stdout.write(
        `${pc.yellow('▲')} ${unfixable.length} issue(s) require manual action:\n`,
      );
      for (const r of unfixable) {
        process.stdout.write(`    ${r.check}: ${r.hint ?? 'no auto-fix available'}\n`);
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
