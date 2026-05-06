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
      details: ['Run onebrain init to create vault.yml'],
    };
  }

  const text = await file.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    const result = parse(text);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      parsed = result as Record<string, unknown>;
    }
  } catch {
    return {
      check: 'vault.yml',
      status: 'error',
      message: 'vault.yml contains invalid YAML',
      hint: 'Check vault.yml syntax',
      details: ['Check vault.yml syntax'],
    };
  }

  const details: string[] = [];
  if (parsed) {
    if (typeof parsed['update_channel'] === 'string')
      details.push(`update_channel: ${parsed['update_channel']}`);
    if (typeof parsed['qmd_collection'] === 'string')
      details.push(`qmd: ${parsed['qmd_collection']}`);
  }
  return {
    check: 'vault.yml',
    status: 'ok',
    message: 'valid',
    ...(details.length > 0 ? { details } : {}),
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
    status: 'error',
    message: `${present}/${total} present`,
    hint: `Missing: ${missing.join(', ')}`,
    details: missing.map((f) => `missing: ${f}`),
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
      status: 'warn',
      message: 'qmd_collection not set in vault.yml',
      hint: 'Run /qmd to set up search index',
      details: ['Run /qmd to set up search index'],
    };
  }

  try {
    let qmdArgs: string[];
    if (process.platform === 'win32') {
      qmdArgs = ['powershell.exe', '-NoProfile', '-Command', 'qmd status'];
    } else {
      const resolved =
        Bun.which('qmd') ??
        Bun.which('qmd', {
          PATH: `${process.env['HOME'] ?? ''}/.bun/bin:${process.env['PATH'] ?? ''}`,
        });
      if (!resolved) {
        return {
          check: 'qmd-embeddings',
          status: 'ok',
          message: 'qmd not found in PATH',
        };
      }
      qmdArgs = [resolved, 'status'];
    }

    const proc = Bun.spawn(qmdArgs, { stdout: 'pipe', stderr: 'pipe' });

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
      return { check: 'qmd-embeddings', status: 'ok', message: 'qmd status unavailable (timeout)' };
    }

    const stdout = await new Response(proc.stdout).text();

    // Parse "Total:    N files indexed" and "Pending:  M need embedding"
    const totalMatch = stdout.match(/Total:\s+(\d+)\s+files? indexed/);
    const pendingMatch = stdout.match(/Pending:\s+(\d+)\s+need embedding/);
    const total = totalMatch ? Number.parseInt(totalMatch[1] ?? '0', 10) : null;
    const pending = pendingMatch ? Number.parseInt(pendingMatch[1] ?? '0', 10) : 0;

    if (total === null) {
      return { check: 'qmd-embeddings', status: 'ok', message: 'qmd status unavailable' };
    }

    const summary = `${total} indexed · ${pending} unembedded`;

    if (pending > 0) {
      return {
        check: 'qmd-embeddings',
        status: 'warn',
        message: summary,
        hint: 'Advisory: run /qmd embed when ready (or onebrain doctor --fix)',
        details: [
          `collection: ${config.qmd_collection}`,
          'Advisory: run /qmd embed when ready (or onebrain doctor --fix)',
        ],
      };
    }

    return {
      check: 'qmd-embeddings',
      status: 'ok',
      message: summary,
      details: [`collection: ${config.qmd_collection}`],
    };
  } catch {
    return { check: 'qmd-embeddings', status: 'ok', message: 'qmd status unavailable' };
  }
}

// ---------------------------------------------------------------------------
// checkOrphanCheckpoints
// ---------------------------------------------------------------------------

/**
 * Count leftover checkpoint files. Since v2.2.0, /wrapup deletes checkpoints
 * directly after writing the session log, so any checkpoint file that exists
 * is unmerged by definition — no `merged:` filter needed.
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

  const orphanCount = checkpointFiles.length;

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
    details: ['Run /wrapup to synthesize and merge them'],
  };
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
      details: [
        ...missingFiles.map((f) => `missing: ${f}`),
        'Run onebrain update to restore plugin files',
      ],
    };
  }

  if (staleFound.length > 0) {
    return {
      check: 'plugin-files',
      status: 'warn',
      message: `stale bash files: ${staleFound.join(', ')}`,
      hint: 'Run onebrain update to remove stale files',
      details: [
        ...staleFound.map((f) => `stale: ${f}`),
        'Run onebrain update to remove stale files',
      ],
    };
  }

  // Count skills and agents for ok details
  let skillCount = 0;
  let agentCount = 0;
  try {
    for await (const _ of new Bun.Glob('*/SKILL.md').scan({ cwd: join(pluginBase, 'skills') })) {
      skillCount++;
    }
  } catch {
    /* ok */
  }
  try {
    for await (const _ of new Bun.Glob('*.md').scan({ cwd: join(pluginBase, 'agents') })) {
      agentCount++;
    }
  } catch {
    /* ok */
  }

  return {
    check: 'plugin-files',
    status: 'ok',
    message: 'all required files present',
    details: [`${skillCount} skills · ${agentCount} agents · INSTRUCTIONS.md ✓`],
  };
}

// ---------------------------------------------------------------------------
// checkVaultYmlKeys
// ---------------------------------------------------------------------------

const REQUIRED_VAULT_YML_KEYS = ['folders'] as const;
// Keys whose absence is a recoverable warning (auto-fix supplies a default)
// rather than a blocking error. update_channel was previously required+error;
// downgraded to warning + auto-fix in v2.1.11 to match the migration step that
// now backfills `update_channel: stable`.
const SOFT_REQUIRED_VAULT_YML_KEYS = ['update_channel'] as const;
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

  // Required top-level keys (hard — error)
  for (const key of REQUIRED_VAULT_YML_KEYS) {
    if (raw[key] === undefined) errors.push(`missing key: ${key}`);
  }

  // Soft-required top-level keys (warn — auto-fix supplies a default)
  for (const key of SOFT_REQUIRED_VAULT_YML_KEYS) {
    if (raw[key] === undefined) warnings.push(`missing key: ${key}`);
  }

  // Required folder sub-keys
  const folders = (raw['folders'] ?? {}) as Record<string, unknown>;
  for (const key of REQUIRED_FOLDER_KEYS) {
    if (folders[key] === undefined) errors.push(`missing folders.${key}`);
  }

  // update_channel value validation (only when present — absence handled above)
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
  if (raw['method'] !== undefined) {
    warnings.push('deprecated key: method (safe to remove)');
  }
  if ((raw['runtime'] as Record<string, unknown> | undefined)?.['harness'] !== undefined) {
    warnings.push('deprecated key: runtime.harness (safe to remove)');
  }

  if (errors.length > 0) {
    const hassMissingKey = errors.some((e) => e.startsWith('missing key:'));
    const hint = hassMissingKey ? 'Run onebrain init --force to recreate vault.yml' : undefined;
    return {
      check: 'vault.yml-keys',
      status: 'error',
      message: `${errors.length} error(s)`,
      ...(hint !== undefined ? { hint } : {}),
      details: hint ? [...errors, hint] : errors,
    };
  }

  if (warnings.length > 0) {
    const hasDeprecated = warnings.some(
      (w) =>
        w.includes('onebrain_version') || w.includes('method') || w.includes('runtime.harness'),
    );
    const hasMissingSoftKey = warnings.some((w) => w.startsWith('missing key:'));
    let hint: string | undefined;
    if (hasMissingSoftKey && hasDeprecated) {
      hint = 'Run onebrain doctor --fix to repair vault.yml';
    } else if (hasMissingSoftKey) {
      hint = 'Run onebrain doctor --fix to backfill defaults';
    } else if (hasDeprecated) {
      hint = 'Run onebrain doctor --fix to remove deprecated keys';
    }
    return {
      check: 'vault.yml-keys',
      status: 'warn',
      message: `${warnings.length} issue(s)`,
      ...(hint !== undefined ? { hint } : {}),
      details: hint ? [...warnings, hint] : warnings,
    };
  }

  return {
    check: 'vault.yml-keys',
    status: 'ok',
    message: 'schema ok',
  };
}

// ---------------------------------------------------------------------------
// checkClaudeSettings — vault-level [vault]/.claude/settings.json drift
// ---------------------------------------------------------------------------

const STALE_MARKETPLACE_REPO = 'kengio/onebrain';
const CANONICAL_MARKETPLACE_REPO = 'onebrain-ai/onebrain';

/**
 * Check vault-level `[vault]/.claude/settings.json` for stale OneBrain
 * marketplace config. The repo was renamed `kengio/onebrain` →
 * `onebrain-ai/onebrain`; GitHub auto-redirects, but the literal in settings
 * is stale and worth a one-time rewrite. Skips silently when the file or key
 * is missing.
 */
export async function checkClaudeSettings(vaultRoot: string): Promise<DoctorResult> {
  const settingsPath = join(vaultRoot, '.claude', 'settings.json');
  const file = Bun.file(settingsPath);

  if (!(await file.exists())) {
    return { check: 'claude-settings', status: 'ok', message: 'no vault settings.json' };
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await file.text()) as Record<string, unknown>;
  } catch {
    return {
      check: 'claude-settings',
      status: 'warn',
      message: 'settings.json contains invalid JSON',
    };
  }

  const marketplaces = raw['extraKnownMarketplaces'] as Record<string, unknown> | undefined;
  const onebrain = marketplaces?.['onebrain'] as Record<string, unknown> | undefined;
  const source = onebrain?.['source'] as Record<string, unknown> | undefined;
  const repo = source?.['repo'];

  if (repo === STALE_MARKETPLACE_REPO) {
    return {
      check: 'claude-settings',
      status: 'warn',
      message: 'stale marketplace repo',
      hint: 'Run onebrain doctor --fix to rewrite to onebrain-ai/onebrain',
      details: [
        `stale extraKnownMarketplaces.onebrain.source.repo: ${STALE_MARKETPLACE_REPO} → ${CANONICAL_MARKETPLACE_REPO}`,
      ],
    };
  }

  return { check: 'claude-settings', status: 'ok', message: 'ok' };
}

// ---------------------------------------------------------------------------
// checkSettingsHooks
// ---------------------------------------------------------------------------

const REQUIRED_HOOKS: Array<{ event: string; cmdSubstring: string }> = [
  { event: 'Stop', cmdSubstring: 'onebrain checkpoint stop' },
];

// Hook events OneBrain is allowed to register. Any onebrain-* command found
// under any other hook event (PreCompact, PostCompact, UserPromptSubmit,
// SessionStart, etc.) is stale and must be removed.
const ALLOWED_HOOK_EVENTS = new Set(['Stop', 'PostToolUse']);

const QMD_HOOK_SUBSTRING = 'onebrain qmd-reindex';
const ONEBRAIN_COMMAND_SUBSTRING = 'onebrain';
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
  const confirmedHooks: string[] = [];
  let permissionOk = false;

  // Check required hooks
  for (const { event, cmdSubstring } of REQUIRED_HOOKS) {
    if (!hookPresent(settings, event, cmdSubstring)) {
      warnings.push(`${event} hook missing`);
    } else {
      confirmedHooks.push(`${event} ✓`);
    }
  }

  // PostToolUse (qmd) — conditional on qmd_collection
  if (config.qmd_collection) {
    if (!hookPresent(settings, 'PostToolUse', QMD_HOOK_SUBSTRING)) {
      warnings.push('PostToolUse (qmd) hook missing');
    } else {
      confirmedHooks.push('PostToolUse ✓');
    }
  }

  // Stale hooks: any onebrain-* command registered under an event NOT in the
  // allowed set (Stop, PostToolUse). Catches PreCompact, PostCompact,
  // UserPromptSubmit, SessionStart, and anything else legacy or experimental.
  // Also catches stale bash-script references (checkpoint-hook.sh, session-init.sh).
  for (const event of Object.keys(settings.hooks ?? {})) {
    const groups = settings.hooks?.[event] ?? [];
    for (const g of groups) {
      for (const h of g.hooks ?? []) {
        const cmd = h.command ?? '';
        if (!ALLOWED_HOOK_EVENTS.has(event) && cmd.includes(ONEBRAIN_COMMAND_SUBSTRING)) {
          warnings.push(
            `stale ${event} hook found (onebrain CLI only registers Stop + PostToolUse)`,
          );
        }
        for (const sub of STALE_HOOK_SUBSTRINGS) {
          if (cmd.includes(sub)) {
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
  } else {
    permissionOk = true;
  }

  if (warnings.length > 0) {
    return {
      check: 'settings-hooks',
      status: 'warn',
      message: `${warnings.length} issue(s)`,
      hint: 'Run onebrain doctor --fix to repair hooks',
      details: [...warnings, 'Run onebrain doctor --fix to repair hooks'],
    };
  }

  const okDetails: string[] = [];
  if (confirmedHooks.length > 0) okDetails.push(`hooks: ${confirmedHooks.join('  ')}`);
  if (permissionOk) okDetails.push('permissions: Bash(onebrain *) ✓');

  return {
    check: 'settings-hooks',
    status: 'ok',
    message: 'hooks ok',
    ...(okDetails.length > 0 ? { details: okDetails } : {}),
  };
}
