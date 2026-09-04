import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { renderForm, requestFromForm, type FormValues } from './optionsForm.js';
import type { SnipshotRequest } from './request.js';

/**
 * "Snipshot…": every flag in one place, pre-filled from the selection and
 * the marks, so a shot can be adjusted without redoing the marking. VS Code
 * has no form dialogs, so this is a small webview; the form itself lives in
 * optionsForm.ts, where it can be tested.
 */

type Message = { type: 'cancel' } | { type: 'snipshot'; values: FormValues };

export function showOptionsPanel(initial: SnipshotRequest, onSubmit: (request: SnipshotRequest) => void): void {
  const panel = vscode.window.createWebviewPanel('snipshot.options', 'Snipshot', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.webview.html = renderForm(panel.webview.cspSource, randomBytes(16).toString('hex'), initial);

  panel.webview.onDidReceiveMessage((message: Message) => {
    if (message.type === 'cancel') {
      panel.dispose();
      return;
    }
    if (message.type !== 'snipshot') return;
    const request = requestFromForm(initial, message.values);
    if (!request) return;
    panel.dispose();
    onSubmit(request);
  });
}
