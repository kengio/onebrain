#!/usr/bin/env bun
import { Command } from 'commander';

const program = new Command();

program
  .name('onebrain')
  .description('OneBrain CLI — personal AI OS for Obsidian')
  .version('2.0.0');

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
  .action(() => {
    console.log('session-init: not yet implemented');
  });

program
  .command('orphan-scan', { hidden: true })
  .description('Scan for orphaned checkpoint files in logs folder')
  .argument('<logs_folder>', 'path to logs folder')
  .argument('<session_token>', 'current session token to exclude')
  .action((_logsFolder: string, _sessionToken: string) => {
    console.log('orphan-scan: not yet implemented');
  });

program
  .command('checkpoint', { hidden: true })
  .description('Write a checkpoint file for the current session')
  .action(() => {
    console.log('checkpoint: not yet implemented');
  });

program
  .command('qmd-reindex', { hidden: true })
  .description('Trigger qmd index rebuild')
  .action(() => {
    console.log('qmd-reindex: not yet implemented');
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
  .action(() => {
    console.log('register-hooks: not yet implemented');
  });

program.parse(process.argv);
