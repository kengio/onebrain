/**
 * Shared CLI UI primitives used by init, update, and doctor commands.
 *
 * Layout language (clack-inspired):
 *   │  message          ← barLine / barBlank
 *   ●  emoji  label     ← createStep (done state)
 *   └  message          ← close
 */

import pc from 'picocolors';

// ── Constants ──────────────────────────────────────────────────────────────────

export const bar = pc.cyan('│');
export const dot = pc.green('●');

// Force UTF-8 bytes. Bun's TTY write path encodes strings with system locale;
// writing Buffer bypasses that and always produces correct UTF-8 output.
function out(str: string): void {
  process.stdout.write(Buffer.from(str, 'utf8'));
}

// ── Output helpers ─────────────────────────────────────────────────────────────

export function writeLine(msg: string): void {
  out(`${msg}\n`);
}

export function barLine(msg: string): void {
  out(`${bar}  ${msg}\n`);
}

export function barBlank(): void {
  out(`${bar}\n`);
}

export function close(msg: string, isError = false, isWarning = false): void {
  if (isError) {
    out(`${pc.cyan('└')}  ${pc.bold(pc.red(msg))}\n`);
  } else if (isWarning) {
    out(`${pc.cyan('└')}  ${pc.yellow(msg)}\n`);
  } else {
    out(`${pc.cyan('└')}  ${msg}\n`);
  }
}

/** Output a completed-step dot line without a preceding spinner. */
export function dotLine(emoji: string, label: string): void {
  out(`${dot}  ${emoji}  ${label}\n`);
}

// ── Spinner step ───────────────────────────────────────────────────────────────

/**
 * Returns a createStep factory bound to the given isTTY flag.
 * Usage:
 *   const createStep = makeStepFn(isTTY);
 *   const sp = createStep('📋', 'vault.yml');
 *   // ... async work ...
 *   sp?.stop('valid', ['key: value']);
 */
export function makeStepFn(isTTY: boolean) {
  return function createStep(emoji: string, label: string) {
    if (!isTTY) return null;
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    out(`${pc.green(frames[0]!)}  ${emoji}  ${label}…\n`);
    const timer = setInterval(() => {
      i = (i + 1) % frames.length;
      out(`\x1b[1A\x1b[2K${pc.green(frames[i]!)}  ${emoji}  ${label}…\n`);
    }, 80);
    return {
      stop(result?: string, details?: string[]) {
        clearInterval(timer);
        process.stdout.write(Buffer.from('\x1b[1A\x1b[2K', 'utf8'));
        out(`${dot}  ${emoji}  ${label}\n`);
        if (result !== undefined) barLine(result);
        if (details) for (const d of details) barLine(`  · ${d}`);
        barBlank();
      },
    };
  };
}

// ── Yes / No prompt ────────────────────────────────────────────────────────────

/**
 * Renders a toggleable Yes/No prompt without clack's gray separator line.
 * Arrow keys / Tab toggle the selection; Enter confirms; y/n shortcut; Ctrl+C → null.
 * Returns true (Yes), false (No), or null (cancelled).
 */
export async function askYesNo(question: string): Promise<boolean | null> {
  out(`${pc.cyan('◆')}  ${question}\n`);
  process.stdout.write(Buffer.from('\x1b[?25l', 'utf8'));

  function renderOptions(yes: boolean): void {
    const yesLabel = yes ? `${pc.bold(pc.green('●'))} Yes` : `${pc.dim('○')} Yes`;
    const noLabel = yes ? `${pc.dim('○')} No` : `${pc.bold(pc.green('●'))} No`;
    out(`\x1b[2K${bar}  ${yesLabel}  /  ${noLabel}\r`);
  }

  const answer = await new Promise<boolean | null>((resolve) => {
    let selected = true;
    renderOptions(selected);
    const { stdin } = process;
    const wasRaw = stdin.isTTY ? stdin.isRaw : false;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    function onData(buf: Buffer): void {
      const key = buf.toString();
      if (key === '\x03') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.pause();
        resolve(null);
      } else if (key === '\r' || key === '\n') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.pause();
        resolve(selected);
      } else if (key === 'y' || key === 'Y') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.pause();
        resolve(true);
      } else if (key === 'n' || key === 'N') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.pause();
        resolve(false);
      } else if (key === '\x1b[C' || key === '\x1b[D' || key === '\t') {
        selected = !selected;
        renderOptions(selected);
      }
    }
    stdin.on('data', onData);
  });

  process.stdout.write(Buffer.from('\n\x1b[?25h\x1b[1A\x1b[2K', 'utf8'));
  return answer;
}
