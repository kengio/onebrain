import type { ScheduleEntry } from './types.js';

export function isOneShot(entry: ScheduleEntry): entry is ScheduleEntry & { at: string } {
  return entry.at !== undefined;
}

export function validateEntry(entry: ScheduleEntry): { valid: boolean; reason?: string } {
  const hasCron = entry.cron !== undefined;
  const hasAt = entry.at !== undefined;
  if (hasCron === hasAt) {
    return { valid: false, reason: 'entry must have exactly one of `cron` or `at`' };
  }
  if (!entry.skill) return { valid: false, reason: 'entry.skill is required' };
  return { valid: true };
}
