/**
 * patchUtf8 — force UTF-8 Buffer output for all string writes on a stream.
 *
 * setDefaultEncoding('utf8') is a no-op in bun bundles. Monkey-patching write
 * is the only reliable way to guarantee UTF-8 bytes reach the terminal for
 * all output including third-party libraries (picocolors, cli-ui, etc.).
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
