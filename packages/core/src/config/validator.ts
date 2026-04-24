import { parse } from 'yaml';
import { join } from 'node:path';
import { glob } from 'node:fs/promises';
import type { VaultConfig, DoctorResult } from '../types/config.js';

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
export async function checkFolders(
  vaultRoot: string,
  config: VaultConfig,
): Promise<DoctorResult> {
  const missing: string[] = [];

  for (const key of STANDARD_FOLDER_KEYS) {
    const folderName = config.folders[key];
    const folderPath = join(vaultRoot, folderName);
    const exists = await directoryExists(folderPath);
    if (!exists) {
      missing.push(folderName);
    }
  }

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
    const { stat } = await import('node:fs/promises');
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
export async function checkHarnessBinary(config: VaultConfig): Promise<DoctorResult> {
  const harness = config.runtime?.harness;

  if (!harness || harness === 'direct') {
    return {
      check: 'harness-binary',
      status: 'ok',
      message: harness ? 'direct (no binary check)' : 'no harness configured',
    };
  }

  const binaryName = HARNESS_BINARY[harness];
  if (!binaryName) {
    return {
      check: 'harness-binary',
      status: 'ok',
      message: `${harness} (unknown harness, skipping)`,
    };
  }

  const found = Bun.which(binaryName);
  if (found) {
    return {
      check: 'harness-binary',
      status: 'ok',
      message: `${harness} (found)`,
    };
  }

  return {
    check: 'harness-binary',
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
    const proc = Bun.spawn(['qmd', 'status', '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Race between process completion and 3-second timeout
    const timeoutMs = 3000;
    const result = await Promise.race([
      proc.exited,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
    ]);

    if (result === 'timeout') {
      proc.kill();
      return {
        check: 'qmd-embeddings',
        status: 'ok',
        message: 'qmd status unavailable (timeout)',
      };
    }

    const stdout = await new Response(proc.stdout).text();
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const unembedded = parsed['unembedded'];

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
 * Compare onebrain_version in vault.yml against plugin.json version.
 * Returns ok if either is unavailable.
 */
export async function checkVersionDrift(
  vaultRoot: string,
  config: VaultConfig,
): Promise<DoctorResult> {
  const configVersion = config.onebrain_version;

  const pluginJsonPath = join(vaultRoot, '.claude', 'plugins', 'onebrain', 'plugin.json');
  const pluginFile = Bun.file(pluginJsonPath);
  const exists = await pluginFile.exists();

  if (!configVersion || !exists) {
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
    pluginVersion = typeof parsed['version'] === 'string' ? parsed['version'] : undefined;
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

  if (configVersion === pluginVersion) {
    return {
      check: 'version-drift',
      status: 'ok',
      message: `v${configVersion}`,
    };
  }

  return {
    check: 'version-drift',
    status: 'warn',
    message: `binary v${configVersion}, plugin files v${pluginVersion}`,
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
    message: `${orphanCount} pre-v1.10.0 files in ${logsFolder}/ — review manually`,
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

    const merged = parsed['merged'];
    if (merged === true) return true;
    if (merged === false) return false;
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
