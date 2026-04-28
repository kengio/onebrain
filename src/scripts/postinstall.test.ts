import { describe, expect, it } from 'bun:test';
import { getBinaryName } from './postinstall.js';

describe('getBinaryName', () => {
  it('darwin arm64', () => expect(getBinaryName('darwin', 'arm64')).toBe('onebrain-darwin-arm64'));
  it('darwin x64', () => expect(getBinaryName('darwin', 'x64')).toBe('onebrain-darwin-x64'));
  it('linux arm64', () => expect(getBinaryName('linux', 'arm64')).toBe('onebrain-linux-arm64'));
  it('linux x64', () => expect(getBinaryName('linux', 'x64')).toBe('onebrain-linux-x64'));
  it('linux arm64 musl', () =>
    expect(getBinaryName('linux', 'arm64', true)).toBe('onebrain-linux-arm64-musl'));
  it('linux x64 musl', () =>
    expect(getBinaryName('linux', 'x64', true)).toBe('onebrain-linux-x64-musl'));
  it('windows x64', () => expect(getBinaryName('win32', 'x64')).toBe('onebrain-windows-x64.exe'));
  it('windows arm64', () =>
    expect(getBinaryName('win32', 'arm64')).toBe('onebrain-windows-arm64.exe'));

  it('unsupported platform → null', () => expect(getBinaryName('freebsd', 'x64')).toBeNull());
  it('unsupported arch → null', () => expect(getBinaryName('linux', 'ia32')).toBeNull());
  it('empty → null', () => expect(getBinaryName('', '')).toBeNull());
});
