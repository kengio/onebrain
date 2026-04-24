/**
 * init — Initialize a new OneBrain vault
 *
 * Steps:
 *   1. Detect existing vault.yml  (--force, non-TTY exit-1, TTY prompt)
 *   2. Create standard folders    (7 + inbox/imports)
 *   3. Write vault.yml            (with harness auto-detect)
 *   4. Download plugin files      (skip if .claude/plugins/onebrain/plugin.json exists)
 *   5. Register plugin            (skip if source:marketplace entry exists)
 *   6. Run register-hooks
 *
 * TTY:     uses @clack/prompts layout
 * Non-TTY: plain text lines
 *
 * Exit code: 0 on success, 1 on failure.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { confirm, intro, log, outro } from '@clack/prompts';
import { stringify as stringifyYaml } from 'yaml';

// ---------------------------------------------------------------------------
// BUILD_VERSION shim
// ---------------------------------------------------------------------------

declare const BUILD_VERSION: string;
const binaryVersion = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'dev';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InitOptions {
	/** Vault root directory (default: process.cwd()). */
	vaultDir?: string;
	/** Harness override. */
	harness?: 'claude-code' | 'gemini' | 'direct';
	/** Overwrite existing vault.yml without prompting. */
	force?: boolean;
	/** Whether stdout is a TTY (default: process.stdout.isTTY). */
	isTTY?: boolean;
	/** Override path to installed_plugins.json (for tests). */
	installedPluginsPath?: string;
	/** Injectable vault-sync function (for tests). */
	vaultSyncFn?: (vaultDir: string, opts: Record<string, unknown>) => Promise<void>;
	/** Injectable register-hooks function (for tests). */
	registerHooksFn?: (vaultDir: string) => Promise<void>;
}

export interface InitResult {
	ok: boolean;
	exitCode: number;
	/** Human-readable message (used for non-TTY output / test assertions). */
	message?: string;
	foldersCreated: number;
	harness: string;
	pluginSkipped: boolean;
	pluginRegistrationSkipped: boolean;
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

/**
 * Auto-detect harness from environment and vault layout.
 * Priority: CLAUDE_CODE_HARNESS env → .claude/ directory → 'direct'
 */
async function detectHarness(vaultDir: string): Promise<string> {
	const envHarness = process.env.CLAUDE_CODE_HARNESS;
	if (envHarness) return envHarness;

	if (await pathExists(join(vaultDir, '.claude'))) return 'claude-code';

	return 'direct';
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
	method: 'onebrain',
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
	runtime: {
		harness: 'claude-code',
	},
};

async function writeVaultYml(vaultDir: string, harness: string): Promise<void> {
	const config = {
		...VAULT_YML_DEFAULTS,
		runtime: { harness },
	};
	const content = stringifyYaml(config, { lineWidth: 0 });
	await writeFile(join(vaultDir, 'vault.yml'), content, 'utf8');
}

/**
 * Step 4: Download plugin files (skip if already present).
 * Returns { skipped, driftWarning }.
 */
async function downloadPluginFiles(
	vaultDir: string,
	vaultSyncFn: (vaultDir: string, opts: Record<string, unknown>) => Promise<void>,
): Promise<{ skipped: boolean; driftWarning?: string }> {
	const pluginJsonPath = join(vaultDir, '.claude', 'plugins', 'onebrain', 'plugin.json');

	if (await pathExists(pluginJsonPath)) {
		// Check version drift
		let pluginVersion: string | undefined;
		try {
			const text = await readFile(pluginJsonPath, 'utf8');
			const parsed = JSON.parse(text) as Record<string, unknown>;
			pluginVersion = typeof parsed.version === 'string' ? parsed.version : undefined;
		} catch {
			// Non-fatal
		}

		let driftWarning: string | undefined;
		if (pluginVersion && binaryVersion !== 'dev' && pluginVersion !== binaryVersion) {
			driftWarning = `Plugin files v${pluginVersion}, binary v${binaryVersion} — run onebrain update to sync.`;
		}

		return { skipped: true, driftWarning };
	}

	// Plugin files not present — run vault-sync (non-fatal)
	try {
		await vaultSyncFn(vaultDir, {});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		process.stderr.write(`init: vault-sync warning: ${msg}\n`);
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

	const plugins = (data.plugins ?? {}) as Record<string, unknown[]>;
	data.plugins = plugins;

	// Check if any onebrain@ key has a marketplace entry
	const hasMarketplace = Object.keys(plugins)
		.filter((k) => k.startsWith('onebrain@'))
		.some((k) => {
			const entries = plugins[k] as Array<Record<string, unknown>>;
			return entries.some((e) => e.source === 'marketplace');
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
			if (typeof parsed.version === 'string') {
				pluginVersion = parsed.version;
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
	const existingIdx = entries.findIndex((e) => e.source !== 'marketplace');

	if (existingIdx >= 0) {
		entries[existingIdx].installPath = installPath;
		entries[existingIdx].version = pluginVersion;
	} else {
		entries.push({ source: 'local', installPath, version: pluginVersion });
	}

	// Write atomically
	const tmpPath = `${installedPluginsPath}.tmp`;
	try {
		const { mkdir: mkdirSync } = await import('node:fs/promises');
		const { dirname } = await import('node:path');
		await mkdirSync(dirname(installedPluginsPath), { recursive: true });
		const { rename } = await import('node:fs/promises');
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
// Hook result type (from register-hooks)
// ---------------------------------------------------------------------------

type HookStatus = 'added' | 'migrated' | 'ok';

interface RegisterHooksResult {
	ok: boolean;
	hooks: Record<string, HookStatus>;
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
		(async (dir: string, syncOpts: Record<string, unknown>) => {
			const { vaultSyncCommand } = await import('../internal/vault-sync.js');
			await vaultSyncCommand(dir, syncOpts);
		});

	const registerHooksFn =
		opts.registerHooksFn ??
		(async (dir: string) => {
			const { runRegisterHooks } = await import('../internal/register-hooks.js');
			await runRegisterHooks({ vaultDir: dir });
		});

	const result: InitResult = {
		ok: false,
		exitCode: 0,
		foldersCreated: 0,
		harness: 'direct',
		pluginSkipped: false,
		pluginRegistrationSkipped: false,
	};

	// Output helpers
	function writeLine(msg: string) {
		process.stdout.write(`${msg}\n`);
	}

	function noteStep(step: string, detail: string) {
		if (isTTY) {
			log.step(`${step}\n│  ${detail}`);
		} else {
			writeLine(`${step}: ${detail}`);
		}
	}

	function noteInfo(msg: string) {
		if (isTTY) {
			log.info(msg);
		} else {
			writeLine(msg);
		}
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
			if (isTTY) intro('OneBrain Init');
			const overwrite = await confirm({
				message: 'vault.yml already exists. Overwrite?',
			});
			if (!overwrite || overwrite === Symbol.for('clack:cancel')) {
				result.ok = true;
				result.exitCode = 0;
				return result;
			}
		}
	} else if (isTTY && !vaultYmlExists) {
		intro('OneBrain Init');
		log.message('');
	} else if (isTTY && force) {
		intro('OneBrain Init');
		log.message('');
	}

	// ── Step 2: Create standard folders ───────────────────────────────────────

	const foldersCreated = await createFolders(vaultDir);
	result.foldersCreated = foldersCreated;
	noteStep(
		'Creating vault structure',
		`${foldersCreated} folder${foldersCreated !== 1 ? 's' : ''} created`,
	);

	// ── Step 3: Write vault.yml ────────────────────────────────────────────────

	const harness = opts.harness ?? (await detectHarness(vaultDir));
	result.harness = harness;
	await writeVaultYml(vaultDir, harness);
	noteStep('Writing vault.yml', `harness: ${harness}`);

	// ── Step 4: Download plugin files ─────────────────────────────────────────

	const { skipped: pluginSkipped, driftWarning } = await downloadPluginFiles(vaultDir, vaultSyncFn);
	result.pluginSkipped = pluginSkipped;

	if (driftWarning) {
		noteInfo(driftWarning);
	}

	// ── Step 5: Register plugin ────────────────────────────────────────────────

	const { skipped: pluginRegistrationSkipped } = await registerPlugin(
		vaultDir,
		installedPluginsPath,
	);
	result.pluginRegistrationSkipped = pluginRegistrationSkipped;
	noteStep(
		'Registering plugin',
		`installed_plugins.json: ${pluginRegistrationSkipped ? 'skipped (marketplace)' : '✓'}`,
	);

	// ── Step 6: Register hooks ─────────────────────────────────────────────────

	let hooksLine = 'ok';
	try {
		// We need hook status for the output line. For non-injectable path,
		// call runRegisterHooks directly; for injected, call it and get no detail.
		if (opts.registerHooksFn) {
			await registerHooksFn(vaultDir);
		} else {
			const { runRegisterHooks } = await import('../internal/register-hooks.js');
			const hooksResult: RegisterHooksResult = await runRegisterHooks({ vaultDir });
			if (hooksResult.ok && hooksResult.hooks) {
				const events = ['Stop', 'PreCompact', 'PostCompact', 'SessionStart'];
				hooksLine = events.map((e) => `${e}: ✓`).join('  ');
			}
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		process.stderr.write(`init: register-hooks warning: ${msg}\n`);
	}

	if (isTTY) {
		log.step(`Registering hooks\n│  ${hooksLine}`);
	} else {
		writeLine(`hooks: ${hooksLine}`);
	}

	// ── Done ──────────────────────────────────────────────────────────────────

	result.ok = true;
	result.exitCode = 0;

	const doneMsg = 'run /onboarding in Claude to finish setup';
	if (isTTY) {
		outro(`Done — ${doneMsg}`);
	} else {
		writeLine(`done: ${doneMsg}`);
	}

	return result;
}

// ---------------------------------------------------------------------------
// CLI entry point (called from index.ts)
// ---------------------------------------------------------------------------

export interface InitCommandOptions {
	vaultDir?: string;
	harness?: 'claude-code' | 'gemini' | 'direct';
	force?: boolean;
}

export async function initCommand(opts: InitCommandOptions = {}): Promise<void> {
	const result = await runInit(opts);
	if (!result.ok) {
		process.exit(result.exitCode || 1);
	}
}
