import { stat } from 'node:fs/promises';
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
    const globber = new Bun.Glob('**/*-checkpoint-*.md');
    const matched: string[] = [];
    for await (const f of globber.scan({ cwd: logsPath, absolute: true })) {
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

    const merged = parsed['merged'];
    if (merged === true || merged === 'true') return true;
    if (merged === false || merged === 'false') return false;
    return undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// checkPluginFiles
// ---------------------------------------------------------------------------

const REQUIRED_PLUGIN_FILES = ['INSTRUCTIONS.md', '.claude-plugin/plugin.json'] as const;

const REQUIRED_PLUGIN_DIRS = ['agents', 'skills'] as const;

const STALE_BASH_FILES = [
  'session-init.sh',
  'orphan-scan.sh',
  'checkpoint-hook.sh',
  'vault-sync.sh',
  'pin-to-vault.sh',
  'qmd-reindex.sh',
  'backfill-recapped.sh',
] as const;

export async function checkPluginFiles(vaultRoot: string): Promise<DoctorResult> {
  const pluginBase = join(vaultRoot, '.claude', 'plugins', 'onebrain');

  const missingFiles: string[] = [];
  for (const rel of REQUIRED_PLUGIN_FILES) {
    const full = join(pluginBase, rel);
    const file = Bun.file(full);
    if (!(await file.exists())) {
      missingFiles.push(rel);
    }
  }

  for (const dir of REQUIRED_PLUGIN_DIRS) {
    const full = join(pluginBase, dir);
    if (!(await directoryExists(full))) {
      missingFiles.push(`${dir}/`);
    } else {
      // Check non-empty
      const globber = new Bun.Glob('**/*.md');
      let count = 0;
      for await (const _ of globber.scan({ cwd: full })) {
        count++;
        break;
      }
      if (count === 0) missingFiles.push(`${dir}/ (empty)`);
    }
  }

  const staleFound: string[] = [];
  for (const name of STALE_BASH_FILES) {
    const full = join(pluginBase, name);
    const file = Bun.file(full);
    if (await file.exists()) {
      staleFound.push(name);
    }
  }

  if (missingFiles.length > 0) {
    return {
      check: 'plugin-files',
      status: 'error',
      message: `missing: ${missingFiles.join(', ')}`,
      hint: 'Run onebrain update to restore plugin files',
    };
  }

  if (staleFound.length > 0) {
    return {
      check: 'plugin-files',
      status: 'warn',
      message: `stale bash files: ${staleFound.join(', ')}`,
      hint: 'Run onebrain update to remove stale files',
    };
  }

  return {
    check: 'plugin-files',
    status: 'ok',
    message: 'all required files present',
  };
}

// ---------------------------------------------------------------------------
// checkVaultYmlKeys
// ---------------------------------------------------------------------------

const REQUIRED_VAULT_YML_KEYS = ['method', 'update_channel', 'folders'] as const;
const REQUIRED_FOLDER_KEYS = [
  'inbox',
  'projects',
  'areas',
  'knowledge',
  'resources',
  'agent',
  'archive',
  'logs',
] as const;

export async function checkVaultYmlKeys(vaultRoot: string): Promise<DoctorResult> {
  const vaultYmlPath = join(vaultRoot, 'vault.yml');
  const file = Bun.file(vaultYmlPath);

  if (!(await file.exists())) {
    return {
      check: 'vault.yml-keys',
      status: 'error',
      message: 'vault.yml not found',
      hint: 'Run onebrain init to create vault.yml',
    };
  }

  let raw: Record<string, unknown>;
  try {
    const text = await file.text();
    const parsed = parse(text);
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      return {
        check: 'vault.yml-keys',
        status: 'error',
        message: 'vault.yml is not a valid YAML mapping',
      };
    }
    raw = parsed as Record<string, unknown>;
  } catch {
    return {
      check: 'vault.yml-keys',
      status: 'error',
      message: 'vault.yml contains invalid YAML',
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Required top-level keys
  for (const key of REQUIRED_VAULT_YML_KEYS) {
    if (raw[key] === undefined) errors.push(`missing key: ${key}`);
  }

  // Required folder sub-keys
  const folders = (raw['folders'] ?? {}) as Record<string, unknown>;
  for (const key of REQUIRED_FOLDER_KEYS) {
    if (folders[key] === undefined) errors.push(`missing folders.${key}`);
  }

  // update_channel value validation
  const updateChannel = raw['update_channel'];
  if (updateChannel !== undefined && updateChannel !== 'stable' && updateChannel !== 'next') {
    errors.push(`invalid update_channel: ${String(updateChannel)} (must be stable or next)`);
  }

  // checkpoint value validation
  const checkpoint = (raw['checkpoint'] ?? {}) as Record<string, unknown>;
  if (
    checkpoint['messages'] !== undefined &&
    (typeof checkpoint['messages'] !== 'number' || checkpoint['messages'] <= 0)
  ) {
    warnings.push('checkpoint.messages should be a number > 0');
  }
  if (
    checkpoint['minutes'] !== undefined &&
    (typeof checkpoint['minutes'] !== 'number' || checkpoint['minutes'] <= 0)
  ) {
    warnings.push('checkpoint.minutes should be a number > 0');
  }

  // Deprecated keys
  if (raw['onebrain_version'] !== undefined) {
    warnings.push('deprecated key: onebrain_version (safe to remove)');
  }

  if (errors.length > 0) {
    const hassMissingKey = errors.some((e) => e.startsWith('missing key:'));
    if (hassMissingKey) {
      return {
        check: 'vault.yml-keys',
        status: 'error',
        message: errors.join('; '),
        hint: 'Run onebrain init --force to recreate vault.yml',
      };
    }
    return {
      check: 'vault.yml-keys',
      status: 'error',
      message: errors.join('; '),
    };
  }

  if (warnings.length > 0) {
    const fixableWarnings = warnings.filter((w) => w.includes('onebrain_version'));
    if (fixableWarnings.length > 0) {
      return {
        check: 'vault.yml-keys',
        status: 'warn',
        message: warnings.join('; '),
        hint: 'Run onebrain doctor --fix to remove deprecated keys',
      };
    }
    return {
      check: 'vault.yml-keys',
      status: 'warn',
      message: warnings.join('; '),
    };
  }

  return {
    check: 'vault.yml-keys',
    status: 'ok',
    message: 'schema ok',
  };
}

// ---------------------------------------------------------------------------
// checkSettingsHooks
// ---------------------------------------------------------------------------

const REQUIRED_HOOKS: Array<{ event: string; cmdSubstring: string }> = [
  { event: 'Stop', cmdSubstring: 'onebrain checkpoint stop' },
  { event: 'PostCompact', cmdSubstring: 'onebrain checkpoint postcompact' },
];

const QMD_HOOK_SUBSTRING = 'onebrain qmd-reindex';
const PRECOMPACT_ONEBRAIN_SUBSTRING = 'onebrain';
const REQUIRED_PERMISSION = 'Bash(onebrain *)';
const STALE_HOOK_SUBSTRINGS = ['checkpoint-hook.sh', 'session-init.sh'];

interface SettingsForCheck {
  hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>>;
  permissions?: { allow?: string[] };
}

function hookPresent(settings: SettingsForCheck, event: string, cmdSubstring: string): boolean {
  const groups = settings.hooks?.[event] ?? [];
  return groups.some((g) => g.hooks?.some((h) => (h.command ?? '').includes(cmdSubstring)));
}

export async function checkSettingsHooks(
  vaultRoot: string,
  config: VaultConfig,
): Promise<DoctorResult> {
  const settingsPath = join(vaultRoot, '.claude', 'settings.json');
  const file = Bun.file(settingsPath);

  if (!(await file.exists())) {
    return {
      check: 'settings-hooks',
      status: 'warn',
      message: 'settings.json not found',
      hint: 'Run onebrain doctor --fix to register hooks',
    };
  }

  let settings: SettingsForCheck;
  try {
    const text = await file.text();
    settings = JSON.parse(text) as SettingsForCheck;
  } catch {
    return {
      check: 'settings-hooks',
      status: 'error',
      message: 'settings.json contains invalid JSON',
    };
  }

  const warnings: string[] = [];

  // Check required hooks
  for (const { event, cmdSubstring } of REQUIRED_HOOKS) {
    if (!hookPresent(settings, event, cmdSubstring)) {
      warnings.push(`${event} hook missing`);
    }
  }

  // PostToolUse (qmd) — conditional on qmd_collection
  if (config.qmd_collection && !hookPresent(settings, 'PostToolUse', QMD_HOOK_SUBSTRING)) {
    warnings.push('PostToolUse (qmd) hook missing');
  }

  // Stale PreCompact hook
  const precompactGroups = settings.hooks?.['PreCompact'] ?? [];
  const hasStalePreCompact = precompactGroups.some((g) =>
    g.hooks?.some((h) => (h.command ?? '').includes(PRECOMPACT_ONEBRAIN_SUBSTRING)),
  );
  if (hasStalePreCompact) {
    warnings.push('stale PreCompact hook found');
  }

  // Stale bash references
  for (const event of Object.keys(settings.hooks ?? {})) {
    const groups = settings.hooks?.[event] ?? [];
    for (const g of groups) {
      for (const h of g.hooks ?? []) {
        for (const sub of STALE_HOOK_SUBSTRINGS) {
          if ((h.command ?? '').includes(sub)) {
            warnings.push(`stale bash hook reference: ${sub}`);
          }
        }
      }
    }
  }

  // Permission check
  const allow = settings.permissions?.allow ?? [];
  if (!allow.includes(REQUIRED_PERMISSION)) {
    warnings.push(`missing permission: ${REQUIRED_PERMISSION}`);
  }

  if (warnings.length > 0) {
    return {
      check: 'settings-hooks',
      status: 'warn',
      message: warnings.join('; '),
      hint: 'Run onebrain doctor --fix to repair hooks',
    };
  }

  return {
    check: 'settings-hooks',
    status: 'ok',
    message: 'hooks ok',
  };
}
