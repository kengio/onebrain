/**
 * patchUtf8 — force UTF-8 Buffer output for all string writes on a stream.
 *
 * Root cause: bun bundles built with --target node use a Node.js stream shim
 * whose TTY write path encodes strings with the system locale rather than
 * UTF-8. This garbles multi-byte characters (box-drawing, emoji, em dash).
 *
 * Primary fix: build with --target bun (uses native Bun stream, UTF-8 always).
 * Defense-in-depth: cli-ui.ts and cli-banner.ts write Buffer.from(str,'utf8').
 * This function catches any remaining third-party writes (picocolors, Commander).
 */

// biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write signature
export function patchUtf8(stream: { write: (...args: any[]) => boolean }): void {
  const orig = stream.write.bind(stream);
  stream.write = (
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void,
  ): boolean => {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    if (typeof encodingOrCb === 'function') return orig(buf, encodingOrCb);
    if (cb !== undefined) return orig(buf, cb);
    return orig(buf);
  };
}
