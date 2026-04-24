#!/usr/bin/env bun
import { Command } from 'commander';
import { checkpointCommand } from './internal/checkpoint.js';
import { orphanScanCommand } from './internal/orphan-scan.js';
import { qmdReindexCommand } from './internal/qmd-reindex.js';
import { registerHooksCommand } from './internal/register-hooks.js';
import { resolveSessionToken, sessionInitCommand } from './internal/session-init.js';

const program = new Command();

program.name('onebrain').description('OneBrain CLI — personal AI OS for Obsidian').version('2.0.0');

// ── User-facing commands ──────────────────────────────────────────────────────

program
	.command('init')
	.description('Initialize a new OneBrain vault')
	.action(() => {
		console.log('init: not yet implemented');
	});

program
	.command('update')
	.description('Update OneBrain plugin files from GitHub')
	.action(() => {
		console.log('update: not yet implemented');
	});

program
	.command('doctor')
	.description('Run vault health checks and report issues')
	.action(() => {
		console.log('doctor: not yet implemented');
	});

program
	.command('help')
	.description('Show this help message')
	.action(() => {
		program.help();
	});

// ── Internal hidden commands (not shown in --help) ────────────────────────────

program
	.command('session-init', { hidden: true })
	.description('Emit session token and datetime (called by Claude Code hook)')
	.action(async () => {
		const vaultRoot = process.cwd();
		await sessionInitCommand(vaultRoot);
	});

program
	.command('orphan-scan', { hidden: true })
	.description('Scan for orphaned checkpoint files in logs folder')
	.argument('<logs_folder>', 'path to logs folder')
	.argument('<session_token>', 'current session token to exclude')
	.action(async (logsFolder: string, sessionToken: string) => {
		await orphanScanCommand(logsFolder, sessionToken);
	});

program
	.command('checkpoint', { hidden: true })
	.description('Handle checkpoint lifecycle (stop/precompact/postcompact/reset)')
	.argument('<mode>', 'stop | precompact | postcompact | reset')
	.action(async (mode: string) => {
		const token = await resolveSessionToken();
		await checkpointCommand(mode, token, process.cwd());
	});

program
	.command('qmd-reindex', { hidden: true })
	.description('Trigger qmd index rebuild')
	.action(async () => {
		const vaultRoot = process.cwd();
		await qmdReindexCommand(vaultRoot);
	});

program
	.command('vault-sync', { hidden: true })
	.description('Sync vault state to agent context')
	.action(() => {
		console.log('vault-sync: not yet implemented');
	});

program
	.command('register-hooks', { hidden: true })
	.description('Install Claude Code hooks into settings.json')
	.option('--vault-dir <path>', 'vault root directory (default: cwd)')
	.action(async (opts: { vaultDir?: string }) => {
		await registerHooksCommand(opts.vaultDir);
	});

program.parse(process.argv);
