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

import { readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { loadVaultConfig, mkdirIdempotent } from '../../lib/index.js';
import { detectHarnesses } from './harness.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HookEntry {
  type?: string;
  command?: string;
  args?: string[];
  [key: string]: unknown;
}

/**
 * Exec-form hook spec — split command + args so settings.json emits
 * `{ command: "onebrain", args: [...] }` (Claude Code ≥2.1.139).
 *
 * Exec form spawns the binary directly without a shell, so vault paths
 * containing spaces (e.g. Obsidian-on-iCloud) never need quoting.
 */
interface HookSpec {
  command: string;
  args: string[];
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

const HOOK_SPECS: Record<string, HookSpec> = {
  Stop: { command: 'onebrain', args: ['checkpoint', 'stop'] },
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
  await mkdirIdempotent(dirname(settingsPath));
  const tmpPath = `${settingsPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(settings, null, 4), 'utf8');
  await rename(tmpPath, settingsPath);
}

// ---------------------------------------------------------------------------
// Step 1: Register hooks (idempotent, with checkpoint-hook.sh migration)
// ---------------------------------------------------------------------------

type HookStatus = 'added' | 'migrated' | 'ok';

/**
 * Match a hook entry against an exec-form spec, accepting both:
 * - new exec form: `{ command: "onebrain", args: ["checkpoint", "stop"] }`
 * - legacy shell form: `{ command: "onebrain checkpoint stop" }` (no args)
 */
function matchesSpec(entry: HookEntry, spec: HookSpec): boolean {
  const fullCmd = [spec.command, ...spec.args].join(' ');
  if (
    entry.command === spec.command &&
    JSON.stringify(entry.args ?? []) === JSON.stringify(spec.args)
  ) {
    return true;
  }
  if (entry.command === fullCmd && !entry.args) {
    return true;
  }
  return false;
}

/**
 * If `entry` is the legacy shell form of `spec`, rewrite it in place to
 * exec form. Returns true when a rewrite happened.
 */
function rewriteIfShellForm(entry: HookEntry, spec: HookSpec): boolean {
  const fullCmd = [spec.command, ...spec.args].join(' ');
  if (entry.command === fullCmd && !entry.args) {
    entry.command = spec.command;
    entry.args = [...spec.args];
    if (!entry.type) entry.type = 'command';
    return true;
  }
  return false;
}

/**
 * Check whether a hook matching `spec` is already registered under an event.
 *
 * Returns:
 * - `found`: an entry already matches `spec` (in either exec or shell form).
 *   Callers should still run `rewriteIfShellForm` first so legacy entries
 *   converge to exec form on the same pass.
 * - `migrate`: an old `checkpoint-hook.sh` entry was found — caller should
 *   rewrite it to exec form rather than appending a new entry.
 * - `missing`: no matching or migratable entry — caller should push a new
 *   exec-form entry.
 */
function checkHookPresence(groups: HookGroup[], spec: HookSpec): 'found' | 'migrate' | 'missing' {
  let foundMigrate = false;
  for (const group of groups) {
    for (const entry of group.hooks ?? []) {
      if (matchesSpec(entry, spec)) return 'found';
      const cmd = entry.command ?? '';
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
    const spec = HOOK_SPECS[event];
    if (!spec) continue; // HOOK_SPECS covers all HOOK_EVENTS — this is a safety guard
    if (!hooks[event]) hooks[event] = [];
    const groups = hooks[event];

    // Pass 1: rewrite any legacy shell-form entries (`command: "onebrain
    // checkpoint stop"`) to exec form in place. This converts old entries on
    // the same run that registers new ones, without producing duplicates.
    let rewroteShellForm = false;
    for (const group of groups) {
      for (const entry of group.hooks ?? []) {
        if (rewriteIfShellForm(entry, spec)) rewroteShellForm = true;
      }
    }

    const presence = checkHookPresence(groups, spec);

    if (presence === 'found') {
      result[event] = rewroteShellForm ? 'migrated' : 'ok';
    } else if (presence === 'migrate') {
      for (const group of groups) {
        if (group.matcher === undefined) group.matcher = '';
        for (const entry of group.hooks ?? []) {
          if ((entry.command ?? '').includes('checkpoint-hook.sh')) {
            entry.command = spec.command;
            entry.args = [...spec.args];
            if (!entry.type) entry.type = 'command';
          }
        }
      }
      result[event] = 'migrated';
    } else {
      groups.push({
        matcher: '',
        hooks: [{ type: 'command', command: spec.command, args: [...spec.args] }],
      });
      result[event] = 'added';
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 2: Register PostToolUse qmd hook (optional, --qmd / --remove-qmd)
// ---------------------------------------------------------------------------

const QMD_SPEC: HookSpec = { command: 'onebrain', args: ['qmd-reindex'] };
const QMD_MATCHER = 'Write|Edit';

/**
 * True for any entry that represents the canonical qmd-reindex hook in
 * either exec or legacy shell form. Used by the strip-on-uninstall path
 * (`keepCanonical=false`) so /qmd uninstall removes both forms.
 */
function isCanonicalQmdEntry(entry: HookEntry): boolean {
  return matchesSpec(entry, QMD_SPEC);
}

/**
 * Match legacy templates that registered `qmd update <args>` as the PostToolUse
 * command instead of the `onebrain qmd-reindex` wrapper. `/doctor`'s substring
 * check looks for `qmd-reindex`, so these working hooks get flagged as missing
 * until we rewrite them. See issue #127.
 *
 * Word-bounded match (`\bqmd\s+update\b`) so the rewrite still applies even if
 * the entry is wrapped by a shell launcher (`powershell.exe -Command qmd update …`,
 * `bash -lc 'qmd update …'`, `cmd.exe /c qmd update …`).
 */
function isLegacyQmdCmd(cmd: string): boolean {
  return /\bqmd\s+update\b/.test(cmd);
}

/**
 * Migrate or remove any legacy `qmd update …` PostToolUse entries.
 *
 * - When `keepCanonical` is true (the normal `--qmd` path), legacy entries are
 *   rewritten in place to `onebrain qmd-reindex` and the parent group's matcher
 *   is normalized to `QMD_MATCHER` so a fresh install and a migrated install
 *   converge to the same shape.
 * - When `keepCanonical` is false (no `qmd_collection` in vault.yml — the user
 *   no longer uses qmd), both legacy `qmd update …` entries and canonical
 *   `onebrain qmd-reindex` entries are dropped from their groups, and any
 *   group that becomes empty is removed. Without this, deleting `qmd_collection`
 *   from vault.yml (or running `/qmd uninstall`) would leave the hook firing
 *   forever against a collection that no longer exists. `qmd_collection`'s
 *   absence is the authoritative signal that qmd is not in use — so the
 *   PostToolUse hook should not survive it, even if the user previously
 *   registered the canonical entry by hand.
 *
 * After in-place rewriting, duplicate canonical entries are deduped to one,
 * so a vault that already had a canonical entry plus a legacy entry doesn't
 * end up calling the hook twice on each Write.
 */
function migrateLegacyQmdEntries(groups: HookGroup[], keepCanonical: boolean): boolean {
  // Four sequential passes over `groups`:
  //   1. Rewrite-or-strip any `qmd update …` entries (rewrite directly to
  //      exec form; strip removes them entirely).
  //   2. (keepCanonical only) Rewrite legacy shell-form `onebrain qmd-reindex`
  //      entries to exec form in place, so both Pass-1 migrations and
  //      hand-edited shell-form entries converge to the same shape.
  //   3. Dedupe canonical entries (matched by spec, so both forms count as
  //      one) — runs on every keepCanonical=true call so a settings.json
  //      that already had two canonical entries still ends up with one.
  //   4. Splice out groups whose hooks array became empty (reverse iteration —
  //      forward indices stay valid as we splice from the tail).
  let touched = false;

  for (const group of groups) {
    if (!group.hooks) continue;
    if (keepCanonical) {
      let groupTouched = false;
      for (const entry of group.hooks) {
        if (isLegacyQmdCmd(entry.command ?? '')) {
          entry.command = QMD_SPEC.command;
          entry.args = [...QMD_SPEC.args];
          if (!entry.type) entry.type = 'command';
          groupTouched = true;
        }
      }
      if (groupTouched) {
        group.matcher = QMD_MATCHER;
        touched = true;
      }
    } else {
      const before = group.hooks.length;
      group.hooks = group.hooks.filter((h) => {
        const cmd = h.command ?? '';
        // Drop legacy `qmd update …` and canonical qmd-reindex (either form).
        return !isLegacyQmdCmd(cmd) && !isCanonicalQmdEntry(h);
      });
      if (group.hooks.length !== before) touched = true;
    }
  }

  if (keepCanonical) {
    // Pass 2: rewrite shell-form canonical entries to exec form in place.
    for (const group of groups) {
      for (const entry of group.hooks ?? []) {
        if (rewriteIfShellForm(entry, QMD_SPEC)) touched = true;
      }
    }

    // Pass 3: dedupe — keep first canonical (now always exec form), drop rest.
    let seenCanonical = false;
    for (const group of groups) {
      if (!group.hooks) continue;
      const before = group.hooks.length;
      group.hooks = group.hooks.filter((h) => {
        if (!isCanonicalQmdEntry(h)) return true;
        if (seenCanonical) return false;
        seenCanonical = true;
        return true;
      });
      if (group.hooks.length !== before) touched = true;
    }
  }

  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g && (g.hooks?.length ?? 0) === 0) groups.splice(i, 1);
  }

  return touched;
}

function applyQmdHook(settings: SettingsJson): HookStatus {
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks['PostToolUse']) settings.hooks['PostToolUse'] = [];
  const groups = settings.hooks['PostToolUse'];

  // Migrate before the canonical-presence check so a settings.json containing
  // only legacy entries reports `migrated` and produces a single canonical
  // entry — never `added` plus a stale duplicate. Migration also rewrites
  // legacy shell-form `onebrain qmd-reindex` entries to exec form.
  const migrated = migrateLegacyQmdEntries(groups, true);

  const already = groups.some((g) => g.hooks?.some((h) => isCanonicalQmdEntry(h)));
  if (already) return migrated ? 'migrated' : 'ok';
  groups.push({
    matcher: QMD_MATCHER,
    hooks: [{ type: 'command', command: QMD_SPEC.command, args: [...QMD_SPEC.args] }],
  });
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
// Step 4: (Gemini harness — no CLI work)
// ---------------------------------------------------------------------------
//
// OneBrain ships a self-contained Gemini extension at
// .claude/plugins/onebrain/gemini/ which users install via
// `gemini extensions link <vault>/.claude/plugins/onebrain/gemini`.
// Hooks (hooks/hooks.json), commands (commands/*.toml), skills, and agents
// are all served by Gemini natively from the linked extension — there is
// no register-hooks step for the gemini harness.

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

  const harnesses = await detectHarnesses(vaultRoot);
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
    // Iterate every detected harness. A vault with both `.claude/` and
    // `.gemini/` present should have OneBrain configured for BOTH — the
    // previous implementation early-returned on the first match and silently
    // skipped the other. Each branch writes independent config files; the
    // shared `result` is populated only by the claude branch (it owns the
    // .claude/settings.json hook/permission state).
    for (const harness of harnesses) {
      // ── Steps 1-3: Claude harness — write .claude/settings.json ─────
      if (harness === 'claude') {
        hooksSpinner = isTTY ? spinner() : null;
        hooksSpinner?.start('Registering hooks...');

        const settings = await readSettings(settingsPath);
        result.hooks = applyHooks(settings);

        // ── Step 1b: qmd PostToolUse hook (applied before stop so it appears in hook line) ──
        let qmdStatus: HookStatus | undefined;
        if (qmdCollection) {
          qmdStatus = applyQmdHook(settings);
        } else {
          // qmd disabled (no qmd_collection in vault.yml): strip any legacy
          // `qmd update …` PostToolUse entries so they don't keep firing against
          // a collection the user no longer maintains. Issue #127.
          const groups = settings.hooks?.['PostToolUse'] ?? [];
          const stripped = migrateLegacyQmdEntries(groups, false);
          if (stripped && groups.length === 0 && settings.hooks) {
            // Removing the key (rather than setting it to undefined) keeps the
            // serialized JSON clean — `JSON.stringify` would emit `"PostToolUse":null`
            // for the assignment form, which surprises downstream consumers.
            // biome-ignore lint/performance/noDelete: see comment above
            delete settings.hooks['PostToolUse'];
          }
        }

        if (isTTY) {
          const parts = HOOK_EVENTS.map((e) => {
            const status = result.hooks[e];
            const icon = pc.green(status === 'ok' ? '✓' : status === 'migrated' ? '↑' : '+');
            return `${pc.dim(e)} ${icon}`;
          });
          if (qmdStatus) {
            const qmdIcon = qmdStatus === 'ok' ? '✓' : qmdStatus === 'migrated' ? '↑' : '+';
            parts.push(`${pc.dim('PostToolUse')} ${pc.green(qmdIcon)}`);
          }
          hooksSpinner?.stop(`Hooks  ${parts.join('  ')}`);
        } else {
          const hookLine = HOOK_EVENTS.map((e) => {
            const status = result.hooks[e] ?? 'ok';
            return `${e} ${status}`;
          }).join('  ');
          note(hookLine);
          if (qmdStatus) note(`PostToolUse ${qmdStatus}`);
        }

        // ── Step 2: Permissions ───────────────────────────────────────────────
        permSpinner = isTTY ? spinner() : null;
        permSpinner?.start('Updating permissions...');

        result.permissionsAdded = applyPermissions(settings);
        await writeSettings(settingsPath, settings);

        permSpinner?.stop('Permissions ok');
        if (!isTTY) note('permissions ok');
      } // end claude harness block

      // ── Step 4: Gemini harness — no-op (handled by extension link, see header) ──
      // (Intentionally empty — Gemini reads hooks/commands/skills from the
      // self-contained extension at .claude/plugins/onebrain/gemini/, which
      // the user links via `gemini extensions link`.)

      // ── Step 5: Direct harness ────────────────────────────────────────────
      if (harness === 'direct') {
        await registerDirectPath();
      }
    } // end harness iteration

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
