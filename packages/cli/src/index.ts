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
  .command('help-all')
  .description('Show all commands including internal ones')
  .action(() => {
    program.help();
  });

// ── Internal hidden commands (not shown in --help) ────────────────────────────

program
  .command('session-init')
  .description('Emit session token and datetime (called by Claude Code hook)')
  .hideHelp()
  .action(() => {
    console.log('session-init: not yet implemented');
  });

program
  .command('orphan-scan')
  .description('Scan for orphaned checkpoint files in logs folder')
  .argument('<logs_folder>', 'path to logs folder')
  .argument('<session_token>', 'current session token to exclude')
  .hideHelp()
  .action((_logsFolder: string, _sessionToken: string) => {
    console.log('orphan-scan: not yet implemented');
  });

program
  .command('checkpoint')
  .description('Write a checkpoint file for the current session')
  .hideHelp()
  .action(() => {
    console.log('checkpoint: not yet implemented');
  });

program
  .command('qmd-reindex')
  .description('Trigger qmd index rebuild')
  .hideHelp()
  .action(() => {
    console.log('qmd-reindex: not yet implemented');
  });

program
  .command('vault-sync')
  .description('Sync vault state to agent context')
  .hideHelp()
  .action(() => {
    console.log('vault-sync: not yet implemented');
  });

program
  .command('register-hooks')
  .description('Install Claude Code hooks into settings.json')
  .hideHelp()
  .action(() => {
    console.log('register-hooks: not yet implemented');
  });

program.parse(process.argv);
