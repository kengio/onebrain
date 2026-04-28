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

// ── Output helpers ─────────────────────────────────────────────────────────────

export function writeLine(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

export function barLine(msg: string): void {
  process.stdout.write(`${bar}  ${msg}\n`);
}

export function barBlank(): void {
  process.stdout.write(`${bar}\n`);
}

export function close(msg: string, isError = false, isWarning = false): void {
  if (isError) {
    process.stdout.write(`${pc.cyan('└')}  ${pc.bold(pc.red(msg))}\n`);
  } else if (isWarning) {
    process.stdout.write(`${pc.cyan('└')}  ${pc.yellow(msg)}\n`);
  } else {
    process.stdout.write(`${pc.cyan('└')}  ${msg}\n`);
  }
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
    process.stdout.write(`${pc.green(frames[0]!)}  ${emoji}  ${label}…\n`);
    const timer = setInterval(() => {
      i = (i + 1) % frames.length;
      process.stdout.write(`\x1b[1A\x1b[2K${pc.green(frames[i]!)}  ${emoji}  ${label}…\n`);
    }, 80);
    return {
      stop(result?: string, details?: string[]) {
        clearInterval(timer);
        process.stdout.write('\x1b[1A\x1b[2K');
        process.stdout.write(`${dot}  ${emoji}  ${label}\n`);
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
  process.stdout.write(`${pc.cyan('◆')}  ${question}\n`);
  process.stdout.write('\x1b[?25l');

  function renderOptions(yes: boolean): void {
    const yesLabel = yes ? `${pc.bold(pc.green('●'))} Yes` : `${pc.dim('○')} Yes`;
    const noLabel = yes ? `${pc.dim('○')} No` : `${pc.bold(pc.green('●'))} No`;
    process.stdout.write(`\x1b[2K${bar}  ${yesLabel}  /  ${noLabel}\r`);
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

  process.stdout.write('\n');
  process.stdout.write('\x1b[?25h');
  process.stdout.write('\x1b[1A\x1b[2K');
  return answer;
}
