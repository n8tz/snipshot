import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { spawnCapture } from './process.js';

/** Downloading and unpacking, free of the vscode API so they can be unit-tested. */

/** GETs [url] into [destination], following redirects (GitHub's latest/download is one). */
export function fetchToFile(url: string, destination: string, redirectsLeft = 5): Promise<void> {
  const client = url.startsWith('http:') ? http : https;
  return new Promise((resolve, reject) => {
    client.get(url, { headers: { 'User-Agent': 'snipshot-vscode' } }, response => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirectsLeft === 0) {
          reject(new Error('too many redirects'));
          return;
        }
        resolve(fetchToFile(new URL(location, url).toString(), destination, redirectsLeft - 1));
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`HTTP ${status} for ${url}`));
        return;
      }
      const out = fs.createWriteStream(destination);
      response.pipe(out);
      out.on('finish', () => out.close(err => (err ? reject(err) : resolve())));
      out.on('error', reject);
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Unpacks a .tar.gz or .zip with tar; bsdtar on Windows 10+ reads zip too,
 * and PowerShell is the fallback there.
 */
export async function extractArchive(archive: string, directory: string): Promise<void> {
  const zip = archive.endsWith('.zip');
  const tar = await spawnCapture('tar', zip ? ['-xf', archive, '-C', directory] : ['-xzf', archive, '-C', directory], { timeoutMs: 60_000 });
  if (tar.code === 0) return;
  if (zip && process.platform === 'win32') {
    const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const ps = await spawnCapture('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(directory)} -Force`,
    ], { timeoutMs: 60_000 });
    if (ps.code === 0) return;
    throw new Error(ps.stderr.trim() || ps.error || 'Expand-Archive failed');
  }
  throw new Error(tar.stderr.trim() || tar.error || 'tar failed');
}
