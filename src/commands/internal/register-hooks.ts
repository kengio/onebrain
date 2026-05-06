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

import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { loadVaultConfig, mkdirIdempotent } from '../../lib/index.js';
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
// must be removed — this catches anything previously registered, including
// historical events that have since been retired.
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
 *   no longer uses qmd), legacy entries are dropped from their groups, and any
 *   group that becomes empty is removed. Without this, deleting `qmd_collection`
 *   from vault.yml would leave the legacy hook firing forever against a
 *   collection that no longer exists.
 *
 * After in-place rewriting, duplicate canonical entries are deduped to one,
 * so a vault that already had a canonical entry plus a legacy entry doesn't
 * end up calling the hook twice on each Write.
 */
function migrateLegacyQmdEntries(groups: HookGroup[], keepCanonical: boolean): boolean {
  // Three sequential passes over `groups`:
  //   1. Rewrite-or-strip any `qmd update …` entries (rewrite keeps canonical,
  //      strip removes them entirely).
  //   2. Dedupe `onebrain qmd-reindex` entries — runs on every keepCanonical=true
  //      call so a settings.json that already had two canonical entries (Pass 1
  //      saw nothing to do) still ends up with one.
  //   3. Splice out groups whose hooks array became empty (reverse iteration —
  //      forward indices stay valid as we splice from the tail).
  let touched = false;

  for (const group of groups) {
    if (!group.hooks) continue;
    if (keepCanonical) {
      let groupTouched = false;
      for (const entry of group.hooks) {
        if (isLegacyQmdCmd(entry.command ?? '')) {
          entry.command = QMD_CMD;
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
      group.hooks = group.hooks.filter((h) => !isLegacyQmdCmd(h.command ?? ''));
      if (group.hooks.length !== before) touched = true;
    }
  }

  if (keepCanonical) {
    let seenCanonical = false;
    for (const group of groups) {
      if (!group.hooks) continue;
      const before = group.hooks.length;
      group.hooks = group.hooks.filter((h) => {
        if (h.command !== QMD_CMD) return true;
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
  // entry — never `added` plus a stale duplicate.
  const migrated = migrateLegacyQmdEntries(groups, true);

  const already = groups.some((g) => g.hooks?.some((h) => h.command === QMD_CMD));
  if (already) return migrated ? 'migrated' : 'ok';
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

// Gemini CLI hooks live in [vault]/.gemini/settings.json. OneBrain mirrors
// the Claude registration set exactly — currently `Stop` + `PostToolUse` (qmd
// only) — translated into Gemini's event vocabulary (Before/After style):
//   Claude `Stop`        → Gemini `AfterAgent` (matcher `*`)
//   Claude `PostToolUse` → Gemini `AfterTool`  (matcher `Write|Edit`, qmd only)
//
// We do NOT register Gemini's `PreCompress`, `SessionStart`, `SessionEnd`, or
// any other event — Claude doesn't register their equivalents either, so the
// harnesses stay symmetric. Adding events here means adding them to the
// Claude side first.
//
// Every hook command must emit `{}` on stdout — Gemini ignores hooks that
// don't satisfy the JSON protocol — so we redirect the inner command's
// output to /dev/null and append `echo '{}'`.
interface GeminiHookSpec {
  command: string;
  matcher: string;
}

const GEMINI_HOOK_SPECS: Record<string, GeminiHookSpec> = {
  AfterAgent: { command: 'onebrain checkpoint stop', matcher: '*' },
};

const GEMINI_QMD_EVENT = 'AfterTool';

// Reuses Claude's `Write|Edit` matcher value verbatim because the live Gemini
// CLI accepts the same pipe-delimited tool-name union for the `AfterTool`
// event. If a future Gemini release diverges (e.g. requires array form or
// glob syntax), introduce a separate `GEMINI_QMD_MATCHER` constant — the
// reuse below is a known coupling.
const GEMINI_QMD_MATCHER = QMD_MATCHER;

function wrapGeminiCommand(cmd: string): string {
  return `${cmd} > /dev/null 2>&1; echo '{}'`;
}

/**
 * Apply Gemini-shaped hooks to a settings object. Distinct from `applyHooks`
 * because Gemini uses a different event vocabulary and requires JSON-wrapped
 * commands. Stale `onebrain*` entries under non-allowed events are pruned;
 * idempotent for already-registered hooks.
 */
function applyGeminiHooks(
  settings: SettingsJson,
  qmdCollection: string | undefined,
): Record<string, HookStatus> {
  if (!settings.hooks) settings.hooks = {};
  const hooks = settings.hooks;
  const result: Record<string, HookStatus> = {};

  const allowedEvents = new Set<string>([...Object.keys(GEMINI_HOOK_SPECS), GEMINI_QMD_EVENT]);
  for (const event of Object.keys(hooks)) {
    if (allowedEvents.has(event)) continue;
    const groups = hooks[event] ?? [];
    const filtered = groups
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((entry) => !(entry.command ?? '').includes('onebrain')),
      }))
      .filter((group) => (group.hooks?.length ?? 0) > 0);
    if (filtered.length === 0) {
      delete hooks[event];
    } else {
      hooks[event] = filtered;
    }
  }

  for (const [event, spec] of Object.entries(GEMINI_HOOK_SPECS)) {
    const wrapped = wrapGeminiCommand(spec.command);
    if (!hooks[event]) hooks[event] = [];
    const groups = hooks[event];

    // Migrate any bare (unwrapped) onebrain commands in this group to the
    // wrapped form before checking presence — older configs / hand edits may
    // have written the raw command without `> /dev/null 2>&1; echo '{}'`,
    // and Gemini ignores hooks that don't emit JSON on stdout. Without
    // migration, the presence check would miss the bare entry and we'd
    // append a duplicate wrapped one, leaving the hook firing twice.
    let migrated = false;
    for (const group of groups) {
      for (const entry of group.hooks ?? []) {
        if (entry.command === spec.command) {
          entry.command = wrapped;
          if (!entry.type) entry.type = 'command';
          migrated = true;
        }
      }
    }

    const already = groups.some((g) => g.hooks?.some((h) => h.command === wrapped));
    if (already) {
      result[event] = migrated ? 'migrated' : 'ok';
    } else {
      groups.push({ matcher: spec.matcher, hooks: [{ type: 'command', command: wrapped }] });
      result[event] = 'added';
    }
  }

  if (qmdCollection) {
    const wrapped = wrapGeminiCommand(QMD_CMD);
    if (!hooks[GEMINI_QMD_EVENT]) hooks[GEMINI_QMD_EVENT] = [];
    const groups = hooks[GEMINI_QMD_EVENT];

    // Same bare-command migration for qmd-reindex.
    let migrated = false;
    for (const group of groups) {
      for (const entry of group.hooks ?? []) {
        if (entry.command === QMD_CMD) {
          entry.command = wrapped;
          if (!entry.type) entry.type = 'command';
          migrated = true;
        }
      }
    }

    const already = groups.some((g) => g.hooks?.some((h) => h.command === wrapped));
    if (already) {
      result[GEMINI_QMD_EVENT] = migrated ? 'migrated' : 'ok';
    } else {
      groups.push({
        matcher: GEMINI_QMD_MATCHER,
        hooks: [{ type: 'command', command: wrapped }],
      });
      result[GEMINI_QMD_EVENT] = 'added';
    }
  } else {
    // qmd disabled in vault.yml — strip OneBrain-owned qmd entries only.
    // The previous filter `!cmd.includes('qmd-reindex')` would also drop
    // user-authored hooks that happened to mention `qmd-reindex` (e.g. a
    // wrapper script). Scoping to entries that contain BOTH `onebrain` and
    // `qmd-reindex` matches the OneBrain-owned identification used elsewhere
    // in this file.
    const groups = hooks[GEMINI_QMD_EVENT] ?? [];
    const filtered = groups
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((entry) => {
          const cmd = entry.command ?? '';
          return !(cmd.includes('onebrain') && cmd.includes('qmd-reindex'));
        }),
      }))
      .filter((group) => (group.hooks?.length ?? 0) > 0);
    if (filtered.length === 0 && groups.length > 0) {
      delete hooks[GEMINI_QMD_EVENT];
    } else if (filtered.length !== groups.length) {
      hooks[GEMINI_QMD_EVENT] = filtered;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Gemini slash-command bundle copy
// ---------------------------------------------------------------------------

// Slash command TOMLs are bundled in the plugin at .claude/plugins/onebrain/
// gemini/commands/ — version-controlled, hand-customizable, and synced to the
// vault by `onebrain vault-sync`. On register, copy each .toml file from that
// bundled source to the vault's .gemini/commands/ directory where Gemini CLI
// looks them up.
//
// Bundle policy: TOMLs are HAND-CURATED, not runtime-generated. To add a new
// skill's TOML, write the file directly under that path and commit it. To
// customize a skill's Gemini prompt, edit its individual `.toml` directly.
// Do NOT add a runtime generator that iterates `skills/` — it would create
// drift between the bundle and the live skill set, and break customizations.
//
// The same pattern applies to future harness bundles (e.g. .claude/plugins/
// onebrain/codex/) — see [[Multi-Harness Config Reference]] in the vault.

interface BundleCopyResult {
  copied: string[];
  unchanged: string[];
}

async function copyBundledGeminiCommands(vaultRoot: string): Promise<BundleCopyResult> {
  const bundledDir = join(vaultRoot, '.claude', 'plugins', 'onebrain', 'gemini', 'commands');
  const targetDir = join(vaultRoot, '.gemini', 'commands');
  const result: BundleCopyResult = { copied: [], unchanged: [] };

  let entries: string[];
  try {
    entries = await readdir(bundledDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return result;
    throw err;
  }

  await mkdirIdempotent(targetDir);

  for (const entry of entries) {
    if (!entry.endsWith('.toml')) continue;
    const src = join(bundledDir, entry);
    const dst = join(targetDir, entry);

    let isFile = false;
    try {
      isFile = (await stat(src)).isFile();
    } catch {
      continue;
    }
    if (!isFile) continue;

    const desired = await readFile(src, 'utf8');
    let existing: string | null = null;
    try {
      existing = await readFile(dst, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    if (existing === desired) {
      result.unchanged.push(entry);
      continue;
    }
    await writeFile(dst, desired, 'utf8');
    result.copied.push(entry);
  }

  return result;
}

async function registerGeminiHooks(
  vaultRoot: string,
  qmdCollection: string | undefined,
): Promise<{ hooks: Record<string, HookStatus>; bundle: BundleCopyResult }> {
  const geminiSettingsPath = join(vaultRoot, '.gemini', 'settings.json');
  let hooksResult: Record<string, HookStatus> = {};
  let bundleResult: BundleCopyResult = { copied: [], unchanged: [] };

  try {
    let settings: SettingsJson = {};
    try {
      const text = await readFile(geminiSettingsPath, 'utf8');
      settings = JSON.parse(text) as SettingsJson;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      // Missing settings.json — start fresh; writeSettings creates parents
    }
    hooksResult = applyGeminiHooks(settings, qmdCollection);
    await writeSettings(geminiSettingsPath, settings);
    bundleResult = await copyBundledGeminiCommands(vaultRoot);
  } catch (err) {
    process.stderr.write(
      `register-hooks: gemini warning: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  return { hooks: hooksResult, bundle: bundleResult };
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
          const status = result.hooks[e];
          const label =
            status === 'ok' || status === 'added' || status === 'migrated'
              ? 'ok'
              : (status ?? 'ok');
          return `${e} ${label}`;
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

    // ── Step 4: Gemini harness (non-fatal) ────────────────────────────────
    if (harness === 'gemini') {
      const geminiSpinner = isTTY ? spinner() : null;
      geminiSpinner?.start('Registering Gemini hooks + commands...');

      const gemini = await registerGeminiHooks(vaultRoot, qmdCollection);
      result.hooks = gemini.hooks;

      const hookEvents = Object.keys(gemini.hooks).length;
      const bundleCount = gemini.bundle.copied.length + gemini.bundle.unchanged.length;
      const summary = `${hookEvents} hooks, ${bundleCount} commands`;
      if (isTTY) {
        geminiSpinner?.stop(`Gemini  ${pc.green(summary)}`);
      } else {
        note(`gemini ${summary}`);
      }
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
