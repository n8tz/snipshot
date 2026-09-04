import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { downloadUrl, findInPath, isWslHost, releaseTarget } from '../src/platform.js';

describe('releaseTarget', () => {
  it('names the release asset for each platform we ship', () => {
    assert.deepEqual(releaseTarget('win32', 'x64'), { asset: 'snipshot-windows-x64.zip', binaryName: 'snipshot.exe' });
    assert.deepEqual(releaseTarget('darwin', 'arm64'), { asset: 'snipshot-macos-arm64.tar.gz', binaryName: 'snipshot' });
    assert.deepEqual(releaseTarget('darwin', 'x64'), { asset: 'snipshot-macos-x64.tar.gz', binaryName: 'snipshot' });
    assert.deepEqual(releaseTarget('linux', 'x64'), { asset: 'snipshot-linux-x64.tar.gz', binaryName: 'snipshot' });
    assert.equal(releaseTarget('linux', 'arm64'), undefined);
  });

  it('downloads from the stable latest-release URL', () => {
    assert.equal(
      downloadUrl({ asset: 'snipshot-linux-x64.tar.gz', binaryName: 'snipshot' }),
      'https://github.com/9pings/snipshot/releases/latest/download/snipshot-linux-x64.tar.gz',
    );
  });
});

describe('findInPath', () => {
  it('returns the first candidate that exists, scanning PATH in order', () => {
    const present = new Set(['/usr/local/bin/snipshot.cmd', '/opt/bin/snipshot']);
    assert.equal(findInPath('/usr/bin:/usr/local/bin:/opt/bin', p => present.has(p), undefined, ':'), '/usr/local/bin/snipshot.cmd');
    assert.equal(findInPath('/usr/bin', p => present.has(p), undefined, ':'), undefined);
    assert.equal(findInPath(undefined, () => true, undefined, ':'), undefined);
  });
});

describe('isWslHost', () => {
  it('spots WSL from the environment or the kernel string, on Linux only', () => {
    assert.equal(isWslHost('linux', { WSL_DISTRO_NAME: 'kali-linux' }, ''), true);
    assert.equal(isWslHost('linux', {}, 'Linux version 5.15.167.4-microsoft-standard-WSL2'), true);
    assert.equal(isWslHost('linux', {}, 'Linux version 6.8.0-generic'), false);
    assert.equal(isWslHost('win32', { WSL_DISTRO_NAME: 'x' }, 'microsoft'), false);
  });
});
