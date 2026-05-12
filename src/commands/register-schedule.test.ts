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

  test('rejects arg value containing shell-special chars', async () => {
    for (const [_key, yaml] of [
      [
        'double-quote',
        `schedule:\n  - cron: "0 9 * * *"\n    skill: /daily\n    args:\n      msg: 'bad "value"'\n`,
      ],
      [
        'dollar-sign',
        `schedule:\n  - cron: "0 9 * * *"\n    skill: /daily\n    args:\n      msg: 'has $var'\n`,
      ],
      [
        'backtick',
        'schedule:\n  - cron: "0 9 * * *"\n    skill: /daily\n    args:\n      msg: \'has `cmd`\'\n',
      ],
      [
        'backslash',
        `schedule:\n  - cron: "0 9 * * *"\n    skill: /daily\n    args:\n      msg: 'back\\\\slash'\n`,
      ],
    ] as [string, string][]) {
      writeFileSync(join(testVault, 'vault.yml'), yaml);
      await expect(registerSchedule({ vault: testVault, dryRun: true })).rejects.toThrow(
        /shell-special chars/,
      );
    }
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

describe('registerSchedule — command mode', () => {
  test('--dry-run produces plist with command + argv', async () => {
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - cron: "0 3 * * 0"\n    command: onebrain\n    args:\n      - qmd-reindex\n`,
    );
    const captured = captureConsoleLog();
    try {
      await registerSchedule({ vault: testVault, dryRun: true });
      const joined = captured.lines().join('\n');
      expect(joined).toContain('<string>onebrain</string>');
      expect(joined).toContain('<string>qmd-reindex</string>');
      expect(joined).not.toContain('<string>--skill</string>');
    } finally {
      captured.restore();
    }
  });

  test('command entry skips schedulable validation', async () => {
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - cron: "0 3 * * 0"\n    command: nonexistent-binary\n    args:\n      - foo\n`,
    );
    await expect(registerSchedule({ vault: testVault, dryRun: true })).resolves.toBeUndefined();
  });

  test('--status shows command entries with cmd: prefix and joined argv', async () => {
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - cron: "0 9 * * *"\n    skill: /daily\n  - cron: "0 3 * * 0"\n    command: onebrain\n    args: [qmd-reindex]\n`,
    );
    const captured = captureConsoleLog();
    try {
      await registerSchedule({ vault: testVault, status: true });
      const plain = stripAnsi(captured.lines().join('\n'));
      expect(plain).toContain('Registered schedules: 2');
      expect(plain).toContain('skill: /daily');
      expect(plain).toContain('cmd: onebrain qmd-reindex');
    } finally {
      captured.restore();
    }
  });

  test('--status shows skill args inline when present', async () => {
    mkdirSync(join(testVault, '.claude/plugins/onebrain/skills/distill'), { recursive: true });
    writeFileSync(
      join(testVault, '.claude/plugins/onebrain/skills/distill/SKILL.md'),
      '---\nname: distill\nschedulable_with_args: true\nrequired_args: [topic]\n---\n',
    );
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - cron: "0 9 * * *"\n    skill: /distill\n    args:\n      topic: this-week\n`,
    );
    const captured = captureConsoleLog();
    try {
      await registerSchedule({ vault: testVault, status: true });
      const plain = stripAnsi(captured.lines().join('\n'));
      expect(plain).toContain('skill: /distill (topic=this-week)');
    } finally {
      captured.restore();
    }
  });

  test('one-shot command rejects shell-special chars', async () => {
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - at: "2026-05-13 14:30"\n    command: onebrain\n    args:\n      - "$EVIL"\n`,
    );
    await expect(registerSchedule({ vault: testVault, dryRun: true })).rejects.toThrow(
      /shell-special/,
    );
  });

  test('mixed skill + command in same vault.yml — both register', async () => {
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - cron: "0 9 * * *"\n    skill: /daily\n  - cron: "0 3 * * 0"\n    command: onebrain\n    args: [qmd-reindex]\n`,
    );
    const captured = captureConsoleLog();
    try {
      await registerSchedule({ vault: testVault, dryRun: true });
      const joined = captured.lines().join('\n');
      expect(joined).toContain('com.onebrain.daily');
      expect(joined).toContain('com.onebrain.onebrain');
    } finally {
      captured.restore();
    }
  });

  test('collision: skill /onebrain and command onebrain rejected', async () => {
    mkdirSync(join(testVault, '.claude/plugins/onebrain/skills/onebrain'), { recursive: true });
    writeFileSync(
      join(testVault, '.claude/plugins/onebrain/skills/onebrain/SKILL.md'),
      '---\nname: onebrain\nschedulable: true\n---\n',
    );
    writeFileSync(
      join(testVault, 'vault.yml'),
      `schedule:\n  - cron: "0 9 * * *"\n    skill: /onebrain\n  - cron: "0 3 * * 0"\n    command: onebrain\n`,
    );
    await expect(registerSchedule({ vault: testVault, dryRun: true })).rejects.toThrow(
      /Conflict.*normalize to the same plist path/,
    );
  });
});

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

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
