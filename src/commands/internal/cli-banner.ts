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
  `  ◆${'─'.repeat(25)}◆`,
  '    ┌─┐┌┐╷┌─╴┌┐ ┌─┐┌─┐╷┌┐╷',
  '    │ ││└┤├╴ ├┴┐├┬┘├─┤││└┤',
  '    └─┘╵ ╵└─╴└─┘╵└╴╵ ╵╵╵ ╵',
  `  ◆${'─'.repeat(25)}◆`,
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
  // Two passes of cosine ease-in-out, each 1.5 s → total 3 s
  // Forward:  hue = 90 × (1 − cos(π × f / N))  →  0° → 180°  (ease in-out)
  // Reverse:  hue = 90 × (1 + cos(π × f / N))  →  180° → 0°  (ease in-out)
  const N = 29; // frames per pass (intervals), so 29 × 50 ms = 1.45 s ≈ 1.5 s
  const FRAME_MS = 50;

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  if (neon) process.stdout.write('\x1b[?25l');
  try {
    process.stdout.write(`${renderBanner(0, neon)}\n`);
    if (neon) {
      // Forward: 0° → 180°
      for (let f = 1; f <= N; f++) {
        await delay(FRAME_MS);
        const hue = Math.round(90 * (1 - Math.cos((Math.PI * f) / N)));
        process.stdout.write(`\x1b[${BANNER_LINE_COUNT}F`);
        process.stdout.write(`${renderBanner(hue, neon)}\n`);
      }
      // Reverse: 180° → 0°
      for (let f = 1; f <= N; f++) {
        await delay(FRAME_MS);
        const hue = Math.round(90 * (1 + Math.cos((Math.PI * f) / N)));
        process.stdout.write(`\x1b[${BANNER_LINE_COUNT}F`);
        process.stdout.write(`${renderBanner(hue, neon)}\n`);
      }
      // Settle on static cyan
      process.stdout.write(`\x1b[${BANNER_LINE_COUNT}F`);
      process.stdout.write(`${renderBanner(0, false)}\n`);
    }
  } finally {
    if (neon) process.stdout.write('\x1b[?25h');
  }
}
