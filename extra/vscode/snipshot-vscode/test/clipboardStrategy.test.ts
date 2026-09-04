import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { chooseClipboardStrategy, type HostInfo } from '../src/clipboardStrategy.js';

const host = (overrides: Partial<HostInfo>): HostInfo => ({
  platform: 'linux',
  remoteName: undefined,
  isWsl: false,
  waylandDisplay: undefined,
  hasCommand: () => false,
  ...overrides,
});

describe('chooseClipboardStrategy', () => {
  it('gives up on remotes other than WSL: their clipboard is not the user\'s', () => {
    const strategy = chooseClipboardStrategy(host({ remoteName: 'ssh-remote' }));
    assert.equal(strategy.kind, 'unreachable');
  });

  it('uses PowerShell on Windows and through WSL interop', () => {
    assert.deepEqual(chooseClipboardStrategy(host({ platform: 'win32' })), { kind: 'powershell' });
    assert.deepEqual(chooseClipboardStrategy(host({ isWsl: true })), { kind: 'wsl' });
    assert.deepEqual(chooseClipboardStrategy(host({ isWsl: true, remoteName: 'wsl' })), { kind: 'wsl' });
  });

  it('uses osascript on macOS', () => {
    assert.deepEqual(chooseClipboardStrategy(host({ platform: 'darwin' })), { kind: 'osascript' });
  });

  it('prefers wl-copy under Wayland, then xclip, then reports what to install', () => {
    assert.deepEqual(chooseClipboardStrategy(host({ waylandDisplay: 'wayland-0', hasCommand: n => n === 'wl-copy' })), { kind: 'wl-copy' });
    assert.deepEqual(chooseClipboardStrategy(host({ waylandDisplay: 'wayland-0', hasCommand: n => n === 'xclip' })), { kind: 'xclip' });
    assert.deepEqual(chooseClipboardStrategy(host({ hasCommand: n => n === 'xclip' })), { kind: 'xclip' });
    const none = chooseClipboardStrategy(host({}));
    assert.equal(none.kind, 'unreachable');
    assert.match(none.kind === 'unreachable' ? none.reason : '', /wl-clipboard.*xclip/);
  });
});
