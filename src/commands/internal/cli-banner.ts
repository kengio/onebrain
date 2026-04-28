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
// Art
// ---------------------------------------------------------------------------

const ART_LINES = [
  `  ◆${'─'.repeat(25)}◆`,
  '    ┌─┐┌┐╷┌─╴┌┐ ┌─┐┌─┐╷┌┐╷',
  '    │ ││└┤├╴ ├┴┐├┬┘├─┤││└┤',
  '    └─┘╵ ╵└─╴└─┘╵└╴╵ ╵╵╵ ╵',
  `  ◆${'─'.repeat(25)}◆`,
];

const TAGLINE = 'Your AI Thinking Partner';

// blank + 5 art + blank + tagline + blank
const BANNER_LINE_COUNT = 1 + ART_LINES.length + 3;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function supportsRgb(): boolean {
  const c = process.env['COLORTERM'] ?? '';
  return c === 'truecolor' || c === '24bit';
}

function hsvToRgb(h: number, floor = 80): [number, number, number] {
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
  // Luminance floor: lifts dark channels so all hues appear equally vivid
  return [Math.min(255, r + floor), Math.min(255, g + floor), Math.min(255, b + floor)];
}

const HUE_PER_CHAR = 10; // hue degrees per character (horizontal)
const HUE_PER_ROW = 30;  // hue degrees per row (vertical) — creates diagonal gradient

function neonLine(line: string, lineIndex = 0, floor = 80): string {
  return line
    .split('')
    .map((ch, i) => {
      if (ch === ' ') return ch;
      const hue = (((i * HUE_PER_CHAR - lineIndex * HUE_PER_ROW) % 360) + 360) % 360;
      const [r, g, b] = hsvToRgb(hue, floor);
      return `\x1b[1;38;2;${r};${g};${b}m${ch}\x1b[0m`;
    })
    .join('');
}

// Warm cyan electron beam — the active scanline
function scanLine(line: string): string {
  return line
    .split('')
    .map((ch) => (ch === ' ' ? ch : `\x1b[1;38;2;140;255;255m${ch}\x1b[0m`))
    .join('');
}

function dimLine(line: string): string {
  return line
    .split('')
    .map((ch) => (ch === ' ' ? ch : `\x1b[2;38;2;50;50;70m${ch}\x1b[0m`))
    .join('');
}

// ---------------------------------------------------------------------------
// Frame printer
// ---------------------------------------------------------------------------

function outb(str: string): void {
  process.stdout.write(Buffer.from(str, 'utf8'));
}

function printFrame(artLines: string[], tagline: string): void {
  outb('\n');
  for (const l of artLines) outb(`${l}\n`);
  outb('\n');
  outb(`${tagline}\n`);
  outb('\n');
}

// ---------------------------------------------------------------------------
// CRT power-on scan animation
// ---------------------------------------------------------------------------

export async function printBanner(): Promise<void> {
  if (!process.stdout.isTTY) return;

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const up = (n: number) => outb(`\x1b[${n}F`);

  if (!supportsRgb()) {
    // No true color — static banner
    outb('\n');
    for (const l of ART_LINES) outb(`${pc.bold(pc.cyan(l))}\n`);
    outb('\n');
    outb(`    ${pc.bold(pc.magenta(TAGLINE))}\n`);
    outb('\n');
    return;
  }

  outb('\x1b[?25l');
  try {
    // Initial: all dim, tagline blank
    printFrame(ART_LINES.map(dimLine), `    ${' '.repeat(TAGLINE.length)}`);

    // Scanline sweeps top → bottom
    // Row layout: settled | 2nd trail (floor 120) | 1st trail (floor 200) | scan beam | dim
    for (let scan = 0; scan < ART_LINES.length; scan++) {
      await delay(65);
      up(BANNER_LINE_COUNT);
      printFrame(
        ART_LINES.map((l, i) => {
          if (i < scan - 2) return neonLine(l, i);          // settled rainbow
          if (i === scan - 2) return neonLine(l, i, 120);   // 2nd trailing glow
          if (i === scan - 1) return neonLine(l, i, 200);   // 1st trailing glow — very bright
          if (i === scan) return scanLine(l);                // warm cyan electron beam
          return dimLine(l);                                 // not yet lit
        }),
        `    ${' '.repeat(TAGLINE.length)}`,
      );
    }

    // All rainbow, tagline still blank
    await delay(60);
    up(BANNER_LINE_COUNT);
    printFrame(ART_LINES.map((l, i) => neonLine(l, i)), `    ${' '.repeat(TAGLINE.length)}`);

    // Diagonal shimmer — stripe aligned with rainbow iso-hue lines (col - 3*row = d)
    // Sweeps perpendicular to the color gradient, forward then reverse
    let minD = 0;
    let maxD = 0;
    for (let row = 0; row < ART_LINES.length; row++) {
      minD = Math.min(minD, -row * 3);
      maxD = Math.max(maxD, ART_LINES[row]!.length - 1 - row * 3);
    }
    function diagFrame(highlight: number): string[] {
      return ART_LINES.map((line, row) =>
        line.split('').map((ch, col) => {
          if (ch === ' ') return ch;
          const d = col - 3 * row;
          if (Math.abs(d - highlight) <= 1) return `\x1b[1;97m${ch}\x1b[0m`;
          const hue = (((col * HUE_PER_CHAR - row * HUE_PER_ROW) % 360) + 360) % 360;
          const [r, g, b] = hsvToRgb(hue);
          return `\x1b[1;38;2;${r};${g};${b}m${ch}\x1b[0m`;
        }).join('')
      );
    }
    for (let d = minD; d <= maxD; d++) {
      await delay(16);
      up(BANNER_LINE_COUNT);
      printFrame(diagFrame(d), `    ${' '.repeat(TAGLINE.length)}`);
    }
    for (let d = maxD; d >= minD; d--) {
      await delay(16);
      up(BANNER_LINE_COUNT);
      printFrame(diagFrame(d), `    ${' '.repeat(TAGLINE.length)}`);
    }
    // Clean rainbow after sweep
    up(BANNER_LINE_COUNT);
    printFrame(ART_LINES.map((l, i) => neonLine(l, i)), `    ${' '.repeat(TAGLINE.length)}`);
    await delay(200);

    // Typewriter tagline — cyan cursor follows text
    const cursor = `\x1b[1;38;2;140;255;255m▌\x1b[0m`;
    for (let len = 1; len <= TAGLINE.length; len++) {
      await delay(32);
      up(BANNER_LINE_COUNT);
      const hasCursor = len < TAGLINE.length;
      printFrame(
        ART_LINES.map((l, i) => neonLine(l, i)),
        `    \x1b[1;97m${TAGLINE.slice(0, len)}\x1b[0m${hasCursor ? cursor : ''}${' '.repeat(Math.max(0, TAGLINE.length - len - 1))}`,
      );
    }

    // Cursor blinks 2 times then disappears into magenta
    const tagWithCursor = `    \x1b[1;97m${TAGLINE}\x1b[0m${cursor}`;
    const tagWhite = `    \x1b[1;97m${TAGLINE}\x1b[0m\x1b[K`;
    for (let b = 0; b < 2; b++) {
      await delay(600);
      up(BANNER_LINE_COUNT);
      printFrame(ART_LINES.map((l, i) => neonLine(l, i)), tagWhite);
      await delay(600);
      up(BANNER_LINE_COUNT);
      printFrame(ART_LINES.map((l, i) => neonLine(l, i)), tagWithCursor);
    }
    // Cursor disappears + settle magenta in one step
    await delay(600);
    up(BANNER_LINE_COUNT);
    printFrame(ART_LINES.map((l, i) => neonLine(l, i)), `    ${pc.bold(pc.magenta(TAGLINE))}\x1b[K`);
  } finally {
    outb('\x1b[?25h');
  }
}
