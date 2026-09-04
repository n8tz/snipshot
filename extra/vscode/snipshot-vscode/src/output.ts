import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { copyImageToClipboard } from './clipboard.js';
import type { SnipshotRequest } from './request.js';
import { notifySaved, run } from './runner.js';
import { readSettings, rememberSaveDirectory } from './settings.js';

/** Sends a rendered snippet wherever the destination setting says. */

/**
 * Renders [request] and delivers it: onto the clipboard by default, or into
 * a file, silently or through a save dialog that opens on the folder the
 * last image went to. SVG never goes to the clipboard, so a clipboard
 * default falls back to asking for a path.
 */
export async function send(context: vscode.ExtensionContext, request: SnipshotRequest): Promise<void> {
  const { destination } = readSettings();
  if (destination === 'clipboard' && !request.svg) {
    await sendToClipboard(context, request);
    return;
  }
  const resolved = destination === 'ask' || destination === 'clipboard'
    ? await askWhereToSave(context, request)
    : request;
  if (!resolved) return;
  await run(context, resolved);
}

/** Renders to a temp file and puts the image on the clipboard. */
export async function sendToClipboard(context: vscode.ExtensionContext, request: SnipshotRequest): Promise<void> {
  const temp = path.join(os.tmpdir(), `snipshot-${process.pid}-${Date.now()}.png`);
  await run(context, { ...request, svg: false, outputPath: temp }, async rendered => {
    try {
      await deliver(request, rendered);
    } finally {
      await fs.promises.rm(rendered, { force: true });
    }
  });
}

async function deliver(request: SnipshotRequest, rendered: string): Promise<void> {
  const failure = await copyImageToClipboard(rendered);
  if (!failure) {
    void vscode.window.showInformationMessage('Snipshot copied to the clipboard.');
    return;
  }
  // A clipboard the user cannot paste from is no result at all, so the shot
  // is kept as a file instead of being lost.
  const kept = await keepAsFile(request, rendered);
  if (kept) {
    notifySaved(
      kept,
      `The clipboard is out of reach (${failure}): saved to ${path.basename(kept)} instead. Set snipshot.destination to choose where these go.`,
      true,
    );
  } else {
    void vscode.window.showErrorMessage(`Could not copy the image (${failure}), and it could not be saved either.`);
  }
}

/** Copies the rendered image next to the code, under .snipshot/. */
async function keepAsFile(request: SnipshotRequest, rendered: string): Promise<string | undefined> {
  const base = request.rootPath ?? path.dirname(request.filePath);
  const target = path.join(base, '.snipshot', path.basename(request.outputPath));
  try {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.copyFile(rendered, target);
    return target;
  } catch {
    return undefined;
  }
}

/**
 * Save dialog, opened on the last folder used and pre-filled with the
 * generated name. Remembers the folder. Undefined when the user cancels.
 */
async function askWhereToSave(context: vscode.ExtensionContext, request: SnipshotRequest): Promise<SnipshotRequest | undefined> {
  const extension = request.svg ? 'svg' : 'png';
  const chosen = await vscode.window.showSaveDialog({
    title: 'Save Snipshot',
    defaultUri: vscode.Uri.file(request.outputPath),
    filters: { [extension.toUpperCase()]: [extension] },
  });
  if (!chosen) return undefined;
  await rememberSaveDirectory(context, path.dirname(chosen.fsPath));
  return { ...request, outputPath: chosen.fsPath };
}
