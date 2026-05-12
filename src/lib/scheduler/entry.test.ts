import { describe, expect, test } from 'bun:test';
import { isOneShot, validateEntry } from './entry.js';

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
