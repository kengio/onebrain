import pc from 'picocolors';

declare const BUILD_VERSION: string;

export function resolveBinaryVersion(): string {
  if (typeof BUILD_VERSION !== 'undefined') return BUILD_VERSION;
  try {
    const pkg = require('../../../package.json') as { version?: string };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
}

// ---------------------------------------------------------------------------
// Neon banner with running spotlight wave (Claude Code style)
// ---------------------------------------------------------------------------

const ART_LINES = [
  `  ◆${'─'.repeat(26)}◆`,
  '    ┌─┐┌┐╷┌─╴┌┐ ┌─┐┌─┐╷┌┐╷',
  '    │ ││└┤├╴ ├┴┐├┬┘├─┤││└┤',
  '    └─┘╵ ╵└─╴└─┘╵└╴╵ ╵╵╵ ╵',
  `  ◆${'─'.repeat(26)}◆`,
];

// 1 (leading blank) + 5 (art) + 1 (blank) + 1 (subtitle) + 1 (trailing blank) = 9
const BANNER_LINE_COUNT = 1 + ART_LINES.length + 3;

function supportsRgb(): boolean {
  const c = process.env['COLORTERM'] ?? '';
  return c === 'truecolor' || c === '24bit';
}

function hsvToRgb(h: number): [number, number, number] {
  // s=1, v=1 (full neon); h in [0, 360)
  const c = 255;
  const x = Math.round(c * (1 - Math.abs(((h / 60) % 2) - 1)));
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [r, g, b];
}

const HUE_PER_CHAR = 10; // hue degrees spread per character position

function neonLine(line: string, hueOffset: number): string {
  return line
    .split('')
    .map((ch, i) => {
      if (ch === ' ') return ch;
      const hue = (((i * HUE_PER_CHAR + hueOffset) % 360) + 360) % 360;
      const [r, g, b] = hsvToRgb(hue);
      return `\x1b[1;38;2;${r};${g};${b}m${ch}\x1b[0m`;
    })
    .join('');
}

function renderBanner(hueOffset: number, neon: boolean): string {
  const colorLine = (l: string) => (neon ? neonLine(l, hueOffset) : pc.bold(pc.cyan(l)));
  return [
    '',
    ...ART_LINES.map(colorLine),
    '',
    `    ${pc.bold('Your AI Thinking Partner')}`,
    '',
  ].join('\n');
}

export async function printBanner(): Promise<void> {
  if (!process.stdout.isTTY) return;

  const neon = supportsRgb();
  const FRAME_MS = 90;
  const HUE_STEP = 12; // 30 frames × 12° = 360° = exactly 1 full hue cycle
  const FRAMES = 360 / HUE_STEP; // 30 frames ≈ 2.7 s

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  if (neon) process.stdout.write('\x1b[?25l');
  try {
    process.stdout.write(`${renderBanner(0, neon)}\n`);
    if (neon) {
      for (let f = 1; f < FRAMES; f++) {
        await delay(FRAME_MS);
        process.stdout.write(`\x1b[${BANNER_LINE_COUNT}F`);
        process.stdout.write(`${renderBanner(f * HUE_STEP, neon)}\n`);
      }
      // Settle on static cyan after the rainbow cycle completes
      process.stdout.write(`\x1b[${BANNER_LINE_COUNT}F`);
      process.stdout.write(`${renderBanner(0, false)}\n`);
    }
  } finally {
    if (neon) process.stdout.write('\x1b[?25h');
  }
}
