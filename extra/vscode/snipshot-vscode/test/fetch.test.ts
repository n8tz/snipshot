import { describe, it, after, before } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { extractArchive, fetchToFile } from '../src/fetch.js';

describe('fetchToFile', () => {
  let server: http.Server;
  let base: string;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snipshot-fetch-'));

  before(async () => {
    server = http.createServer((request, response) => {
      switch (request.url) {
        case '/latest/download/asset':
          // GitHub answers the stable URL with a redirect to the real object.
          response.writeHead(302, { Location: '/objects/asset?token=1' });
          response.end();
          break;
        case '/objects/asset?token=1':
          response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          response.end(Buffer.from('binary contents'));
          break;
        case '/loop':
          response.writeHead(302, { Location: '/loop' });
          response.end();
          break;
        default:
          response.writeHead(404);
          response.end('nope');
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    base = `http://127.0.0.1:${address.port}`;
  });

  after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('follows redirects and writes the body to the file', async () => {
    const destination = path.join(dir, 'asset');
    await fetchToFile(`${base}/latest/download/asset`, destination);
    assert.equal(fs.readFileSync(destination, 'utf8'), 'binary contents');
  });

  it('fails on an HTTP error rather than saving the error page', async () => {
    await assert.rejects(fetchToFile(`${base}/missing`, path.join(dir, 'missing')), /HTTP 404/);
  });

  it('gives up on a redirect loop', async () => {
    await assert.rejects(fetchToFile(`${base}/loop`, path.join(dir, 'loop')), /too many redirects/);
  });
});

describe('extractArchive', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snipshot-extract-'));

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('unpacks a tar.gz next to where the download landed', async () => {
    const source = path.join(dir, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'snipshot'), '#!/bin/sh\necho 1.3.0\n');
    const archive = path.join(dir, 'snipshot-linux-x64.tar.gz');
    const tar = spawnSync('tar', ['-czf', archive, '-C', source, 'snipshot']);
    assert.equal(tar.status, 0, tar.stderr.toString());

    const target = path.join(dir, 'install');
    fs.mkdirSync(target);
    await extractArchive(archive, target);
    assert.equal(fs.readFileSync(path.join(target, 'snipshot'), 'utf8'), '#!/bin/sh\necho 1.3.0\n');
  });

  it('reports what tar said when the archive is broken', async () => {
    const archive = path.join(dir, 'broken.tar.gz');
    fs.writeFileSync(archive, 'not an archive');
    await assert.rejects(extractArchive(archive, dir));
  });
});
