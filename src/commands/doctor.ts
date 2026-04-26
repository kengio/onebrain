import {
  type DoctorResult,
  type VaultConfig,
  checkFolders,
  checkHarnessBinary,
  checkOrphanCheckpoints,
  checkQmdEmbeddings,
  checkSandbox,
  checkVaultYml,
  checkVersionDrift,
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
  /** Compiled binary version (BUILD_VERSION). When provided, compared against plugin.json instead of vault.yml onebrain_version. */
  binaryVersion?: string;
  /** Injectable validators — real implementations are used when absent. */
  checkVaultYmlFn?: (vaultDir: string) => Promise<DoctorResult>;
  loadVaultConfigFn?: (vaultDir: string) => Promise<VaultConfig>;
  checkFoldersFn?: (vaultDir: string, config: VaultConfig) => Promise<DoctorResult>;
  checkHarnessBinaryFn?: (config: VaultConfig) => Promise<DoctorResult>;
  checkQmdEmbeddingsFn?: (config: VaultConfig) => Promise<DoctorResult>;
  checkVersionDriftFn?: (
    vaultDir: string,
    config: VaultConfig,
    binaryVersion?: string,
  ) => Promise<DoctorResult>;
  checkOrphanCheckpointsFn?: (vaultDir: string, config: VaultConfig) => Promise<DoctorResult>;
  checkSandboxFn?: (config: VaultConfig) => DoctorResult | Promise<DoctorResult>;
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
  const binaryVersion = opts.binaryVersion;

  const checkVaultYmlFn = opts.checkVaultYmlFn ?? checkVaultYml;
  const loadVaultConfigFn = opts.loadVaultConfigFn ?? loadVaultConfig;
  const checkFoldersFn = opts.checkFoldersFn ?? checkFolders;
  const checkHarnessBinaryFn = opts.checkHarnessBinaryFn ?? checkHarnessBinary;
  const checkQmdEmbeddingsFn = opts.checkQmdEmbeddingsFn ?? checkQmdEmbeddings;
  const checkVersionDriftFn = opts.checkVersionDriftFn ?? checkVersionDrift;
  const checkOrphanCheckpointsFn = opts.checkOrphanCheckpointsFn ?? checkOrphanCheckpoints;
  const checkSandboxFn = opts.checkSandboxFn ?? checkSandbox;

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

  const [
    foldersResult,
    harnessResult,
    qmdResult,
    versionDriftResult,
    orphanCheckpointsResult,
    sandboxResult,
  ] = await Promise.all([
    checkFoldersFn(vaultDir, config),
    checkHarnessBinaryFn(config),
    checkQmdEmbeddingsFn(config),
    checkVersionDriftFn(vaultDir, config, binaryVersion),
    checkOrphanCheckpointsFn(vaultDir, config),
    checkSandboxFn(config),
  ]);

  const results = [
    vaultYmlResult,
    foldersResult,
    harnessResult,
    qmdResult,
    versionDriftResult,
    orphanCheckpointsResult,
    sandboxResult,
  ];

  const errorCount = results.filter((r) => r.status === 'error').length;
  const warningCount = results.filter((r) => r.status === 'warn').length;

  printDoctorOutput(results, isTTY, errorCount, warningCount);

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
// Formatting
// ---------------------------------------------------------------------------

function printDoctorOutput(
  results: DoctorResult[],
  isTTY: boolean,
  errorCount: number,
  warningCount: number,
): void {
  const lines: string[] = [];

  if (isTTY) {
    lines.push('');
    lines.push('  OneBrain Doctor 🔍');
    lines.push('');
  } else {
    lines.push('OneBrain Doctor 🔍');
    lines.push('');
  }

  for (const result of results) {
    const statusIcon = getStatusIcon(result.status);
    lines.push(formatCheckLine(result, statusIcon));
    if (result.hint) {
      lines.push(formatHintLine(result.hint));
    }
  }

  lines.push('');

  if (errorCount > 0 && warningCount > 0) {
    lines.push(`Summary: ${errorCount} errors, ${warningCount} warnings`);
  } else if (errorCount > 0) {
    lines.push(`Summary: ${errorCount} errors`);
  } else if (warningCount > 0) {
    lines.push(`Summary: ${warningCount} warnings — ok to run`);
  } else {
    lines.push('Summary: All checks passed');
  }

  if (isTTY) {
    lines.push('');
  }

  console.log(lines.join('\n'));
}

function getStatusIcon(status: 'ok' | 'warn' | 'error'): string {
  switch (status) {
    case 'ok':
      return '[✓]';
    case 'warn':
      return '[!]';
    case 'error':
      return '[✗]';
    default:
      return '[?]';
  }
}

function formatCheckLine(result: DoctorResult, icon: string): string {
  return `  ${icon} ${result.check.padEnd(20)} ${result.message}`;
}

function formatHintLine(hint: string): string {
  return `        → ${hint}`;
}
