import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { downloadedBinary } from './downloader.js';
import { findInPath } from './platform.js';
import { isFile, spawnCapture } from './process.js';
import { toCommandArgs, type SnipshotRequest } from './request.js';
import { readSettings } from './settings.js';

/** Runs the snipshot CLI off the UI thread and reports the result. */

const TIMEOUT_MS = 60_000;

/**
 * The binary to run: whatever was configured, else one downloaded by the
 * extension, else the first `snipshot` found on PATH. Undefined when snipshot
 * cannot be located at all.
 */
export function resolveExecutable(context: vscode.ExtensionContext): string | undefined {
  const configured = readSettings().executablePath;
  if (configured) return isFile(configured) ? configured : undefined;
  return downloadedBinary(context) ?? findInPath(process.env.PATH, isFile);
}

export type RunOutcome = { ok: true; file: string } | { ok: false; message: string };

export async function runSnipshot(executable: string, request: SnipshotRequest): Promise<RunOutcome> {
  await fs.promises.mkdir(path.dirname(request.outputPath), { recursive: true });
  const output = await spawnCapture(executable, toCommandArgs(request), {
    cwd: request.rootPath ?? path.dirname(request.filePath),
    timeoutMs: TIMEOUT_MS,
  });
  if (output.error) return { ok: false, message: `snipshot failed to start: ${output.error}` };
  if (output.code !== 0) {
    const message = [output.stderr, output.stdout].map(s => s.trim()).find(s => s !== '')
      ?? `snipshot exited with code ${output.code}`;
    return { ok: false, message };
  }
  if (!isFile(request.outputPath)) {
    return { ok: false, message: `snipshot reported success but ${request.outputPath} is missing` };
  }
  return { ok: true, file: request.outputPath };
}

/**
 * Runs [request] behind a progress notification. On success [onSuccess] gets
 * the file that was written; failures surface as an error notification
 * carrying the CLI's own message, which already explains how to recover
 * (narrow the range, fold, raise the limit).
 */
export async function run(
  context: vscode.ExtensionContext,
  request: SnipshotRequest,
  onSuccess: (file: string) => Promise<void> = file => notifySaved(file),
): Promise<void> {
  const executable = resolveExecutable(context);
  if (!executable) {
    await notifyMissingExecutable();
    return;
  }
  const outcome = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Running snipshot' },
    () => runSnipshot(executable, request),
  );
  if (!outcome.ok) {
    void vscode.window.showErrorMessage(outcome.message);
    return;
  }
  await onSuccess(outcome.file);
}

export async function notifySaved(file: string, message = `Snipshot saved to ${path.basename(file)}`, warning = false): Promise<void> {
  const uri = vscode.Uri.file(file);
  if (readSettings().openAfterSave) void vscode.commands.executeCommand('vscode.open', uri);
  const actions = ['Open', 'Show in files'];
  const choice = warning
    ? await vscode.window.showWarningMessage(message, ...actions)
    : await vscode.window.showInformationMessage(message, ...actions);
  if (choice === 'Open') void vscode.commands.executeCommand('vscode.open', uri);
  else if (choice === 'Show in files') void vscode.commands.executeCommand('revealFileInOS', uri);
}

export async function notifyMissingExecutable(): Promise<void> {
  const choice = await vscode.window.showErrorMessage(
    'snipshot was not found. Download the binary, install it with "npm install -g snipshot", or set its path in the Snipshot settings.',
    'Download binary', 'Open settings',
  );
  if (choice === 'Download binary') void vscode.commands.executeCommand('snipshot.downloadBinary');
  else if (choice === 'Open settings') void vscode.commands.executeCommand('workbench.action.openSettings', 'snipshot.executablePath');
}
