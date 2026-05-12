import { describe, expect, test } from 'bun:test';
import { schedulerLogPath } from './log-paths.js';

describe('schedulerLogPath', () => {
  test('success path', () => {
    const out = schedulerLogPath('07-logs', new Date('2026-05-12T09:00:00'), '/daily', false);
    expect(out).toBe('07-logs/scheduler/2026/05/2026-05-12-daily.md');
  });

  test('error path', () => {
    const out = schedulerLogPath('07-logs', new Date('2026-05-12T09:00:00'), '/distill', true);
    expect(out).toBe('07-logs/scheduler/2026/05/2026-05-12-distill.err.md');
  });
});
