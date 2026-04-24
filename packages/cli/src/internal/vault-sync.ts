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

import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rename,
	rm,
	stat,
	unlink,
	writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { intro, log, outro, spinner } from '@clack/prompts';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

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
	const url = `https://api.github.com/repos/kengio/onebrain/tarball/${branch}`;
	const response = await fetchFn(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} downloading tarball from ${url}`);
	}
	const tarball = await response.arrayBuffer();
	const tmpDir = await mkdtemp(join(tmpdir(), 'onebrain-sync-'));
	return { tarball, tmpDir };
}

/**
 * Extract a .tar.gz buffer to destDir using the `tar` CLI.
 * Returns the path of the top-level extracted directory.
 */
async function extractTarball(tarball: ArrayBuffer, destDir: string): Promise<string> {
	const tarPath = join(destDir, 'bundle.tar.gz');
	await writeFile(tarPath, Buffer.from(tarball));

	// Spawn tar to extract
	const proc = Bun.spawn(['tar', '-xzf', tarPath, '-C', destDir], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const errText = await new Response(proc.stderr).text();
		throw new Error(`tar extraction failed (exit ${exitCode}): ${errText.trim()}`);
	}

	// Delete the tarball file now we've extracted
	await unlink(tarPath);

	// Find the top-level directory (should be kengio-onebrain-<sha>/)
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
): Promise<{ filesAdded: number; filesRemoved: number }> {
	const sourcePlugin = join(extractedDir, '.claude', 'plugins', 'onebrain');
	const destPlugin = join(vaultRoot, '.claude', 'plugins', 'onebrain');

	await mkdir(destPlugin, { recursive: true });

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
		await mkdir(dirname(destPath), { recursive: true });
		const content = await readFile(srcPath);
		await writeFile(destPath, content);
		filesAdded++;
	}

	// Remove stale files
	for (const rel of staleRels) {
		const destPath = join(destPlugin, rel);
		try {
			await unlink(destPath);
		} catch {
			// Non-fatal within this step — log nothing (best-effort cleanup)
		}
	}

	return { filesAdded, filesRemoved: staleRels.length };
}

// ---------------------------------------------------------------------------
// Step 3: Copy root docs
// ---------------------------------------------------------------------------

async function copyRootDocs(extractedDir: string, vaultRoot: string): Promise<void> {
	const docs = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md'];
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

async function updateVaultYml(
	vaultRoot: string,
	version: string,
	updateChannel: string,
): Promise<void> {
	const vaultYmlPath = join(vaultRoot, 'vault.yml');
	let text: string;
	try {
		text = await readFile(vaultYmlPath, 'utf8');
	} catch {
		// vault.yml missing — create minimal one
		text = '';
	}

	const raw = (parseYaml(text) ?? {}) as Record<string, unknown>;
	raw.onebrain_version = version;
	raw.update_channel = updateChannel;

	const updated = stringifyYaml(raw, { lineWidth: 0 });
	await writeFile(vaultYmlPath, updated, 'utf8');
}

// ---------------------------------------------------------------------------
// Step 6: Pin to vault
// ---------------------------------------------------------------------------

/**
 * Read plugin.json version from the synced plugin dir.
 */
async function readPluginVersion(vaultRoot: string): Promise<string> {
	// plugin.json lives in .claude/plugins/onebrain/.claude-plugin/plugin.json
	const pluginJsonPath = join(vaultRoot, '.claude', 'plugins', 'onebrain', '.claude-plugin', 'plugin.json');
	try {
		const text = await readFile(pluginJsonPath, 'utf8');
		const parsed = JSON.parse(text) as Record<string, unknown>;
		return typeof parsed.version === 'string' ? parsed.version : 'unknown';
	} catch {
		return 'unknown';
	}
}

interface PinResult {
	skipped: boolean;
}

async function pinToVault(
	vaultRoot: string,
	installedPluginsPath: string,
	installedPluginsCacheDir: string | undefined,
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

	const plugins = data.plugins as Record<string, unknown[]> | undefined;
	if (!plugins) {
		return { skipped: true };
	}

	// Find all onebrain@ entries
	const onebrainKeys = Object.keys(plugins).filter((k) => k.startsWith('onebrain@'));
	if (onebrainKeys.length === 0) {
		return { skipped: true };
	}

	const vaultPluginDir = join(vaultRoot, '.claude', 'plugins', 'onebrain');
	const pluginVersion = await readPluginVersion(vaultRoot);

	// Determine cache dir: installed_plugins.json parent → plugins/ → cache/
	const cacheDir = installedPluginsCacheDir ?? join(dirname(installedPluginsPath), 'cache');

	// If ANY onebrain entry has source: marketplace, Claude Code owns it — skip entirely.
	const hasMarketplace = onebrainKeys.some((k) => {
		const entries = plugins[k] as Array<Record<string, unknown>>;
		return entries.some((e) => e.source === 'marketplace');
	});
	if (hasMarketplace) {
		return { skipped: true };
	}

	let changed = false;
	for (const key of onebrainKeys) {
		const entries = plugins[key] as Array<Record<string, unknown>>;
		for (const entry of entries) {
			const installPath = entry.installPath;
			if (typeof installPath !== 'string') {
				continue;
			}

			// Only rewrite if installPath is inside the cache dir
			let inCache = false;
			try {
				// resolves any symlinks before comparison (normalize)
				inCache = installPath.startsWith(`${cacheDir}/`) || installPath === cacheDir;
			} catch {
				inCache = false;
			}

			if (!inCache) {
				continue;
			}

			entry.installPath = vaultPluginDir;
			entry.version = pluginVersion;
			changed = true;
		}
	}

	if (!changed) {
		return { skipped: false }; // Already pinned — no change needed
	}

	// Atomic write via temp file + rename
	const tmpPath = `${installedPluginsPath}.tmp`;
	await writeFile(tmpPath, JSON.stringify(data, null, 4), 'utf8');
	// rename is atomic on POSIX
	await rename(tmpPath, installedPluginsPath);

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
		const plugins = data.plugins as Record<string, unknown[]> | undefined;
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
	const isTTY = process.stdout.isTTY;

	// Load vault.yml for config
	let updateChannel = 'stable';
	let harness = 'claude-code';
	try {
		const vaultYmlText = await readFile(join(vaultRoot, 'vault.yml'), 'utf8');
		const vaultYml = (parseYaml(vaultYmlText) ?? {}) as Record<string, unknown>;
		if (typeof vaultYml.update_channel === 'string') {
			updateChannel = vaultYml.update_channel;
		}
		const runtime = vaultYml.runtime as Record<string, unknown> | undefined;
		if (runtime && typeof runtime.harness === 'string') {
			harness = runtime.harness;
		}
	} catch {
		// vault.yml not found — use defaults
	}

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
	let s: ReturnType<typeof spinner> | null = null;

	function startSpinner(msg: string) {
		if (isTTY) {
			s = spinner();
			s.start(msg);
		} else {
			process.stdout.write(`vault-sync: ${msg}\n`);
		}
	}

	function stopSpinner(msg: string) {
		if (isTTY && s) {
			s.stop(msg);
			s = null;
		}
	}

	function note(msg: string) {
		if (isTTY) {
			log.info(msg);
		} else {
			process.stdout.write(`vault-sync: ${msg}\n`);
		}
	}

	if (isTTY) {
		intro('OneBrain Vault Sync');
	}

	let tmpDir: string | null = null;

	try {
		// ── Step 1: Download tarball ──────────────────────────────────────────
		startSpinner('Downloading tarball...');
		let extractedDir: string;
		try {
			const dl = await downloadTarball(branch, fetchFn);
			tmpDir = dl.tmpDir;
			extractedDir = await extractTarball(dl.tarball, tmpDir);
		} catch (err) {
			stopSpinner('Download failed');
			const msg = err instanceof Error ? err.message : String(err);
			result.error = msg;
			process.stderr.write(`vault-sync: download failed: ${msg}\n`);
			return result;
		}

		// Read version from extracted plugin.json (before sync writes it to vault)
		try {
			const pjText = await readFile(
				join(extractedDir, '.claude', 'plugins', 'onebrain', 'plugin.json'),
				'utf8',
			);
			const pj = JSON.parse(pjText) as Record<string, unknown>;
			if (typeof pj.version === 'string') {
				result.version = pj.version;
			}
		} catch {
			// Keep 'unknown'
		}

		stopSpinner(`kengio/onebrain@${branch} (v${result.version})`);

		// ── Step 2: Sync plugin files ─────────────────────────────────────────
		startSpinner('Syncing plugin files...');
		try {
			const { filesAdded, filesRemoved } = await syncPluginFiles(extractedDir, vaultRoot);
			result.filesAdded = filesAdded;
			result.filesRemoved = filesRemoved;
		} catch (err) {
			stopSpinner('Plugin sync failed');
			const msg = err instanceof Error ? err.message : String(err);
			result.error = msg;
			process.stderr.write(`vault-sync: plugin sync failed: ${msg}\n`);
			return result;
		}
		stopSpinner(
			`${result.filesAdded} file${result.filesAdded !== 1 ? 's' : ''} synced, ${result.filesRemoved} removed`,
		);

		// ── Step 3: Copy root docs (non-fatal) ───────────────────────────────
		await copyRootDocs(extractedDir, vaultRoot);

		// ── Step 4: Merge harness files ───────────────────────────────────────
		startSpinner('Updating harness files...');
		let importsAdded = 0;
		try {
			importsAdded = await mergeHarnessFiles(extractedDir, vaultRoot);
			result.importsAdded = importsAdded;
		} catch (err) {
			stopSpinner('Harness merge failed');
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
			await updateVaultYml(vaultRoot, result.version, updateChannel);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			result.error = msg;
			process.stderr.write(`vault-sync: vault.yml update failed: ${msg}\n`);
			return result;
		}

		// ── Steps 6–7: Non-fatal, claude-code harness only ────────────────────
		if (harness === 'claude-code') {
			// Step 6: Pin to vault
			startSpinner('Pinning to vault...');
			try {
				const pinResult = await pinToVault(
					vaultRoot,
					installedPluginsPath,
					installedPluginsCacheDir,
				);
				result.pinSkipped = pinResult.skipped;
				if (pinResult.skipped) {
					stopSpinner('pin skipped (not found or marketplace)');
					note('');
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
			startSpinner('Cleaning cache...');
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
			outro(`Done — v${result.version} synced`);
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
