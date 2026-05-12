import { describe, expect, test } from 'bun:test';
import { atToLaunchd, cronFieldsToLaunchd, validateAt, validateCron } from './cron-parse.js';

describe('validateCron', () => {
  test('accepts valid daily cron', () => {
    expect(validateCron('0 9 * * *')).toEqual({ valid: true });
  });

  test('accepts weekday-range cron', () => {
    expect(validateCron('0 9 * * 1-5')).toEqual({ valid: true });
  });

  test('rejects wrong field count', () => {
    const result = validateCron('0 9 * *');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expected 5 fields');
  });

  test('rejects invalid characters', () => {
    const result = validateCron('0 9 * * abc');
    expect(result.valid).toBe(false);
  });
});

describe('cronFieldsToLaunchd', () => {
  test('converts daily 9am', () => {
    expect(cronFieldsToLaunchd('0 9 * * *')).toEqual({ Minute: 0, Hour: 9 });
  });

  test('converts Sunday noon', () => {
    expect(cronFieldsToLaunchd('0 12 * * 0')).toEqual({
      Minute: 0,
      Hour: 12,
      Weekday: 0,
    });
  });
});

describe('validateAt', () => {
  test('accepts valid timestamp', () => {
    expect(validateAt('2026-05-13 14:30')).toEqual({ valid: true });
  });

  test('rejects bad format', () => {
    const result = validateAt('2026/05/13 14:30');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expected');
  });

  test('rejects month out of range', () => {
    const result = validateAt('2026-13-01 09:00');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('month out of range');
  });

  test('rejects hour out of range', () => {
    const result = validateAt('2026-05-13 24:00');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('hour out of range');
  });
  test('rejects day out of range', () => {
    expect(validateAt('2026-05-32 09:00').valid).toBe(false);
    expect(validateAt('2026-05-00 09:00').valid).toBe(false);
  });
  test('rejects minute out of range', () => {
    expect(validateAt('2026-05-13 09:60').valid).toBe(false);
  });
});

describe('atToLaunchd', () => {
  test('converts 2026-05-13 14:30', () => {
    expect(atToLaunchd('2026-05-13 14:30')).toEqual({
      Year: 2026,
      Month: 5,
      Day: 13,
      Hour: 14,
      Minute: 30,
    });
  });
});
