import { describe, expect, test } from 'bun:test';
import { generatePlist, plistPath } from './launchd.js';

const ctx = {
  vaultPath: '/Users/test/vault',
  skillCliPath: '/usr/local/bin/claude-code',
  logBasePath: '/Users/test/vault/07-logs/scheduler/2026/05',
  homedir: '/Users/test',
  uid: 501,
};

describe('generatePlist', () => {
  test('daily 9am /daily', () => {
    const out = generatePlist({ cron: '0 9 * * *', skill: '/daily' }, ctx);
    expect(out).toContain('<string>com.onebrain.daily</string>');
    expect(out).toContain('<key>Hour</key>\n        <integer>9</integer>');
    expect(out).toContain('<string>--skill</string>');
    expect(out).toContain('<string>/daily</string>');
    expect(out).toContain('<string>--headless</string>');
  });

  test('with args', () => {
    const out = generatePlist(
      { cron: '0 12 * * 0', skill: '/distill', args: { topic: 'this-week' } },
      ctx,
    );
    expect(out).toContain('<string>--topic=this-week</string>');
  });

  test('escapes XML-sensitive chars in args', () => {
    const out = generatePlist(
      { cron: '0 9 * * *', skill: '/echo', args: { msg: 'a & b < c' } },
      ctx,
    );
    expect(out).toContain('<string>--msg=a &amp; b &lt; c</string>');
    expect(out).not.toContain('a & b'); // ensure raw chars are gone
  });

  test('no blank line in <array> when args absent', () => {
    const out = generatePlist({ cron: '0 9 * * *', skill: '/daily' }, ctx);
    expect(out).not.toMatch(/<string>--headless<\/string>\n\n\s*<\/array>/);
  });

  test('one-shot plist emits Year/Month/Day/Hour/Minute', () => {
    const out = generatePlist({ at: '2026-05-13 14:30', skill: '/reminder' }, { ...ctx, uid: 501 });
    expect(out).toContain('<key>Year</key>\n        <integer>2026</integer>');
    expect(out).toContain('<key>Month</key>\n        <integer>5</integer>');
    expect(out).toContain('<key>Day</key>\n        <integer>13</integer>');
    expect(out).toContain('<key>Hour</key>\n        <integer>14</integer>');
    expect(out).toContain('<key>Minute</key>\n        <integer>30</integer>');
  });

  test('one-shot plist wraps command in self-delete shell', () => {
    const out = generatePlist({ at: '2026-05-13 14:30', skill: '/reminder' }, { ...ctx, uid: 501 });
    expect(out).toContain('<string>/bin/sh</string>');
    expect(out).toContain('<string>-c</string>');
    expect(out).toContain('launchctl bootout gui/501/com.onebrain.reminder');
    expect(out).toContain('rm -f');
  });

  test('one-shot plist escapes XML in args inside wrapper', () => {
    const out = generatePlist(
      { at: '2026-05-13 14:30', skill: '/echo', args: { msg: 'a & b' } },
      { ...ctx, uid: 501 },
    );
    // Shell line: --msg="a & b" — the whole line is XML-escaped once, so
    // " → &quot; and & → &amp;, giving --msg=&quot;a &amp; b&quot;.
    expect(out).toContain('--msg=&quot;a &amp; b&quot;');
  });
});

describe('plistPath', () => {
  test('returns LaunchAgents path', () => {
    expect(plistPath('/daily', '/Users/test')).toBe(
      '/Users/test/Library/LaunchAgents/com.onebrain.daily.plist',
    );
  });
});

describe('generatePlist — command mode', () => {
  const cctx = { ...ctx, uid: 501, homedir: '/Users/test' };

  test('recurring command emits hook-style ProgramArguments', () => {
    const out = generatePlist(
      { cron: '0 3 * * 0', command: 'onebrain', args: ['qmd-reindex'] },
      cctx,
    );
    expect(out).toContain('<string>onebrain</string>');
    expect(out).toContain('<string>qmd-reindex</string>');
    expect(out).not.toContain('<string>--skill</string>');
    expect(out).not.toContain('<string>--vault</string>');
    expect(out).not.toContain('<string>--headless</string>');
  });

  test('label derives from command name', () => {
    const out = generatePlist(
      { cron: '0 3 * * 0', command: 'onebrain', args: ['qmd-reindex'] },
      cctx,
    );
    expect(out).toContain('<string>com.onebrain.onebrain</string>');
  });

  test('one-shot command wraps in self-delete shell', () => {
    const out = generatePlist(
      { at: '2026-05-13 14:30', command: 'onebrain', args: ['qmd-reindex'] },
      cctx,
    );
    expect(out).toContain('<string>/bin/sh</string>');
    expect(out).toContain('&quot;onebrain&quot; &quot;qmd-reindex&quot;');
    expect(out).toContain('launchctl bootout gui/501/com.onebrain.onebrain');
    expect(out).toContain('rm -f');
  });

  test('command with no args produces single-element argv', () => {
    const out = generatePlist({ cron: '0 3 * * 0', command: 'onebrain' }, cctx);
    expect(out).toContain('<string>onebrain</string>');
  });

  test('command with non-onebrain binary works (rsync example)', () => {
    const out = generatePlist(
      { cron: '0 5 * * *', command: 'rsync', args: ['-av', '/src', '/dst'] },
      cctx,
    );
    expect(out).toContain('<string>rsync</string>');
    expect(out).toContain('<string>-av</string>');
    expect(out).toContain('<string>com.onebrain.rsync</string>');
  });

  test('command-mode args containing XML-special chars are escaped', () => {
    const out = generatePlist(
      { cron: '0 5 * * *', command: 'rclone', args: ['--exclude', 'a & b'] },
      cctx,
    );
    expect(out).toContain('<string>--exclude</string>');
    expect(out).toContain('<string>a &amp; b</string>');
    expect(out).not.toContain('<string>a & b</string>'); // raw `&` must not appear
  });
});
