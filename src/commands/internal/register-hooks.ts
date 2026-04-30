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
import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { loadVaultConfig } from '../../lib/index.js';
import { detectHarness } from './harness.js';

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
};

const HOOK_EVENTS = ['Stop'] as const;

const PERMISSIONS_TO_ADD = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash(git *)',
  'Bash(bun *)',
  'Bash(gh *)',
  'Bash(node *)',
  'Bash(onebrain *)',
  'Bash(bun install -g @onebrain-ai/cli*)',
  'Bash(npm install -g @onebrain-ai/cli*)',
  'WebFetch',
  'WebSearch',
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

// Hook events OneBrain is allowed to register (PostToolUse handled separately
// for qmd). Any onebrain-* command found under any other event is stale and
// must be removed — this catches PreCompact, PostCompact, UserPromptSubmit,
// SessionStart, and any future hook that might have been registered before.
const ALLOWED_HOOK_EVENTS = new Set(['Stop', 'PostToolUse']);

function applyHooks(settings: SettingsJson): Record<string, HookStatus> {
  if (!settings.hooks) settings.hooks = {};
  const hooks = settings.hooks;
  const result: Record<string, HookStatus> = {};

  // Remove stale onebrain-* commands under any non-allowed hook event. This
  // generalizes the legacy STALE_HOOK_COMMANDS approach (which matched only
  // exact command strings under specific event names) to catch every
  // onebrain entry registered under an unwanted event.
  for (const event of Object.keys(hooks)) {
    if (ALLOWED_HOOK_EVENTS.has(event)) continue;
    const groups = hooks[event] ?? [];
    const filtered = groups
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((entry) => {
          const cmd = entry.command ?? '';
          // Leave non-onebrain entries alone — those are user-added hooks
          return !cmd.includes('onebrain');
        }),
      }))
      .filter((group) => (group.hooks?.length ?? 0) > 0);
    if (filtered.length === 0) {
      delete hooks[event];
    } else {
      hooks[event] = filtered;
    }
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
  isTTY?: boolean;
  silent?: boolean;
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
  const isTTY = opts.isTTY ?? process.stdout.isTTY ?? false;

  const harness = await detectHarness(vaultRoot);
  let qmdCollection: string | undefined;
  try {
    const vaultConfig = await loadVaultConfig(vaultRoot);
    qmdCollection = vaultConfig.qmd_collection;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(
        `register-hooks: warning: could not read vault.yml: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  const result: RegisterHooksResult = {
    ok: false,
    hooks: {},
    permissionsAdded: [],
  };

  const settingsPath = join(vaultRoot, '.claude', 'settings.json');

  // Output helpers
  const note = (msg: string) => {
    if (opts.silent) return;
    process.stdout.write(`register-hooks: ${msg}\n`);
  };

  let hooksSpinner: ReturnType<typeof spinner> | null = null;
  let permSpinner: ReturnType<typeof spinner> | null = null;

  try {
    // ── Steps 1-3: Claude harness only — write .claude/settings.json ─────
    if (harness === 'claude') {
      hooksSpinner = isTTY ? spinner() : null;
      hooksSpinner?.start('Registering hooks...');

      const settings = await readSettings(settingsPath);
      result.hooks = applyHooks(settings);

      // ── Step 1b: qmd PostToolUse hook (applied before stop so it appears in hook line) ──
      let qmdStatus: HookStatus | undefined;
      if (qmdCollection) qmdStatus = applyQmdHook(settings);

      if (isTTY) {
        const parts = HOOK_EVENTS.map((e) => {
          const status = result.hooks[e];
          const icon = pc.green(status === 'ok' ? '✓' : status === 'migrated' ? '↑' : '+');
          return `${pc.dim(e)} ${icon}`;
        });
        if (qmdStatus)
          parts.push(`${pc.dim('PostToolUse')} ${pc.green(qmdStatus === 'ok' ? '✓' : '+')}`);
        hooksSpinner?.stop(`Hooks  ${parts.join('  ')}`);
      } else {
        const hookLine = HOOK_EVENTS.map((e) => {
          const status = result.hooks[e];
          const label =
            status === 'ok' || status === 'added' || status === 'migrated'
              ? 'ok'
              : (status ?? 'ok');
          return `${e} ${label}`;
        }).join('  ');
        note(hookLine);
        if (qmdStatus) note(`PostToolUse ${qmdStatus === 'added' ? 'added' : 'ok'}`);
      }

      // ── Step 2: Permissions ───────────────────────────────────────────────
      permSpinner = isTTY ? spinner() : null;
      permSpinner?.start('Updating permissions...');

      result.permissionsAdded = applyPermissions(settings);
      await writeSettings(settingsPath, settings);

      permSpinner?.stop('Permissions ok');
      if (!isTTY) note('permissions ok');
    } // end claude harness block

    // ── Step 4: Gemini harness (non-fatal) ────────────────────────────────
    if (harness === 'gemini') {
      await registerGeminiHooks(vaultRoot);
    }

    // ── Step 5: Direct harness ────────────────────────────────────────────
    if (harness === 'direct') {
      await registerDirectPath();
    }

    result.ok = true;

    if (!isTTY) {
      note('done');
    }
  } catch (err) {
    hooksSpinner?.stop('Registration failed');
    permSpinner?.stop('Permissions failed');
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
