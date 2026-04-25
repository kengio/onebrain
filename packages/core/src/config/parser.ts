import { join } from 'node:path';
import { parse } from 'yaml';
import type {
	VaultCheckpoint,
	VaultConfig,
	VaultFolders,
	VaultRecap,
	VaultRuntime,
	VaultSandbox,
	VaultStats,
} from '../types/config.js';

const DEFAULT_FOLDERS: VaultFolders = {
	inbox: '00-inbox',
	projects: '01-projects',
	areas: '02-areas',
	knowledge: '03-knowledge',
	resources: '04-resources',
	agent: '05-agent',
	archive: '06-archive',
	logs: '07-logs',
};

const DEFAULT_CHECKPOINT: VaultCheckpoint = {
	messages: 15,
	minutes: 30,
};

/**
 * Load and parse vault.yml from vaultRoot, merging defaults for missing fields.
 *
 * Throws a clear human-readable error when vault.yml does not exist.
 */
export async function loadVaultConfig(vaultRoot: string): Promise<VaultConfig> {
	const vaultYmlPath = join(vaultRoot, 'vault.yml');
	const file = Bun.file(vaultYmlPath);

	const exists = await file.exists();
	if (!exists) {
		throw new Error(
			`vault.yml not found at ${vaultYmlPath}. Run onebrain init to set up this vault.`,
		);
	}

	const text = await file.text();
	// parse() returns unknown — we cast after merging
	const parsed = parse(text) ?? {};
	if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
		throw new Error(
			`vault.yml must be a YAML mapping. Got: ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
		);
	}
	const raw = parsed as Record<string, unknown>;

	const rawFolders = (raw.folders ?? {}) as Partial<Record<string, string>>;
	const folders: VaultFolders = {
		...DEFAULT_FOLDERS,
		// Only override keys that are actually present in raw yaml
		...(rawFolders.inbox !== undefined ? { inbox: rawFolders.inbox } : {}),
		...(rawFolders.projects !== undefined ? { projects: rawFolders.projects } : {}),
		...(rawFolders.areas !== undefined ? { areas: rawFolders.areas } : {}),
		...(rawFolders.knowledge !== undefined ? { knowledge: rawFolders.knowledge } : {}),
		...(rawFolders.resources !== undefined ? { resources: rawFolders.resources } : {}),
		...(rawFolders.agent !== undefined ? { agent: rawFolders.agent } : {}),
		...(rawFolders.archive !== undefined ? { archive: rawFolders.archive } : {}),
		...(rawFolders.logs !== undefined ? { logs: rawFolders.logs } : {}),
		...(rawFolders.import_inbox !== undefined ? { import_inbox: rawFolders.import_inbox } : {}),
		...(rawFolders.attachments !== undefined ? { attachments: rawFolders.attachments } : {}),
	};

	const rawCheckpoint = (raw.checkpoint ?? {}) as Partial<Record<string, number>>;
	const checkpoint: VaultCheckpoint = {
		messages: rawCheckpoint.messages ?? DEFAULT_CHECKPOINT.messages,
		minutes: rawCheckpoint.minutes ?? DEFAULT_CHECKPOINT.minutes,
	};

	const config: VaultConfig = {
		folders,
		checkpoint,
		update_channel: (raw.update_channel as 'stable' | 'next' | undefined) ?? 'stable',
	};

	if (raw.qmd_collection !== undefined) {
		config.qmd_collection = raw.qmd_collection as string;
	}

	if (raw.onebrain_version !== undefined) {
		config.onebrain_version = raw.onebrain_version as string;
	}

	if (raw.runtime !== undefined) {
		config.runtime = raw.runtime as VaultRuntime;
	}

	if (raw.sandbox !== undefined) {
		config.sandbox = raw.sandbox as VaultSandbox;
	}

	if (raw.stats !== undefined) {
		config.stats = raw.stats as VaultStats;
	}

	if (raw.recap !== undefined) {
		config.recap = raw.recap as VaultRecap;
	}

	return config;
}
