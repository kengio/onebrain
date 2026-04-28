/**
 * init — Initialize a new OneBrain vault
 *
 * Steps:
 *   1. Detect existing vault.yml  (--force, non-TTY exit-1, TTY prompt)
 *   2. Create standard folders    (8 + inbox/imports)
 *   3. Write vault.yml
 *   4. Download plugin files      (skip if .claude/plugins/onebrain/.claude-plugin/plugin.json exists)
 *   5. Register plugin            (skip if source:marketplace entry exists)
 *   6. Run register-hooks
 *
 * TTY:     uses @clack/prompts layout
 * Non-TTY: plain text lines
 *
 * Exit code: 0 on success, 1 on failure.
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { cancel, confirm, spinner as createSpinner, outro } from '@clack/prompts';
import pc from 'picocolors';
import { stringify as stringifyYaml } from 'yaml';
import { printBanner, resolveBinaryVersion } from './internal/cli-banner.js';
import { detectHarness } from './internal/harness.js';

const binaryVersion = resolveBinaryVersion();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InitOptions {
  /** Vault root directory (default: process.cwd()). */
  vaultDir?: string;
  /** Overwrite existing vault.yml without prompting. */
  force?: boolean;
  /** Whether stdout is a TTY (default: process.stdout.isTTY). */
  isTTY?: boolean;
  /** Override path to installed_plugins.json (for tests). */
  installedPluginsPath?: string;
  /** Injectable vault-sync function (for tests). */
  vaultSyncFn?: (
    vaultDir: string,
    opts: { branch?: string; includeObsidian?: boolean },
  ) => Promise<void>;
  /** Injectable community plugin installer function (for tests). */
  installPluginsFn?: (
    vaultDir: string,
    opts: { githubToken?: string },
  ) => Promise<PluginInstallResult>;
  /** Injectable register-hooks function (for tests). */
  registerHooksFn?: (vaultDir: string) => Promise<void>;
}

export interface InitResult {
  ok: boolean;
  exitCode: number;
  /** Human-readable message (used for non-TTY output / test assertions). */
  message?: string;
  foldersCreated: number;
  pluginSkipped: boolean;
  pluginRegistrationSkipped: boolean;
  pluginsInstalled: number;
  pluginsFailed: number;
}

export interface PluginInstallResult {
  installed: string[];
  failed: Array<{ id: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Standard vault folders
// ---------------------------------------------------------------------------

/** [folder-path, create-parent-only] */
const STANDARD_FOLDERS: string[] = [
  '00-inbox',
  '01-projects',
  '02-areas',
  '03-knowledge',
  '04-resources',
  '05-agent',
  '06-archive',
  '07-logs',
];

// inbox/imports is a sub-directory that must also be created
const INBOX_IMPORTS = join('00-inbox', 'imports');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function createFolders(vaultDir: string): Promise<number> {
  let created = 0;

  const allPaths = [...STANDARD_FOLDERS, INBOX_IMPORTS];

  for (const rel of allPaths) {
    const full = join(vaultDir, rel);
    if (!(await pathExists(full))) {
      await mkdir(full, { recursive: true });
      created++;
    }
  }

  return created;
}

const VAULT_YML_DEFAULTS = {
  update_channel: 'stable',
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
  checkpoint: {
    messages: 15,
    minutes: 30,
  },
};

async function writeVaultYml(vaultDir: string): Promise<void> {
  const content = stringifyYaml(VAULT_YML_DEFAULTS, { lineWidth: 0 });
  await writeFile(join(vaultDir, 'vault.yml'), content, 'utf8');
}

/**
 * Step 4: Download plugin files (skip if already present).
 * Returns { skipped, driftWarning }.
 */
async function downloadPluginFiles(
  vaultDir: string,
  vaultSyncFn: (
    vaultDir: string,
    opts: { branch?: string; includeObsidian?: boolean },
  ) => Promise<void>,
): Promise<{ skipped: boolean; driftWarning?: string; failed?: boolean }> {
  const pluginJsonPath = join(
    vaultDir,
    '.claude',
    'plugins',
    'onebrain',
    '.claude-plugin',
    'plugin.json',
  );

  if (await pathExists(pluginJsonPath)) {
    // Check version drift
    let pluginVersion: string | undefined;
    try {
      const text = await readFile(pluginJsonPath, 'utf8');
      const parsed = JSON.parse(text) as Record<string, unknown>;
      pluginVersion = typeof parsed['version'] === 'string' ? parsed['version'] : undefined;
    } catch {
      // Non-fatal
    }

    let driftWarning: string | undefined;
    if (pluginVersion && binaryVersion !== 'dev' && pluginVersion !== binaryVersion) {
      driftWarning = `Plugin files v${pluginVersion}, binary v${binaryVersion} — run onebrain update to sync.`;
    }

    return driftWarning !== undefined ? { skipped: true, driftWarning } : { skipped: true };
  }

  // Plugin files not present — run vault-sync (non-fatal)
  try {
    await vaultSyncFn(vaultDir, { includeObsidian: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`init: vault-sync warning: ${msg}\n`);
    return { skipped: false, failed: true };
  }

  return { skipped: false };
}

/**
 * Step 5: Register plugin in installed_plugins.json.
 * Skips if a source:marketplace entry already exists.
 * Returns { skipped }.
 */
async function registerPlugin(
  vaultDir: string,
  installedPluginsPath: string,
): Promise<{ skipped: boolean }> {
  // Read existing file
  let data: Record<string, unknown>;
  try {
    const text = await readFile(installedPluginsPath, 'utf8');
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { plugins: {} };
  }

  const plugins = (data['plugins'] ?? {}) as Record<string, unknown[]>;
  data['plugins'] = plugins;

  // Check if any onebrain@ key has a marketplace entry
  const hasMarketplace = Object.keys(plugins)
    .filter((k) => k.startsWith('onebrain@'))
    .some((k) => {
      const entries = plugins[k] as Array<Record<string, unknown>>;
      return entries.some((e) => e['source'] === 'marketplace');
    });

  if (hasMarketplace) {
    return { skipped: true };
  }

  // Read plugin version from .claude-plugin/plugin.json or plugin.json
  let pluginVersion = '0.0.0';
  const candidatePaths = [
    join(vaultDir, '.claude', 'plugins', 'onebrain', '.claude-plugin', 'plugin.json'),
    join(vaultDir, '.claude', 'plugins', 'onebrain', 'plugin.json'),
  ];
  for (const p of candidatePaths) {
    try {
      const text = await readFile(p, 'utf8');
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed['version'] === 'string') {
        pluginVersion = parsed['version'];
        break;
      }
    } catch {
      // Try next
    }
  }

  const installPath = join(vaultDir, '.claude', 'plugins', 'onebrain');
  const key = `onebrain@${pluginVersion}`;

  // Upsert entry
  if (!plugins[key]) {
    plugins[key] = [];
  }
  const entries = plugins[key] as Array<Record<string, unknown>>;
  const existingIdx = entries.findIndex((e) => e['source'] !== 'marketplace');

  if (existingIdx >= 0) {
    const existing = entries[existingIdx];
    if (existing) {
      existing['installPath'] = installPath;
      existing['version'] = pluginVersion;
    }
  } else {
    entries.push({ source: 'local', installPath, version: pluginVersion });
  }

  // Write atomically
  const tmpPath = `${installedPluginsPath}.tmp`;
  try {
    await mkdir(dirname(installedPluginsPath), { recursive: true });
    await writeFile(tmpPath, JSON.stringify(data, null, 4), 'utf8');
    await rename(tmpPath, installedPluginsPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`init: plugin registration warning: ${msg}\n`);
    return { skipped: false };
  }

  return { skipped: false };
}

// ---------------------------------------------------------------------------
// Community plugin installer
// ---------------------------------------------------------------------------

const PLUGIN_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const REGISTRY_URL =
  'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json';
const GITHUB_API_BASE = 'https://api.github.com/repos';

interface RegistryEntry {
  id: string;
  repo: string;
}

async function installObsidianPlugins(
  vaultDir: string,
  opts: { githubToken?: string },
): Promise<PluginInstallResult> {
  const communityPluginsPath = join(vaultDir, '.obsidian', 'community-plugins.json');

  // Read list of plugins to install
  let pluginIds: string[];
  try {
    const text = await readFile(communityPluginsPath, 'utf8');
    pluginIds = JSON.parse(text) as string[];
    if (!Array.isArray(pluginIds) || pluginIds.length === 0) {
      return { installed: [], failed: [] };
    }
  } catch {
    return { installed: [], failed: [] };
  }

  const installed: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  // Validate all IDs first
  const validIds: string[] = [];
  for (const id of pluginIds) {
    if (!PLUGIN_ID_PATTERN.test(id)) {
      failed.push({ id, reason: 'invalid id' });
    } else {
      validIds.push(id);
    }
  }

  if (validIds.length === 0) return { installed, failed };

  // Fetch Obsidian plugin registry
  const authHeaders: Record<string, string> = opts.githubToken
    ? { Authorization: `token ${opts.githubToken}` }
    : {};

  let registry: RegistryEntry[];
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(REGISTRY_URL, { signal: controller.signal, headers: authHeaders });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`Registry fetch failed: HTTP ${resp.status}`);
    registry = (await resp.json()) as RegistryEntry[];
  } catch (err) {
    const reason = `registry unavailable: ${err instanceof Error ? err.message : String(err)}`;
    for (const id of validIds) {
      failed.push({ id, reason });
    }
    return { installed, failed };
  }

  // Install each plugin
  for (const id of validIds) {
    const pluginDir = join(vaultDir, '.obsidian', 'plugins', id);
    const manifestPath = join(pluginDir, 'manifest.json');

    // Idempotency: skip if already installed
    if (await pathExists(manifestPath)) {
      installed.push(id);
      continue;
    }

    const entry = registry.find((r) => r.id === id);
    if (!entry) {
      failed.push({ id, reason: 'not in registry' });
      continue;
    }

    // Fetch latest release assets
    let assets: Array<{ name: string; browser_download_url: string }>;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${GITHUB_API_BASE}/${entry.repo}/releases/latest`, {
        signal: controller.signal,
        headers: { Accept: 'application/vnd.github.v3+json', ...authHeaders },
      });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as Record<string, unknown>;
      assets = (json['assets'] ?? []) as Array<{ name: string; browser_download_url: string }>;
    } catch (err) {
      failed.push({
        id,
        reason: `release fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    // Download assets
    await mkdir(pluginDir, { recursive: true });
    let pluginFailed = false;

    for (const assetName of ['main.js', 'manifest.json', 'styles.css'] as const) {
      const asset = assets.find((a) => a.name === assetName);
      if (!asset) {
        if (assetName === 'styles.css') continue; // optional
        pluginFailed = true;
        failed.push({ id, reason: `missing required asset: ${assetName}` });
        break;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const resp = await fetch(asset.browser_download_url, {
          signal: controller.signal,
          headers: authHeaders,
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
          if (assetName === 'styles.css') continue; // optional 404
          throw new Error(`HTTP ${resp.status}`);
        }
        const buf = await resp.arrayBuffer();
        await writeFile(join(pluginDir, assetName), Buffer.from(buf));
      } catch (err) {
        if (assetName === 'styles.css') continue; // optional
        pluginFailed = true;
        failed.push({
          id,
          reason: `download failed (${assetName}): ${err instanceof Error ? err.message : String(err)}`,
        });
        break;
      }
    }

    if (pluginFailed) {
      // Clean up partial install
      try {
        const { rm } = await import('node:fs/promises');
        await rm(pluginDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    } else {
      installed.push(id);
    }
  }

  return { installed, failed };
}

// ---------------------------------------------------------------------------
// Main runInit
// ---------------------------------------------------------------------------

export async function runInit(opts: InitOptions = {}): Promise<InitResult> {
  const vaultDir = opts.vaultDir ?? process.cwd();
  const isTTY = opts.isTTY ?? process.stdout.isTTY ?? false;
  const force = opts.force ?? false;
  const installedPluginsPath =
    opts.installedPluginsPath ?? join(homedir(), '.claude', 'plugins', 'installed_plugins.json');

  // Injectable dependencies (real implementations lazy-loaded)
  const vaultSyncFn =
    opts.vaultSyncFn ??
    (async (dir: string, syncOpts: { branch?: string; includeObsidian?: boolean }) => {
      const { vaultSyncCommand } = await import('./internal/vault-sync.js');
      await vaultSyncCommand(dir, syncOpts);
    });

  const registerHooksFn =
    opts.registerHooksFn ??
    (async (dir: string) => {
      const { runRegisterHooks } = await import('./internal/register-hooks.js');
      await runRegisterHooks({ vaultDir: dir, isTTY: false, silent: true });
    });

  const result: InitResult = {
    ok: false,
    exitCode: 0,
    foldersCreated: 0,
    pluginSkipped: false,
    pluginRegistrationSkipped: false,
    pluginsInstalled: 0,
    pluginsFailed: 0,
  };

  // Output helpers
  function writeLine(msg: string) {
    process.stdout.write(`${msg}\n`);
  }

  function step(msg: string) {
    process.stdout.write(`  ${pc.bold(pc.cyan('›'))}  ${msg}\n`);
  }

  const delay = (ms: number) =>
    isTTY ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();
  const randDelay = () => delay(Math.floor(Math.random() * 500) + 500);

  function warnStep(msg: string) {
    process.stdout.write(`  ${pc.bold(pc.yellow('›'))}  ${pc.yellow(msg)}\n`);
  }

  // ── Step 1: Detect existing vault.yml ─────────────────────────────────────

  const vaultYmlPath = join(vaultDir, 'vault.yml');
  const vaultYmlExists = await pathExists(vaultYmlPath);

  if (vaultYmlExists && !force) {
    if (!isTTY) {
      const msg = 'vault.yml exists. Re-run with --force to overwrite.';
      process.stdout.write(`${msg}\n`);
      result.message = msg;
      result.exitCode = 1;
      return result;
    }

    // TTY: prompt user
    if (isTTY) {
      await printBanner();
      process.stdout.write(
        `${pc.bold('OneBrain')} ${pc.dim(`v${binaryVersion}`)}  ${pc.dim('—')} ${pc.cyan(vaultDir)}\n\n`,
      );
      const overwrite = await confirm({
        message: 'vault.yml already exists. Overwrite?',
      });
      if (!overwrite || overwrite === Symbol.for('clack:cancel')) {
        outro('Aborted.');
        result.ok = true;
        result.exitCode = 0;
        return result;
      }
    }
  } else if (isTTY) {
    await printBanner();
    process.stdout.write(
      `${pc.bold('OneBrain')} ${pc.dim(`v${binaryVersion}`)}  ${pc.dim('—')} ${pc.cyan(vaultDir)}\n\n`,
    );
  }

  // Non-TTY header (TTY uses intro() above)
  if (!isTTY) {
    writeLine('OneBrain Init');
  }

  // ── Step 2: Create standard folders ───────────────────────────────────────

  const foldersCreated = await createFolders(vaultDir);
  result.foldersCreated = foldersCreated;

  if (isTTY) {
    step(
      `📁  Vault structure   ${foldersCreated} folder${foldersCreated !== 1 ? 's' : ''} created`,
    );
    await randDelay();
  } else {
    writeLine(`folders: ${foldersCreated} created`);
  }

  // ── Step 3: Write vault.yml ────────────────────────────────────────────────

  await writeVaultYml(vaultDir);
  const harness = await detectHarness(vaultDir);

  if (isTTY) {
    step(`⚙️   vault.yml   harness: ${harness} · checkpoint: ${15} msgs / ${30} min`);
    await randDelay();
  } else {
    writeLine(`vault.yml: written (harness=${harness})`);
  }

  // ── Step 4: Download plugin files ─────────────────────────────────────────

  const dlSpinner = isTTY ? createSpinner() : null;
  dlSpinner?.start('Downloading plugin files…');

  const {
    skipped: pluginSkipped,
    driftWarning,
    failed: pluginDownloadFailed,
  } = await downloadPluginFiles(vaultDir, vaultSyncFn);
  result.pluginSkipped = pluginSkipped;

  dlSpinner?.stop(pluginDownloadFailed ? 'Plugin download failed' : 'Plugin files ready');

  if (pluginDownloadFailed) {
    result.exitCode = 1;
    if (isTTY) {
      cancel('Could not download plugin files. Check your internet connection and try again.');
    } else {
      writeLine('error: vault-sync failed — run onebrain update to download plugin files');
    }
    return result;
  }
  if (driftWarning) {
    if (isTTY) {
      warnStep(driftWarning);
    } else {
      writeLine(driftWarning);
    }
  }

  // ── Step 4b: Install community plugins ────────────────────────────────────

  const installPluginsFn = opts.installPluginsFn ?? installObsidianPlugins;
  const githubToken = process.env['GITHUB_TOKEN'];
  const pluginResult = await installPluginsFn(vaultDir, {
    ...(githubToken ? { githubToken } : {}),
  });
  result.pluginsInstalled = pluginResult.installed.length;
  result.pluginsFailed = pluginResult.failed.length;

  if (isTTY && pluginResult.installed.length + pluginResult.failed.length > 0) {
    if (pluginResult.installed.length > 0) {
      step(
        `🔌  ${pluginResult.installed.length} plugin${pluginResult.installed.length !== 1 ? 's' : ''} installed`,
      );
      await randDelay();
    }
    for (const f of pluginResult.failed) {
      warnStep(`${f.id} · skipped — install manually in Obsidian Settings`);
    }
  } else if (!isTTY) {
    if (pluginResult.installed.length > 0)
      writeLine(`plugins: ${pluginResult.installed.join(', ')} installed`);
    if (pluginResult.failed.length > 0)
      writeLine(`plugins-skipped: ${pluginResult.failed.map((f) => f.id).join(', ')}`);
  }

  // ── Step 5: Register plugin ────────────────────────────────────────────────

  const { skipped: pluginRegistrationSkipped } = await registerPlugin(
    vaultDir,
    installedPluginsPath,
  );
  result.pluginRegistrationSkipped = pluginRegistrationSkipped;

  if (isTTY) {
    step(
      `📌  Plugin registered   installed_plugins.json: ${pluginRegistrationSkipped ? 'skipped (marketplace)' : '✓'}`,
    );
    await randDelay();
  } else {
    writeLine(`plugin: ${pluginRegistrationSkipped ? 'skipped (marketplace)' : 'registered'}`);
  }

  // ── Step 6: Register hooks ─────────────────────────────────────────────────

  let hooksOk = true;
  try {
    await registerHooksFn(vaultDir);
  } catch (err) {
    hooksOk = false;
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`init: register-hooks warning: ${msg}\n`);
  }

  const hooksLine = hooksOk ? 'ok' : 'warning — hooks not registered; run onebrain update';
  if (isTTY) {
    if (hooksOk) {
      step('🪝  Hooks registered   Stop · PostCompact');
    } else {
      warnStep('🪝  Hooks not registered — run onebrain update');
    }
    await randDelay();
  } else {
    writeLine(`hooks: ${hooksLine}`);
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  result.ok = true;
  result.exitCode = 0;

  if (isTTY) {
    process.stdout.write(`\n  ${pc.dim('─'.repeat(38))}\n`);
    process.stdout.write(`  ${pc.bold(pc.cyan('1'))}  Open Obsidian → open this folder as vault\n`);
    process.stdout.write(`  ${pc.bold(pc.cyan('2'))}  Run ${pc.cyan('claude')}\n`);
    process.stdout.write(
      `  ${pc.bold(pc.cyan('3'))}  Type ${pc.cyan('/onboarding')} to personalize\n`,
    );
    process.stdout.write(
      `\n  ${pc.bold(pc.cyan('›'))}  ${pc.bold('Ready')}  —  ${pc.cyan('/onboarding')}\n`,
    );
  } else {
    writeLine('done: run /onboarding in Claude to finish setup');
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point (called from index.ts)
// ---------------------------------------------------------------------------

export interface InitCommandOptions {
  vaultDir?: string;
  force?: boolean;
}

export async function initCommand(opts: InitCommandOptions = {}): Promise<void> {
  const result = await runInit(opts);
  if (!result.ok) {
    process.exit(result.exitCode || 1);
  }
}
