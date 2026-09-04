import * as vscode from 'vscode';
import { buildRequest, currentHighlightSpec, currentSelectionRange, windowLines } from './context.js';
import { downloadBinary, probeVersion } from './downloader.js';
import { Marks } from './marks.js';
import type { MarkKind } from './marksModel.js';
import { showOptionsPanel } from './optionsPanel.js';
import { send, sendToClipboard } from './output.js';
import { notifyMissingExecutable, resolveExecutable, run } from './runner.js';
import { readSettings } from './settings.js';

interface Gate {
  /** The command needs a non-empty selection. */
  selection?: boolean;
  /** The CLI reads the file from disk, so unsaved changes are saved first. */
  save?: boolean;
}

export function activate(context: vscode.ExtensionContext): void {
  const marks = new Marks();
  context.subscriptions.push(marks);

  /** Shared plumbing: every editor command needs a file on disk. */
  const editorCommand = (id: string, gate: Gate, handler: (editor: vscode.TextEditor) => Promise<void> | void) => {
    context.subscriptions.push(vscode.commands.registerCommand(id, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.scheme !== 'file') {
        void vscode.window.showWarningMessage('Snipshot needs a file on disk: open one in the editor first.');
        return;
      }
      if (gate.selection && editor.selection.isEmpty) {
        void vscode.window.showWarningMessage('Select the lines to snipshot first.');
        return;
      }
      if (gate.save && editor.document.isDirty && !(await editor.document.save())) {
        void vscode.window.showWarningMessage('Snipshot reads the file from disk, and it could not be saved.');
        return;
      }
      await handler(editor);
    }));
  };

  const svgByDefault = () => readSettings().format === 'svg';

  // "Snipshot this": shoot the visible window and outline the selection in it.
  // The selection is not the subject of the image, it is what the image
  // points at, so the surrounding code stays visible.
  const shootThis = (kind: 'red' | 'green') => async (editor: vscode.TextEditor) => {
    const spec = currentHighlightSpec(editor);
    await send(context, buildRequest(context, editor, marks.store, {
      svg: svgByDefault(),
      lines: windowLines(editor),
      extraRed: kind === 'red' ? spec : '',
      extraGreen: kind === 'green' ? spec : '',
    }));
  };
  editorCommand('snipshot.thisRed', { selection: true, save: true }, shootThis('red'));
  editorCommand('snipshot.thisGreen', { selection: true, save: true }, shootThis('green'));

  editorCommand('snipshot.save', { save: true }, editor =>
    send(context, buildRequest(context, editor, marks.store, { svg: svgByDefault() })));
  editorCommand('snipshot.svg', { save: true }, editor =>
    send(context, buildRequest(context, editor, marks.store, { svg: true })));
  editorCommand('snipshot.copy', { save: true }, editor =>
    sendToClipboard(context, buildRequest(context, editor, marks.store, { svg: false })));
  editorCommand('snipshot.options', { save: true }, editor =>
    showOptionsPanel(buildRequest(context, editor, marks.store, { svg: svgByDefault() }), request => void run(context, request)));

  const mark = (kind: MarkKind) => (editor: vscode.TextEditor) => marks.add(editor, kind, currentSelectionRange(editor));
  editorCommand('snipshot.markRed', { selection: true }, mark('red'));
  editorCommand('snipshot.markGreen', { selection: true }, mark('green'));
  editorCommand('snipshot.markFold', { selection: true }, mark('fold'));
  editorCommand('snipshot.clearMarks', {}, editor => {
    if (!marks.has(editor)) {
      void vscode.window.showInformationMessage('No snipshot marks on this file.');
      return;
    }
    marks.clear(editor);
  });

  context.subscriptions.push(vscode.commands.registerCommand('snipshot.downloadBinary', async () => {
    const { binary, error } = await downloadBinary(context);
    if (!binary) {
      void vscode.window.showErrorMessage(error ?? 'Download failed.');
      return;
    }
    const version = await probeVersion(binary);
    const configured = readSettings().executablePath;
    void vscode.window.showInformationMessage(
      `snipshot ${version ?? ''} downloaded to ${binary}.` +
      (configured ? ` Clear snipshot.executablePath (${configured}) to use it.` : ''),
    );
  }));

  context.subscriptions.push(vscode.commands.registerCommand('snipshot.checkBinary', async () => {
    const binary = resolveExecutable(context);
    if (!binary) {
      await notifyMissingExecutable();
      return;
    }
    const version = await probeVersion(binary);
    if (version) void vscode.window.showInformationMessage(`snipshot ${version}: ${binary}`);
    else void vscode.window.showErrorMessage(`${binary} did not answer --version.`);
  }));
}

export function deactivate(): void {}
