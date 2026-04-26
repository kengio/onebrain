import { glob, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { DoctorResult, VaultConfig } from './types.js';

// ---------------------------------------------------------------------------
// checkVaultYml
// ---------------------------------------------------------------------------

/**
 * Check that vault.yml exists and is valid YAML.
 */
export async function checkVaultYml(vaultRoot: string): Promise<DoctorResult> {
  const vaultYmlPath = join(vaultRoot, 'vault.yml');
  const file = Bun.file(vaultYmlPath);

  const exists = await file.exists();
  if (!exists) {
    return {
      check: 'vault.yml',
      status: 'error',
      message: 'vault.yml not found',
      hint: 'Run onebrain init to create vault.yml',
    };
  }

  const text = await file.text();
  try {
    parse(text);
  } catch {
    return {
      check: 'vault.yml',
      status: 'error',
      message: 'vault.yml contains invalid YAML',
      hint: 'Check vault.yml syntax',
    };
  }

  return {
    check: 'vault.yml',
    status: 'ok',
    message: 'valid',
  };
}

// ---------------------------------------------------------------------------
// checkFolders
// ---------------------------------------------------------------------------

const STANDARD_FOLDER_KEYS = [
  'inbox',
  'projects',
  'areas',
  'knowledge',
  'resources',
  'agent',
  'archive',
  'logs',
] as const;

/**
 * Check that all 8 standard vault folders exist on disk.
 */
export async function checkFolders(vaultRoot: string, config: VaultConfig): Promise<DoctorResult> {
  const results = await Promise.all(
    STANDARD_FOLDER_KEYS.map(async (key) => {
      const folderName = config.folders[key];
      const exists = await directoryExists(join(vaultRoot, folderName));
      return exists ? null : folderName;
    }),
  );
  const missing = results.filter((f): f is string => f !== null);

  const total = STANDARD_FOLDER_KEYS.length;
  const present = total - missing.length;

  if (missing.length === 0) {
    return {
      check: 'folders',
      status: 'ok',
      message: `${total}/${total} present`,
    };
  }

  return {
    check: 'folders',
    status: 'warn',
    message: `${present}/${total} present`,
    hint: `Missing: ${missing.join(', ')}`,
  };
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// checkHarnessBinary
// ---------------------------------------------------------------------------

const HARNESS_BINARY: Record<string, string> = {
  'claude-code': 'claude',
  gemini: 'gemini',
};

const HARNESS_INSTALL_HINT: Record<string, string> = {
  'claude-code': 'Install Claude Code: https://claude.ai/code',
  gemini: 'Install Gemini CLI: https://github.com/google-gemini/gemini-cli',
};

/**
 * Check that the configured harness binary is available in PATH.
 * For 'direct' or absent runtime, always returns ok.
 */
export async function checkHarnessBinary(
  config: VaultConfig,
  whichFn: (cmd: string) => string | null = (cmd) => Bun.which(cmd),
): Promise<DoctorResult> {
  const harness = config.runtime?.harness;

  if (!harness || harness === 'direct') {
    return {
      check: 'runtime.harness',
      status: 'ok',
      message: harness ? 'direct (no binary check)' : 'no harness configured',
    };
  }

  const binaryName = HARNESS_BINARY[harness];
  if (!binaryName) {
    return {
      check: 'runtime.harness',
      status: 'ok',
      message: `${harness} (unknown harness, skipping)`,
    };
  }

  const found = whichFn(binaryName);
  if (found) {
    return {
      check: 'runtime.harness',
      status: 'ok',
      message: `${harness} (found)`,
    };
  }

  return {
    check: 'runtime.harness',
    status: 'warn',
    message: `${harness} binary not found`,
    hint: HARNESS_INSTALL_HINT[harness] ?? `Install ${binaryName} and ensure it is in PATH`,
  };
}

// ---------------------------------------------------------------------------
// checkQmdEmbeddings
// ---------------------------------------------------------------------------

/**
 * Check qmd embedding status. Non-fatal — returns ok on any error or timeout.
 */
export async function checkQmdEmbeddings(config: VaultConfig): Promise<DoctorResult> {
  if (!config.qmd_collection) {
    return {
      check: 'qmd-embeddings',
      status: 'ok',
      message: 'qmd not configured',
    };
  }

  try {
    const qmdArgs =
      process.platform === 'win32'
        ? ['powershell.exe', '-NoProfile', '-Command', 'qmd status --json']
        : ['qmd', 'status', '--json'];
    const proc = Bun.spawn(qmdArgs, {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Race between process completion and 3-second timeout
    const timeoutMs = 3000;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const raceResult = await Promise.race([
      proc.exited,
      new Promise<'timeout'>((resolve) => {
        timerId = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
    if (timerId !== undefined) clearTimeout(timerId);

    if (raceResult === 'timeout') {
      proc.kill();
      return {
        check: 'qmd-embeddings',
        status: 'ok',
        message: 'qmd status unavailable (timeout)',
      };
    }

    const stdout = await new Response(proc.stdout).text();
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const unembedded = parsed.unembedded;

    if (typeof unembedded !== 'number') {
      return {
        check: 'qmd-embeddings',
        status: 'ok',
        message: 'qmd status unavailable (unexpected output)',
      };
    }

    if (unembedded === 0) {
      return {
        check: 'qmd-embeddings',
        status: 'ok',
        message: 'all embedded',
      };
    }

    return {
      check: 'qmd-embeddings',
      status: 'warn',
      message: `${unembedded} doc(s) missing embeddings`,
      hint: 'Run /qmd embed to index them',
    };
  } catch {
    return {
      check: 'qmd-embeddings',
      status: 'ok',
      message: 'qmd status unavailable',
    };
  }
}

// ---------------------------------------------------------------------------
// checkVersionDrift
// ---------------------------------------------------------------------------

/**
 * Compare a version against plugin.json version to detect drift.
 *
 * When `binaryVersion` is provided, it is compared against plugin.json version
 * (detects "binary is newer than installed plugin files").
 * When `binaryVersion` is absent, falls back to comparing vault.yml
 * `onebrain_version` against plugin.json version.
 *
 * Returns ok if the required data for the selected comparison path is unavailable.
 */
export async function checkVersionDrift(
  vaultRoot: string,
  config: VaultConfig,
  binaryVersion?: string,
): Promise<DoctorResult> {
  const pluginJsonPath = join(
    vaultRoot,
    '.claude',
    'plugins',
    'onebrain',
    '.claude-plugin',
    'plugin.json',
  );
  const pluginFile = Bun.file(pluginJsonPath);
  const exists = await pluginFile.exists();

  // Determine which version to compare against plugin.json
  const compareVersion = binaryVersion ?? config.onebrain_version;

  if (!compareVersion || !exists) {
    return {
      check: 'version-drift',
      status: 'ok',
      message: 'version check skipped (incomplete data)',
    };
  }

  let pluginVersion: string | undefined;
  try {
    const text = await pluginFile.text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    pluginVersion = typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return {
      check: 'version-drift',
      status: 'ok',
      message: 'version check skipped (plugin.json unreadable)',
    };
  }

  if (!pluginVersion) {
    return {
      check: 'version-drift',
      status: 'ok',
      message: 'version check skipped (no version in plugin.json)',
    };
  }

  if (compareVersion === pluginVersion) {
    return {
      check: 'version-drift',
      status: 'ok',
      message: `v${compareVersion}`,
    };
  }

  const driftMessage = binaryVersion
    ? `binary v${binaryVersion}, plugin files v${pluginVersion}`
    : `vault v${compareVersion}, plugin files v${pluginVersion}`;

  return {
    check: 'version-drift',
    status: 'warn',
    message: driftMessage,
    hint: 'Run onebrain update to sync',
  };
}

// ---------------------------------------------------------------------------
// checkOrphanCheckpoints
// ---------------------------------------------------------------------------

/**
 * Count checkpoint files where merged is not true.
 */
export async function checkOrphanCheckpoints(
  vaultRoot: string,
  config: VaultConfig,
): Promise<DoctorResult> {
  const logsFolder = config.folders.logs;
  const logsPath = join(vaultRoot, logsFolder);

  let checkpointFiles: string[] = [];

  try {
    const pattern = join(logsPath, '**', '*-checkpoint-*.md');
    const matched: string[] = [];
    for await (const f of glob(pattern)) {
      matched.push(f);
    }
    checkpointFiles = matched;
  } catch {
    // Logs folder likely doesn't exist — no orphans
    return {
      check: 'orphan-checkpoints',
      status: 'ok',
      message: '0 orphans',
    };
  }

  if (checkpointFiles.length === 0) {
    return {
      check: 'orphan-checkpoints',
      status: 'ok',
      message: '0 orphans',
    };
  }

  let orphanCount = 0;

  for (const filePath of checkpointFiles) {
    const merged = await readMergedField(filePath);
    if (merged !== true) {
      orphanCount++;
    }
  }

  if (orphanCount === 0) {
    return {
      check: 'orphan-checkpoints',
      status: 'ok',
      message: '0 orphans',
    };
  }

  return {
    check: 'orphan-checkpoints',
    status: 'warn',
    message: `${orphanCount} unmerged checkpoint(s) in ${logsFolder}/`,
    hint: 'Run /wrapup to synthesize and merge them',
  };
}

/**
 * Read YAML frontmatter from a markdown file and extract the `merged` field.
 * Returns undefined if the file cannot be read or has no frontmatter.
 */
async function readMergedField(filePath: string): Promise<boolean | undefined> {
  try {
    const file = Bun.file(filePath);
    const text = await file.text();

    // Extract frontmatter between first --- pair
    if (!text.startsWith('---')) return undefined;
    const endIdx = text.indexOf('\n---', 3);
    if (endIdx === -1) return undefined;

    const frontmatter = text.slice(3, endIdx).trim();
    const parsed = parse(frontmatter) as Record<string, unknown> | null;
    if (!parsed) return undefined;

    const merged = parsed.merged;
    if (merged === true || merged === 'true') return true;
    if (merged === false || merged === 'false') return false;
    return undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// checkSandbox
// ---------------------------------------------------------------------------

/**
 * Check that sandbox is explicitly enabled in vault.yml.
 */
export function checkSandbox(config: VaultConfig): DoctorResult {
  if (config.sandbox?.enabled === true) {
    return {
      check: 'sandbox',
      status: 'ok',
      message: 'enabled',
    };
  }

  return {
    check: 'sandbox',
    status: 'warn',
    message: 'disabled',
    hint: 'Set sandbox.enabled: true in vault.yml',
  };
}
