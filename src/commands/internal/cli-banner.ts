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
// Banner data — branching-tree brain icon (left) + upright ANSI Shadow block
// "OneBrain" wordmark (right).
//
// Layout:
//   border:    lead 2 + ◆ + 78 ─ + ◆       (total 82 cols)
//   inner:     lead 3 + brain(9) + gap(2) + wordmark(64) = 78 visible cols
//   tagline:   lead 14 + 24 chars          (anchored under wordmark's first col)
//   subtitle:  lead 14 + 45 chars
//
// Brain icon (5 rows × 9 cols, all 1-col Unicode) — branching-tree neural
// network: 3 nodes top, 5 nodes middle (widest, with two outlying side
// nodes), 3 nodes bottom. Reads as an asymmetric "tree of thought." Brain
// is the only animated region; gradient flow + shimmer + neural-pulse all
// paint inside its bounding box only.
//
// Wordmark — hand-laid ANSI Shadow block letters, rendered upright in solid
// white (matches the website logo's white-on-dark wordmark) — never
// animated, never gradient.
//
// Borders (top/bottom `◆──◆` lines) are static brand cyan — a quiet accent
// that frames the white wordmark + animated brain.
//
// Tagline lead = 14 spaces (lead 3 + brain 9 + gap 2) anchors the prefix
// "YOUR AI" directly under the wordmark's first column.
// ---------------------------------------------------------------------------

const ART_LINES = [
  `  ◆${'─'.repeat(78)}◆`,
  '     ●━●━●     ██████╗ ███╗   ██╗███████╗██████╗ ██████╗  █████╗ ██╗███╗   ██╗',
  '    ╱│╲ │ ╲   ██╔═══██╗████╗  ██║██╔════╝██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║',
  '   ● ●━●━● ●  ██║   ██║██╔██╗ ██║█████╗  ██████╔╝██████╔╝███████║██║██╔██╗ ██║',
  '    ╲│╱ │ ╱   ██║   ██║██║╚██╗██║██╔══╝  ██╔══██╗██╔══██╗██╔══██║██║██║╚██╗██║',
  '     ●━●━●    ╚██████╔╝██║ ╚████║███████╗██████╔╝██║  ██║██║  ██║██║██║ ╚████║',
  '               ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝',
  `  ◆${'─'.repeat(78)}◆`,
];

const PREFIX = 'YOUR AI ';
const TAGLINE_LEAD = '              '; // 14 spaces — anchors under wordmark column
export const TAGLINE_FALLBACK = `${PREFIX}THINKING PARTNER`;
export const SUBTITLE = 'A unified intelligence in your Obsidian vault';
const BANNER_LINE_COUNT = 1 + ART_LINES.length + 3;

type Rgb = [number, number, number];

interface Sentence {
  trailing: string;
  trailingWords: string[];
  /** Per-word ms/char tick rate (length matches trailingWords) */
  wordTicks: number[];
}

// Color scheme — aligned with website CI brand palette:
//   "YOUR AI" prefix   → brand cyan #00f3ff throughout
//   trailing 2 words   → brand magenta #ff2d92 during all sentences
//   final lock shimmer → sweeps full tagline; behind the head, every char
//                        settles to brand cyan (magenta "burns out" to cyan)
//   subtitle           → brand cyan dimmed along its own hue axis, reads as
//                        a secondary descriptive layer while staying inside
//                        the cyan family per the brand-CI memory.
//
// PREFIX/TRAILING/FINAL colors and TAGLINE_FALLBACK/SUBTITLE are exported
// only for the colocated test suite — not part of the public CLI API.
export const PREFIX_COLOR: Rgb = [0, 243, 255]; // #00f3ff brand cyan
export const TRAILING_COLOR: Rgb = [255, 45, 146]; // #ff2d92 brand magenta
export const FINAL_COLOR: Rgb = [0, 243, 255]; // #00f3ff brand cyan
const SUBTITLE_COLOR: Rgb = [0, 170, 178]; // brand cyan ~70% — same hue, lower intensity

const SENTENCES: Sentence[] = [
  { trailing: 'REMEMBERS YOU', trailingWords: ['REMEMBERS', 'YOU'], wordTicks: [24, 32] },
  { trailing: 'CATCHES INSIGHTS', trailingWords: ['CATCHES', 'INSIGHTS'], wordTicks: [27, 26] },
  { trailing: 'THINKING PARTNER', trailingWords: ['THINKING', 'PARTNER'], wordTicks: [26, 31] },
];

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function supportsRgb(): boolean {
  // FORCE_COLOR=3 is the npm-CLI convention for "force 24-bit color" — honor
  // it so users on environments that under-report truecolor (Git Bash MinTTY,
  // some CI runners) can opt into the brand-gradient render.
  if (process.env['FORCE_COLOR'] === '3') return true;
  const c = process.env['COLORTERM'] ?? '';
  return c === 'truecolor' || c === '24bit';
}

// Treat stdout as interactive when (a) it is a real TTY, or (b) the user has
// explicitly opted in via env var. Issue #131: bun-compiled binaries on
// Windows misdetect Git Bash MinTTY pipes as non-TTY; FORCE_COLOR=3 or
// ONEBRAIN_FORCE_TTY=1 lets those users still get the animated banner.
// Exported for the colocated test suite — not part of the public CLI API.
export function isInteractiveStdout(): boolean {
  if (process.env['ONEBRAIN_FORCE_TTY'] === '1') return true;
  if (process.env['FORCE_COLOR'] === '3') return true;
  return Boolean(process.stdout.isTTY);
}

function rgb(r: number, g: number, b: number, ch: string): string {
  return `\x1b[1;38;2;${r};${g};${b}m${ch}\x1b[0m`;
}
function rgbStr(c: Rgb, ch: string): string {
  return rgb(c[0], c[1], c[2], ch);
}

// Brand gradient — 3-stop magenta → mid pink → cyan, mirrors the diagonal
// gradient on the brain SVG (top-left magenta, bottom-right cyan). Replaces
// the old full-hue rainbow so every banner frame stays inside the OneBrain
// brand palette across the whole CLI surface.
const BRAND_STOPS: Array<{ t: number; rgb: Rgb }> = [
  { t: 0, rgb: [255, 45, 146] }, // #ff2d92 brand magenta
  { t: 0.55, rgb: [255, 90, 163] }, // #ff5aa3 mid pink (matches SVG mid-stop)
  { t: 1, rgb: [0, 243, 255] }, // #00f3ff brand cyan
];

function brandGradient(t: number): Rgb {
  const tt = Math.max(0, Math.min(1, t));
  for (let i = 0; i < BRAND_STOPS.length - 1; i++) {
    const a = BRAND_STOPS[i]!;
    const b = BRAND_STOPS[i + 1]!;
    if (tt <= b.t) {
      const local = (tt - a.t) / (b.t - a.t);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * local),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * local),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * local),
      ];
    }
  }
  return BRAND_STOPS[BRAND_STOPS.length - 1]!.rgb;
}

// Diagonal `d = col - 3 * row` is the only axis the gradient varies along.
// `[DIAG_MIN, DIAG_MAX]` is derived once from `ART_LINES` so the color map
// (this file) and the animation iteration loops in `playBannerIntro` always
// agree on the banner extent — single source of truth.
const [DIAG_MIN, DIAG_MAX] = ((): [number, number] => {
  let min = 0;
  let max = 0;
  for (let row = 0; row < ART_LINES.length; row++) {
    min = Math.min(min, -row * 3);
    max = Math.max(max, ART_LINES[row]!.length - 1 - row * 3);
  }
  return [min, max];
})();
const DIAG_RANGE = DIAG_MAX - DIAG_MIN;

// Brain icon occupies cols 3..11 in art rows 1..5 (lead 3 + 9-col brain
// bounding box; individual rows render only 5–9 chars and the predicate
// safely covers spaces, which the renderer skips anyway). The brand SVG
// paints the brain with the *full* magenta→cyan gradient across its
// bounding box, so we remap the brain's local diagonal range to t ∈ [0,1]
// independently of the global banner gradient. Without this, the brain
// icon — which sits in the magenta half of the global diagonal — would
// render solid pink, losing the canonical magenta→cyan sweep that defines
// the brand mark.
const BRAIN_ROW_MIN = 1;
const BRAIN_ROW_MAX = 5;
const BRAIN_COL_MIN = 3;
const BRAIN_COL_MAX = 11;
const BRAIN_DIAG_MIN = BRAIN_COL_MIN - 3 * BRAIN_ROW_MAX;
const BRAIN_DIAG_MAX = BRAIN_COL_MAX - 3 * BRAIN_ROW_MIN;
const BRAIN_DIAG_RANGE = BRAIN_DIAG_MAX - BRAIN_DIAG_MIN;

function inBrainCell(row: number, col: number): boolean {
  return (
    row >= BRAIN_ROW_MIN && row <= BRAIN_ROW_MAX && col >= BRAIN_COL_MIN && col <= BRAIN_COL_MAX
  );
}

function gradientForCell(row: number, col: number): Rgb {
  const d = col - 3 * row;
  const t = inBrainCell(row, col)
    ? (d - BRAIN_DIAG_MIN) / BRAIN_DIAG_RANGE
    : (d - DIAG_MIN) / DIAG_RANGE;
  return brandGradient(t);
}

// Per-cell role: only the brain icon animates and carries the brand gradient.
// The wordmark stays solid white to match the website logo (white wordmark on
// dark theme); the top/bottom border lines render as a static brand-cyan
// accent. This split keeps the visual focus on the brain — the moving part —
// and prevents the slant wordmark from competing for attention.
function isBorderRow(row: number): boolean {
  return row === 0 || row === ART_LINES.length - 1;
}

const WHITE_SGR = '\x1b[1;97m';
const SGR_RESET = '\x1b[0m';

function whiteCell(ch: string): string {
  return `${WHITE_SGR}${ch}${SGR_RESET}`;
}

// Color a non-brain cell — borders go brand cyan, wordmark stays solid white.
function staticCellColor(row: number, ch: string): string {
  if (isBorderRow(row)) return rgbStr(PREFIX_COLOR, ch);
  return whiteCell(ch);
}

function neonLine(line: string, lineIndex = 0): string {
  return line
    .split('')
    .map((ch, col) => {
      if (ch === ' ') return ch;
      if (inBrainCell(lineIndex, col)) {
        const [r, g, b] = gradientForCell(lineIndex, col);
        return rgb(r, g, b, ch);
      }
      return staticCellColor(lineIndex, ch);
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

function renderSubtitle(): string {
  // Faint (SGR 2) + custom RGB — secondary descriptive layer, intentionally
  // less prominent than the bold brand tagline above it.
  const [r, g, b] = SUBTITLE_COLOR;
  return `\x1b[2;38;2;${r};${g};${b}m${SUBTITLE}\x1b[0m`;
}

function dimLine(line: string): string {
  // Cyan-leaning dim — the unbuilt CRT-scan pre-state stays inside the brand
  // hue family rather than reading as neutral terminal grey.
  return line
    .split('')
    .map((ch) => (ch === ' ' ? ch : `\x1b[2;38;2;30;60;70m${ch}\x1b[0m`))
    .join('');
}

function scanLineCh(line: string): string {
  return line
    .split('')
    .map((ch) => (ch === ' ' ? ch : rgb(140, 255, 255, ch)))
    .join('');
}

// Cursor + wipe scanner share a bright cyan accent that stays close to the
// brand cyan #00f3ff but reads with more presence on dark backgrounds.
const SCAN_CYAN: Rgb = [140, 255, 255];
const CURSOR = rgb(SCAN_CYAN[0], SCAN_CYAN[1], SCAN_CYAN[2], '▌');
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

async function playBannerIntro(brandArt: string[], whiteArt: string[]): Promise<void> {
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

  // Phase 1B — brand gradient (magenta → cyan) flows diagonally across the
  // brain icon, mirroring the SVG brain logo's gradient direction. The
  // wordmark stays solid white and the borders settle to brand cyan during
  // this phase — only the brain animates so the moving piece reads cleanly
  // against a static brand-themed frame. As the gradient front crosses
  // brain cells, flash white for a few diagonal positions to read as a
  // "neural firing" pulse — small distinctive brand signature.
  const PULSE_TRAIL = 3;

  function flowFrame(frontD: number): string[] {
    return ART_LINES.map((line, row) =>
      line
        .split('')
        .map((ch, col) => {
          if (ch === ' ') return ch;
          if (!inBrainCell(row, col)) return staticCellColor(row, ch);
          const d = col - 3 * row;
          if (d <= frontD) {
            const ageBehindFront = frontD - d;
            if (ageBehindFront <= PULSE_TRAIL) return whiteCell(ch);
            const [r, g, b] = gradientForCell(row, col);
            return rgb(r, g, b, ch);
          }
          return whiteCell(ch);
        })
        .join(''),
    );
  }

  for (let d = DIAG_MIN; d <= DIAG_MAX; d++) {
    await delay(9);
    up(BANNER_LINE_COUNT);
    printFrame(flowFrame(d), blankTagline());
  }
  up(BANNER_LINE_COUNT);
  printFrame(brandArt, blankTagline());
  await delay(180);

  // Phase 1C — white shimmer sweeps the same diagonal direction over the
  // brain only; wordmark + border cells stay in their static colors.
  function shimmerArtFrame(highlight: number): string[] {
    return ART_LINES.map((line, row) =>
      line
        .split('')
        .map((ch, col) => {
          if (ch === ' ') return ch;
          if (!inBrainCell(row, col)) return staticCellColor(row, ch);
          const d = col - 3 * row;
          if (Math.abs(d - highlight) <= 1) return whiteCell(ch);
          const [r, g, b] = gradientForCell(row, col);
          return rgb(r, g, b, ch);
        })
        .join(''),
    );
  }
  for (let d = DIAG_MIN; d <= DIAG_MAX; d++) {
    await delay(9);
    up(BANNER_LINE_COUNT);
    printFrame(shimmerArtFrame(d), blankTagline());
  }
  up(BANNER_LINE_COUNT);
  printFrame(brandArt, blankTagline());
  await delay(80);
}

// ---------------------------------------------------------------------------
// Tagline phase — 3 rotating sentences via wipe swap, then lock shimmer
// ---------------------------------------------------------------------------

async function decodeFirstSentence(brandArt: string[], s: Sentence): Promise<void> {
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const up = (n: number) => outb(`\x1b[${n}F`);

  const prefixWords = ['YOUR', 'AI'];
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
      printFrame(brandArt, `${prefixPart}${trailingBlank}\x1b[K`);
    }
    if (wi < prefixWords.length - 1) {
      await delay(INTER_WORD_PAUSE_MS);
    }
  }

  await delay(INTER_WORD_PAUSE_MS);
  await decodeTrailing(brandArt, s, PREFIX.length);
}

async function decodeTrailing(
  brandArt: string[],
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
      printFrame(brandArt, buildTaglineLine(lockedPrefixChars, trailing));
    }
    if (wi < words.length - 1) {
      await delay(INTER_WORD_PAUSE_MS);
    }
  }
}

async function wipeSwapTransition(brandArt: string[], from: Sentence, to: Sentence): Promise<void> {
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
    printFrame(brandArt, buildTaglineLine(PREFIX.length, trailing));
  }
  await delay(WIPE_PAUSE_MS);

  // Phase B: type+glitch decode of the new trailing
  await decodeTrailing(brandArt, to, PREFIX.length);
}

async function lockShimmer(brandArt: string[], s: Sentence): Promise<void> {
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const up = (n: number) => outb(`\x1b[${n}F`);

  const SHIMMER_TICK_MS = 22;
  const TRAIL = 3;
  // Brand-aligned shimmer trail: white head → pale cyan → brand cyan tail
  // (matches FINAL_COLOR), so the wave settles cleanly into the brand palette.
  const STOPS: Rgb[] = [
    [255, 255, 255], // head — pure white flash
    [180, 220, 255], // mid — pale cyan
    [0, 243, 255], // tail — brand cyan #00f3ff
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
    printFrame(brandArt, line);
  }

  // Final settle — entire tagline neon cyan + subtitle layer. Replaces the
  // final printFrame so we can append the subtitle line. This block writes
  // `BANNER_LINE_COUNT + 1` lines (one extra for the subtitle); the on-screen
  // banner footprint after `printBanner()` returns is therefore one line
  // taller than `BANNER_LINE_COUNT` reports. Callers must NOT use
  // BANNER_LINE_COUNT to rewind past `printBanner()`'s output — it describes
  // a single animation frame, not the final on-screen height.
  up(BANNER_LINE_COUNT);
  let finalLine = TAGLINE_LEAD;
  for (let j = 0; j < N; j++) {
    const ch = fullText[j]!;
    finalLine += ch === ' ' ? ' ' : rgbStr(FINAL_COLOR, ch);
  }
  finalLine += '\x1b[K';
  const subtitleLine = `${TAGLINE_LEAD}${renderSubtitle()}\x1b[K`;
  outb('\n');
  for (const l of brandArt) outb(`${l}\n`);
  outb('\n');
  outb(`${finalLine}\n`);
  outb(`${subtitleLine}\n`);
  outb('\n');
  await delay(150);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// Render a static, non-animated banner — used when stdout is not an
// interactive TTY (piped, redirected, CI logs) OR when the terminal does not
// support 24-bit color. With truecolor we paint each cell using the same
// brand gradient as the animated path; without truecolor we fall back to
// `pc.cyan` so 16-color terminals still see a brand-aligned monochrome line.
function printStaticBanner(): void {
  const truecolor = supportsRgb();
  outb('\n');
  if (truecolor) {
    for (let i = 0; i < ART_LINES.length; i++) outb(`${neonLine(ART_LINES[i]!, i)}\n`);
  } else {
    for (const l of ART_LINES) outb(`${pc.bold(pc.cyan(l))}\n`);
  }
  outb('\n');
  if (truecolor) {
    // Tagline is a single solid block (one ANSI wrap around the whole string)
    // since all chars share FINAL_COLOR. Per-char wrapping is reserved for the
    // animated path where each cell can have a different color.
    outb(`${TAGLINE_LEAD}${rgbStr(FINAL_COLOR, TAGLINE_FALLBACK)}\n`);
    outb(`${TAGLINE_LEAD}${renderSubtitle()}\n`);
  } else {
    outb(`${TAGLINE_LEAD}${pc.bold(pc.cyan(TAGLINE_FALLBACK))}\n`);
    outb(`${TAGLINE_LEAD}${pc.dim(pc.cyan(SUBTITLE))}\n`);
  }
  outb('\n');
}

export async function printBanner(): Promise<void> {
  // Animation requires both an interactive TTY (cursor positioning works) and
  // 24-bit color (for the brand gradient). Anything else gets the static
  // banner — still brand-colored when truecolor is available.
  if (!isInteractiveStdout() || !supportsRgb()) {
    printStaticBanner();
    return;
  }

  const brandArt = ART_LINES.map((l, i) => neonLine(l, i));
  const whiteArt = ART_LINES.map((l) => whiteLine(l));

  try {
    // Hide system cursor inside the try block so the finally always restores it.
    outb('\x1b[?25l');
    await playBannerIntro(brandArt, whiteArt);

    // Tagline rotation
    await decodeFirstSentence(brandArt, SENTENCES[0]!);
    await new Promise<void>((r) => setTimeout(r, SENTENCE_HOLD_MS));

    await wipeSwapTransition(brandArt, SENTENCES[0]!, SENTENCES[1]!);
    await new Promise<void>((r) => setTimeout(r, SENTENCE_HOLD_MS));

    await wipeSwapTransition(brandArt, SENTENCES[1]!, SENTENCES[2]!);
    await new Promise<void>((r) => setTimeout(r, SENTENCE_HOLD_MS));

    await lockShimmer(brandArt, SENTENCES[2]!);
  } finally {
    outb('\x1b[?25h');
  }
}
