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

export function printBanner(): void {
  if (!process.stdout.isTTY) return;
  const c = (s: string) => pc.bold(pc.cyan(s));
  const line = pc.cyan(`◆${'─'.repeat(26)}◆`);
  process.stdout.write('\n');
  process.stdout.write(`  ${line}\n`);
  process.stdout.write(`    ${c('┌─┐┌┐╷┌─╴┌┐ ┌─┐┌─┐╷┌┐╷')}\n`);
  process.stdout.write(`    ${c('│ ││└┤├╴ ├┴┐├┬┘├─┤││└┤')}\n`);
  process.stdout.write(`    ${c('└─┘╵ ╵└─╴└─┘╵└╴╵ ╵╵╵ ╵')}\n`);
  process.stdout.write(`  ${line}\n`);
  process.stdout.write(`\n    ${pc.dim('Your AI Thinking Partner')}\n\n`);
}
