import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { extractArchive, fetchToFile } from './fetch.js';
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
        await extractArchive(archive, directory);
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
