import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { retargetExtension, type SnipshotRequest } from './request.js';

/**
 * "Snipshot…": every flag in one place, pre-filled from the selection and
 * the marks, so a shot can be adjusted without redoing the marking. VS Code
 * has no form dialogs, so this is a small webview.
 */

interface FormValues {
  lines: string;
  red: string;
  green: string;
  folds: string;
  theme: 'dark' | 'light';
  format: 'png' | 'svg';
  contextLines: number;
  maxWidth: number;
  maxLines: number;
  outputPath: string;
}

type Message = { type: 'cancel' } | { type: 'snipshot'; values: FormValues };

export function showOptionsPanel(initial: SnipshotRequest, onSubmit: (request: SnipshotRequest) => void): void {
  const panel = vscode.window.createWebviewPanel('snipshot.options', 'Snipshot', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.webview.html = html(panel.webview.cspSource, randomBytes(16).toString('hex'), initial);

  panel.webview.onDidReceiveMessage((message: Message) => {
    if (message.type === 'cancel') {
      panel.dispose();
      return;
    }
    if (message.type !== 'snipshot') return;
    const values = message.values;
    if (!values.lines.trim() || !values.outputPath.trim()) return;
    const svg = values.format === 'svg';
    panel.dispose();
    onSubmit({
      ...initial,
      lines: values.lines.trim(),
      red: values.red.trim(),
      green: values.green.trim(),
      folds: values.folds.trim(),
      theme: values.theme,
      contextLines: Math.max(0, Math.floor(values.contextLines)),
      maxWidth: Math.max(0, Math.floor(values.maxWidth)),
      maxLines: Math.max(0, Math.floor(values.maxLines)),
      svg,
      outputPath: retargetExtension(values.outputPath.trim(), svg),
    });
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function option(value: string, selected: string, label = value): string {
  return `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`;
}

function html(cspSource: string, nonce: string, r: SnipshotRequest): string {
  const format = r.svg ? 'svg' : 'png';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Snipshot</title>
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 12px 16px; max-width: 640px; }
  h1 { font-size: 1.3em; font-weight: 600; margin: 0 0 12px; }
  fieldset { border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 4px; margin: 0 0 14px; padding: 8px 12px 12px; }
  legend { padding: 0 4px; color: var(--vscode-descriptionForeground); }
  .row { display: grid; grid-template-columns: 170px 1fr; align-items: center; gap: 8px; margin: 6px 0; }
  .hint { grid-column: 2; color: var(--vscode-descriptionForeground); font-size: 0.9em; margin: -2px 0 6px 178px; }
  input, select { font-family: inherit; font-size: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; padding: 4px 6px; width: 100%; box-sizing: border-box; }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); }
  .actions { display: flex; gap: 8px; align-items: center; }
  button { font-family: inherit; font-size: inherit; padding: 6px 14px; border: none; border-radius: 2px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  #error { color: var(--vscode-errorForeground); }
</style>
</head>
<body>
<h1>Snipshot</h1>
<form id="form">
  <fieldset>
    <legend>Lines</legend>
    <div class="row"><label for="lines">Lines</label><input id="lines" value="${escapeHtml(r.lines)}"></div>
    <div class="hint">One or more ranges, e.g. 42-56 or 10-14,42-56. Gaps between ranges are folded.</div>
    <div class="row"><label for="red">Highlight red</label><input id="red" value="${escapeHtml(r.red)}"></div>
    <div class="row"><label for="green">Highlight green</label><input id="green" value="${escapeHtml(r.green)}"></div>
    <div class="hint">Lines (47), ranges (47-50) or columns (47:12-38), comma-separated.</div>
    <div class="row"><label for="folds">Fold</label><input id="folds" value="${escapeHtml(r.folds)}"></div>
  </fieldset>
  <fieldset>
    <legend>Rendering</legend>
    <div class="row"><label for="theme">Theme</label><select id="theme">${option('dark', r.theme)}${option('light', r.theme)}</select></div>
    <div class="row"><label for="format">Format</label><select id="format">${option('png', format, 'PNG')}${option('svg', format, 'SVG')}</select></div>
    <div class="row"><label for="contextLines">Context lines</label><input id="contextLines" type="number" min="0" max="999" value="${r.contextLines}"></div>
    <div class="row"><label for="maxWidth">Max width (0 = no wrap)</label><input id="maxWidth" type="number" min="0" max="10000" step="50" value="${r.maxWidth}"></div>
    <div class="row"><label for="maxLines">Max rows (0 = unlimited)</label><input id="maxLines" type="number" min="0" max="10000" step="10" value="${r.maxLines}"></div>
  </fieldset>
  <fieldset>
    <legend>Output</legend>
    <div class="row"><label for="outputPath">Output</label><input id="outputPath" value="${escapeHtml(r.outputPath)}"></div>
  </fieldset>
  <div class="actions">
    <button type="submit">Snipshot</button>
    <button type="button" class="secondary" id="cancel">Cancel</button>
    <span id="error"></span>
  </div>
</form>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const field = id => document.getElementById(id);
  const error = field('error');
  field('format').addEventListener('change', () => {
    const svg = field('format').value === 'svg';
    field('outputPath').value = field('outputPath').value.replace(svg ? /\\.png$/i : /\\.svg$/i, svg ? '.svg' : '.png');
  });
  field('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
  field('form').addEventListener('submit', event => {
    event.preventDefault();
    if (!field('lines').value.trim()) { error.textContent = 'Give at least one line or range.'; field('lines').focus(); return; }
    if (!field('outputPath').value.trim()) { error.textContent = 'Give an output path.'; field('outputPath').focus(); return; }
    vscode.postMessage({ type: 'snipshot', values: {
      lines: field('lines').value, red: field('red').value, green: field('green').value, folds: field('folds').value,
      theme: field('theme').value, format: field('format').value,
      contextLines: Number(field('contextLines').value) || 0,
      maxWidth: Number(field('maxWidth').value) || 0,
      maxLines: Number(field('maxLines').value) || 0,
      outputPath: field('outputPath').value,
    } });
  });
  field('lines').focus();
</script>
</body>
</html>`;
}
