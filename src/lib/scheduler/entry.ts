import type { ScheduleEntry } from './types.js';

export function isOneShot(entry: ScheduleEntry): entry is ScheduleEntry & { at: string } {
  return entry.at !== undefined;
}

export function isSkillMode(entry: ScheduleEntry): entry is ScheduleEntry & { skill: string } {
  return entry.skill !== undefined;
}

export function isCommandMode(entry: ScheduleEntry): entry is ScheduleEntry & { command: string } {
  return entry.command !== undefined;
}

export function validateEntry(entry: ScheduleEntry): { valid: boolean; reason?: string } {
  const hasCron = entry.cron !== undefined;
  const hasAt = entry.at !== undefined;
  if (hasCron === hasAt) {
    return { valid: false, reason: 'entry must have exactly one of `cron` or `at`' };
  }

  const hasSkill = entry.skill !== undefined;
  const hasCommand = entry.command !== undefined;
  if (hasSkill === hasCommand) {
    return { valid: false, reason: 'entry must have exactly one of `skill` or `command`' };
  }

  if (hasSkill && !entry.skill) {
    return { valid: false, reason: 'entry.skill must not be empty' };
  }
  if (hasCommand && !entry.command) {
    return { valid: false, reason: 'entry.command must not be empty' };
  }

  if (entry.args !== undefined) {
    const isArray = Array.isArray(entry.args);
    if (hasSkill && isArray) {
      return {
        valid: false,
        reason: 'skill-mode entries require `args` as a map (Record<string, string>), not an array',
      };
    }
    if (hasCommand && !isArray) {
      return {
        valid: false,
        reason: 'command-mode entries require `args` as a string array, not a map',
      };
    }
    if (isArray) {
      for (const v of entry.args as string[]) {
        if (typeof v !== 'string') {
          return { valid: false, reason: 'command-mode `args` must contain only strings' };
        }
      }
    }
  }

  return { valid: true };
}
