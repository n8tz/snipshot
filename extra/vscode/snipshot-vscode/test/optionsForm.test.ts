import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { renderForm, requestFromForm, type FormValues } from '../src/optionsForm.js';
import type { SnipshotRequest } from '../src/request.js';

const initial: SnipshotRequest = {
  filePath: '/work/src/App.java',
  lines: '40-60',
  red: '47',
  green: '',
  folds: '',
  theme: 'dark',
  contextLines: 3,
  maxWidth: 800,
  maxLines: 70,
  svg: false,
  outputPath: '/work/App_L40-60.png',
  rootPath: '/work',
};

const values: FormValues = {
  lines: ' 10-14,42-56 ',
  red: '47:12-38',
  green: '55',
  folds: '1-9',
  theme: 'light',
  format: 'svg',
  contextLines: 5,
  maxWidth: 0,
  maxLines: 120,
  outputPath: '/work/App_L40-60.png',
};

describe('requestFromForm', () => {
  it('builds the edited request, keeping what the form does not show', () => {
    const request = requestFromForm(initial, values);
    assert.deepEqual(request, {
      ...initial,
      lines: '10-14,42-56',
      red: '47:12-38',
      green: '55',
      folds: '1-9',
      theme: 'light',
      contextLines: 5,
      maxWidth: 0,
      maxLines: 120,
      svg: true,
      // The extension follows the chosen format.
      outputPath: '/work/App_L40-60.svg',
    });
  });

  it('refuses a form without lines or without an output path', () => {
    assert.equal(requestFromForm(initial, { ...values, lines: '  ' }), undefined);
    assert.equal(requestFromForm(initial, { ...values, outputPath: '' }), undefined);
  });

  it('turns odd numbers into whole, non-negative ones', () => {
    const request = requestFromForm(initial, { ...values, contextLines: 2.7, maxWidth: -5, maxLines: Number.NaN });
    assert.equal(request?.contextLines, 2);
    assert.equal(request?.maxWidth, 0);
    assert.equal(request?.maxLines, 0);
  });
});

describe('renderForm', () => {
  const html = renderForm('vscode-resource:', 'n0nce', { ...initial, outputPath: '/x/<a "b">.png', theme: 'light', svg: true });

  it('pre-fills every field from the request, escaped', () => {
    assert.ok(html.includes('id="lines" value="40-60"'));
    assert.ok(html.includes('id="red" value="47"'));
    assert.ok(html.includes('id="outputPath" value="/x/&lt;a &quot;b&quot;&gt;.png"'));
    assert.ok(html.includes('<option value="light" selected>'));
    assert.ok(html.includes('<option value="svg" selected>SVG</option>'));
    assert.ok(html.includes('id="contextLines" type="number" min="0" max="999" value="3"'));
  });

  it('locks the CSP to the nonce it uses for its style and script', () => {
    assert.ok(html.includes(`script-src 'nonce-n0nce'`));
    assert.ok(html.includes(`style-src vscode-resource: 'nonce-n0nce'`));
    assert.ok(html.includes('<script nonce="n0nce">'));
    assert.ok(html.includes('<style nonce="n0nce">'));
  });

  it('posts the form as the message the panel expects', () => {
    assert.ok(html.includes(`vscode.postMessage({ type: 'snipshot', values: {`));
    assert.ok(html.includes(`vscode.postMessage({ type: 'cancel' })`));
  });
});
