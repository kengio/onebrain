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
import { parse as parseYaml } from 'yaml';

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
  env?: {
    PATH?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOOK_COMMANDS: Record<string, string> = {
  Stop: 'onebrain checkpoint stop',
  PreCompact: 'onebrain checkpoint precompact',
  PostCompact: 'onebrain checkpoint postcompact',
  SessionStart: 'onebrain session-init',
};

const HOOK_EVENTS = ['Stop', 'PreCompact', 'PostCompact', 'SessionStart'] as const;

const PERMISSIONS_TO_ADD = [
  'Bash(onebrain *)',
  'Bash(bun install -g @onebrain-ai/cli*)',
  'Bash(npm install -g @onebrain-ai/cli*)',
];

const BUN_BIN = join(homedir(), '.bun', 'bin');
const NPM_GLOBAL_BIN = join(homedir(), '.npm-global', 'bin');

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

  for (const event of HOOK_EVENTS) {
    const cmd = HOOK_COMMANDS[event];
    if (!hooks[event]) hooks[event] = [];
    const groups = hooks[event];
    const presence = checkHookPresence(groups, cmd);

    if (presence === 'found') {
      result[event] = 'ok';
    } else if (presence === 'migrate') {
      for (const group of groups) {
        for (const entry of group.hooks ?? []) {
          if ((entry.command ?? '').includes('checkpoint-hook.sh')) {
            entry.command = cmd;
          }
        }
      }
      result[event] = 'migrated';
    } else {
      groups.push({ hooks: [{ command: cmd }] });
      result[event] = 'added';
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 2: Register PATH (idempotent)
// ---------------------------------------------------------------------------

function applyPath(settings: SettingsJson): 'ok' | 'updated' {
  if (!settings.env) settings.env = {};

  const existing = settings.env.PATH ?? '';
  const parts = existing ? existing.split(':') : [];

  const bunForms = [BUN_BIN, '$HOME/.bun/bin', '${HOME}/.bun/bin', '~/.bun/bin'];
  const npmForms = [
    NPM_GLOBAL_BIN,
    '$HOME/.npm-global/bin',
    '${HOME}/.npm-global/bin',
    '~/.npm-global/bin',
  ];

  const missing: string[] = [];
  if (!bunForms.some((f) => parts.includes(f))) missing.push(BUN_BIN);
  if (!npmForms.some((f) => parts.includes(f))) missing.push(NPM_GLOBAL_BIN);

  if (missing.length === 0) return 'ok';

  const base = existing || '${PATH}';
  const hasPlaceholder = base.includes('${PATH}');

  if (hasPlaceholder) {
    const withoutPlaceholder = base.replace('${PATH}', '').replace(/:+$/, '').replace(/^:+/, '');
    const allParts = [
      ...missing,
      ...(withoutPlaceholder ? withoutPlaceholder.split(':').filter(Boolean) : []),
      '${PATH}',
    ];
    settings.env.PATH = allParts.join(':');
  } else {
    settings.env.PATH = [...missing, base].join(':');
  }

  return 'updated';
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
  pathStatus: 'ok' | 'updated';
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

  // Load vault.yml to determine harness
  let harness = 'claude-code';
  try {
    const vaultYmlText = await readFile(join(vaultRoot, 'vault.yml'), 'utf8');
    const vaultYml = (parseYaml(vaultYmlText) ?? {}) as Record<string, unknown>;
    const runtime = vaultYml.runtime as Record<string, unknown> | undefined;
    if (runtime && typeof runtime.harness === 'string') {
      harness = runtime.harness;
    }
  } catch {
    // vault.yml missing — use default harness
  }

  const result: RegisterHooksResult = {
    ok: false,
    hooks: {},
    pathStatus: 'ok',
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
          status === 'ok' || status === 'added' || status === 'migrated' || status === 'found'
            ? 'ok'
            : (status ?? 'ok');
        return `${e} ${label}`;
      }).join('  ');
      note(hookLine);
    }

    // ── Step 2: PATH ──────────────────────────────────────────────────────
    const pathSpinner = isTTY ? spinner() : null;
    pathSpinner?.start('Registering PATH...');

    result.pathStatus = applyPath(settings);

    pathSpinner?.stop('PATH registered');

    if (isTTY) {
      note('env.PATH in .claude/settings.json: ✓');
    } else {
      note('PATH ok');
    }

    // ── Step 3: Permissions ───────────────────────────────────────────────
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
  const result = await runRegisterHooks({ vaultDir });
  if (!result.ok) {
    process.exit(1);
  }
}
