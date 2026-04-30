// Runs under Node.js during `npm install -g` or `bun install -g`.
// No Bun APIs — must work on systems without Bun installed.

import { chmod, createWriteStream, existsSync, rename, unlink } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Platform map ─────────────────────────────────────────────────────────────

const PLATFORM_MAP: Record<string, string> = {
  'darwin-arm64': 'onebrain-darwin-arm64',
  'darwin-x64': 'onebrain-darwin-x64',
  'linux-arm64': 'onebrain-linux-arm64',
  'linux-x64': 'onebrain-linux-x64',
  'linux-arm64-musl': 'onebrain-linux-arm64-musl',
  'linux-x64-musl': 'onebrain-linux-x64-musl',
  'win32-x64': 'onebrain-windows-x64.exe',
};

export function getBinaryName(platform: string, arch: string, musl = false): string | null {
  const key = musl ? `${platform}-${arch}-musl` : `${platform}-${arch}`;
  return PLATFORM_MAP[key] ?? null;
}

function detectMusl(): boolean {
  if (process.platform !== 'linux') return false;
  return (
    existsSync('/lib/libc.musl-x86_64.so.1') ||
    existsSync('/lib/libc.musl-aarch64.so.1') ||
    existsSync('/lib/ld-musl-x86_64.so.1') ||
    existsSync('/lib/ld-musl-aarch64.so.1')
  );
}

// ── Download ─────────────────────────────────────────────────────────────────

function download(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmp = `${destPath}.tmp`;

    function fetch(currentUrl: string, redirectsLeft: number): void {
      if (redirectsLeft === 0) {
        reject(new Error('too many redirects'));
        return;
      }

      httpsGet(currentUrl, { headers: { 'User-Agent': 'onebrain-postinstall' } }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          fetch(res.headers.location, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const out = createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          rename(tmp, destPath, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        out.on('error', (err) => {
          unlink(tmp, () => {});
          reject(err);
        });
        res.on('error', (err) => {
          unlink(tmp, () => {});
          reject(err);
        });
      }).on('error', reject);
    }

    fetch(url, 5);
  });
}

function chmodExec(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chmod(filePath, 0o755, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const platform = process.platform;
  const arch = process.arch;
  const musl = detectMusl();

  const binaryName = getBinaryName(platform, arch, musl);
  if (!binaryName) {
    process.stderr.write(
      `[onebrain] Unsupported platform: ${platform}/${arch}${musl ? '-musl' : ''}.\nInstall Bun (https://bun.sh) to use the JS bundle fallback.\n`,
    );
    return;
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(__dirname, '..', 'package.json');

  let version: string;
  try {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
    version = pkg.version;
  } catch {
    process.stderr.write('[onebrain] Could not read package version — skipping binary download.\n');
    return;
  }

  const destPath = join(__dirname, 'onebrain');
  const url = `https://github.com/onebrain-ai/onebrain/releases/download/v${version}/${binaryName}`;

  process.stdout.write(`[onebrain] Downloading ${binaryName} v${version}…\n`);

  try {
    await download(url, destPath);
    if (platform !== 'win32') await chmodExec(destPath);
    process.stdout.write('[onebrain] Ready.\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[onebrain] Download failed: ${msg}\nInstall Bun (https://bun.sh) to use the JS bundle fallback.\n`,
    );
  }
}

main();
