import pc from 'picocolors';
import {
  type DoctorResult,
  type VaultConfig,
  atomicWrite,
  checkClaudeSettings,
  checkFolders,
  checkOrphanCheckpoints,
  checkPluginFiles,
  checkQmdEmbeddings,
  checkSettingsHooks,
  checkVaultYml,
  checkVaultYmlKeys,
  loadVaultConfig,
} from '../lib/index.js';
import { printBanner } from './internal/cli-banner.js';
import {
  askYesNo,
  barBlank,
  barLine,
  barOpen,
  close,
  makeStepFn,
  writeLine,
} from './internal/cli-ui.js';

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
  checkClaudeSettingsFn?: (vaultDir: string) => Promise<DoctorResult>;
  registerHooksFn?: (vaultDir: string) => Promise<void>;
  /** Injectable delay (for tests — pass `async () => {}` to skip animation delays). */
  delayFn?: (ms: number) => Promise<void>;
}

export interface DoctorCommandResult {
  ok: boolean;
  exitCode: number;
  errorCount: number;
  warningCount: number;
  /** Number of fixes that threw during `--fix`. 0 when --fix wasn't requested. */
  fixFailedCount: number;
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
  const checkClaudeSettingsFn = opts.checkClaudeSettingsFn ?? checkClaudeSettings;

  if (isTTY) {
    await printBanner();
  }

  const createStep = makeStepFn(isTTY);
  const delay = opts.delayFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const randDelay = () =>
    isTTY ? delay(Math.floor(Math.random() * 1000) + 1000) : Promise.resolve();

  function fmtResult(r: DoctorResult): string {
    if (r.status === 'ok') return pc.dim(r.message);
    if (r.status === 'warn') return pc.yellow(r.message);
    return pc.red(r.message);
  }

  // ---------------------------------------------------------------------------
  // Default config
  // ---------------------------------------------------------------------------

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
    checkpoint: { messages: 15, minutes: 30 },
  };

  // ---------------------------------------------------------------------------
  // Step 1: vault.yml (always first — needed to load config)
  // ---------------------------------------------------------------------------

  const sp1 = createStep('📋', 'vault.yml');
  const vaultYmlResult = await checkVaultYmlFn(vaultDir);
  if (vaultYmlResult.status === 'ok') {
    try {
      config = await loadVaultConfigFn(vaultDir);
    } catch (err) {
      // ENOENT → first-run path: defaults are correct, stay silent.
      // Any other code (YAML parse, EACCES, EIO) needs to surface so the user
      // doesn't silently see "vault.yml ok" while the rest of doctor falls back
      // to defaults that don't match their actual layout.
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`doctor: vault.yml load warning: ${msg}\n`);
      }
    }
  }
  await randDelay();
  sp1?.stop(fmtResult(vaultYmlResult), vaultYmlResult.details);

  // ---------------------------------------------------------------------------
  // Steps 2–7: remaining checks
  // ---------------------------------------------------------------------------

  let foldersResult: DoctorResult;
  let qmdResult: DoctorResult;
  let orphanResult: DoctorResult;
  let pluginFilesResult: DoctorResult;
  let vaultYmlKeysResult: DoctorResult;
  let settingsHooksResult: DoctorResult;
  let claudeSettingsResult: DoctorResult;

  if (isTTY) {
    const sp2 = createStep('⚙️', 'Config schema');
    vaultYmlKeysResult = await checkVaultYmlKeysFn(vaultDir);
    await randDelay();
    sp2!.stop(fmtResult(vaultYmlKeysResult), vaultYmlKeysResult.details);

    const sp3 = createStep('📁', 'Vault folders');
    foldersResult = await checkFoldersFn(vaultDir, config);
    await randDelay();
    sp3!.stop(fmtResult(foldersResult), foldersResult.details);

    const sp4 = createStep('📦', 'Plugin integrity');
    pluginFilesResult = await checkPluginFilesFn(vaultDir);
    await randDelay();
    sp4!.stop(fmtResult(pluginFilesResult), pluginFilesResult.details);

    const sp5 = createStep('🪝', 'Hooks & permissions');
    settingsHooksResult = await checkSettingsHooksFn(vaultDir, config);
    await randDelay();
    sp5!.stop(fmtResult(settingsHooksResult), settingsHooksResult.details);

    const sp6 = createStep('📍', 'Orphan checkpoints');
    orphanResult = await checkOrphanCheckpointsFn(vaultDir, config);
    await randDelay();
    sp6!.stop(fmtResult(orphanResult), orphanResult.details);

    const sp7 = createStep('🔍', 'Search index');
    qmdResult = await checkQmdEmbeddingsFn(config);
    await randDelay();
    sp7!.stop(fmtResult(qmdResult), qmdResult.details);

    const sp8 = createStep('🛒', 'Marketplace config');
    claudeSettingsResult = await checkClaudeSettingsFn(vaultDir);
    await randDelay();
    sp8!.stop(fmtResult(claudeSettingsResult), claudeSettingsResult.details);
  } else {
    [
      foldersResult,
      qmdResult,
      orphanResult,
      pluginFilesResult,
      vaultYmlKeysResult,
      settingsHooksResult,
      claudeSettingsResult,
    ] = await Promise.all([
      checkFoldersFn(vaultDir, config),
      checkQmdEmbeddingsFn(config),
      checkOrphanCheckpointsFn(vaultDir, config),
      checkPluginFilesFn(vaultDir),
      checkVaultYmlKeysFn(vaultDir),
      checkSettingsHooksFn(vaultDir, config),
      checkClaudeSettingsFn(vaultDir),
    ]);
  }

  const results = [
    vaultYmlResult,
    vaultYmlKeysResult,
    foldersResult,
    pluginFilesResult,
    settingsHooksResult,
    orphanResult,
    qmdResult,
    claudeSettingsResult,
  ];

  const totalChecks = results.length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const warningCount = results.filter((r) => r.status === 'warn').length;
  // fixableCount drives the "→ Run doctor --fix" hint. Exclude advisory fixes
  // so checks like qmd-embeddings (potentially long-running, opt-in) do not
  // nudge the user toward `--fix`. They still run when --fix is invoked.
  const fixableCount = results.filter((r) => {
    if (r.status === 'ok') return false;
    const fix = getFix(r);
    return fix !== null && !fix.advisory;
  }).length;
  const showFixHint = !opts.fix && fixableCount > 0;

  const summaryParts = [`${totalChecks} checks`];
  if (errorCount > 0) summaryParts.push(`${errorCount} error(s)`);
  if (warningCount > 0) summaryParts.push(`${warningCount} warning(s)`);

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  if (!isTTY) {
    printNonTtyOutput(results, totalChecks, errorCount, warningCount, showFixHint, fixableCount);
  } else {
    if (errorCount > 0) {
      close(`${summaryParts.join(' · ')} — fix before using`, true);
    } else if (warningCount > 0) {
      close(`${summaryParts.join(' · ')} — advisory only, safe to run`, false, true);
    } else {
      close(pc.green(`${summaryParts.join(' · ')} — all passed`));
    }
    if (showFixHint) {
      process.stdout.write(
        `\n→ Run ${pc.cyan('onebrain doctor --fix')} to auto-fix ${fixableCount} issue(s)\n`,
      );
    }
  }

  let fixFailedCount = 0;
  if (opts.fix) {
    fixFailedCount = await applyFixes(vaultDir, results, isTTY, opts.registerHooksFn);
  }

  const ok = errorCount === 0 && fixFailedCount === 0;
  return {
    ok,
    exitCode: ok ? 0 : 1,
    errorCount,
    warningCount,
    fixFailedCount,
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
// Non-TTY output (plain text table)
// ---------------------------------------------------------------------------

function printNonTtyOutput(
  results: DoctorResult[],
  totalChecks: number,
  errorCount: number,
  warningCount: number,
  showFixHint: boolean,
  fixableCount: number,
): void {
  const lines: string[] = ['OneBrain Doctor', ''];
  for (const result of results) {
    const icon = result.status === 'ok' ? '[✓]' : result.status === 'warn' ? '[!]' : '[✗]';
    lines.push(`  ${icon} ${result.check.padEnd(20)} ${result.message}`);
    if (result.hint) lines.push(`        → ${result.hint}`);
    if (result.details) for (const d of result.details) lines.push(`        · ${d}`);
  }
  lines.push('');
  if (errorCount > 0) {
    lines.push(
      `Summary: ${totalChecks} checks · ${errorCount} error(s) · ${warningCount} warning(s) — fix before using`,
    );
  } else if (warningCount > 0) {
    lines.push(`Summary: ${totalChecks} checks · ${warningCount} warning(s) — ok to run`);
  } else {
    lines.push(`Summary: ${totalChecks} checks — all passed`);
  }
  if (showFixHint)
    lines.push(`hint: run onebrain doctor --fix to auto-fix ${fixableCount} issue(s)`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

// ---------------------------------------------------------------------------
// Fix helpers
// ---------------------------------------------------------------------------

type FixFn = (
  vaultDir: string,
  registerHooksFn?: (vaultDir: string) => Promise<void>,
) => Promise<void>;

interface Fix {
  fn: FixFn;
  description: string;
  /**
   * Advisory fixes still run when the user explicitly invokes `--fix`, but they
   * do not contribute to `fixableCount`, so plain `onebrain doctor` does not
   * suggest `--fix` solely because of them. Use this for fixes whose work is
   * potentially long-running or otherwise opt-in (e.g. qmd embedding).
   */
  advisory?: boolean;
}

function getFix(r: DoctorResult): Fix | null {
  // settings-hooks → run register-hooks
  if (r.check === 'settings-hooks' && r.status === 'warn') {
    const issues = (r.details ?? []).filter((d) => !d.startsWith('Run '));
    const description =
      issues.length > 0
        ? `Fix: ${issues.join(', ')}`
        : 'Repair Claude Code hooks in .claude/settings.json';
    return {
      fn: async (vaultDir, registerHooksFn) => {
        const fn =
          registerHooksFn ??
          (async (dir: string) => {
            const { runRegisterHooks } = await import('./internal/register-hooks.js');
            await runRegisterHooks({ vaultDir: dir });
          });
        await fn(vaultDir);
      },
      description,
    };
  }

  // vault.yml-keys: deprecated keys → remove them; missing soft-required keys → backfill
  const hasDeprecatedKeys = r.details?.some(
    (d) =>
      d.includes('deprecated key: onebrain_version') ||
      d.includes('deprecated key: method') ||
      d.includes('deprecated key: runtime.harness'),
  );
  const hasMissingUpdateChannel = r.details?.some((d) => d === 'missing key: update_channel');
  if (
    r.check === 'vault.yml-keys' &&
    r.status === 'warn' &&
    (hasDeprecatedKeys || hasMissingUpdateChannel)
  ) {
    const deprecated = (r.details ?? [])
      .filter((d) => d.startsWith('deprecated key:'))
      .map((d) => d.slice('deprecated key: '.length).split(' ')[0] ?? d);
    const fixParts: string[] = [];
    if (hasMissingUpdateChannel) fixParts.push('add update_channel: stable');
    if (deprecated.length > 0) fixParts.push(`remove deprecated: ${deprecated.join(', ')}`);
    const description =
      fixParts.length > 0 ? `Fix vault.yml: ${fixParts.join('; ')}` : 'Fix vault.yml';
    return {
      fn: async (vaultDir) => {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const { parse, stringify } = await import('yaml');
        const vaultYmlPath = join(vaultDir, 'vault.yml');
        const text = await readFile(vaultYmlPath, 'utf8');
        const raw = (parse(text) ?? {}) as Record<string, unknown>;
        const details = r.details ?? [];
        if (details.some((d) => d.includes('onebrain_version')))
          raw['onebrain_version'] = undefined;
        if (details.some((d) => d.includes('deprecated key: method'))) raw['method'] = undefined;
        if (details.some((d) => d.includes('runtime.harness'))) {
          const runtime = raw['runtime'] as Record<string, unknown> | undefined;
          if (runtime) {
            runtime['harness'] = undefined;
            if (Object.keys(runtime).filter((k) => runtime[k] !== undefined).length === 0) {
              raw['runtime'] = undefined;
            }
          }
        }
        if (details.some((d) => d === 'missing key: update_channel')) {
          raw['update_channel'] = 'stable';
        }
        await atomicWrite(vaultYmlPath, stringify(raw, { lineWidth: 0 }), 'vault.yml');
      },
      description,
    };
  }

  // qmd-embeddings: unembedded docs → qmd update + qmd embed.
  // Marked advisory so plain `onebrain doctor` does not nudge the user toward
  // `--fix` solely for embeddings (embedding can be slow). When the user does
  // run `--fix`, the embedding still happens.
  if (r.check === 'qmd-embeddings' && r.status === 'warn' && r.message.includes('unembedded')) {
    const pendingMatch = r.message.match(/(\d+) unembedded/);
    const count = pendingMatch?.[1] ?? 'some';
    return {
      advisory: true,
      fn: async (vaultDir) => {
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

        await Bun.spawn([qmd, 'update', '-c', collection], {
          stdout: 'ignore',
          stderr: 'ignore',
        }).exited;

        await Bun.spawn([qmd, 'embed'], {
          stdout: 'ignore',
          stderr: 'ignore',
        }).exited;
      },
      description: `Embed ${count} unembedded document(s) (qmd update + embed)`,
    };
  }

  // claude-settings: stale extraKnownMarketplaces.onebrain.source.repo → rewrite
  if (
    r.check === 'claude-settings' &&
    r.status === 'warn' &&
    r.details?.some((d) => d.startsWith('stale extraKnownMarketplaces.onebrain.source.repo:'))
  ) {
    return {
      fn: async (vaultDir) => {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const settingsPath = join(vaultDir, '.claude', 'settings.json');
        const text = await readFile(settingsPath, 'utf8');
        const raw = JSON.parse(text) as Record<string, unknown>;
        const marketplaces = raw['extraKnownMarketplaces'] as Record<string, unknown> | undefined;
        const onebrain = marketplaces?.['onebrain'] as Record<string, unknown> | undefined;
        const source = onebrain?.['source'] as Record<string, unknown> | undefined;
        if (!source || source['repo'] !== 'kengio/onebrain') return; // idempotent — already canonical or absent
        source['repo'] = 'onebrain-ai/onebrain';
        // Preserve 2-space indentation (matches Claude Code's own formatter) + trailing newline
        const trailingNewline = text.endsWith('\n') ? '\n' : '';
        const updated = `${JSON.stringify(raw, null, 2)}${trailingNewline}`;
        await atomicWrite(settingsPath, updated, '.claude/settings.json');
      },
      description: 'Rewrite stale marketplace repo: kengio/onebrain → onebrain-ai/onebrain',
    };
  }

  // folders missing → mkdir -p
  if (r.check === 'folders' && r.status === 'error' && r.hint) {
    const missingStr = r.hint.replace('Missing: ', '');
    return {
      fn: async (vaultDir) => {
        const { mkdirIdempotent } = await import('../lib/index.js');
        const { join } = await import('node:path');
        const missing = missingStr
          .split(', ')
          .map((f) => f.trim())
          .filter(Boolean);
        for (const folder of missing) {
          await mkdirIdempotent(join(vaultDir, folder));
        }
      },
      description: `Create missing folders: ${missingStr}`,
    };
  }

  return null;
}

async function applyFixes(
  vaultDir: string,
  results: DoctorResult[],
  isTTY: boolean,
  registerHooksFn: ((vaultDir: string) => Promise<void>) | undefined,
): Promise<number> {
  const fixable = results.filter((r) => r.status !== 'ok' && getFix(r) !== null);

  if (fixable.length === 0) {
    // The previous close() already closed the bar pattern with `└`; render
    // "Nothing to fix" as a plain line (no `│` prefix) to match that closure.
    if (isTTY) writeLine(`${pc.green('◆')}  Nothing to fix`);
    else writeLine('nothing to fix');
    return 0;
  }

  if (isTTY) {
    // The previous close() emitted └. Start a fresh bar group with ┌ so
    // the fix-application section reads as its own clack-style box.
    writeLine('');
    barOpen(pc.bold(`${fixable.length} fix(es) to apply:`));
    barBlank();
    for (const r of fixable) {
      barLine(`  ${pc.cyan('◆')}  ${getFix(r)!.description}`);
    }
    barBlank();

    const answer = await askYesNo('Apply all?');

    if (answer === null || answer === false) {
      barLine(pc.dim('No'));
      barBlank();
      close(`No changes made — run ${pc.cyan('onebrain doctor --fix')} to apply`);
      return 0;
    }
    barLine('Yes');
    barBlank();
  }

  let fixed = 0;
  let fixFailed = 0;
  const unfixable: DoctorResult[] = [];

  for (const r of results) {
    if (r.status === 'ok') continue;
    const fix = getFix(r);
    if (!fix) {
      unfixable.push(r);
      continue;
    }
    try {
      await fix.fn(vaultDir, registerHooksFn);
      fixed++;
      if (isTTY) barLine(`${pc.green('◆')}  ${fix.description}`);
    } catch (err) {
      fixFailed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (isTTY) {
        barLine(`${pc.yellow('▲')}  Could not fix ${r.check}: ${errMsg}`);
      } else {
        process.stderr.write(`doctor: fix failed for ${r.check}: ${errMsg}\n`);
      }
    }
  }

  if (isTTY) {
    barBlank();
    if (fixed > 0) barLine(`${pc.green('◆')}  Fixed ${fixed} issue(s)`);
    if (fixFailed > 0) {
      barLine(`${pc.yellow('▲')}  ${fixFailed} fix(es) failed — see warnings above`);
    }
    if (unfixable.length > 0) {
      barLine(`${pc.yellow('▲')}  ${unfixable.length} issue(s) require manual action:`);
      for (const r of unfixable) {
        barLine(`      ${r.check}: ${r.hint ?? 'no auto-fix available'}`);
      }
    }
    barBlank();
    close('Done');
  } else {
    process.stdout.write(`fixed: ${fixed}\n`);
    if (fixFailed > 0) process.stdout.write(`fix-failed: ${fixFailed}\n`);
    if (unfixable.length > 0) {
      process.stdout.write(`manual: ${unfixable.map((r) => r.check).join(', ')}\n`);
    }
  }

  return fixFailed;
}
