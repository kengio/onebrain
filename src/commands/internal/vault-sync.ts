/**
 * vault-sync — internal command
 *
 * Replaces vault-sync.sh + pin-to-vault.sh + clean-plugin-cache.sh.
 *
 * Steps (in order):
 *   1. Download tarball from GitHub
 *   2. Sync plugin files  (critical — exit 1 on failure)
 *   3. Copy root docs     (non-fatal — docs are optional, skip silently on error)
 *   4. Merge harness files (critical — exit 1 on failure)
 *   5. Write version to vault.yml (critical)
 *   6. Pin to vault       (non-fatal — log stderr, continue)
 *   7. Clean plugin cache (non-fatal — log stderr, continue)
 *
 * Exit code: 0 on success, 1 if any critical step fails.
 * TTY:     uses @clack/prompts spinners
 * Non-TTY: plain text prefixed with "vault-sync:"
 */

import { mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, sep as pathSep, relative, resolve as resolvePath } from 'node:path';
import { intro, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { atomicWrite, mkdirIdempotent } from '../../lib/index.js';
import { makeStepFn } from './cli-ui.js';
import { detectHarness } from './harness.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VaultSyncOptions {
  /** Overrides vault.yml update_channel branch resolution (for tests). */
  branch?: string;
  /** Mock fetch for tests — defaults to globalThis.fetch. */
  fetchFn?: typeof fetch;
  /** Override path to installed_plugins.json (for tests). */
  installedPluginsPath?: string;
  /** Override path to the plugins cache dir (for tests). */
  installedPluginsCacheDir?: string;
  /** Override TTY detection for tests — defaults to process.stdout.isTTY. */
  isTTY?: boolean;
  /** Injectable unlink for tests — defaults to node:fs/promises unlink. */
  unlinkFn?: typeof unlink;
  /** When true, also extract .obsidian/ from the tarball (init only). */
  includeObsidian?: boolean;
  /** When true, suppress clack intro/outro and use cli-ui bar format (called as sub-operation from init). */
  embedded?: boolean;
  /** Injectable now (for tests — defaults to () => new Date()). */
  now?: () => Date;
}

export interface VaultSyncResult {
  ok: boolean;
  version: string;
  branch: string;
  filesAdded: number;
  filesRemoved: number;
  importsAdded: number;
  pinSkipped: boolean;
  cacheRemoved: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Path normalization
// ---------------------------------------------------------------------------

// Strict `===` between paths is fragile: trailing-slash drift, mixed
// relative/absolute, repeated separators. `path.resolve` collapses those
// without I/O. We deliberately do NOT realpath — that would touch fs per
// entry on every sync.
function normalizePath(p: string): string {
  const resolved = resolvePath(p);
  return resolved.endsWith(pathSep) && resolved.length > pathSep.length
    ? resolved.slice(0, -pathSep.length)
    : resolved;
}

// ---------------------------------------------------------------------------
// Branch resolution
// ---------------------------------------------------------------------------

function resolveBranch(updateChannel: string | undefined): string {
  // update_channel === 'stable' → use 'main'; anything else → 'next'
  return updateChannel === 'stable' ? 'main' : 'next';
}

// ---------------------------------------------------------------------------
// Step 1: Download tarball
// ---------------------------------------------------------------------------

async function downloadTarball(
  branch: string,
  fetchFn: typeof fetch,
): Promise<{ tarball: ArrayBuffer; tmpDir: string }> {
  const url = `https://api.github.com/repos/onebrain-ai/onebrain/tarball/${branch}`;
  const response = await fetchFn(url);
  if (!response.ok) {
    const hints: Partial<Record<number, string>> = {
      403: ' — check repo permissions or GITHUB_TOKEN',
      404: ' — repo or branch not found',
      429: ' — rate limited, wait and retry',
    };
    const hint = hints[response.status] ?? '';
    throw new Error(`HTTP ${response.status} downloading tarball from ${url}${hint}`);
  }
  const tarball = await response.arrayBuffer();
  const tmpDir = await mkdtemp(join(tmpdir(), 'onebrain-sync-'));
  return { tarball, tmpDir };
}

/**
 * Build the spawn-option overrides for the `tar` extraction subprocess.
 *
 * On Windows MSYS/Git Bash, GNU tar parses any path containing a colon as
 * `host:path` and tries to ssh to host `C` (or whichever drive letter), which
 * blows up `vault-sync` for any vault under a Windows drive root. Setting
 * `TAR_OPTIONS=--force-local` tells GNU tar to treat colons as part of the
 * local path. BSD tar on macOS ignores the env var entirely, so we only set
 * it on win32 to avoid surprises on platforms where the workaround is a no-op.
 *
 * Returns `{}` outside win32 (caller spreads → spawn inherits parent env), or
 * `{ env: { ... } }` on win32 with `TAR_OPTIONS=--force-local` overlaid on the
 * parent env. The shape lets callers use `Bun.spawn(args, { ...other, ...buildTarSpawnOverrides() })`
 * without needing a conditional spread. Exported for testing.
 */
export function buildTarSpawnOverrides(
  platform: NodeJS.Platform = process.platform,
  parentEnv: NodeJS.ProcessEnv = process.env,
): { env?: NodeJS.ProcessEnv } {
  if (platform !== 'win32') return {};
  return { env: { ...parentEnv, TAR_OPTIONS: '--force-local' } };
}

/**
 * Extract a .tar.gz buffer to destDir using the `tar` CLI. Returns the path of
 * the top-level extracted directory. See `buildTarSpawnOverrides` for the win32 quirk.
 */
async function extractTarball(tarball: ArrayBuffer, destDir: string): Promise<string> {
  const tarPath = join(destDir, 'bundle.tar.gz');
  await writeFile(tarPath, Buffer.from(tarball));

  // Spawn tar to extract — only override env on win32 (see buildTarSpawnOverrides).
  const tarOverrides = buildTarSpawnOverrides();
  const proc = Bun.spawn(['tar', '-xzf', tarPath, '-C', destDir], {
    stdout: 'pipe',
    stderr: 'pipe',
    ...tarOverrides,
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errText = await new Response(proc.stderr).text();
    // Surface the win32 env override in the error so a tar failure on Windows
    // is self-documenting in user-submitted logs (see #126).
    const envHint = tarOverrides.env ? ', TAR_OPTIONS=--force-local' : '';
    throw new Error(`tar extraction failed (exit ${exitCode}${envHint}): ${errText.trim()}`);
  }

  // Delete the tarball file now we've extracted
  await unlink(tarPath);

  // Find the top-level directory (should be onebrain-ai-onebrain-<sha>/)
  const entries = await readdir(destDir);
  const topLevel = entries.find((e) => e !== 'bundle.tar.gz');
  if (!topLevel) {
    throw new Error('Extracted tarball contains no top-level directory');
  }
  return join(destDir, topLevel);
}

// ---------------------------------------------------------------------------
// Step 2: Sync plugin files
// ---------------------------------------------------------------------------

/**
 * Recursively list all files under a directory (relative paths).
 */
async function listFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry);
      let s: Awaited<ReturnType<typeof stat>>;
      try {
        s = await stat(fullPath);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        queue.push(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }
  return results;
}

async function syncPluginFiles(
  extractedDir: string,
  vaultRoot: string,
  unlinkFn: typeof unlink = unlink,
): Promise<{ filesAdded: number; filesRemoved: number }> {
  const sourcePlugin = join(extractedDir, '.claude', 'plugins', 'onebrain');
  const destPlugin = join(vaultRoot, '.claude', 'plugins', 'onebrain');

  await mkdirIdempotent(destPlugin);

  // Collect source files (relative to sourcePlugin)
  const sourceFiles = await listFilesRecursive(sourcePlugin);
  const sourceRelSet = new Set(sourceFiles.map((f) => relative(sourcePlugin, f)));

  // Collect destination files
  const destFiles = await listFilesRecursive(destPlugin);
  const destRelSet = new Set(destFiles.map((f) => relative(destPlugin, f)));

  // Identify stale files (in dest, not in source)
  const staleRels: string[] = [];
  for (const rel of destRelSet) {
    if (!sourceRelSet.has(rel)) {
      staleRels.push(rel);
    }
  }

  // Copy all source files to dest
  let filesAdded = 0;
  for (const srcPath of sourceFiles) {
    const rel = relative(sourcePlugin, srcPath);
    const destPath = join(destPlugin, rel);
    await mkdirIdempotent(dirname(destPath));
    const content = await readFile(srcPath);
    await writeFile(destPath, content);
    filesAdded++;
  }

  // Remove stale files — track actual deletions only
  let filesRemoved = 0;
  for (const rel of staleRels) {
    const destPath = join(destPlugin, rel);
    try {
      await unlinkFn(destPath);
      filesRemoved++;
    } catch {
      // Non-fatal within this step — log nothing (best-effort cleanup)
    }
  }

  return { filesAdded, filesRemoved };
}

/**
 * Sync the project-level Gemini config tree at .gemini/ from the extracted
 * release into the vault. Mirror the same shape as syncPluginFiles: copy
 * everything from source, remove anything in dest that isn't in source.
 *
 * The user-owned .gemini/settings.json hooks-block is NOT special-cased here
 * — it is overwritten with the bundled version every sync, the same way
 * skills/agents/commands are. If users hand-edit settings.json they must
 * accept that /update will reset it. (Mirrors plugin-folder behavior.)
 */
async function syncGeminiConfig(
  extractedDir: string,
  vaultRoot: string,
  unlinkFn: typeof unlink = unlink,
): Promise<{ filesAdded: number; filesRemoved: number }> {
  const sourceGemini = join(extractedDir, '.gemini');
  const destGemini = join(vaultRoot, '.gemini');

  // Source absent → no-op (release artifact may pre-date .gemini/ shipping)
  try {
    await stat(sourceGemini);
  } catch {
    return { filesAdded: 0, filesRemoved: 0 };
  }

  await mkdirIdempotent(destGemini);

  const sourceFiles = await listFilesRecursive(sourceGemini);
  const sourceRelSet = new Set(sourceFiles.map((f) => relative(sourceGemini, f)));

  const destFiles = await listFilesRecursive(destGemini);
  const destRelSet = new Set(destFiles.map((f) => relative(destGemini, f)));

  const staleRels: string[] = [];
  for (const rel of destRelSet) {
    if (!sourceRelSet.has(rel)) staleRels.push(rel);
  }

  let filesAdded = 0;
  for (const srcPath of sourceFiles) {
    const rel = relative(sourceGemini, srcPath);
    const destPath = join(destGemini, rel);
    await mkdirIdempotent(dirname(destPath));
    const content = await readFile(srcPath);
    await writeFile(destPath, content);
    filesAdded++;
  }

  let filesRemoved = 0;
  for (const rel of staleRels) {
    const destPath = join(destGemini, rel);
    try {
      await unlinkFn(destPath);
      filesRemoved++;
    } catch {
      // best-effort
    }
  }

  return { filesAdded, filesRemoved };
}

// ---------------------------------------------------------------------------
// Step 3: Copy root docs
// ---------------------------------------------------------------------------

async function copyRootDocs(extractedDir: string, vaultRoot: string): Promise<void> {
  const docs = ['CONTRIBUTING.md', 'CHANGELOG.md', 'PLUGIN-CHANGELOG.md'];
  for (const doc of docs) {
    const srcPath = join(extractedDir, doc);
    const destPath = join(vaultRoot, doc);
    try {
      const content = await readFile(srcPath);
      await writeFile(destPath, content);
    } catch {
      // File may not exist in tarball — skip silently
    }
  }
}

// ---------------------------------------------------------------------------
// Step 4: Merge harness files
// ---------------------------------------------------------------------------

/**
 * Merge a single harness file.
 * Vault is primary. Only inject @import lines from repo that are not yet in vault.
 * Returns number of imports added.
 */
async function mergeHarnessFile(
  extractedDir: string,
  vaultRoot: string,
  filename: string,
): Promise<number> {
  const srcPath = join(extractedDir, filename);
  const destPath = join(vaultRoot, filename);

  let repoText: string;
  try {
    repoText = await readFile(srcPath, 'utf8');
  } catch {
    return 0; // Not in tarball — nothing to do
  }

  let vaultText: string;
  try {
    vaultText = await readFile(destPath, 'utf8');
  } catch {
    // Vault copy doesn't exist — write repo version directly
    await writeFile(destPath, repoText, 'utf8');
    return repoText.split('\n').filter((l) => l.startsWith('@')).length;
  }

  // Find @import lines in repo not already in vault
  const vaultAtSet = new Set(
    vaultText
      .split('\n')
      .filter((l) => l.startsWith('@'))
      .map((l) => l.trim()),
  );

  const newImports = repoText
    .split('\n')
    .filter((l) => l.startsWith('@') && !vaultAtSet.has(l.trim()))
    .map((l) => l.trimEnd());

  if (newImports.length === 0) {
    return 0;
  }

  // Insert before the last @-line in vault (keeps structural ordering)
  const vaultLines = vaultText.split('\n');
  const lastAtIdx = vaultLines.reduce((acc, l, i) => (l.startsWith('@') ? i : acc), -1);

  if (lastAtIdx >= 0) {
    vaultLines.splice(lastAtIdx, 0, ...newImports);
  } else {
    vaultLines.push('', ...newImports);
  }

  const merged = vaultLines.join('\n');
  await writeFile(destPath, merged, 'utf8');
  return newImports.length;
}

async function mergeHarnessFiles(extractedDir: string, vaultRoot: string): Promise<number> {
  const harnessFiles = ['CLAUDE.md', 'GEMINI.md', 'AGENTS.md'];
  let totalImportsAdded = 0;
  const results = await Promise.all(
    harnessFiles.map((f) => mergeHarnessFile(extractedDir, vaultRoot, f)),
  );
  for (const n of results) {
    totalImportsAdded += n;
  }
  return totalImportsAdded;
}

// ---------------------------------------------------------------------------
// Step 5: Write version to vault.yml
// ---------------------------------------------------------------------------

async function updateVaultYml(vaultRoot: string, updateChannel: string): Promise<void> {
  const vaultYmlPath = join(vaultRoot, 'vault.yml');
  let text: string;
  try {
    text = await readFile(vaultYmlPath, 'utf8');
  } catch {
    // vault.yml missing — create minimal one
    text = '';
  }

  const raw = (parseYaml(text) ?? {}) as Record<string, unknown>;
  raw['update_channel'] = updateChannel;

  await atomicWrite(vaultYmlPath, stringifyYaml(raw, { lineWidth: 0 }), 'vault.yml');
}

// ---------------------------------------------------------------------------
// Step 6: Pin to vault
// ---------------------------------------------------------------------------

/**
 * Read plugin.json `version` and `lastUpdated` from the synced plugin dir.
 * `lastUpdated` is optional in plugin.json — callers fall back to `new Date().toISOString()`.
 */
async function readPluginMetadata(
  vaultRoot: string,
): Promise<{ version: string; lastUpdated: string | undefined }> {
  // plugin.json lives in .claude/plugins/onebrain/.claude-plugin/plugin.json
  const pluginJsonPath = join(
    vaultRoot,
    '.claude',
    'plugins',
    'onebrain',
    '.claude-plugin',
    'plugin.json',
  );
  try {
    const text = await readFile(pluginJsonPath, 'utf8');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const version = typeof parsed['version'] === 'string' ? parsed['version'] : 'unknown';
    const lastUpdated =
      typeof parsed['lastUpdated'] === 'string' ? parsed['lastUpdated'] : undefined;
    return { version, lastUpdated };
  } catch {
    return { version: 'unknown', lastUpdated: undefined };
  }
}

interface PinResult {
  skipped: boolean;
}

async function pinToVault(
  vaultRoot: string,
  installedPluginsPath: string,
  installedPluginsCacheDir: string | undefined,
  now: () => Date = () => new Date(),
): Promise<PinResult> {
  // Read installed_plugins.json
  let text: string;
  try {
    text = await readFile(installedPluginsPath, 'utf8');
  } catch {
    return { skipped: true }; // File not found — no-op
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`installed_plugins.json is not valid JSON: ${installedPluginsPath}`);
  }

  const plugins = data['plugins'] as Record<string, unknown[]> | undefined;
  if (!plugins) {
    return { skipped: true };
  }

  // Find all onebrain@ entries
  const onebrainKeys = Object.keys(plugins).filter((k) => k.startsWith('onebrain@'));
  if (onebrainKeys.length === 0) {
    return { skipped: true };
  }

  const vaultPluginDir = join(vaultRoot, '.claude', 'plugins', 'onebrain');
  const normalizedVaultRoot = normalizePath(vaultRoot);
  const normalizedVaultPluginDir = normalizePath(vaultPluginDir);
  const { version: pluginVersion, lastUpdated: pluginLastUpdated } =
    await readPluginMetadata(vaultRoot);
  const updatedAt = pluginLastUpdated ?? now().toISOString();

  // Determine cache dir: installed_plugins.json parent → plugins/ → cache/
  const cacheDir = installedPluginsCacheDir ?? join(dirname(installedPluginsPath), 'cache');
  const normalizedCacheDir = normalizePath(cacheDir);

  // If ANY onebrain entry has source: marketplace, Claude Code owns it — skip entirely.
  const hasMarketplace = onebrainKeys.some((k) => {
    const entries = plugins[k] as Array<Record<string, unknown>>;
    return entries.some((e) => e['source'] === 'marketplace');
  });
  if (hasMarketplace) {
    return { skipped: true };
  }

  let changed = false;

  // Dedup orphan `onebrain@onebrain` entries whose `projectPath` no longer exists.
  // Only ENOENT counts as orphan — any other stat error (EACCES on an unmounted
  // external drive, EIO, etc.) preserves the entry so we don't silently delete
  // user data. Limited to `onebrain@onebrain` plugin key (per-vault project pins).
  const ONEBRAIN_KEY = 'onebrain@onebrain';
  if (Array.isArray(plugins[ONEBRAIN_KEY])) {
    const before = plugins[ONEBRAIN_KEY] as Array<Record<string, unknown>>;
    const keep: Array<Record<string, unknown>> = [];
    for (const entry of before) {
      const projectPath = entry['projectPath'];
      if (typeof projectPath !== 'string') {
        keep.push(entry);
        continue;
      }
      try {
        await stat(projectPath);
        keep.push(entry);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT') continue; // genuine orphan — drop
        // Any other code (EACCES, EIO, ENOTDIR, …): preserve + warn.
        process.stderr.write(
          `vault-sync: pin warning: stat ${projectPath}: ${code ?? 'unknown'}\n`,
        );
        keep.push(entry);
      }
    }
    if (keep.length !== before.length) {
      plugins[ONEBRAIN_KEY] = keep;
      changed = true;
    }
  }

  for (const key of onebrainKeys) {
    const entries = plugins[key] as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const installPathRaw = entry['installPath'];
      const projectPathRaw = entry['projectPath'];

      // Surface malformed entries: a non-string path field is broken data,
      // not a "different vault" signal. Silent skip → same class of bug
      // as #147. Continue (don't throw — registry is user data).
      const installPathBad = installPathRaw !== undefined && typeof installPathRaw !== 'string';
      const projectPathBad = projectPathRaw !== undefined && typeof projectPathRaw !== 'string';
      if (installPathBad || projectPathBad) {
        process.stderr.write(
          `vault-sync: pin warning: malformed entry — non-string installPath/projectPath in installed_plugins.json[${key}]\n`,
        );
        continue;
      }

      const installPath = typeof installPathRaw === 'string' ? installPathRaw : undefined;
      const projectPath = typeof projectPathRaw === 'string' ? projectPathRaw : undefined;
      const normalizedInstallPath =
        installPath !== undefined ? normalizePath(installPath) : undefined;
      const normalizedProjectPath =
        projectPath !== undefined ? normalizePath(projectPath) : undefined;

      // Scope refresh to the vault being synced. An entry belongs to this
      // vault if any of:
      //   1. installPath === this vault's plugin dir (canonical, post-pin)
      //   2. installPath is under the plugins cache dir (will be rewritten)
      //   3. projectPath === this vault root (installPath may be stale —
      //      e.g. old install location that no longer exists; #147)
      // Other vaults pinned to different paths are left alone — syncing
      // vault A must not stomp vault B's pinned version.
      const inCache =
        normalizedInstallPath !== undefined &&
        (normalizedInstallPath === normalizedCacheDir ||
          normalizedInstallPath.startsWith(`${normalizedCacheDir}${pathSep}`));
      const isThisVault = normalizedInstallPath === normalizedVaultPluginDir;
      const isThisProject = normalizedProjectPath === normalizedVaultRoot;

      if (!isThisVault && !inCache && !isThisProject) {
        continue;
      }

      // Canonicalize installPath when it's stale (cache dir, or projectPath
      // matched but installPath drifted from vaultPluginDir).
      if (normalizedInstallPath !== normalizedVaultPluginDir) {
        entry['installPath'] = vaultPluginDir;
        changed = true;
      }

      // Refresh version on this vault's entry; only bump lastUpdated when
      // version actually changes so back-to-back syncs of the same version
      // produce a byte-identical installed_plugins.json.
      if (entry['version'] !== pluginVersion) {
        entry['version'] = pluginVersion;
        entry['lastUpdated'] = updatedAt;
        changed = true;
      }
    }
  }

  if (!changed) {
    return { skipped: false }; // Already pinned — no change needed
  }

  await atomicWrite(installedPluginsPath, JSON.stringify(data, null, 4), 'installed_plugins.json');

  return { skipped: false };
}

// ---------------------------------------------------------------------------
// Step 7: Clean plugin cache
// ---------------------------------------------------------------------------

async function cleanPluginCache(
  installedPluginsPath: string,
  installedPluginsCacheDir: string | undefined,
): Promise<number> {
  const cacheDir = installedPluginsCacheDir ?? join(dirname(installedPluginsPath), 'cache');

  // Check cache dir exists
  try {
    await stat(cacheDir);
  } catch {
    return 0; // No cache dir — no-op
  }

  // Read installed_plugins.json to find onebrain marketplace entries
  const onebrainDirs: string[] = [];
  try {
    const text = await readFile(installedPluginsPath, 'utf8');
    const data = JSON.parse(text) as Record<string, unknown>;
    const plugins = data['plugins'] as Record<string, unknown[]> | undefined;
    if (plugins) {
      for (const key of Object.keys(plugins)) {
        if (!key.startsWith('onebrain@')) continue;
        const marketplace = key.split('@')[1] as string;
        const candidate = join(cacheDir, marketplace, 'onebrain');
        try {
          await stat(candidate);
          onebrainDirs.push(candidate);
        } catch {
          // Directory doesn't exist — skip
        }
      }
    }
  } catch {
    // JSON parse failure or file not found — fall back to glob
  }

  // Fallback: glob for any cache/*/onebrain/
  if (onebrainDirs.length === 0) {
    try {
      const marketplaceDirs = await readdir(cacheDir);
      for (const mp of marketplaceDirs) {
        const candidate = join(cacheDir, mp, 'onebrain');
        try {
          await stat(candidate);
          onebrainDirs.push(candidate);
        } catch {
          // Not found
        }
      }
    } catch {
      return 0;
    }
  }

  let removed = 0;
  for (const pluginDir of onebrainDirs) {
    let versionDirs: string[];
    try {
      versionDirs = await readdir(pluginDir);
    } catch {
      continue;
    }
    for (const versionDir of versionDirs) {
      const fullPath = join(pluginDir, versionDir);
      try {
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          await rm(fullPath, { recursive: true, force: true });
          removed++;
        }
      } catch {
        // Skip
      }
    }
  }

  return removed;
}

// ---------------------------------------------------------------------------
// Main runVaultSync function
// ---------------------------------------------------------------------------

export async function runVaultSync(
  vaultRoot: string,
  opts: VaultSyncOptions = {},
): Promise<VaultSyncResult> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const isTTY = opts.isTTY ?? process.stdout.isTTY;
  const unlinkFn = opts.unlinkFn ?? unlink;

  // Load vault.yml for config
  let updateChannel = 'stable';
  try {
    const vaultYmlText = await readFile(join(vaultRoot, 'vault.yml'), 'utf8');
    const vaultYml = (parseYaml(vaultYmlText) ?? {}) as Record<string, unknown>;
    if (typeof vaultYml['update_channel'] === 'string') {
      updateChannel = vaultYml['update_channel'];
    }
  } catch {
    // vault.yml not found — use defaults
  }
  const harness = await detectHarness(vaultRoot);

  const branch = opts.branch ?? resolveBranch(updateChannel);
  const installedPluginsPath =
    opts.installedPluginsPath ?? join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
  const installedPluginsCacheDir = opts.installedPluginsCacheDir;

  const result: VaultSyncResult = {
    ok: false,
    version: 'unknown',
    branch,
    filesAdded: 0,
    filesRemoved: 0,
    importsAdded: 0,
    pinSkipped: true,
    cacheRemoved: 0,
  };

  // TTY output helpers
  const embedded = opts.embedded ?? false;
  const createEmbeddedStep = embedded ? makeStepFn(true) : null;
  let s: ReturnType<typeof spinner> | null = null;
  let currentStep: ReturnType<ReturnType<typeof makeStepFn>> = null;

  function startSpinner(emoji: string, label: string) {
    if (isTTY) {
      if (embedded) {
        currentStep = createEmbeddedStep!(emoji, label);
      } else {
        s = spinner();
        s.start(label);
      }
    } else {
      process.stdout.write(`vault-sync: ${label}\n`);
    }
  }

  function stopSpinner(result: string, details?: string[]) {
    if (isTTY) {
      if (embedded) {
        currentStep?.stop(pc.dim(result), details);
        currentStep = null;
      } else if (s) {
        s.stop(result);
        s = null;
      }
    }
  }

  if (isTTY && !embedded) {
    intro('OneBrain Vault Sync');
  }

  let tmpDir: string | null = null;

  try {
    // ── Step 1: Download tarball ──────────────────────────────────────────
    startSpinner('📥', 'Downloading');
    let extractedDir: string;
    try {
      const dl = await downloadTarball(branch, fetchFn);
      tmpDir = dl.tmpDir;
      extractedDir = await extractTarball(dl.tarball, tmpDir);
    } catch (err) {
      stopSpinner('download failed');
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      process.stderr.write(`vault-sync: download failed: ${msg}\n`);
      return result;
    }

    // Read version from extracted plugin.json (before sync writes it to vault)
    try {
      const pjText = await readFile(
        join(extractedDir, '.claude', 'plugins', 'onebrain', '.claude-plugin', 'plugin.json'),
        'utf8',
      );
      const pj = JSON.parse(pjText) as Record<string, unknown>;
      if (typeof pj['version'] === 'string') {
        result.version = pj['version'];
      }
    } catch {
      // Keep 'unknown'
    }

    stopSpinner(`onebrain-ai/onebrain@${branch} (v${result.version})`);

    // ── Step 2: Sync plugin files + .gemini/ project config ──────────────
    startSpinner('📂', 'Syncing files');
    try {
      const pluginResult = await syncPluginFiles(extractedDir, vaultRoot, unlinkFn);
      const geminiResult = await syncGeminiConfig(extractedDir, vaultRoot, unlinkFn);
      result.filesAdded = pluginResult.filesAdded + geminiResult.filesAdded;
      result.filesRemoved = pluginResult.filesRemoved + geminiResult.filesRemoved;
    } catch (err) {
      stopSpinner('plugin sync failed');
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      process.stderr.write(`vault-sync: plugin sync failed: ${msg}\n`);
      return result;
    }
    stopSpinner(
      `${result.filesAdded} file${result.filesAdded !== 1 ? 's' : ''} synced, ${result.filesRemoved} removed`,
    );

    // ── Step 2b: Sync .obsidian/ (init only) ─────────────────────────────
    if (opts.includeObsidian) {
      const sourceObsidian = join(extractedDir, '.obsidian');
      const destObsidian = join(vaultRoot, '.obsidian');
      try {
        const obsidianFiles = await listFilesRecursive(sourceObsidian);
        for (const srcPath of obsidianFiles) {
          const rel = relative(sourceObsidian, srcPath);
          const destPath = join(destObsidian, rel);
          await mkdirIdempotent(dirname(destPath));
          const content = await readFile(srcPath);
          await writeFile(destPath, content);
        }
      } catch {
        // .obsidian not in tarball — skip silently
      }
    }

    // ── Step 3: Copy root docs (non-fatal) ───────────────────────────────
    await copyRootDocs(extractedDir, vaultRoot);

    // ── Step 4: Merge harness files ───────────────────────────────────────
    startSpinner('🔧', 'Updating harness');
    let importsAdded = 0;
    try {
      importsAdded = await mergeHarnessFiles(extractedDir, vaultRoot);
      result.importsAdded = importsAdded;
    } catch (err) {
      stopSpinner('harness merge failed');
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      process.stderr.write(`vault-sync: harness merge failed: ${msg}\n`);
      return result;
    }
    if (importsAdded > 0) {
      stopSpinner(`${importsAdded} import${importsAdded !== 1 ? 's' : ''} added`);
    } else {
      stopSpinner('harness files up-to-date');
    }

    // ── Step 5: Write version to vault.yml ───────────────────────────────
    try {
      await updateVaultYml(vaultRoot, updateChannel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      process.stderr.write(`vault-sync: vault.yml update failed: ${msg}\n`);
      return result;
    }

    // ── Steps 6–7: Non-fatal, claude harness only ─────────────────────────
    if (harness === 'claude') {
      // Step 6: Pin to vault
      startSpinner('📌', 'Pinning to vault');
      try {
        const pinResult = await pinToVault(
          vaultRoot,
          installedPluginsPath,
          installedPluginsCacheDir,
          opts.now,
        );
        result.pinSkipped = pinResult.skipped;
        if (pinResult.skipped) {
          stopSpinner('pin skipped (not found or marketplace)');
        } else {
          stopSpinner('installPath → .claude/plugins/onebrain');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`vault-sync: pin warning: ${msg}\n`);
        result.pinSkipped = true;
        stopSpinner('pin skipped (error — non-fatal)');
      }

      // Step 7: Clean plugin cache
      startSpinner('🧹', 'Cleaning cache');
      try {
        const cacheRemoved = await cleanPluginCache(installedPluginsPath, installedPluginsCacheDir);
        result.cacheRemoved = cacheRemoved;
        if (cacheRemoved > 0) {
          stopSpinner(`${cacheRemoved} cached version${cacheRemoved !== 1 ? 's' : ''} removed`);
        } else {
          stopSpinner('no cache to clean');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`vault-sync: cache clean warning: ${msg}\n`);
        stopSpinner('cache clean skipped (error — non-fatal)');
      }
    }

    result.ok = true;

    if (isTTY) {
      if (!embedded) {
        outro(`Done — v${result.version} synced`);
      }
    } else {
      process.stdout.write('vault-sync: done\n');
    }
  } finally {
    // Clean up temp dir
    if (tmpDir) {
      rm(tmpDir, { recursive: true, force: true }).catch(() => {
        // Non-fatal cleanup
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function vaultSyncCommand(
  vaultRoot: string,
  opts: VaultSyncOptions = {},
): Promise<void> {
  const result = await runVaultSync(vaultRoot, opts);
  if (!result.ok) {
    process.exit(1);
  }
}
