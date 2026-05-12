import { describe, expect, test } from 'bun:test';
import { isCommandMode, isOneShot, isSkillMode, validateEntry } from './entry.js';

describe('isOneShot', () => {
  test('returns true when at is set', () => {
    expect(isOneShot({ at: '2026-05-13 14:30', skill: '/x' })).toBe(true);
  });
  test('returns false when at is undefined', () => {
    expect(isOneShot({ cron: '0 9 * * *', skill: '/x' })).toBe(false);
  });
});

describe('validateEntry', () => {
  test('rejects when both cron and at are set', () => {
    const r = validateEntry({ cron: '0 9 * * *', at: '2026-05-13 14:30', skill: '/x' });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('exactly one');
  });
  test('rejects when neither cron nor at is set', () => {
    const r = validateEntry({ skill: '/x' });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('exactly one');
  });
  test('rejects when skill is empty', () => {
    const r = validateEntry({ cron: '0 9 * * *', skill: '' });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('skill');
  });
  test('accepts cron-only entry', () => {
    expect(validateEntry({ cron: '0 9 * * *', skill: '/daily' })).toEqual({ valid: true });
  });
  test('accepts at-only entry', () => {
    expect(validateEntry({ at: '2026-05-13 14:30', skill: '/reminder' })).toEqual({ valid: true });
  });
});

describe('isSkillMode / isCommandMode', () => {
  test('isSkillMode true for skill entry', () => {
    expect(isSkillMode({ cron: '0 9 * * *', skill: '/daily' })).toBe(true);
  });
  test('isSkillMode false for command entry', () => {
    expect(isSkillMode({ cron: '0 9 * * *', command: 'onebrain' })).toBe(false);
  });
  test('isCommandMode true for command entry', () => {
    expect(isCommandMode({ cron: '0 9 * * *', command: 'onebrain' })).toBe(true);
  });
  test('isCommandMode false for skill entry', () => {
    expect(isCommandMode({ cron: '0 9 * * *', skill: '/daily' })).toBe(false);
  });
});

describe('validateEntry — command mode', () => {
  test('accepts command-only entry with array args', () => {
    expect(
      validateEntry({ cron: '0 3 * * 0', command: 'onebrain', args: ['qmd-reindex'] }),
    ).toEqual({ valid: true });
  });
  test('accepts command-only entry with no args', () => {
    expect(validateEntry({ cron: '0 3 * * 0', command: 'onebrain' })).toEqual({ valid: true });
  });
  test('rejects both skill and command set', () => {
    const r = validateEntry({ cron: '0 9 * * *', skill: '/daily', command: 'onebrain' });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('exactly one of `skill` or `command`');
  });
  test('rejects neither skill nor command set', () => {
    const r = validateEntry({ cron: '0 9 * * *' });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('exactly one of `skill` or `command`');
  });
  test('rejects skill mode with array args', () => {
    const r = validateEntry({
      cron: '0 9 * * *',
      skill: '/daily',
      args: ['x'] as unknown as Record<string, string>,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('skill-mode');
  });
  test('rejects command mode with map args', () => {
    const r = validateEntry({
      cron: '0 9 * * *',
      command: 'onebrain',
      args: { k: 'v' } as unknown as string[],
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('command-mode');
  });
});
