import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Activates the compiled extension against a stubbed `vscode` module, then
 * checks it against the manifest: every declared command is registered,
 * every menu and keybinding points at a declared command, and the settings
 * defaults the code falls back on are the ones the manifest advertises.
 */

const root = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const registered: string[] = [];
const disposable = () => ({ dispose() {} });
const stub = {
  commands: {
    registerCommand: (id: string) => { registered.push(id); return disposable(); },
    executeCommand: async () => undefined,
  },
  window: {
    createTextEditorDecorationType: disposable,
    onDidChangeVisibleTextEditors: disposable,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    visibleTextEditors: [],
    activeTextEditor: undefined,
    activeColorTheme: { kind: 2 },
  },
  workspace: {
    onDidChangeTextDocument: disposable,
    onDidCloseTextDocument: disposable,
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
  env: { remoteName: undefined },
  OverviewRulerLane: { Center: 2 },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
  ProgressLocation: { Notification: 15 },
  ViewColumn: { Beside: -2 },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
};

// Route `require('vscode')` to the stub for everything loaded below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const moduleWithInternals = require('module') as { _resolveFilename: (...args: unknown[]) => string };
const resolve = moduleWithInternals._resolveFilename;
moduleWithInternals._resolveFilename = function (request: unknown, ...rest: unknown[]) {
  return request === 'vscode' ? 'vscode' : resolve.call(this, request, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: stub } as unknown as NodeModule;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extension = require('../src/extension.js') as { activate: (context: unknown) => unknown };
const subscriptions: unknown[] = [];
const api = extension.activate({
  subscriptions,
  globalStorageUri: { fsPath: '/tmp/snipshot-test' },
  globalState: { get: () => undefined, update: async () => undefined },
});

const declared: string[] = manifest.contributes.commands.map((c: { command: string }) => c.command);

describe('activate', () => {
  it('registers exactly the commands the manifest declares', () => {
    assert.deepEqual([...registered].sort(), [...declared].sort());
    assert.ok(subscriptions.length >= declared.length);
  });

  it('returns the test API', () => {
    assert.ok(api && typeof (api as { clipboardStrategy: unknown }).clipboardStrategy === 'function');
  });
});

describe('manifest', () => {
  it('has no menu, palette or keybinding entry pointing at an unknown command', () => {
    const menus = manifest.contributes.menus as Record<string, { command?: string; submenu?: string }[]>;
    const referenced = [
      ...Object.values(menus).flat().map(entry => entry.command).filter((c): c is string => typeof c === 'string'),
      ...manifest.contributes.keybindings.map((k: { command: string }) => k.command),
    ];
    assert.deepEqual(referenced.filter(c => !declared.includes(c)), []);
    const submenus = manifest.contributes.submenus.map((s: { id: string }) => s.id);
    for (const entry of menus['editor/context']) assert.ok(submenus.includes(entry.submenu ?? ''));
  });

  it('advertises the same defaults the code falls back on', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readSettings } = require('../src/settings.js') as { readSettings: () => Record<string, unknown> };
    const properties = manifest.contributes.configuration.properties as Record<string, { default: unknown }>;
    const fromCode = readSettings();
    for (const [key, value] of Object.entries(fromCode)) {
      assert.deepEqual(properties[`snipshot.${key}`]?.default, value, key);
    }
    assert.equal(Object.keys(properties).length, Object.keys(fromCode).length);
  });
});
