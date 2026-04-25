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
} from '@onebrain/core';

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
}

export interface DoctorCommandResult {
  ok: boolean;
  exitCode: number;
  errorCount: number;
  warningCount: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function doctorCommand(opts: DoctorOptions = {}): Promise<void> {
  const vaultDir = opts.vaultDir ?? process.cwd();
  const isTTY = opts.isTTY ?? process.stdout.isTTY;
  const binaryVersion = opts.binaryVersion;

  // Step 1: Run all validators in parallel
  const vaultYmlResult = await checkVaultYml(vaultDir);

  // If vault.yml check failed, use empty config for checks that need it
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
      config = await loadVaultConfig(vaultDir);
    } catch {
      // If loading fails, use default config above
    }
  }

  // Run remaining checks in parallel
  const [
    foldersResult,
    harnessResult,
    qmdResult,
    versionDriftResult,
    orphanCheckpointsResult,
    sandboxResult,
  ] = await Promise.all([
    checkFolders(vaultDir, config),
    checkHarnessBinary(config),
    checkQmdEmbeddings(config),
    checkVersionDrift(vaultDir, config, binaryVersion),
    checkOrphanCheckpoints(vaultDir, config),
    checkSandbox(config),
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

  // Step 2: Format and print output
  const errorCount = results.filter((r) => r.status === 'error').length;
  const warningCount = results.filter((r) => r.status === 'warn').length;

  printDoctorOutput(results, isTTY, errorCount, warningCount);

  // Step 3: Exit with appropriate code
  process.exit(errorCount > 0 ? 1 : 0);
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
  const title = '  OneBrain Doctor 🔍';
  const lines: string[] = [];

  if (isTTY) {
    lines.push('');
    lines.push(title);
    lines.push('');
  } else {
    lines.push('OneBrain Doctor 🔍');
    lines.push('');
  }

  // Print each check result
  for (const result of results) {
    const statusIcon = getStatusIcon(result.status);
    const line = formatCheckLine(result, statusIcon);
    lines.push(line);

    if (result.hint) {
      const hintLine = formatHintLine(result.hint);
      lines.push(hintLine);
    }
  }

  // Print summary
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
  const checkName = result.check.padEnd(20);
  return `  ${icon} ${checkName} ${result.message}`;
}

function formatHintLine(hint: string): string {
  return `        → ${hint}`;
}
