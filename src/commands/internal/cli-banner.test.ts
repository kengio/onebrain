import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  FINAL_COLOR,
  PREFIX_COLOR,
  SUBTITLE,
  TAGLINE_FALLBACK,
  TRAILING_COLOR,
  isInteractiveStdout,
  printBanner,
} from './cli-banner.js';

// ---------------------------------------------------------------------------
// Helpers — capture stdout + toggle isTTY/COLORTERM safely across tests
// ---------------------------------------------------------------------------

interface StdoutSpy {
  chunks: string[];
  restore: () => void;
}

function spyStdout(): StdoutSpy {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
  return {
    chunks,
    restore: () => {
      process.stdout.write = original;
    },
  };
}

function setIsTTY(value: boolean): () => void {
  // When `isTTY` lives on the prototype (common in non-TTY CI), the descriptor
  // lookup returns undefined; we must `deleteProperty` on restore instead of
  // writing `undefined`, otherwise the prototype lookup gets shadowed for the
  // rest of the test run.
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true, writable: true });
  return () => {
    if (descriptor) Object.defineProperty(process.stdout, 'isTTY', descriptor);
    else Reflect.deleteProperty(process.stdout, 'isTTY');
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('printBanner — non-TTY (piped/CI) static path', () => {
  // Non-interactive output (piped, redirected, CI logs) must still print the
  // banner, statically and brand-colored — never animated, never cursor-toggling.
  let spy: StdoutSpy;
  let restoreIsTTY: () => void;
  let savedColorterm: string | undefined;

  beforeEach(() => {
    spy = spyStdout();
    restoreIsTTY = setIsTTY(false);
    savedColorterm = process.env['COLORTERM'];
    process.env['COLORTERM'] = 'truecolor'; // simulate piped output from a truecolor host
  });

  afterEach(() => {
    spy.restore();
    restoreIsTTY();
    if (savedColorterm === undefined) Reflect.deleteProperty(process.env, 'COLORTERM');
    else process.env['COLORTERM'] = savedColorterm;
  });

  it('writes the canonical uppercase tagline + subtitle', async () => {
    await printBanner();
    const all = spy.chunks.join('');
    expect(all).toContain(TAGLINE_FALLBACK);
    expect(all).toContain(SUBTITLE);
    expect(all.indexOf(SUBTITLE)).toBeGreaterThan(all.indexOf(TAGLINE_FALLBACK));
  });

  it('does not toggle the cursor or run animation (no \\x1b[?25l / \\x1b[?25h)', async () => {
    await printBanner();
    const all = spy.chunks.join('');
    expect(all).not.toContain('\x1b[?25l');
    expect(all).not.toContain('\x1b[?25h');
    // Animated path also emits cursor-up rewinds (ESC + [ + digits + F).
    // String-search avoids putting a literal ESC inside a regex.
    expect(all).not.toContain('\x1b[1F');
    expect(all).not.toContain('\x1b[11F');
  });

  it('uses brand cyan #00f3ff truecolor RGB when COLORTERM=truecolor (not generic 16-color cyan)', async () => {
    await printBanner();
    const all = spy.chunks.join('');
    // Truecolor SGR for #00f3ff = ESC[...;38;2;0;243;255m
    expect(all).toContain('38;2;0;243;255');
    // Should NOT use the generic 16-color cyan SGR ESC[36m (picocolors' pc.cyan).
    expect(all).not.toContain('\x1b[36m');
  });

  it('renders gradient on logo + solid white wordmark', async () => {
    await printBanner();
    const all = spy.chunks.join('');
    // Logo carries the brand gradient — many distinct truecolor SGR codes.
    const matches = all.match(/38;2;\d+;\d+;\d+/g) ?? [];
    const unique = new Set(matches);
    expect(unique.size).toBeGreaterThan(5);
    // Wordmark cells render bold white — locks in "logo animates, wordmark stays".
    expect(all).toContain('\x1b[1;97m');
  });
});

describe('printBanner — TTY without truecolor (16-color static fallback)', () => {
  let spy: StdoutSpy;
  let restoreIsTTY: () => void;
  let savedColorterm: string | undefined;

  beforeEach(() => {
    spy = spyStdout();
    restoreIsTTY = setIsTTY(true);
    savedColorterm = process.env['COLORTERM'];
    Reflect.deleteProperty(process.env, 'COLORTERM');
  });

  afterEach(() => {
    spy.restore();
    restoreIsTTY();
    if (savedColorterm === undefined) Reflect.deleteProperty(process.env, 'COLORTERM');
    else process.env['COLORTERM'] = savedColorterm;
  });

  it('writes the canonical uppercase tagline', async () => {
    await printBanner();
    const all = spy.chunks.join('');
    expect(all).toContain(TAGLINE_FALLBACK);
    expect(TAGLINE_FALLBACK).toBe('YOUR AI THINKING PARTNER');
  });

  it('writes the subtitle below the tagline', async () => {
    await printBanner();
    const all = spy.chunks.join('');
    expect(all).toContain(SUBTITLE);
    expect(all.indexOf(SUBTITLE)).toBeGreaterThan(all.indexOf(TAGLINE_FALLBACK));
  });

  it('does not run the truecolor animation (no cursor hide/show)', async () => {
    await printBanner();
    const all = spy.chunks.join('');
    expect(all).not.toContain('\x1b[?25l');
    expect(all).not.toContain('\x1b[?25h');
  });
});

describe('brand color exports', () => {
  it('PREFIX_COLOR matches brand cyan #00f3ff', () => {
    expect(PREFIX_COLOR).toEqual([0, 243, 255]);
  });

  it('TRAILING_COLOR matches brand magenta #ff2d92', () => {
    expect(TRAILING_COLOR).toEqual([255, 45, 146]);
  });

  it('FINAL_COLOR settles to brand cyan (matches PREFIX_COLOR)', () => {
    expect(FINAL_COLOR).toEqual(PREFIX_COLOR);
  });
});

describe('canonical tagline + subtitle text', () => {
  it('TAGLINE_FALLBACK is the canonical uppercase form', () => {
    expect(TAGLINE_FALLBACK).toBe('YOUR AI THINKING PARTNER');
  });

  it('SUBTITLE is the canonical descriptive line', () => {
    expect(SUBTITLE).toBe('A unified intelligence in your Obsidian vault');
  });
});

describe('isInteractiveStdout — issue #131 env var override', () => {
  // bun-compiled binaries on Windows misdetect Git Bash MinTTY as non-TTY.
  // FORCE_COLOR=3 / ONEBRAIN_FORCE_TTY=1 let users override that detection
  // so they still get the animated banner. This suite locks the gate logic.
  let restoreIsTTY: () => void;
  let savedForceColor: string | undefined;
  let savedForceTty: string | undefined;

  beforeEach(() => {
    restoreIsTTY = setIsTTY(false);
    savedForceColor = process.env['FORCE_COLOR'];
    savedForceTty = process.env['ONEBRAIN_FORCE_TTY'];
    Reflect.deleteProperty(process.env, 'FORCE_COLOR');
    Reflect.deleteProperty(process.env, 'ONEBRAIN_FORCE_TTY');
  });

  afterEach(() => {
    restoreIsTTY();
    if (savedForceColor === undefined) Reflect.deleteProperty(process.env, 'FORCE_COLOR');
    else process.env['FORCE_COLOR'] = savedForceColor;
    if (savedForceTty === undefined) Reflect.deleteProperty(process.env, 'ONEBRAIN_FORCE_TTY');
    else process.env['ONEBRAIN_FORCE_TTY'] = savedForceTty;
  });

  it('returns false when isTTY=false and no override env var set', () => {
    expect(isInteractiveStdout()).toBe(false);
  });

  it('returns true when ONEBRAIN_FORCE_TTY=1 even with isTTY=false', () => {
    process.env['ONEBRAIN_FORCE_TTY'] = '1';
    expect(isInteractiveStdout()).toBe(true);
  });

  it('returns true when FORCE_COLOR=3 even with isTTY=false', () => {
    process.env['FORCE_COLOR'] = '3';
    expect(isInteractiveStdout()).toBe(true);
  });

  it('returns false for FORCE_COLOR=1 or 2 — only level 3 (truecolor) opts in', () => {
    process.env['FORCE_COLOR'] = '1';
    expect(isInteractiveStdout()).toBe(false);
    process.env['FORCE_COLOR'] = '2';
    expect(isInteractiveStdout()).toBe(false);
  });

  it('returns true when isTTY=true regardless of env vars', () => {
    restoreIsTTY();
    restoreIsTTY = setIsTTY(true);
    expect(isInteractiveStdout()).toBe(true);
  });
});
