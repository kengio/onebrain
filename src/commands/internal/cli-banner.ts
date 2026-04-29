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
// Banner data — center axis at col 15.5
//   border:  lead 2 + ◆ + 26 ─ + ◆        (visible col 2..29 → center 15.5)
//   inner:   lead 5 + 22 chars             (visible col 5..26 → center 15.5)
//   tagline: lead 4 + 24 chars             (visible col 4..27 → center 15.5)
// ---------------------------------------------------------------------------

const ART_LINES = [
  `  ◆${'─'.repeat(26)}◆`,
  '     ┌─┐┌┐╷┌─╴┌┐ ┌─┐┌─┐╷┌┐╷',
  '     │ ││└┤├╴ ├┴┐├┬┘├─┤││└┤',
  '     └─┘╵ ╵└─╴└─┘╵└╴╵ ╵╵╵ ╵',
  `  ◆${'─'.repeat(26)}◆`,
];

const PREFIX = 'Your AI ';
const TAGLINE_LEAD = '    '; // 4 spaces — fits longest sentence at center
const TAGLINE_FALLBACK = `${PREFIX}Thinking Partner`;
const BANNER_LINE_COUNT = 1 + ART_LINES.length + 3;

type Rgb = [number, number, number];

interface Sentence {
  trailing: string;
  trailingWords: string[];
  /** Per-word ms/char tick rate (length matches trailingWords) */
  wordTicks: number[];
}

// Color scheme:
//   "Your AI" prefix   → neon cyan throughout
//   trailing 2 words   → neon magenta during all sentences
//   final lock shimmer → sweeps full tagline; behind the head, every char
//                        settles to neon cyan (magenta "burns out" to cyan)
const PREFIX_COLOR: Rgb = [120, 230, 255];
const TRAILING_COLOR: Rgb = [255, 80, 255];
const FINAL_COLOR: Rgb = [120, 230, 255];

const SENTENCES: Sentence[] = [
  { trailing: 'Remembers You', trailingWords: ['Remembers', 'You'], wordTicks: [24, 32] },
  { trailing: 'Catches Insights', trailingWords: ['Catches', 'Insights'], wordTicks: [27, 26] },
  { trailing: 'Thinking Partner', trailingWords: ['Thinking', 'Partner'], wordTicks: [26, 31] },
];

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function supportsRgb(): boolean {
  const c = process.env['COLORTERM'] ?? '';
  return c === 'truecolor' || c === '24bit';
}

function rgb(r: number, g: number, b: number, ch: string): string {
  return `\x1b[1;38;2;${r};${g};${b}m${ch}\x1b[0m`;
}
function rgbStr(c: Rgb, ch: string): string {
  return rgb(c[0], c[1], c[2], ch);
}

function hsvToRgb(h: number, floor = 80): Rgb {
  const c = 255;
  const x = Math.round(c * (1 - Math.abs(((h / 60) % 2) - 1)));
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.min(255, r + floor), Math.min(255, g + floor), Math.min(255, b + floor)];
}

const HUE_PER_CHAR = 10;
const HUE_PER_ROW = 30;

function neonLine(line: string, lineIndex = 0, floor = 80): string {
  return line
    .split('')
    .map((ch, i) => {
      if (ch === ' ') return ch;
      const hue = (((i * HUE_PER_CHAR - lineIndex * HUE_PER_ROW) % 360) + 360) % 360;
      const [r, g, b] = hsvToRgb(hue, floor);
      return rgb(r, g, b, ch);
    })
    .join('');
}

function whiteLine(line: string): string {
  return line
    .split('')
    .map((ch) => (ch === ' ' ? ch : `\x1b[1;97m${ch}\x1b[0m`))
    .join('');
}

function whiteGlowLine(line: string, alpha: number): string {
  return line
    .split('')
    .map((ch) => (ch === ' ' ? ch : `\x1b[1;38;2;${alpha};${alpha};${alpha}m${ch}\x1b[0m`))
    .join('');
}

function dimLine(line: string): string {
  return line
    .split('')
    .map((ch) => (ch === ' ' ? ch : `\x1b[2;38;2;50;50;70m${ch}\x1b[0m`))
    .join('');
}

function scanLineCh(line: string): string {
  return line
    .split('')
    .map((ch) => (ch === ' ' ? ch : rgb(140, 255, 255, ch)))
    .join('');
}

const CURSOR = rgb(140, 255, 255, '▌');
const GLYPHS = '▓░▒█│┤┐└┴┬├─┼╪╫╬╧╨╤╥╙╘╒╓┘┌║▌▀▄▐∆ƒΩ§¶±÷×ø¥€';
const randGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? '?';
const glitchWhite = (g: string) => `\x1b[1;97m${g}\x1b[0m`;

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

function blankTagline(): string {
  return `${TAGLINE_LEAD}${' '.repeat(TAGLINE_FALLBACK.length)}`;
}

function buildTaglineLine(prefixLockedChars: number, trailingPart: string): string {
  let s = TAGLINE_LEAD;
  for (let i = 0; i < PREFIX.length; i++) {
    if (i < prefixLockedChars) {
      s += PREFIX[i] === ' ' ? ' ' : rgbStr(PREFIX_COLOR, PREFIX[i]!);
    } else {
      s += ' ';
    }
  }
  s += trailingPart;
  return `${s}\x1b[K`;
}

// Tagline tempo
const LOCK_LATENCY = 4;
const PREFIX_TICK_MS = [27, 27]; // "Your" / "AI"
const INTER_WORD_PAUSE_MS = 65;
const SENTENCE_HOLD_MS = 500;
const WIPE_TICK_MS = 22;
const WIPE_TRAIL = 3;
const WIPE_PAUSE_MS = 80;

// ---------------------------------------------------------------------------
// Banner intro — 3-phase reveal (sequential)
// ---------------------------------------------------------------------------

async function playBannerIntro(rainbowArt: string[], whiteArt: string[]): Promise<void> {
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const up = (n: number) => outb(`\x1b[${n}F`);

  // Phase 1A — CRT scan top→bottom, banner builds in white
  printFrame(ART_LINES.map(dimLine), blankTagline());

  for (let scan = 0; scan < ART_LINES.length; scan++) {
    await delay(55);
    up(BANNER_LINE_COUNT);
    printFrame(
      ART_LINES.map((l, i) => {
        if (i < scan - 2) return whiteLine(l);
        if (i === scan - 2) return whiteGlowLine(l, 200);
        if (i === scan - 1) return whiteGlowLine(l, 230);
        if (i === scan) return scanLineCh(l);
        return dimLine(l);
      }),
      blankTagline(),
    );
  }

  await delay(40);
  up(BANNER_LINE_COUNT);
  printFrame(whiteArt, blankTagline());

  // Hold pure white (CRT settle) — 600ms
  await delay(600);

  // Phase 1B — rainbow flows diagonally bottom-left → top-right
  let minD = 0;
  let maxD = 0;
  for (let row = 0; row < ART_LINES.length; row++) {
    minD = Math.min(minD, -row * 3);
    maxD = Math.max(maxD, ART_LINES[row]!.length - 1 - row * 3);
  }

  function flowFrame(frontD: number): string[] {
    return ART_LINES.map((line, row) =>
      line
        .split('')
        .map((ch, col) => {
          if (ch === ' ') return ch;
          const d = col - 3 * row;
          if (d <= frontD) {
            const hue = (((col * HUE_PER_CHAR - row * HUE_PER_ROW) % 360) + 360) % 360;
            const [r, g, b] = hsvToRgb(hue);
            return rgb(r, g, b, ch);
          }
          return `\x1b[1;97m${ch}\x1b[0m`;
        })
        .join(''),
    );
  }

  for (let d = minD; d <= maxD; d++) {
    await delay(9);
    up(BANNER_LINE_COUNT);
    printFrame(flowFrame(d), blankTagline());
  }
  up(BANNER_LINE_COUNT);
  printFrame(rainbowArt, blankTagline());
  await delay(180);

  // Phase 1C — white shimmer sweeps the same diagonal direction over rainbow
  function shimmerArtFrame(highlight: number): string[] {
    return ART_LINES.map((line, row) =>
      line
        .split('')
        .map((ch, col) => {
          if (ch === ' ') return ch;
          const d = col - 3 * row;
          if (Math.abs(d - highlight) <= 1) return `\x1b[1;97m${ch}\x1b[0m`;
          const hue = (((col * HUE_PER_CHAR - row * HUE_PER_ROW) % 360) + 360) % 360;
          const [r, g, b] = hsvToRgb(hue);
          return rgb(r, g, b, ch);
        })
        .join(''),
    );
  }
  for (let d = minD; d <= maxD; d++) {
    await delay(9);
    up(BANNER_LINE_COUNT);
    printFrame(shimmerArtFrame(d), blankTagline());
  }
  up(BANNER_LINE_COUNT);
  printFrame(rainbowArt, blankTagline());
  await delay(80);
}

// ---------------------------------------------------------------------------
// Tagline phase — 3 rotating sentences via wipe swap, then lock shimmer
// ---------------------------------------------------------------------------

async function decodeFirstSentence(rainbowArt: string[], s: Sentence): Promise<void> {
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const up = (n: number) => outb(`\x1b[${n}F`);

  const prefixWords = ['Your', 'AI'];
  for (let wi = 0; wi < prefixWords.length; wi++) {
    const w = prefixWords[wi]!;
    const tickMs = PREFIX_TICK_MS[wi]!;
    const totalTicks = w.length + LOCK_LATENCY;
    const baseIdx = prefixWords.slice(0, wi).reduce((a, x) => a + x.length + 1, 0);

    for (let t = 1; t <= totalTicks; t++) {
      await delay(tickMs);
      up(BANNER_LINE_COUNT);
      let prefixPart = TAGLINE_LEAD;
      for (let i = 0; i < PREFIX.length; i++) {
        if (i < baseIdx) {
          prefixPart += PREFIX[i] === ' ' ? ' ' : rgbStr(PREFIX_COLOR, PREFIX[i]!);
        } else if (i >= baseIdx + w.length) {
          prefixPart += ' ';
        } else {
          const localIdx = i - baseIdx;
          const age = t - localIdx;
          if (age > LOCK_LATENCY) prefixPart += rgbStr(PREFIX_COLOR, PREFIX[i]!);
          else if (age > 0) prefixPart += glitchWhite(randGlyph());
          else if (age === 0 && t < w.length) prefixPart += CURSOR;
          else prefixPart += ' ';
        }
      }
      const trailingBlank = ' '.repeat(s.trailing.length);
      printFrame(rainbowArt, `${prefixPart}${trailingBlank}\x1b[K`);
    }
    if (wi < prefixWords.length - 1) {
      await delay(INTER_WORD_PAUSE_MS);
    }
  }

  await delay(INTER_WORD_PAUSE_MS);
  await decodeTrailing(rainbowArt, s, PREFIX.length);
}

async function decodeTrailing(
  rainbowArt: string[],
  s: Sentence,
  lockedPrefixChars: number,
): Promise<void> {
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const up = (n: number) => outb(`\x1b[${n}F`);

  const words = s.trailingWords;
  const ticks = s.wordTicks;
  const offsets: number[] = [];
  let off = 0;
  for (const w of words) {
    offsets.push(off);
    off += w.length + 1;
  }

  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi]!;
    const tickMs = ticks[wi]!;
    const totalTicks = w.length + LOCK_LATENCY;

    for (let t = 1; t <= totalTicks; t++) {
      await delay(tickMs);
      up(BANNER_LINE_COUNT);
      let trailing = '';
      for (let j = 0; j < s.trailing.length; j++) {
        const ch = s.trailing[j]!;
        if (ch === ' ') {
          trailing += ' ';
          continue;
        }
        let owningWi = -1;
        let localIdx = -1;
        for (let k = 0; k < words.length; k++) {
          const start = offsets[k]!;
          const end = start + words[k]!.length;
          if (j >= start && j < end) {
            owningWi = k;
            localIdx = j - start;
            break;
          }
        }
        if (owningWi < wi) {
          trailing += rgbStr(TRAILING_COLOR, ch);
        } else if (owningWi > wi) {
          trailing += ' ';
        } else {
          const age = t - localIdx;
          if (age > LOCK_LATENCY) trailing += rgbStr(TRAILING_COLOR, ch);
          else if (age > 0) trailing += glitchWhite(randGlyph());
          else if (age === 0 && t < w.length) trailing += CURSOR;
          else trailing += ' ';
        }
      }
      printFrame(rainbowArt, buildTaglineLine(lockedPrefixChars, trailing));
    }
    if (wi < words.length - 1) {
      await delay(INTER_WORD_PAUSE_MS);
    }
  }
}

async function wipeSwapTransition(
  rainbowArt: string[],
  from: Sentence,
  to: Sentence,
): Promise<void> {
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const up = (n: number) => outb(`\x1b[${n}F`);

  // Phase A: bright cyan scanner R→L erases the trailing
  for (let pos = from.trailing.length - 1; pos >= -WIPE_TRAIL; pos--) {
    await delay(WIPE_TICK_MS);
    up(BANNER_LINE_COUNT);
    let trailing = '';
    for (let j = 0; j < from.trailing.length; j++) {
      const ch = from.trailing[j]!;
      if (ch === ' ') {
        trailing += ' ';
        continue;
      }
      const offset = j - pos;
      if (offset >= 0 && offset <= WIPE_TRAIL) {
        trailing += rgb(140, 255, 255, randGlyph());
      } else if (j > pos) {
        trailing += ' ';
      } else {
        trailing += rgbStr(TRAILING_COLOR, ch);
      }
    }
    printFrame(rainbowArt, buildTaglineLine(PREFIX.length, trailing));
  }
  await delay(WIPE_PAUSE_MS);

  // Phase B: type+glitch decode of the new trailing
  await decodeTrailing(rainbowArt, to, PREFIX.length);
}

async function lockShimmer(rainbowArt: string[], s: Sentence): Promise<void> {
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const up = (n: number) => outb(`\x1b[${n}F`);

  const SHIMMER_TICK_MS = 22;
  const TRAIL = 3;
  const STOPS: Rgb[] = [
    [255, 255, 255], // head — pure white
    [200, 245, 255], // mid — ice
    [150, 235, 255], // tail — bright cyan
  ];
  const fullText = PREFIX + s.trailing;
  const N = fullText.length;

  for (let pos = 0; pos <= N + TRAIL; pos++) {
    await delay(SHIMMER_TICK_MS);
    up(BANNER_LINE_COUNT);
    let line = TAGLINE_LEAD;
    for (let j = 0; j < N; j++) {
      const ch = fullText[j]!;
      if (ch === ' ') {
        line += ' ';
        continue;
      }
      const offset = pos - j;
      if (offset >= 0 && offset < TRAIL) {
        line += rgbStr(STOPS[offset]!, ch);
      } else if (offset >= TRAIL) {
        // Behind head — every char settles to neon cyan
        line += rgbStr(FINAL_COLOR, ch);
      } else {
        // Ahead of head — original locked color
        const baseColor = j < PREFIX.length ? PREFIX_COLOR : TRAILING_COLOR;
        line += rgbStr(baseColor, ch);
      }
    }
    line += '\x1b[K';
    printFrame(rainbowArt, line);
  }

  // Final settle — entire tagline neon cyan
  up(BANNER_LINE_COUNT);
  let finalLine = TAGLINE_LEAD;
  for (let j = 0; j < N; j++) {
    const ch = fullText[j]!;
    finalLine += ch === ' ' ? ' ' : rgbStr(FINAL_COLOR, ch);
  }
  finalLine += '\x1b[K';
  printFrame(rainbowArt, finalLine);
  await delay(150);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function printBanner(): Promise<void> {
  if (!process.stdout.isTTY) return;

  if (!supportsRgb()) {
    // No true color — static fallback. Use the final sentence (signature
    // tagline) so non-truecolor terminals still see the brand line.
    outb('\n');
    for (const l of ART_LINES) outb(`${pc.bold(pc.cyan(l))}\n`);
    outb('\n');
    outb(`${TAGLINE_LEAD}${pc.bold(pc.cyan(TAGLINE_FALLBACK))}\n`);
    outb('\n');
    return;
  }

  const rainbowArt = ART_LINES.map((l, i) => neonLine(l, i));
  const whiteArt = ART_LINES.map((l) => whiteLine(l));

  outb('\x1b[?25l');
  try {
    await playBannerIntro(rainbowArt, whiteArt);

    // Tagline rotation
    await decodeFirstSentence(rainbowArt, SENTENCES[0]!);
    await new Promise<void>((r) => setTimeout(r, SENTENCE_HOLD_MS));

    await wipeSwapTransition(rainbowArt, SENTENCES[0]!, SENTENCES[1]!);
    await new Promise<void>((r) => setTimeout(r, SENTENCE_HOLD_MS));

    await wipeSwapTransition(rainbowArt, SENTENCES[1]!, SENTENCES[2]!);
    await new Promise<void>((r) => setTimeout(r, SENTENCE_HOLD_MS));

    await lockShimmer(rainbowArt, SENTENCES[2]!);
  } finally {
    outb('\x1b[?25h');
  }
}
