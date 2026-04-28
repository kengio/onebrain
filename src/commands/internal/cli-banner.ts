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
// Gradient banner
// ---------------------------------------------------------------------------

const ART_LINES = [
  `  ◆${'─'.repeat(26)}◆`,
  '    ┌─┐┌┐╷┌─╴┌┐ ┌─┐┌─┐╷┌┐╷',
  '    │ ││└┤├╴ ├┴┐├┬┘├─┤││└┤',
  '    └─┘╵ ╵└─╴└─┘╵└╴╵ ╵╵╵ ╵',
  `  ◆${'─'.repeat(26)}◆`,
];

// total newlines emitted by renderBanner + the trailing \n in printBanner:
// 1 (leading blank) + 5 (art) + 1 (blank) + 1 (subtitle) + 1 (trailing blank) = 9
const BANNER_LINE_COUNT = 1 + ART_LINES.length + 3;

function supportsRgb(): boolean {
  const c = process.env['COLORTERM'] ?? '';
  return c === 'truecolor' || c === '24bit';
}

function rgbChar(ch: string, r: number, g: number, b: number): string {
  return `\x1b[1;38;2;${r};${g};${b}m${ch}\x1b[0m`;
}

function gradientLine(line: string, offset: number): string {
  const WAVE = 32;
  return line
    .split('')
    .map((ch, i) => {
      if (ch === ' ') return ch;
      const t = (((i + offset) % WAVE) / WAVE) * Math.PI * 2;
      const g = Math.min(255, Math.max(0, Math.round(150 + 105 * Math.sin(t))));
      const b = Math.min(255, Math.max(0, Math.round(220 - 60 * Math.sin(t))));
      return rgbChar(ch, 0, g, b);
    })
    .join('');
}

function renderBanner(offset: number, gradient: boolean): string {
  const colorLine = (l: string) => (gradient ? gradientLine(l, offset) : pc.bold(pc.cyan(l)));
  return [
    '',
    ...ART_LINES.map(colorLine),
    '',
    `    ${pc.dim('Your AI Thinking Partner')}`,
    '',
  ].join('\n');
}

export async function printBanner(): Promise<void> {
  if (!process.stdout.isTTY) return;

  const gradient = supportsRgb();
  const FRAMES = 8;
  const FRAME_MS = 65;
  const WAVE_STEP = 4;
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  if (gradient) process.stdout.write('\x1b[?25l');
  try {
    process.stdout.write(`${renderBanner(0, gradient)}\n`);
    if (gradient) {
      for (let f = 1; f < FRAMES; f++) {
        await delay(FRAME_MS);
        process.stdout.write(`\x1b[${BANNER_LINE_COUNT}F`);
        process.stdout.write(`${renderBanner(f * WAVE_STEP, gradient)}\n`);
      }
    }
  } finally {
    if (gradient) process.stdout.write('\x1b[?25h');
  }
}
