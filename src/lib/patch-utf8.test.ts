/**
 * Regression tests for patchUtf8.
 *
 * Verifies that unicode strings (box-drawing, emoji, bullets) are written as
 * correct UTF-8 bytes — not garbled Latin-1 sequences like 0xE2 0x80 0x94.
 *
 * These chars were garbled in the bun bundle before patchUtf8 was introduced.
 */

import { describe, expect, it } from 'bun:test';
import { patchUtf8 } from './patch-utf8.js';

function makeMockStream(): {
  chunks: Buffer[];
  write: (chunk: string | Uint8Array, cb?: (err?: Error | null) => void) => boolean;
} {
  const chunks: Buffer[] = [];
  return {
    chunks,
    write(chunk: string | Uint8Array, cb?: (err?: Error | null) => void): boolean {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
      cb?.();
      return true;
    },
  };
}

function collectUtf8(stream: { chunks: Buffer[] }): string {
  return Buffer.concat(stream.chunks).toString('utf8');
}

describe('patchUtf8', () => {
  it('box-drawing chars arrive as correct UTF-8 bytes', () => {
    const stream = makeMockStream();
    patchUtf8(stream);
    stream.write('─────────────────\n');
    expect(collectUtf8(stream)).toBe('─────────────────\n');
  });

  it('em dash (—) is not garbled', () => {
    const stream = makeMockStream();
    patchUtf8(stream);
    stream.write('OneBrain v2.1.1 — released 2026-04-29');
    expect(collectUtf8(stream)).toBe('OneBrain v2.1.1 — released 2026-04-29');
  });

  it('emoji (✓ ✅ 📋) are not garbled', () => {
    const stream = makeMockStream();
    patchUtf8(stream);
    stream.write('✓ vault.yml written ✅\n');
    stream.write('📋 checkpoint: 15 msgs\n');
    expect(collectUtf8(stream)).toBe('✓ vault.yml written ✅\n📋 checkpoint: 15 msgs\n');
  });

  it('bullet (·) and middle dot chars are not garbled', () => {
    const stream = makeMockStream();
    patchUtf8(stream);
    stream.write('update_channel: stable · checkpoint: 15 msgs');
    expect(collectUtf8(stream)).toBe('update_channel: stable · checkpoint: 15 msgs');
  });

  it('Uint8Array passthrough — not double-encoded', () => {
    const stream = makeMockStream();
    patchUtf8(stream);
    const bytes = Buffer.from('hello', 'utf8');
    stream.write(bytes);
    expect(stream.chunks[0]).toStrictEqual(bytes);
  });

  it('write(chunk, cb) overload — callback is invoked', () => {
    const stream = makeMockStream();
    patchUtf8(stream);
    let cbCalled = false;
    // biome-ignore lint/suspicious/noExplicitAny: testing overload signature
    (stream.write as any)('test', () => {
      cbCalled = true;
    });
    expect(cbCalled).toBe(true);
  });

  it('write(chunk, encoding, cb) overload — callback is invoked and encoding is ignored', () => {
    const stream = makeMockStream();
    patchUtf8(stream);
    let cbCalled = false;
    // biome-ignore lint/suspicious/noExplicitAny: testing overload signature
    (stream.write as any)('— em dash', 'latin1', () => {
      cbCalled = true;
    });
    // Despite 'latin1' encoding hint, output must be valid UTF-8
    expect(collectUtf8(stream)).toBe('— em dash');
    expect(cbCalled).toBe(true);
  });
});
