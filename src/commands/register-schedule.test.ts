import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerSchedule } from './register-schedule.js';

let testVault: string;

beforeEach(() => {
  testVault = mkdtempSync(join(tmpdir(), 'onebrain-sched-test-'));
  mkdirSync(join(testVault, '.claude/plugins/onebrain/skills/daily'), { recursive: true });
  writeFileSync(
    join(testVault, '.claude/plugins/onebrain/skills/daily/SKILL.md'),
    '---\nname: daily\nschedulable: true\n---\n\n# /daily\n',
  );
  writeFileSync(
    join(testVault, 'vault.yml'),
    `schedule:\n  - cron: "0 9 * * *"\n    skill: /daily\n`,
  );
});

afterEach(() => rmSync(testVault, { recursive: true, force: true }));

describe('registerSchedule', () => {
  test('--dry-run prints plist without writing', async () => {
    const captured = captureConsoleLog();
    try {
      await registerSchedule({ vault: testVault, dryRun: true });
      expect(captured.lines().some((l) => l.includes('com.onebrain.daily'))).toBe(true);
      expect(captured.lines().some((l) => l.includes('StartCalendarInterval'))).toBe(true);
    } finally {
      captured.restore();
    }
  });

  test('rejects unschedulable skill', async () => {
    writeFileSync(
      join(testVault, '.claude/plugins/onebrain/skills/daily/SKILL.md'),
      '---\nname: daily\nschedulable: false\n---\n',
    );
    await expect(registerSchedule({ vault: testVault, dryRun: true })).rejects.toThrow(
      /requires user input/,
    );
  });

  test('--status reports entry tagged [cron]', async () => {
    const captured = captureConsoleLog();
    try {
      await registerSchedule({ vault: testVault, status: true });
      expect(captured.lines().some((l) => l.includes('Registered schedules: 1'))).toBe(true);
      expect(captured.lines().some((l) => l.includes('[cron]'))).toBe(true);
    } finally {
      captured.restore();
    }
  });

  test('one-shot --dry-run produces plist with Year/Month/Day/Hour/Minute and self-delete wrapper', async () => {
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - at: "2026-05-13 14:30"\n    skill: /daily\n`,
    );
    const captured = captureConsoleLog();
    try {
      await registerSchedule({ vault: testVault, dryRun: true });
      const joined = captured.lines().join('\n');
      expect(joined).toContain('<key>Year</key>');
      expect(joined).toContain('<key>Day</key>');
      expect(joined).toContain('launchctl bootout');
      expect(joined).toContain('rm -f');
    } finally {
      captured.restore();
    }
  });

  test('rejects entry with both cron and at', async () => {
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - cron: "0 9 * * *"\n    at: "2026-05-13 14:30"\n    skill: /daily\n`,
    );
    await expect(registerSchedule({ vault: testVault, dryRun: true })).rejects.toThrow(
      /exactly one/,
    );
  });

  test('rejects arg value containing double-quote', async () => {
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - cron: "0 9 * * *"\n    skill: /daily\n    args:\n      msg: 'bad "value"'\n`,
    );
    await expect(registerSchedule({ vault: testVault, dryRun: true })).rejects.toThrow(
      /double-quote/,
    );
  });

  test('--refresh logs notice and re-emits plists', async () => {
    const captured = captureConsoleLog();
    try {
      await registerSchedule({ vault: testVault, refresh: true, dryRun: true });
      expect(captured.lines().some((l) => l.includes('--refresh'))).toBe(true);
      expect(captured.lines().some((l) => l.includes('com.onebrain.daily'))).toBe(true);
    } finally {
      captured.restore();
    }
  });
});

function captureConsoleLog() {
  const original = console.log;
  const lines: string[] = [];
  console.log = (msg: unknown) => lines.push(String(msg));
  return {
    lines: () => lines,
    restore: () => {
      console.log = original;
    },
  };
}
