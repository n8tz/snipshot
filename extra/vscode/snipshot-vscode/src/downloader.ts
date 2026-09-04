import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';
import { downloadUrl, releaseTarget } from './platform.js';
import { isFile, spawnCapture } from './process.js';

/**
 * Fetches the standalone snipshot binary from the project's GitHub releases,
 * so the extension works without installing anything by hand.
 */

/** Where a downloaded binary lives: VS Code-managed, survives extension updates. */
function installDirectory(context: vscode.ExtensionContext): string {
  return path.join(context.globalStorageUri.fsPath, 'snipshot');
}

/** An already-downloaded binary, if there is one. */
export function downloadedBinary(context: vscode.ExtensionContext): string | undefined {
  const target = releaseTarget(process.platform, process.arch);
  if (!target) return undefined;
  const binary = path.join(installDirectory(context), target.binaryName);
  return isFile(binary) ? binary : undefined;
}

/** GETs [url] into [destination], following redirects (latest/download is one). */
function fetchToFile(url: string, destination: string, redirectsLeft = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'snipshot-vscode' } }, response => {
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

/** Unpacks with tar; bsdtar on Windows 10+ reads zip too, PowerShell is the fallback there. */
async function extract(archive: string, directory: string): Promise<void> {
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

/** Downloads and unpacks the binary, with a progress notification. */
export async function downloadBinary(context: vscode.ExtensionContext): Promise<{ binary?: string; error?: string }> {
  const target = releaseTarget(process.platform, process.arch);
  if (!target) {
    return { error: `No prebuilt binary for ${process.platform} ${process.arch}. Install it with "npm install -g snipshot", or set snipshot.executablePath.` };
  }
  const directory = installDirectory(context);
  const archive = path.join(directory, target.asset);
  try {
    return await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Downloading ${target.asset}` },
      async progress => {
        await fs.promises.mkdir(directory, { recursive: true });
        await fetchToFile(downloadUrl(target), archive);
        progress.report({ message: 'unpacking' });
        await extract(archive, directory);
        const binary = path.join(directory, target.binaryName);
        if (!isFile(binary)) return { error: `The archive did not contain ${target.binaryName}.` };
        if (process.platform !== 'win32') await fs.promises.chmod(binary, 0o755);
        return { binary };
      },
    );
  } catch (err) {
    return { error: `Download failed: ${(err as Error).message}` };
  } finally {
    await fs.promises.rm(archive, { force: true });
  }
}

/** Runs `<binary> --version`; the version, or undefined if it does not run. */
export async function probeVersion(binary: string): Promise<string | undefined> {
  const output = await spawnCapture(binary, ['--version'], { timeoutMs: 10_000 });
  return output.code === 0 ? output.stdout.trim() || undefined : undefined;
}
