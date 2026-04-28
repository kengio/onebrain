/**
 * register-hooks — internal command
 *
 * Idempotently registers OneBrain hooks, PATH, and permissions in
 * .claude/settings.json (claude-code harness) or equivalent for other harnesses.
 *
 * Exit code: 0 on success, 1 on failure.
 * TTY:     uses @clack/prompts layout
 * Non-TTY: plain text prefixed with "register-hooks:"
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { intro, log, outro, spinner } from '@clack/prompts';
import { loadVaultConfig } from '../../lib/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HookEntry {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
  [key: string]: unknown;
}

type HooksMap = Record<string, HookGroup[]>;

interface SettingsJson {
  permissions?: {
    allow?: string[];
    [key: string]: unknown;
  };
  hooks?: HooksMap;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOOK_COMMANDS: Record<string, string> = {
  Stop: 'onebrain checkpoint stop',
  PostCompact: 'onebrain checkpoint postcompact',
};

const HOOK_EVENTS = ['Stop', 'PostCompact'] as const;

// Hooks that were registered by previous versions and must be removed on /update.
const STALE_HOOK_COMMANDS: Record<string, string> = {
  PreCompact: 'onebrain checkpoint precompact',
};

const PERMISSIONS_TO_ADD = [
  'Bash(onebrain *)',
  'Bash(bun install -g @onebrain-ai/cli*)',
  'Bash(npm install -g @onebrain-ai/cli*)',
];

const ONEBRAIN_MARKER = '# onebrain';
const PATH_EXPORT = 'export PATH="$HOME/.bun/bin:$HOME/.npm-global/bin:$PATH"';

// ---------------------------------------------------------------------------
// Helpers: settings.json read/write
// ---------------------------------------------------------------------------

async function readSettings(settingsPath: string): Promise<SettingsJson> {
  try {
    const text = await readFile(settingsPath, 'utf8');
    return JSON.parse(text) as SettingsJson;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeSettings(settingsPath: string, settings: SettingsJson): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  const tmpPath = `${settingsPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(settings, null, 4), 'utf8');
  await rename(tmpPath, settingsPath);
}

// ---------------------------------------------------------------------------
// Step 1: Register hooks (idempotent, with checkpoint-hook.sh migration)
// ---------------------------------------------------------------------------

type HookStatus = 'added' | 'migrated' | 'ok';

/**
 * Check whether a command is already registered under an event.
 */
function checkHookPresence(
  groups: HookGroup[],
  targetCmd: string,
): 'found' | 'migrate' | 'missing' {
  let foundMigrate = false;
  for (const group of groups) {
    for (const entry of group.hooks ?? []) {
      const cmd = entry.command ?? '';
      if (cmd === targetCmd) return 'found';
      if (cmd.includes('checkpoint-hook.sh')) foundMigrate = true;
    }
  }
  return foundMigrate ? 'migrate' : 'missing';
}

function applyHooks(settings: SettingsJson): Record<string, HookStatus> {
  if (!settings.hooks) settings.hooks = {};
  const hooks = settings.hooks;
  const result: Record<string, HookStatus> = {};

  // Remove stale hooks from previous versions
  for (const [event, staleCmd] of Object.entries(STALE_HOOK_COMMANDS)) {
    if (!hooks[event]) continue;
    hooks[event] = hooks[event].filter(
      (group) => !group.hooks?.some((entry) => entry.command === staleCmd),
    );
    if (hooks[event].length === 0) delete hooks[event];
  }

  for (const event of HOOK_EVENTS) {
    const cmd = HOOK_COMMANDS[event];
    if (!cmd) continue; // HOOK_COMMANDS covers all HOOK_EVENTS — this is a safety guard
    if (!hooks[event]) hooks[event] = [];
    const groups = hooks[event];
    const presence = checkHookPresence(groups, cmd);

    if (presence === 'found') {
      result[event] = 'ok';
    } else if (presence === 'migrate') {
      for (const group of groups) {
        if (group.matcher === undefined) group.matcher = '';
        for (const entry of group.hooks ?? []) {
          if ((entry.command ?? '').includes('checkpoint-hook.sh')) {
            entry.command = cmd;
            if (!entry.type) entry.type = 'command';
          }
        }
      }
      result[event] = 'migrated';
    } else {
      groups.push({ matcher: '', hooks: [{ type: 'command', command: cmd }] });
      result[event] = 'added';
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 2: Register PostToolUse qmd hook (optional, --qmd / --remove-qmd)
// ---------------------------------------------------------------------------

const QMD_CMD = 'onebrain qmd-reindex';
const QMD_MATCHER = 'Write|Edit';

function applyQmdHook(settings: SettingsJson): HookStatus {
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks['PostToolUse']) settings.hooks['PostToolUse'] = [];
  const groups = settings.hooks['PostToolUse'];
  const already = groups.some((g) => g.hooks?.some((h) => h.command === QMD_CMD));
  if (already) return 'ok';
  groups.push({ matcher: QMD_MATCHER, hooks: [{ type: 'command', command: QMD_CMD }] });
  return 'added';
}

// ---------------------------------------------------------------------------
// Step 3: Register permissions (idempotent)
// ---------------------------------------------------------------------------

function applyPermissions(settings: SettingsJson): string[] {
  if (!settings.permissions) settings.permissions = {};
  if (!settings.permissions.allow) settings.permissions.allow = [];

  const allow = settings.permissions.allow;
  const added: string[] = [];

  for (const perm of PERMISSIONS_TO_ADD) {
    if (!allow.includes(perm)) {
      allow.push(perm);
      added.push(perm);
    }
  }

  return added;
}

// ---------------------------------------------------------------------------
// Step 4: Gemini harness (non-fatal)
// ---------------------------------------------------------------------------

async function registerGeminiHooks(vaultRoot: string): Promise<void> {
  const geminiSettingsPath = join(vaultRoot, '.gemini', 'settings.json');
  try {
    // Only modify if the file already exists — skip non-fatally otherwise
    const text = await readFile(geminiSettingsPath, 'utf8');
    const settings = JSON.parse(text) as SettingsJson;
    applyHooks(settings);
    await writeSettings(geminiSettingsPath, settings);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(
        `register-hooks: gemini warning: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Step 5: Direct harness — shell profile PATH export (idempotent via marker)
// ---------------------------------------------------------------------------

async function registerDirectPath(): Promise<void> {
  const home = homedir();
  const candidates = [join(home, '.zshrc'), join(home, '.bashrc'), join(home, '.profile')];

  let profilePath: string | undefined;
  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8');
      profilePath = candidate;
      break;
    } catch {
      // Not found — try next
    }
  }

  if (!profilePath) return;

  const content = await readFile(profilePath, 'utf8');
  if (content.includes(ONEBRAIN_MARKER)) return;

  const updated = `${content}\n${ONEBRAIN_MARKER}\n${PATH_EXPORT}\n`;
  const tmpPath = `${profilePath}.tmp`;
  await writeFile(tmpPath, updated, 'utf8');
  await rename(tmpPath, profilePath);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RegisterHooksOptions {
  vaultDir?: string;
}

export interface RegisterHooksResult {
  ok: boolean;
  hooks: Record<string, HookStatus>;
  permissionsAdded: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Main runRegisterHooks
// ---------------------------------------------------------------------------

export async function runRegisterHooks(
  opts: RegisterHooksOptions = {},
): Promise<RegisterHooksResult> {
  const vaultRoot = opts.vaultDir ?? process.cwd();
  const isTTY = process.stdout.isTTY;

  // Load vault.yml to determine harness and qmd_collection
  let harness = 'claude-code';
  let qmdCollection: string | undefined;
  try {
    const vaultConfig = await loadVaultConfig(vaultRoot);
    harness = vaultConfig.runtime?.harness ?? 'claude-code';
    qmdCollection = vaultConfig.qmd_collection;
  } catch {
    // vault.yml missing — use defaults
  }

  const result: RegisterHooksResult = {
    ok: false,
    hooks: {},
    permissionsAdded: [],
  };

  const settingsPath = join(vaultRoot, '.claude', 'settings.json');

  // Output helpers
  const note = (msg: string) => {
    if (isTTY) {
      log.message(msg);
    } else {
      process.stdout.write(`register-hooks: ${msg}\n`);
    }
  };

  try {
    if (isTTY) intro('OneBrain Register Hooks');

    // ── Steps 1-3: Read once, apply all, write once ───────────────────────
    const hooksSpinner = isTTY ? spinner() : null;
    hooksSpinner?.start('Registering hooks...');

    const settings = await readSettings(settingsPath);
    result.hooks = applyHooks(settings);

    hooksSpinner?.stop('Hooks registered');

    if (isTTY) {
      const hookLine = HOOK_EVENTS.map((e) => {
        const status = result.hooks[e];
        const icon = status === 'ok' ? '✓' : status === 'migrated' ? '↑' : '+';
        return `${e}: ${icon}`;
      }).join('  ');
      note(hookLine);
    } else {
      const hookLine = HOOK_EVENTS.map((e) => {
        const status = result.hooks[e];
        const label =
          status === 'ok' || status === 'added' || status === 'migrated' ? 'ok' : (status ?? 'ok');
        return `${e} ${label}`;
      }).join('  ');
      note(hookLine);
    }

    // ── Step 1b: qmd PostToolUse hook (auto-detect from vault.yml) ──────────
    if (qmdCollection) {
      const status = applyQmdHook(settings);
      note(status === 'added' ? 'PostToolUse qmd: added' : 'PostToolUse qmd: ok');
    }

    // ── Step 2: Permissions ───────────────────────────────────────────────
    const permSpinner = isTTY ? spinner() : null;
    permSpinner?.start('Updating permissions...');

    result.permissionsAdded = applyPermissions(settings);
    await writeSettings(settingsPath, settings);

    permSpinner?.stop('Updating permissions...');

    if (isTTY) {
      for (const perm of PERMISSIONS_TO_ADD) {
        note(`${perm}: ✓`);
      }
    } else {
      note('permissions ok');
    }

    // ── Step 4: Gemini harness (non-fatal) ────────────────────────────────
    if (harness === 'gemini') {
      await registerGeminiHooks(vaultRoot);
    }

    // ── Step 5: Direct harness ────────────────────────────────────────────
    if (harness === 'direct') {
      await registerDirectPath();
    }

    result.ok = true;

    if (isTTY) {
      outro('Done');
    } else {
      note('done');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = msg;
    process.stderr.write(`register-hooks: error: ${msg}\n`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function registerHooksCommand(vaultDir?: string): Promise<void> {
  const result = await runRegisterHooks({
    ...(vaultDir !== undefined ? { vaultDir } : {}),
  });
  if (!result.ok) {
    process.exit(1);
  }
}
