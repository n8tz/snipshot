import * as assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Runs inside a real VS Code (see .vscode-test.mjs): drives the commands
 * through the API and checks what reaches the CLI and the disk. The CLI is
 * a shim that logs its arguments, then renders for real.
 */

const workspace = process.env.SNIPSHOT_TEST_WORKSPACE!;
const shimLog = process.env.SNIPSHOT_SHIM_LOG!;
const shim = path.join(__dirname, '..', '..', 'integration', 'snipshot-shim.cjs');
const sample = path.join(workspace, 'sample.ts');
const shots = path.join(workspace, '.snipshot');
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

interface TestApi {
  marks: { store: { spec(file: string, kind: 'red' | 'green' | 'fold'): string; has(file: string): boolean } };
  clipboardStrategy(): { kind: string };
  resolveExecutable(): string | undefined;
}

async function api(): Promise<TestApi> {
  const extension = vscode.extensions.getExtension('9pings.snipshot');
  assert.ok(extension, 'the extension is loaded');
  return await extension.activate() as TestApi;
}

async function configure(values: Record<string, unknown>): Promise<void> {
  const config = vscode.workspace.getConfiguration('snipshot');
  for (const [key, value] of Object.entries(values)) {
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
}

const defaults = {
  executablePath: shim,
  destination: 'projectSnipshot',
  customDirectory: '',
  format: 'png',
  openAfterSave: false,
  theme: 'dark',
  contextLines: 3,
  maxWidth: 800,
  maxLines: 70,
};

function calls(): string[][] {
  if (!fs.existsSync(shimLog)) return [];
  return fs.readFileSync(shimLog, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as string[]);
}

function lastCall(): string[] {
  const all = calls();
  assert.ok(all.length > 0, 'the CLI was called');
  return all[all.length - 1];
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function until(condition: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) assert.fail(`timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/** The visible lines as `--lines` spells them. */
function visibleLines(editor: vscode.TextEditor): string {
  const visible = editor.visibleRanges;
  return `${visible[0].start.line + 1}-${visible[visible.length - 1].end.line + 1}`;
}

async function openSample(): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument(sample);
  const editor = await vscode.window.showTextDocument(document);
  await until(() => editor.visibleRanges.length > 0, 'the editor to lay out');
  // The window keeps settling for a moment after it opens; wait until the
  // visible area stops moving, or tests reading it race the layout.
  let seen = visibleLines(editor);
  for (let stable = 0; stable < 4; stable++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const now = visibleLines(editor);
    if (now !== seen) {
      seen = now;
      stable = -1;
    }
  }
  return editor;
}

function select(editor: vscode.TextEditor, line1: number, char1: number, line2: number, char2: number): void {
  editor.selection = new vscode.Selection(line1, char1, line2, char2);
}

function run(command: string): Thenable<unknown> {
  return vscode.commands.executeCommand(command);
}

before(async () => {
  await configure(defaults);
});

beforeEach(() => {
  fs.rmSync(shimLog, { force: true });
});

afterEach(async () => {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
});

describe('activation', () => {
  it('registers every command the manifest declares', async () => {
    const extension = vscode.extensions.getExtension('9pings.snipshot')!;
    await api();
    const declared = (extension.packageJSON.contributes.commands as { command: string }[]).map(c => c.command);
    const registered = await vscode.commands.getCommands(true);
    for (const command of declared) assert.ok(registered.includes(command), command);
  });

  it('resolves the configured binary', async () => {
    assert.equal((await api()).resolveExecutable(), shim);
  });
});

describe('Snipshot Selection', () => {
  it('shoots the selected lines into .snipshot/ with the plugin\'s command line', async () => {
    const editor = await openSample();
    select(editor, 39, 0, 59, 5); // lines 40-60
    await run('snipshot.save');

    const args = lastCall();
    const output = path.join(shots, 'sample_L40-60.png');
    assert.deepEqual(args, [
      sample, '--lines', '40-60',
      '--theme', 'dark', '--context', '3', '--max-width', '800', '--max-lines', '70',
      '--root', workspace, '--output', output,
    ]);
    assert.deepEqual([...fs.readFileSync(output).subarray(0, 4)], PNG_MAGIC);
  });

  it('shoots the visible area when nothing is selected', async () => {
    const editor = await openSample();
    select(editor, 0, 0, 0, 0);
    const expected = visibleLines(editor);
    await run('snipshot.save');
    assert.equal(flag(lastCall(), '--lines'), expected);
  });

  it('turns several cursors into several ranges, sorted', async () => {
    const editor = await openSample();
    editor.selections = [new vscode.Selection(39, 0, 42, 0), new vscode.Selection(9, 0, 12, 3)];
    await run('snipshot.save');
    assert.equal(flag(lastCall(), '--lines'), '10-13,40-42');
  });

  it('follows the rendering settings', async () => {
    await configure({ theme: 'light', contextLines: 5, maxWidth: 0, maxLines: 0 });
    try {
      const editor = await openSample();
      select(editor, 0, 0, 4, 0);
      await run('snipshot.save');
      const args = lastCall();
      assert.deepEqual(args.slice(3, 9), ['--theme', 'light', '--context', '5', '--no-max-width', '--no-max-lines']);
    } finally {
      await configure(defaults);
    }
  });

  it('saves the file first, so the shot shows what the editor shows', async () => {
    const editor = await openSample();
    await editor.edit(edit => edit.insert(new vscode.Position(0, 0), '// unsaved\n'));
    assert.equal(editor.document.isDirty, true);
    select(editor, 0, 0, 3, 0);
    await run('snipshot.save');
    assert.equal(editor.document.isDirty, false);
    assert.ok(fs.readFileSync(sample, 'utf8').startsWith('// unsaved\n'));
    // Put the fixture back for the tests that follow.
    await editor.edit(edit => edit.delete(new vscode.Range(0, 0, 1, 0)));
    await editor.document.save();
  });

  it('reports the page-fit error and writes nothing', async () => {
    const editor = await openSample();
    select(editor, 0, 0, 79, 10); // 80 lines, over the 70-row limit
    await run('snipshot.save');
    const output = flag(lastCall(), '--output')!;
    assert.equal(fs.existsSync(output), false);
  });

  it('does not run without a binary', async () => {
    await configure({ executablePath: path.join(workspace, 'missing-snipshot') });
    try {
      const editor = await openSample();
      select(editor, 0, 0, 4, 0);
      await run('snipshot.save');
      assert.deepEqual(calls(), []);
    } finally {
      await configure(defaults);
    }
  });
});

describe('Snipshot this', () => {
  it('shoots the window and boxes the selected characters in red', async () => {
    const editor = await openSample();
    select(editor, 46, 11, 46, 38); // line 47, characters 11..37
    await run('snipshot.thisRed');

    const args = lastCall();
    assert.equal(flag(args, '--highlight-red'), '47:12-38');
    assert.equal(flag(args, '--highlight-green'), undefined);
    const [start, end] = flag(args, '--lines')!.split('-').map(Number);
    assert.ok(start <= 47 && end >= 47, `the window ${start}-${end} covers line 47`);
    assert.deepEqual([...fs.readFileSync(flag(args, '--output')!).subarray(0, 4)], PNG_MAGIC);
  });

  it('counts columns past tabs the way the CLI expands them', async () => {
    const editor = await openSample();
    select(editor, 9, 1, 9, 6); // "\tconst": the word after the tab
    await run('snipshot.thisGreen');
    assert.equal(flag(lastCall(), '--highlight-green'), '10:5-9');
  });

  it('highlights whole lines when the selection spans lines', async () => {
    const editor = await openSample();
    select(editor, 46, 3, 49, 0);
    await run('snipshot.thisRed');
    assert.equal(flag(lastCall(), '--highlight-red'), '47-49');
  });
});

describe('destinations and formats', () => {
  it('writes SVG into the workspace root when asked', async () => {
    await configure({ destination: 'projectRoot' });
    try {
      const editor = await openSample();
      select(editor, 0, 0, 4, 0);
      await run('snipshot.svg');
      const args = lastCall();
      assert.ok(args.includes('--svg'));
      const output = flag(args, '--output')!;
      assert.equal(output, path.join(workspace, 'sample_L1-4.svg'));
      const svg = fs.readFileSync(output, 'utf8');
      assert.match(svg, /^<svg /);
      assert.ok(svg.includes('sample.ts'), 'the header carries the path');
    } finally {
      await configure(defaults);
      fs.rmSync(path.join(workspace, 'sample_L1-4.svg'), { force: true });
    }
  });

  it('honours a custom directory and the default format', async () => {
    const custom = path.join(workspace, 'shots');
    await configure({ destination: 'custom', customDirectory: custom, format: 'svg' });
    try {
      const editor = await openSample();
      select(editor, 0, 0, 4, 0);
      await run('snipshot.save');
      const output = path.join(custom, 'sample_L1-4.svg');
      assert.equal(flag(lastCall(), '--output'), output);
      assert.ok(fs.existsSync(output));
    } finally {
      await configure(defaults);
    }
  });
});

describe('marks', () => {
  it('annotate the next shot, follow edits, and can be cleared', async () => {
    const { marks } = await api();
    const editor = await openSample();

    select(editor, 46, 0, 47, 0); // line 47
    await run('snipshot.markRed');
    select(editor, 51, 0, 55, 0); // lines 52-55
    await run('snipshot.markGreen');
    select(editor, 0, 0, 5, 0); // lines 1-5
    await run('snipshot.markFold');
    assert.equal(marks.store.spec(sample, 'red'), '47');
    assert.equal(marks.store.spec(sample, 'green'), '52-55');
    assert.equal(marks.store.spec(sample, 'fold'), '1-5');

    select(editor, 39, 0, 59, 5);
    await run('snipshot.save');
    const args = lastCall();
    assert.equal(flag(args, '--highlight-red'), '47');
    assert.equal(flag(args, '--highlight-green'), '52-55');
    assert.equal(flag(args, '--fold'), '1-5');

    // Two lines inserted above the marks: they move down with the text.
    await editor.edit(edit => edit.insert(new vscode.Position(20, 0), '// one\n// two\n'));
    await until(() => marks.store.spec(sample, 'red') === '49', 'the marks to follow the edit');
    assert.equal(marks.store.spec(sample, 'green'), '54-57');
    assert.equal(marks.store.spec(sample, 'fold'), '1-5');

    await run('snipshot.clearMarks');
    assert.equal(marks.store.has(sample), false);
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  it('merges a one-shot selection with the marks', async () => {
    const { marks } = await api();
    const editor = await openSample();
    select(editor, 29, 0, 30, 0); // line 30
    await run('snipshot.markRed');
    select(editor, 46, 11, 46, 38);
    await run('snipshot.thisRed');
    assert.equal(flag(lastCall(), '--highlight-red'), '30,47:12-38');
    await run('snipshot.clearMarks');
    assert.equal(marks.store.has(sample), false);
  });
});

describe('clipboard', () => {
  it('copies the PNG, or keeps it as a file where the clipboard is out of reach', async () => {
    const { clipboardStrategy } = await api();
    const kept = path.join(shots, 'sample_L1-4.png');
    fs.rmSync(kept, { force: true });
    await configure({ destination: 'clipboard' });
    try {
      const editor = await openSample();
      select(editor, 0, 0, 4, 0);
      await run('snipshot.copy');

      const args = lastCall();
      const temp = flag(args, '--output')!;
      assert.ok(temp.startsWith(os.tmpdir()), `rendered to a temp file: ${temp}`);
      assert.equal(fs.existsSync(temp), false, 'the temp file is removed afterwards');

      const { kind } = clipboardStrategy();
      if (kind === 'xclip' || kind === 'wl-copy') {
        const read = kind === 'xclip'
          ? spawnSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o'])
          : spawnSync('wl-paste', ['--type', 'image/png']);
        assert.equal(read.status, 0, read.stderr?.toString());
        assert.deepEqual([...read.stdout.subarray(0, 4)], PNG_MAGIC);
        assert.equal(fs.existsSync(kept), false, 'nothing is written to disk');
      } else if (kind === 'unreachable') {
        assert.ok(fs.existsSync(kept), `kept as ${kept}`);
      }
      // 'wsl' and 'powershell' depend on the machine: either outcome is fine.
    } finally {
      await configure(defaults);
    }
  });
});

describe('options panel', () => {
  it('opens the form next to the editor', async () => {
    const editor = await openSample();
    select(editor, 0, 0, 4, 0);
    await run('snipshot.options');
    const tabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs);
    await until(() => tabs().some(tab => tab.label === 'Snipshot' && tab.input instanceof vscode.TabInputWebview), 'the Snipshot panel');
  });
});

describe('binary check', () => {
  it('asks the configured binary for its version', async () => {
    await run('snipshot.checkBinary');
    assert.deepEqual(lastCall(), ['--version']);
  });
});
