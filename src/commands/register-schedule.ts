import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pc from 'picocolors';
import { parse as parseYaml } from 'yaml';
import { validateAt, validateCron } from '../lib/scheduler/cron-parse.js';
import { isCommandMode, isOneShot, isSkillMode, validateEntry } from '../lib/scheduler/entry.js';
import { generatePlist, labelForEntry, plistPath } from '../lib/scheduler/launchd.js';
import type { ScheduleConfig, ScheduleEntry, SkillFrontmatter } from '../lib/scheduler/types.js';

export interface RegisterScheduleOptions {
  vault: string;
  dryRun?: boolean;
  remove?: boolean;
  refresh?: boolean;
  resume?: string;
  status?: boolean;
  test?: string;
}

export async function registerSchedule(opts: RegisterScheduleOptions): Promise<void> {
  if (opts.remove) return await removeAll(opts.vault);
  if (opts.status) return await printStatus(opts.vault);
  if (opts.test) return await testRun(opts.vault, opts.test);
  if (opts.resume) return await resumeSkill(opts.vault, opts.resume);

  if (opts.refresh) {
    console.log(pc.dim('(--refresh: re-emitting plists with current vault path)'));
  }

  const config = await readVaultConfig(opts.vault);
  const entries = config.schedule ?? [];

  if (entries.length === 0) {
    console.log(pc.yellow('No schedule entries in vault.yml. Nothing to register.'));
    return;
  }

  // Validate each entry (exactly-one-of cron/at + skill/command, plus format checks)
  for (const entry of entries) {
    const ve = validateEntry(entry);
    if (!ve.valid) throw new Error(`Invalid schedule entry: ${ve.reason}`);

    if (isOneShot(entry)) {
      const va = validateAt(entry.at);
      if (!va.valid) throw new Error(`Invalid at "${entry.at}": ${va.reason}`);
      sanitizeArgsForOneShot(entry);
    } else if (entry.cron !== undefined) {
      const vc = validateCron(entry.cron);
      if (!vc.valid) throw new Error(`Invalid cron "${entry.cron}": ${vc.reason}`);
    }

    if (isSkillMode(entry)) {
      await validateSchedulable(opts.vault, entry);
    }
    // Command mode: no schedulable-frontmatter validation (hook-style trust model)
  }

  // TODO: resolve the real `onebrain` binary path for production use.
  // In production the CLI is invoked as `onebrain`, so the installed path should
  // be resolvable (e.g. via `which onebrain` or a known install prefix). For now
  // process.argv[1] gives the script path being executed, which works in dev and
  // in the Bun bundle where argv[1] is the compiled binary path. process.execPath
  // points to the Bun runtime itself, which is wrong for launchd invocations.
  const skillCliPath = process.argv[1] ?? 'onebrain';

  const ctx = {
    vaultPath: opts.vault,
    skillCliPath,
    // TODO: read folders.logs from vault.yml instead of hardcoding '07-logs'
    // — for vaults using a non-default logs folder. Tracked for follow-up.
    logBasePath: join(opts.vault, '07-logs/scheduler'),
    // process.getuid is undefined on Windows; fall back to 501 (default macOS UID).
    // TODO: surface an error if running on a non-POSIX platform where getuid is absent.
    uid: process.getuid?.() ?? 501,
    homedir: homedir(),
  };

  // Collision detection: two entries normalizing to the same plist path conflict
  const seen = new Map<string, ScheduleEntry>();
  for (const entry of entries) {
    const target = plistPath(labelForEntry(entry), ctx.homedir);
    if (seen.has(target)) {
      const existing = seen.get(target);
      if (existing) {
        const existingLabel = isCommandMode(existing)
          ? `command:${existing.command}`
          : `skill:${existing.skill}`;
        const newLabel = isCommandMode(entry) ? `command:${entry.command}` : `skill:${entry.skill}`;
        throw new Error(
          `Conflict: ${newLabel} and ${existingLabel} normalize to the same plist path ${target}`,
        );
      }
    }
    seen.set(target, entry);
  }

  for (const entry of entries) {
    const plistContent = generatePlist(entry, ctx);
    const targetPath = plistPath(labelForEntry(entry), ctx.homedir);

    if (opts.dryRun) {
      console.log(pc.cyan(`---  ${targetPath}  ---`));
      console.log(plistContent);
      continue;
    }

    await writeFile(targetPath, plistContent, 'utf8');
    console.log(pc.green(`✓ Wrote ${targetPath}`));
  }

  console.log(pc.green(`\nRegistered ${entries.length} schedule entries.`));
  console.log(pc.dim('Use launchctl to load (or restart launchd):'));
  for (const entry of entries) {
    const target = plistPath(labelForEntry(entry), ctx.homedir);
    console.log(pc.dim(`  launchctl load ${target}`));
  }
}

async function readVaultConfig(vault: string): Promise<ScheduleConfig> {
  const yamlPath = join(vault, 'vault.yml');
  if (!existsSync(yamlPath)) return {};
  const raw = await readFile(yamlPath, 'utf8');
  return (parseYaml(raw) ?? {}) as ScheduleConfig;
}

function sanitizeArgsForOneShot(entry: ScheduleEntry): void {
  const values: string[] = isCommandMode(entry)
    ? ((entry.args as string[] | undefined) ?? [])
    : Object.values((entry.args as Record<string, string> | undefined) ?? {});
  for (const v of values) {
    if (/["$`\\]/.test(v)) {
      throw new Error(`Arg value must not contain shell-special chars (", $, \`, \\): ${v}`);
    }
  }
}

async function validateSchedulable(vault: string, entry: ScheduleEntry): Promise<void> {
  if (!entry.skill) {
    throw new Error('validateSchedulable invoked on non-skill entry — caller bug');
  }
  const skillName = entry.skill.replace(/^\//, '');
  const skillPath = join(vault, '.claude/plugins/onebrain/skills', skillName, 'SKILL.md');
  if (!existsSync(skillPath)) {
    throw new Error(`Skill ${entry.skill} not found at ${skillPath}`);
  }
  const raw = await readFile(skillPath, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error(`Skill ${entry.skill} has no YAML frontmatter`);
  }
  // biome-ignore lint/style/noNonNullAssertion: regex has a capture group; match[1] is present when match is non-null
  const fm = parseYaml(match[1]!) as SkillFrontmatter;

  if (fm.schedulable === false) {
    throw new Error(`Skill ${entry.skill} requires user input — cannot schedule`);
  }
  if (fm.schedulable_with_args) {
    const required = fm.required_args ?? [];
    const provided = Object.keys((entry.args as Record<string, string> | undefined) ?? {});
    const missing = required.filter((r) => !provided.includes(r));
    if (missing.length > 0) {
      throw new Error(`Skill ${entry.skill} requires args: [${missing.join(', ')}]`);
    }
  } else if (!fm.schedulable) {
    throw new Error(`Skill ${entry.skill} does not declare schedulable: true in frontmatter`);
  }

  // Reject shell-special chars in args values for skill mode: the one-shot shell wrapper
  // interpolates arg values into a sh -c "..." string, and recurring mode's plist generator
  // also embeds arg values. Reject early here to provide a clear error message.
  if (entry.args) {
    for (const [k, v] of Object.entries(entry.args as Record<string, string>)) {
      if (/["$`\\]/.test(v)) {
        throw new Error(
          `Arg "${k}" value must not contain shell-special chars (", $, \`, \\): ${v}`,
        );
      }
    }
  }
}

async function removeAll(vault: string): Promise<void> {
  const config = await readVaultConfig(vault);
  const entries = config.schedule ?? [];
  for (const entry of entries) {
    const target = plistPath(labelForEntry(entry), homedir());
    if (existsSync(target)) {
      await unlink(target);
      console.log(pc.green(`✓ Removed ${target}`));
    }
  }
}

async function printStatus(vault: string): Promise<void> {
  const config = await readVaultConfig(vault);
  const entries = config.schedule ?? [];
  console.log(pc.cyan(`Registered schedules: ${entries.length}`));
  for (const entry of entries) {
    const target = plistPath(labelForEntry(entry), homedir());
    const installed = existsSync(target) ? '✓' : '✗';
    const when = entry.at ?? entry.cron ?? '?';
    const tag = entry.at ? pc.magenta('[once]') : pc.dim('[cron]');

    let targetLabel: string;
    if (isCommandMode(entry)) {
      const argv = (entry.args as string[] | undefined) ?? [];
      const argStr = argv.length ? ` ${argv.join(' ')}` : '';
      targetLabel = `${pc.yellow('cmd:')} ${entry.command}${argStr}`;
    } else {
      const argsMap = (entry.args as Record<string, string> | undefined) ?? {};
      const argStr = Object.keys(argsMap).length
        ? ` (${Object.entries(argsMap)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')})`
        : '';
      targetLabel = `${pc.green('skill:')} ${entry.skill}${argStr}`;
    }
    console.log(`  ${installed} ${tag} ${when}  ${targetLabel}`);
  }
}

async function testRun(vault: string, skill: string): Promise<void> {
  console.log(pc.cyan(`Testing scheduled invocation of ${skill}...`));
  // The CLI binary is `claude` (not `claude-code`; that name is incorrect).
  console.log(pc.dim('(Spawns headless Claude Code. Output streams here.)'));
  const { spawn } = await import('node:child_process');
  const child = spawn('claude', ['--vault', vault, '--skill', skill, '--headless'], {
    stdio: 'inherit',
  });
  await new Promise((resolve) => child.on('exit', resolve));
}

async function resumeSkill(vault: string, skill: string): Promise<void> {
  // TODO: read folders.logs from vault.yml instead of hardcoding '07-logs'
  // — for vaults using a non-default logs folder. Tracked for follow-up.
  const marker = join(vault, '07-logs/scheduler/.paused', `${skill.replace(/^\//, '')}.txt`);
  if (existsSync(marker)) {
    await unlink(marker);
    console.log(pc.green(`✓ Resumed ${skill}`));
  } else {
    console.log(pc.yellow(`${skill} is not paused.`));
  }
}
