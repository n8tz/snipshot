# Snipshot for VS Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VS Code extension under `extra/vscode/snipshot-vscode/` that mirrors the IntelliJ plugin, packaged as a `.vsix` by `npm run build:vscode` and attached to every GitHub Release.

**Architecture:** Pure modules (ranges, request, marks model, platform, clipboard strategy) hold every decision and are unit-tested under Node; thin `vscode`-bound modules (context, marks, runner, output, clipboard, downloader, options panel) adapt them to the editor. The extension shells out to the `snipshot` CLI exactly like the plugin does, so every shot is a reproducible command line.

**Tech Stack:** TypeScript 6 (`module: node20`, CommonJS output), `@types/vscode` 1.85.0 (engine `^1.85.0`), `node:test` for unit tests, `@vscode/vsce` 3.9 for packaging. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-vscode-extension-design.md`

## Global Constraints

- Extension lives in `extra/vscode/snipshot-vscode/`; output is `standalone/vscode/snipshot-vscode-extension.vsix`.
- Extension version is synced from the root `package.json` by the build script (currently `1.3.0`).
- `engines.vscode` is `^1.85.0` and `@types/vscode` is pinned to exactly `1.85.0` (vsce rejects newer types).
- Pure modules never import `vscode`; relative imports carry the `.js` suffix (node20 module resolution).
- Command ids are `snipshot.*`; settings are `snipshot.*`; the submenu id is `snipshot.menu`.
- Keybindings: `alt+shift+s` save, `alt+shift+c` copy, `alt+shift+r` / `alt+shift+g` / `alt+shift+x` marks (Alt+Shift+F is Format Document in VS Code).
- CLI flags and their order follow the plugin's `SnipshotRequest.toCommandArgs`.
- Each code block below is preceded by `<!-- write: <path> -->`, naming the file it is the full content of.

---

### Task 1: Scaffold the extension package

**Files:**
- Create: `extra/vscode/snipshot-vscode/package.json`, `tsconfig.json`, `.gitignore`, `.vscodeignore`, `LICENSE` (copy of the root one), `src/extension.ts` (placeholder), `test/smoke.test.ts`

**Interfaces:**
- Produces: the manifest every later task's commands, menus, keybindings and settings are declared in.

- [ ] **Step 1: Write the manifest**

<!-- write: extra/vscode/snipshot-vscode/package.json -->
```json
{
  "name": "snipshot",
  "displayName": "Snipshot",
  "description": "Right-click a selection, get a syntax-highlighted code screenshot: PNG or SVG with the file path in the header, red/green annotations and folds, rendered by the snipshot CLI.",
  "version": "1.3.0",
  "publisher": "9pings",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/9pings/snipshot.git",
    "directory": "extra/vscode/snipshot-vscode"
  },
  "homepage": "https://github.com/9pings/snipshot/blob/master/VSCODE.md",
  "bugs": {
    "url": "https://github.com/9pings/snipshot/issues"
  },
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": [
    "Other"
  ],
  "keywords": [
    "screenshot",
    "code screenshot",
    "snippet",
    "png",
    "svg",
    "carbon"
  ],
  "main": "./out/src/extension.js",
  "activationEvents": [],
  "contributes": {
    "commands": [
      { "command": "snipshot.thisRed", "category": "Snipshot", "title": "Snipshot this (red)" },
      { "command": "snipshot.thisGreen", "category": "Snipshot", "title": "Snipshot this (green)" },
      { "command": "snipshot.save", "category": "Snipshot", "title": "Snipshot Selection" },
      { "command": "snipshot.copy", "category": "Snipshot", "title": "Copy Snipshot to Clipboard" },
      { "command": "snipshot.svg", "category": "Snipshot", "title": "Snipshot Selection as SVG" },
      { "command": "snipshot.options", "category": "Snipshot", "title": "Snipshot..." },
      { "command": "snipshot.markRed", "category": "Snipshot", "title": "Mark Selection Red" },
      { "command": "snipshot.markGreen", "category": "Snipshot", "title": "Mark Selection Green" },
      { "command": "snipshot.markFold", "category": "Snipshot", "title": "Mark Selection Folded" },
      { "command": "snipshot.clearMarks", "category": "Snipshot", "title": "Clear Snipshot Marks" },
      { "command": "snipshot.downloadBinary", "category": "Snipshot", "title": "Download Binary" },
      { "command": "snipshot.checkBinary", "category": "Snipshot", "title": "Check Binary" }
    ],
    "submenus": [
      { "id": "snipshot.menu", "label": "Snipshot" }
    ],
    "menus": {
      "editor/context": [
        { "submenu": "snipshot.menu", "group": "z_snipshot", "when": "resourceScheme == file" }
      ],
      "snipshot.menu": [
        { "command": "snipshot.thisRed", "group": "1_this@1", "when": "editorHasSelection" },
        { "command": "snipshot.thisGreen", "group": "1_this@2", "when": "editorHasSelection" },
        { "command": "snipshot.save", "group": "2_shot@1" },
        { "command": "snipshot.copy", "group": "2_shot@2" },
        { "command": "snipshot.svg", "group": "2_shot@3" },
        { "command": "snipshot.options", "group": "2_shot@4" },
        { "command": "snipshot.markRed", "group": "3_marks@1", "when": "editorHasSelection" },
        { "command": "snipshot.markGreen", "group": "3_marks@2", "when": "editorHasSelection" },
        { "command": "snipshot.markFold", "group": "3_marks@3", "when": "editorHasSelection" },
        { "command": "snipshot.clearMarks", "group": "3_marks@4" }
      ],
      "commandPalette": [
        { "command": "snipshot.thisRed", "when": "editorHasSelection" },
        { "command": "snipshot.thisGreen", "when": "editorHasSelection" },
        { "command": "snipshot.markRed", "when": "editorHasSelection" },
        { "command": "snipshot.markGreen", "when": "editorHasSelection" },
        { "command": "snipshot.markFold", "when": "editorHasSelection" }
      ]
    },
    "keybindings": [
      { "command": "snipshot.save", "key": "alt+shift+s", "when": "editorTextFocus" },
      { "command": "snipshot.copy", "key": "alt+shift+c", "when": "editorTextFocus" },
      { "command": "snipshot.markRed", "key": "alt+shift+r", "when": "editorTextFocus && editorHasSelection" },
      { "command": "snipshot.markGreen", "key": "alt+shift+g", "when": "editorTextFocus && editorHasSelection" },
      { "command": "snipshot.markFold", "key": "alt+shift+x", "when": "editorTextFocus && editorHasSelection" }
    ],
    "configuration": {
      "title": "Snipshot",
      "properties": {
        "snipshot.executablePath": {
          "type": "string",
          "default": "",
          "order": 1,
          "markdownDescription": "Path to the `snipshot` binary. Leave empty to use the binary fetched by **Snipshot: Download Binary**, or the `snipshot` found on your PATH (`npm install -g snipshot`).\n\n[Download binary](command:snipshot.downloadBinary) · [Check](command:snipshot.checkBinary)"
        },
        "snipshot.destination": {
          "type": "string",
          "default": "clipboard",
          "order": 2,
          "enum": ["clipboard", "ask", "projectSnipshot", "projectRoot", "custom"],
          "enumDescriptions": [
            "Clipboard (PNG): nothing is written to disk. SVG cannot go on the clipboard, so an SVG shot asks for a path instead.",
            "Ask every time: a save dialog, opening on the folder you used last.",
            "A .snipshot directory in the workspace, created on demand.",
            "The workspace root.",
            "A fixed folder of your choosing: see Custom Directory."
          ],
          "description": "Where the images go."
        },
        "snipshot.customDirectory": {
          "type": "string",
          "default": "",
          "order": 3,
          "description": "Folder used when Destination is \"custom\"."
        },
        "snipshot.format": {
          "type": "string",
          "default": "png",
          "order": 4,
          "enum": ["png", "svg"],
          "description": "Format of the plain Snipshot actions. \"Snipshot Selection as SVG\" always wins."
        },
        "snipshot.openAfterSave": {
          "type": "boolean",
          "default": false,
          "order": 5,
          "description": "Open the image in the editor after saving it. Off by default: the notification already offers to."
        },
        "snipshot.theme": {
          "type": "string",
          "default": "auto",
          "order": 6,
          "enum": ["auto", "dark", "light"],
          "description": "Color theme of the image. \"auto\" follows the VS Code theme."
        },
        "snipshot.contextLines": {
          "type": "integer",
          "default": 3,
          "minimum": 0,
          "order": 7,
          "description": "Lines of context before and after each range."
        },
        "snipshot.maxWidth": {
          "type": "integer",
          "default": 800,
          "minimum": 0,
          "order": 8,
          "description": "Max image width in pixels, with word wrap. 0 turns wrapping off and lets the image grow to the longest line."
        },
        "snipshot.maxLines": {
          "type": "integer",
          "default": 70,
          "minimum": 0,
          "order": 9,
          "description": "Refuse to render taller than this many rows, so images fit a page. 0 lifts the limit."
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p .",
    "watch": "tsc -w -p .",
    "pretest": "npm run compile",
    "test": "node --test \"out/test/**/*.test.js\"",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^18.19.0",
    "@types/vscode": "1.85.0",
    "@vscode/vsce": "^3.9.2",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 2: Write tsconfig, ignores**

<!-- write: extra/vscode/snipshot-vscode/tsconfig.json -->
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "node20",
    "outDir": "out",
    "rootDir": ".",
    "strict": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "out"]
}
```

<!-- write: extra/vscode/snipshot-vscode/.gitignore -->
```
node_modules/
out/
*.vsix
```

<!-- write: extra/vscode/snipshot-vscode/.vscodeignore -->
```
.gitignore
.vscodeignore
.vscode/**
tsconfig.json
DEVELOPMENT.md
src/**
test/**
out/test/**
out/**/*.map
node_modules/**
*.vsix
```

- [ ] **Step 3: Placeholder entry point and smoke test**

<!-- write: extra/vscode/snipshot-vscode/src/extension.ts -->
```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('snipshot.checkBinary', () => {
    void vscode.window.showInformationMessage('Snipshot is installed.');
  }));
}

export function deactivate(): void {}
```

<!-- write: extra/vscode/snipshot-vscode/test/smoke.test.ts -->
```ts
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

test('the test runner runs compiled tests', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Install, compile, test**

Run (in `extra/vscode/snipshot-vscode`): `cp ../../../LICENSE . && npm install && npm test`
Expected: `npm test` compiles and reports 1 passing test.

---

### Task 2: Line ranges and selection geometry (pure)

**Files:**
- Create: `src/ranges.ts`, `test/ranges.test.ts`

**Interfaces:**
- Produces: `LineRange {start,end}` (1-based inclusive), `formatRange`, `formatRanges`, `Position`, `Selection`, `isEmpty`, `selectionLines`, `selectionRange`, `captureRanges(selections, visible)`, `visibleRange(visible)`, `windowRangeCovering(visible, selection)`, `expandedColumn(lineText, character)`, `selectionHighlightSpec(selection, lineText)`.

- [ ] **Step 1: Write the failing tests**

<!-- write: extra/vscode/snipshot-vscode/test/ranges.test.ts -->
```ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  captureRanges, expandedColumn, formatRange, formatRanges, selectionHighlightSpec,
  selectionLines, selectionRange, visibleRange, windowRangeCovering, type Selection,
} from '../src/ranges.js';

const sel = (l1: number, c1: number, l2: number, c2: number): Selection =>
  ({ start: { line: l1, character: c1 }, end: { line: l2, character: c2 } });

describe('formatRange', () => {
  it('spells a single line and a range the way the CLI wants them', () => {
    assert.equal(formatRange({ start: 47, end: 47 }), '47');
    assert.equal(formatRange({ start: 47, end: 50 }), '47-50');
    assert.equal(formatRanges([{ start: 3, end: 5 }, { start: 39, end: 42 }]), '3-5,39-42');
  });
});

describe('selectionLines', () => {
  it('converts 0-based lines to 1-based', () => {
    assert.deepEqual(selectionLines(sel(9, 4, 12, 7)), { start: 10, end: 13 });
  });

  it('stops on the previous line when the selection ends at column 0', () => {
    assert.deepEqual(selectionLines(sel(9, 0, 12, 0)), { start: 10, end: 12 });
  });

  it('never ends before it starts', () => {
    assert.deepEqual(selectionLines(sel(9, 0, 10, 0)), { start: 10, end: 10 });
  });
});

describe('selectionRange', () => {
  it('is the caret line when nothing is selected', () => {
    assert.deepEqual(selectionRange(sel(4, 8, 4, 8)), { start: 5, end: 5 });
  });

  it('is the selected lines otherwise', () => {
    assert.deepEqual(selectionRange(sel(4, 8, 6, 1)), { start: 5, end: 7 });
  });
});

describe('captureRanges', () => {
  const visible = [{ start: 20, end: 60 }];

  it('gives one range per non-empty selection, sorted by start', () => {
    const ranges = captureRanges([sel(40, 0, 43, 5), sel(10, 0, 12, 0), sel(50, 3, 50, 3)], visible);
    assert.deepEqual(ranges, [{ start: 11, end: 12 }, { start: 41, end: 44 }]);
  });

  it('falls back to the visible area, merged across split views', () => {
    assert.deepEqual(captureRanges([sel(1, 1, 1, 1)], [{ start: 20, end: 30 }, { start: 40, end: 60 }]), [{ start: 20, end: 60 }]);
  });

  it('is line 1 with nothing visible at all', () => {
    assert.deepEqual(visibleRange([]), { start: 1, end: 1 });
  });
});

describe('windowRangeCovering', () => {
  it('widens the visible area to keep the selection in frame', () => {
    assert.deepEqual(windowRangeCovering({ start: 20, end: 60 }, { start: 58, end: 70 }), { start: 20, end: 70 });
    assert.deepEqual(windowRangeCovering({ start: 20, end: 60 }, { start: 30, end: 31 }), { start: 20, end: 60 });
  });
});

describe('expandedColumn', () => {
  it('counts each tab as four columns, as the CLI expands them', () => {
    assert.equal(expandedColumn('\t\tfoo', 2), 8);
    assert.equal(expandedColumn('\t\tfoo', 4), 10);
    assert.equal(expandedColumn('abc', 2), 2);
  });
});

describe('selectionHighlightSpec', () => {
  it('is empty without a selection', () => {
    assert.equal(selectionHighlightSpec(sel(46, 3, 46, 3), 'anything'), '');
  });

  it('boxes the characters of a selection inside one line, 1-based inclusive', () => {
    // characters 11..37 (0-based, end exclusive) → columns 12-38
    assert.equal(selectionHighlightSpec(sel(46, 11, 46, 38), 'x'.repeat(60)), '47:12-38');
  });

  it('shifts the columns past tabs', () => {
    assert.equal(selectionHighlightSpec(sel(0, 1, 0, 4), '\tfoo bar'), '1:5-7');
  });

  it('is the line when the selection covers it', () => {
    assert.equal(selectionHighlightSpec(sel(46, 0, 46, 5), 'hello'), '47');
  });

  it('is the line range when the selection spans lines', () => {
    assert.equal(selectionHighlightSpec(sel(46, 3, 48, 0), 'first line'), '47-48');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: compile error, `../src/ranges.js` not found.

- [ ] **Step 3: Implement**

<!-- write: extra/vscode/snipshot-vscode/src/ranges.ts -->
```ts
/** A 1-based, inclusive line range, spelled the way the snipshot CLI expects. */
export interface LineRange {
  start: number;
  end: number;
}

export function formatRange(range: LineRange): string {
  return range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`;
}

/** Comma-separated, as `--lines` and the highlight flags take them. */
export function formatRanges(ranges: LineRange[]): string {
  return ranges.map(formatRange).join(',');
}

/** A 0-based editor position, as VS Code counts them. */
export interface Position {
  line: number;
  character: number;
}

/** An ordered selection: start never comes after end. */
export interface Selection {
  start: Position;
  end: Position;
}

export function isEmpty(selection: Selection): boolean {
  return selection.start.line === selection.end.line &&
    selection.start.character === selection.end.character;
}

/**
 * The lines a selection covers, 1-based. A selection ending at column 0 of a
 * later line stops on the previous line: the trailing newline was selected,
 * not the line after it.
 */
export function selectionLines(selection: Selection): LineRange {
  const start = selection.start.line + 1;
  let endLine = selection.end.line;
  if (endLine > selection.start.line && selection.end.character === 0) endLine -= 1;
  return { start, end: Math.max(start, endLine + 1) };
}

/** The range covered by the selection, or the caret line. */
export function selectionRange(selection: Selection): LineRange {
  if (isEmpty(selection)) {
    const line = selection.start.line + 1;
    return { start: line, end: line };
  }
  return selectionLines(selection);
}

/** The first and last line currently scrolled into view, over every split. */
export function visibleRange(visible: LineRange[]): LineRange {
  if (visible.length === 0) return { start: 1, end: 1 };
  return {
    start: Math.min(...visible.map(v => v.start)),
    end: Math.max(...visible.map(v => v.end)),
  };
}

/**
 * The lines to capture: one range per selection (multiple cursors give
 * multiple ranges, which snipshot folds the gaps between). With no selection
 * at all, capture what is currently visible on screen.
 */
export function captureRanges(selections: Selection[], visible: LineRange[]): LineRange[] {
  const ranges = selections
    .filter(s => !isEmpty(s))
    .map(selectionLines)
    .sort((a, b) => a.start - b.start);
  if (ranges.length > 0) return ranges;
  return [visibleRange(visible)];
}

/**
 * The visible area, widened if needed so [selection] is inside the shot.
 * Keeps "shoot the window, point at this" from producing an image whose
 * annotation is off-screen.
 */
export function windowRangeCovering(visible: LineRange, selection: LineRange): LineRange {
  return {
    start: Math.min(visible.start, selection.start),
    end: Math.max(visible.end, selection.end),
  };
}

/** A column as the CLI counts it: 0-based, with every tab expanded to 4 spaces. */
export function expandedColumn(lineText: string, character: number): number {
  let column = 0;
  for (let i = 0; i < character && i < lineText.length; i++) {
    column += lineText[i] === '\t' ? 4 : 1;
  }
  return column + Math.max(0, character - lineText.length);
}

/**
 * The selection as a snipshot highlight spec. A selection sitting inside a
 * single line becomes a column box ("47:12-38") so only those characters are
 * outlined; anything else becomes a line range.
 */
export function selectionHighlightSpec(selection: Selection, lineText: string): string {
  if (isEmpty(selection)) return '';

  const range = selectionLines(selection);
  if (selection.start.line !== selection.end.line) return formatRange(range);

  const startColumn = expandedColumn(lineText, selection.start.character);
  const endColumn = expandedColumn(lineText, selection.end.character);
  if (endColumn <= startColumn) return formatRange(range);

  const coversWholeLine = selection.start.character === 0 && selection.end.character >= lineText.length;
  if (coversWholeLine) return formatRange(range);

  // snipshot columns are 1-based and inclusive; the selection end is exclusive.
  return `${range.start}:${startColumn + 1}-${endColumn}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all ranges tests pass.

---

### Task 3: The CLI request (pure)

**Files:**
- Create: `src/request.ts`, `test/request.test.ts`

**Interfaces:**
- Produces: `SnipshotRequest`, `toCommandArgs(request): string[]`, `mergeSpecs(...specs): string`, `defaultOutputName(filePath, lines, svg): string`, `retargetExtension(outputPath, svg): string`.

- [ ] **Step 1: Write the failing tests**

<!-- write: extra/vscode/snipshot-vscode/test/request.test.ts -->
```ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { defaultOutputName, mergeSpecs, retargetExtension, toCommandArgs, type SnipshotRequest } from '../src/request.js';

const base: SnipshotRequest = {
  filePath: '/work/src/App.java',
  lines: '40-60',
  red: '',
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

describe('toCommandArgs', () => {
  it('mirrors the plugin flag for flag, in the same order', () => {
    assert.deepEqual(toCommandArgs({ ...base, red: '47', green: '52-55', folds: '1-10' }), [
      '/work/src/App.java', '--lines', '40-60',
      '--highlight-red', '47', '--highlight-green', '52-55', '--fold', '1-10',
      '--theme', 'dark', '--context', '3', '--max-width', '800', '--max-lines', '70',
      '--root', '/work', '--output', '/work/App_L40-60.png',
    ]);
  });

  it('omits empty specs and the root, and spells zero limits as --no-* flags', () => {
    assert.deepEqual(toCommandArgs({ ...base, maxWidth: 0, maxLines: 0, svg: true, rootPath: undefined }), [
      '/work/src/App.java', '--lines', '40-60',
      '--theme', 'dark', '--context', '3', '--no-max-width', '--no-max-lines', '--svg',
      '--output', '/work/App_L40-60.png',
    ]);
  });
});

describe('mergeSpecs', () => {
  it('joins the non-blank specs with commas', () => {
    assert.equal(mergeSpecs('13,15-18', '', '  ', '47:12-38'), '13,15-18,47:12-38');
    assert.equal(mergeSpecs('', ''), '');
  });
});

describe('defaultOutputName', () => {
  it('is <name>_L<ranges>.<ext>, with + between ranges like the CLI', () => {
    assert.equal(defaultOutputName('/work/src/App.java', '40-60', false), 'App_L40-60.png');
    assert.equal(defaultOutputName('/work/src/App.java', '3-5,39-42', true), 'App_L3-5+39-42.svg');
  });
});

describe('retargetExtension', () => {
  it('swaps the extension when the format changes and leaves other paths alone', () => {
    assert.equal(retargetExtension('/x/shot.png', true), '/x/shot.svg');
    assert.equal(retargetExtension('/x/shot.SVG', false), '/x/shot.png');
    assert.equal(retargetExtension('/x/shot.png', false), '/x/shot.png');
    assert.equal(retargetExtension('/x/custom.out', true), '/x/custom.out');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` — Expected: compile error, `../src/request.js` not found.

- [ ] **Step 3: Implement**

<!-- write: extra/vscode/snipshot-vscode/src/request.ts -->
```ts
import * as path from 'path';

/** Everything one snipshot invocation needs. Mirrors the CLI flags one-for-one. */
export interface SnipshotRequest {
  filePath: string;
  /** `--lines` spec: one or more comma-separated ranges. */
  lines: string;
  red: string;
  green: string;
  folds: string;
  theme: 'dark' | 'light';
  contextLines: number;
  /** 0 = --no-max-width. */
  maxWidth: number;
  /** 0 = --no-max-lines. */
  maxLines: number;
  svg: boolean;
  outputPath: string;
  rootPath?: string;
}

/** The command line, in the same order as the IntelliJ plugin builds it. */
export function toCommandArgs(request: SnipshotRequest): string[] {
  const args = [request.filePath, '--lines', request.lines];
  if (request.red.trim()) args.push('--highlight-red', request.red);
  if (request.green.trim()) args.push('--highlight-green', request.green);
  if (request.folds.trim()) args.push('--fold', request.folds);
  args.push('--theme', request.theme, '--context', String(request.contextLines));
  if (request.maxWidth <= 0) args.push('--no-max-width');
  else args.push('--max-width', String(request.maxWidth));
  if (request.maxLines <= 0) args.push('--no-max-lines');
  else args.push('--max-lines', String(request.maxLines));
  if (request.svg) args.push('--svg');
  if (request.rootPath) args.push('--root', request.rootPath);
  args.push('--output', request.outputPath);
  return args;
}

/** Joins non-empty CLI specs, e.g. marks plus a one-shot selection. */
export function mergeSpecs(...specs: string[]): string {
  return specs.map(s => s.trim()).filter(s => s !== '').join(',');
}

/** `<name>_L<ranges>.<ext>`, with "+" between ranges like the CLI. */
export function defaultOutputName(filePath: string, lines: string, svg: boolean): string {
  const base = path.basename(filePath, path.extname(filePath));
  return `${base}_L${lines.replace(/,/g, '+')}.${svg ? 'svg' : 'png'}`;
}

/** Keeps the output extension in sync when the format is switched. */
export function retargetExtension(outputPath: string, svg: boolean): string {
  const wanted = svg ? '.svg' : '.png';
  const other = svg ? '.png' : '.svg';
  return outputPath.toLowerCase().endsWith(other)
    ? outputPath.slice(0, -other.length) + wanted
    : outputPath;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` — Expected: all pass.

---

### Task 4: Marks model (pure)

**Files:**
- Create: `src/marksModel.ts`, `test/marksModel.test.ts`

**Interfaces:**
- Consumes: `LineRange`, `formatRanges` from Task 2.
- Produces: `MarkKind`, `Mark`, `LineEdit`, `shiftRange(range, edit): LineRange | null`, `applyEdit(marks, edit): Mark[]`, `class MarkStore { add, ranges, spec, has, clear, applyEdit }` keyed by file path.

- [ ] **Step 1: Write the failing tests**

<!-- write: extra/vscode/snipshot-vscode/test/marksModel.test.ts -->
```ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { MarkStore, shiftRange, type LineEdit } from '../src/marksModel.js';

// 0-based edit geometry, like VS Code's content changes.
const edit = (startLine: number, endLine: number, endAtLineStart: boolean, newLineCount: number): LineEdit =>
  ({ startLine, endLine, endAtLineStart, newLineCount });

describe('shiftRange', () => {
  const mark = { start: 10, end: 12 }; // lines 10-12, 0-based 9-11

  it('shifts a mark below an insertion', () => {
    assert.deepEqual(shiftRange(mark, edit(2, 2, true, 3)), { start: 12, end: 14 });
  });

  it('shifts a mark up when lines above it are deleted', () => {
    assert.deepEqual(shiftRange(mark, edit(2, 5, true, 1)), { start: 7, end: 9 });
  });

  it('leaves a mark above an edit alone', () => {
    assert.deepEqual(shiftRange(mark, edit(20, 25, false, 1)), mark);
  });

  it('keeps a mark whose lines are only typed on', () => {
    assert.deepEqual(shiftRange(mark, edit(10, 10, false, 1)), mark);
  });

  it('grows a mark when lines are inserted inside it', () => {
    assert.deepEqual(shiftRange(mark, edit(10, 10, false, 3)), { start: 10, end: 14 });
  });

  it('shrinks a mark when a newline inside it is deleted', () => {
    assert.deepEqual(shiftRange(mark, edit(9, 10, true, 1)), { start: 10, end: 11 });
  });

  it('follows the join when the newline before the mark is deleted', () => {
    assert.deepEqual(shiftRange({ start: 10, end: 10 }, edit(8, 9, true, 1)), { start: 9, end: 9 });
  });

  it('drops a mark whose lines are deleted outright', () => {
    assert.equal(shiftRange(mark, edit(9, 12, true, 1)), null);
    assert.equal(shiftRange({ start: 10, end: 10 }, edit(9, 10, true, 1)), null);
  });

  it('clips a mark cut from the middle to below', () => {
    assert.deepEqual(shiftRange(mark, edit(10, 15, false, 1)), { start: 10, end: 11 });
  });
});

describe('MarkStore', () => {
  it('keeps marks per file, sorted, and spells them as CLI specs', () => {
    const store = new MarkStore();
    store.add('/a.ts', { kind: 'red', range: { start: 47, end: 47 } });
    store.add('/a.ts', { kind: 'green', range: { start: 52, end: 55 } });
    store.add('/a.ts', { kind: 'red', range: { start: 13, end: 18 } });
    store.add('/b.ts', { kind: 'fold', range: { start: 1, end: 9 } });

    assert.equal(store.spec('/a.ts', 'red'), '13-18,47');
    assert.equal(store.spec('/a.ts', 'green'), '52-55');
    assert.equal(store.spec('/a.ts', 'fold'), '');
    assert.equal(store.spec('/b.ts', 'fold'), '1-9');
    assert.equal(store.has('/a.ts'), true);
    assert.equal(store.has('/c.ts'), false);
  });

  it('clears one file only', () => {
    const store = new MarkStore();
    store.add('/a.ts', { kind: 'red', range: { start: 1, end: 1 } });
    store.add('/b.ts', { kind: 'red', range: { start: 1, end: 1 } });
    store.clear('/a.ts');
    assert.equal(store.has('/a.ts'), false);
    assert.equal(store.has('/b.ts'), true);
  });

  it('moves marks with edits and forgets deleted ones', () => {
    const store = new MarkStore();
    store.add('/a.ts', { kind: 'red', range: { start: 10, end: 12 } });
    store.add('/a.ts', { kind: 'green', range: { start: 30, end: 30 } });
    store.applyEdit('/a.ts', edit(0, 0, true, 2));      // one line inserted at the top
    store.applyEdit('/a.ts', edit(30, 31, true, 1));    // the (shifted) green line deleted
    assert.equal(store.spec('/a.ts', 'red'), '11-13');
    assert.equal(store.spec('/a.ts', 'green'), '');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` — Expected: compile error, `../src/marksModel.js` not found.

- [ ] **Step 3: Implement**

<!-- write: extra/vscode/snipshot-vscode/src/marksModel.ts -->
```ts
import { formatRanges, type LineRange } from './ranges.js';

export type MarkKind = 'red' | 'green' | 'fold';

export interface Mark {
  kind: MarkKind;
  range: LineRange;
}

/**
 * A document edit reduced to its line geometry, 0-based. [endLine] is the
 * last line the replaced range reaches; when the range ends at column 0 of
 * that line ([endAtLineStart]) the line's own text is untouched.
 * [newLineCount] is how many lines the inserted text spans (1 = no newline).
 */
export interface LineEdit {
  startLine: number;
  endLine: number;
  endAtLineStart: boolean;
  newLineCount: number;
}

/**
 * Where a marked range ends up after [edit], or null when the edit deleted
 * the marked lines outright. Marks above the edit stay put, marks below shift
 * by the line delta, and a mark the edit runs into keeps its start and grows
 * or shrinks with it — the way an editor highlighter follows the text.
 */
export function shiftRange(range: LineRange, edit: LineEdit): LineRange | null {
  const markStart = range.start - 1;
  const markEnd = range.end - 1;
  const { startLine, endLine, newLineCount } = edit;
  const delta = (newLineCount - 1) - (endLine - startLine);
  // The last line whose content the edit touched.
  const lastTouched = edit.endAtLineStart && endLine > startLine ? endLine - 1 : endLine;

  if (lastTouched < markStart) {
    return { start: range.start + delta, end: range.end + delta };
  }
  if (startLine > markEnd) return range;

  const markLines = markEnd - markStart + 1;
  if (startLine <= markStart && lastTouched >= markEnd && -delta >= markLines) return null;

  const start = Math.min(markStart, startLine);
  const end = Math.max(start, endLine <= markEnd ? markEnd + delta : startLine + newLineCount - 1);
  return { start: start + 1, end: end + 1 };
}

export function applyEdit(marks: Mark[], edit: LineEdit): Mark[] {
  const moved: Mark[] = [];
  for (const mark of marks) {
    const range = shiftRange(mark.range, edit);
    if (range) moved.push({ kind: mark.kind, range });
  }
  return moved;
}

/**
 * Remembers which lines the user marked red / green / folded, per file.
 * Marks are session-only on purpose: they describe one screenshot in
 * progress, not a property of the file.
 */
export class MarkStore {
  private readonly byFile = new Map<string, Mark[]>();

  add(file: string, mark: Mark): void {
    const marks = this.byFile.get(file) ?? [];
    marks.push(mark);
    this.byFile.set(file, marks);
  }

  /** Marked ranges of one kind, sorted by start line. */
  ranges(file: string, kind: MarkKind): LineRange[] {
    return (this.byFile.get(file) ?? [])
      .filter(m => m.kind === kind)
      .map(m => m.range)
      .sort((a, b) => a.start - b.start);
  }

  /** The same ranges as a comma-separated CLI spec, e.g. "13,15-18". */
  spec(file: string, kind: MarkKind): string {
    return formatRanges(this.ranges(file, kind));
  }

  has(file: string): boolean {
    return (this.byFile.get(file)?.length ?? 0) > 0;
  }

  clear(file: string): void {
    this.byFile.delete(file);
  }

  applyEdit(file: string, edit: LineEdit): void {
    const marks = this.byFile.get(file);
    if (!marks) return;
    this.byFile.set(file, applyEdit(marks, edit));
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` — Expected: all pass.

---

### Task 5: Platform facts and the clipboard strategy (pure)

**Files:**
- Create: `src/platform.ts`, `src/clipboardStrategy.ts`, `test/platform.test.ts`, `test/clipboardStrategy.test.ts`

**Interfaces:**
- Produces: `ReleaseTarget`, `releaseTarget(platform, arch)`, `downloadUrl(target)`, `EXECUTABLE_CANDIDATES`, `findInPath(pathVar, isFile, candidates?, delimiter?)`, `isWslHost(platform, env, procVersion)`; `ClipboardStrategy`, `HostInfo`, `chooseClipboardStrategy(host)`.

- [ ] **Step 1: Write the failing tests**

<!-- write: extra/vscode/snipshot-vscode/test/platform.test.ts -->
```ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { downloadUrl, findInPath, isWslHost, releaseTarget } from '../src/platform.js';

describe('releaseTarget', () => {
  it('names the release asset for each platform we ship', () => {
    assert.deepEqual(releaseTarget('win32', 'x64'), { asset: 'snipshot-windows-x64.zip', binaryName: 'snipshot.exe' });
    assert.deepEqual(releaseTarget('darwin', 'arm64'), { asset: 'snipshot-macos-arm64.tar.gz', binaryName: 'snipshot' });
    assert.deepEqual(releaseTarget('darwin', 'x64'), { asset: 'snipshot-macos-x64.tar.gz', binaryName: 'snipshot' });
    assert.deepEqual(releaseTarget('linux', 'x64'), { asset: 'snipshot-linux-x64.tar.gz', binaryName: 'snipshot' });
    assert.equal(releaseTarget('linux', 'arm64'), undefined);
  });

  it('downloads from the stable latest-release URL', () => {
    assert.equal(
      downloadUrl({ asset: 'snipshot-linux-x64.tar.gz', binaryName: 'snipshot' }),
      'https://github.com/9pings/snipshot/releases/latest/download/snipshot-linux-x64.tar.gz',
    );
  });
});

describe('findInPath', () => {
  it('returns the first candidate that exists, scanning PATH in order', () => {
    const present = new Set(['/usr/local/bin/snipshot.cmd', '/opt/bin/snipshot']);
    assert.equal(findInPath('/usr/bin:/usr/local/bin:/opt/bin', p => present.has(p), undefined, ':'), '/usr/local/bin/snipshot.cmd');
    assert.equal(findInPath('/usr/bin', p => present.has(p), undefined, ':'), undefined);
    assert.equal(findInPath(undefined, () => true, undefined, ':'), undefined);
  });
});

describe('isWslHost', () => {
  it('spots WSL from the environment or the kernel string, on Linux only', () => {
    assert.equal(isWslHost('linux', { WSL_DISTRO_NAME: 'kali-linux' }, ''), true);
    assert.equal(isWslHost('linux', {}, 'Linux version 5.15.167.4-microsoft-standard-WSL2'), true);
    assert.equal(isWslHost('linux', {}, 'Linux version 6.8.0-generic'), false);
    assert.equal(isWslHost('win32', { WSL_DISTRO_NAME: 'x' }, 'microsoft'), false);
  });
});
```

<!-- write: extra/vscode/snipshot-vscode/test/clipboardStrategy.test.ts -->
```ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { chooseClipboardStrategy, type HostInfo } from '../src/clipboardStrategy.js';

const host = (overrides: Partial<HostInfo>): HostInfo => ({
  platform: 'linux',
  remoteName: undefined,
  isWsl: false,
  waylandDisplay: undefined,
  hasCommand: () => false,
  ...overrides,
});

describe('chooseClipboardStrategy', () => {
  it('gives up on remotes other than WSL: their clipboard is not the user\'s', () => {
    const strategy = chooseClipboardStrategy(host({ remoteName: 'ssh-remote' }));
    assert.equal(strategy.kind, 'unreachable');
  });

  it('uses PowerShell on Windows and through WSL interop', () => {
    assert.deepEqual(chooseClipboardStrategy(host({ platform: 'win32' })), { kind: 'powershell' });
    assert.deepEqual(chooseClipboardStrategy(host({ isWsl: true })), { kind: 'wsl' });
    assert.deepEqual(chooseClipboardStrategy(host({ isWsl: true, remoteName: 'wsl' })), { kind: 'wsl' });
  });

  it('uses osascript on macOS', () => {
    assert.deepEqual(chooseClipboardStrategy(host({ platform: 'darwin' })), { kind: 'osascript' });
  });

  it('prefers wl-copy under Wayland, then xclip, then reports what to install', () => {
    assert.deepEqual(chooseClipboardStrategy(host({ waylandDisplay: 'wayland-0', hasCommand: n => n === 'wl-copy' })), { kind: 'wl-copy' });
    assert.deepEqual(chooseClipboardStrategy(host({ waylandDisplay: 'wayland-0', hasCommand: n => n === 'xclip' })), { kind: 'xclip' });
    assert.deepEqual(chooseClipboardStrategy(host({ hasCommand: n => n === 'xclip' })), { kind: 'xclip' });
    const none = chooseClipboardStrategy(host({}));
    assert.equal(none.kind, 'unreachable');
    assert.match(none.kind === 'unreachable' ? none.reason : '', /wl-clipboard.*xclip/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` — Expected: compile errors, modules not found.

- [ ] **Step 3: Implement**

<!-- write: extra/vscode/snipshot-vscode/src/platform.ts -->
```ts
import * as path from 'path';

export interface ReleaseTarget {
  asset: string;
  binaryName: string;
}

/** Release assets carry no version, which keeps this URL stable. */
const LATEST_DOWNLOAD = 'https://github.com/9pings/snipshot/releases/latest/download';

/** The release asset for a machine, or undefined when we do not ship one. */
export function releaseTarget(platform: string, arch: string): ReleaseTarget | undefined {
  if (platform === 'win32') return { asset: 'snipshot-windows-x64.zip', binaryName: 'snipshot.exe' };
  if (platform === 'darwin' && arch === 'arm64') return { asset: 'snipshot-macos-arm64.tar.gz', binaryName: 'snipshot' };
  if (platform === 'darwin') return { asset: 'snipshot-macos-x64.tar.gz', binaryName: 'snipshot' };
  if (platform === 'linux' && arch !== 'arm64') return { asset: 'snipshot-linux-x64.tar.gz', binaryName: 'snipshot' };
  return undefined;
}

export function downloadUrl(target: ReleaseTarget): string {
  return `${LATEST_DOWNLOAD}/${target.asset}`;
}

/** npm installs a shim whose name differs per OS, so try every spelling. */
export const EXECUTABLE_CANDIDATES = ['snipshot', 'snipshot.cmd', 'snipshot.exe', 'snipshot.bat'];

/** The first candidate found in a PATH-like variable; [isFile] abstracts the disk. */
export function findInPath(
  pathVar: string | undefined,
  isFile: (file: string) => boolean,
  candidates: string[] = EXECUTABLE_CANDIDATES,
  delimiter: string = path.delimiter,
): string | undefined {
  for (const dir of (pathVar ?? '').split(delimiter).filter(d => d !== '')) {
    for (const name of candidates) {
      const candidate = path.join(dir, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/** True inside WSL, where a Linux clipboard never reaches Windows applications. */
export function isWslHost(platform: string, env: Record<string, string | undefined>, procVersion: string): boolean {
  if (platform !== 'linux') return false;
  return env.WSL_DISTRO_NAME !== undefined || /microsoft/i.test(procVersion);
}
```

<!-- write: extra/vscode/snipshot-vscode/src/clipboardStrategy.ts -->
```ts
/**
 * VS Code's clipboard API is text-only, so an image goes on the clipboard
 * through a platform tool. This picks which one, from facts about the host.
 */
export type ClipboardStrategy =
  /** Native Windows: PowerShell + System.Windows.Forms. */
  | { kind: 'powershell' }
  /** Linux under WSL: the same PowerShell, reached through WSL interop. */
  | { kind: 'wsl' }
  | { kind: 'osascript' }
  | { kind: 'wl-copy' }
  | { kind: 'xclip' }
  | { kind: 'unreachable'; reason: string };

export interface HostInfo {
  platform: string;
  /** `vscode.env.remoteName`: undefined locally; "wsl", "ssh-remote", "dev-container", ... */
  remoteName: string | undefined;
  isWsl: boolean;
  waylandDisplay: string | undefined;
  hasCommand: (name: string) => boolean;
}

export function chooseClipboardStrategy(host: HostInfo): ClipboardStrategy {
  if (host.remoteName !== undefined && host.remoteName !== 'wsl') {
    return {
      kind: 'unreachable',
      reason: `the extension runs on the remote host (${host.remoteName}), whose clipboard is not the one you paste from`,
    };
  }
  if (host.platform === 'win32') return { kind: 'powershell' };
  if (host.isWsl) return { kind: 'wsl' };
  if (host.platform === 'darwin') return { kind: 'osascript' };
  if (host.platform === 'linux') {
    if (host.waylandDisplay && host.hasCommand('wl-copy')) return { kind: 'wl-copy' };
    if (host.hasCommand('xclip')) return { kind: 'xclip' };
    return { kind: 'unreachable', reason: 'no clipboard tool found: install wl-clipboard (Wayland) or xclip (X11)' };
  }
  return { kind: 'unreachable', reason: `no clipboard support on ${host.platform}` };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` — Expected: all pass.

---

### Task 6: Settings, editor context and marks (vscode-bound)

**Files:**
- Create: `src/settings.ts`, `src/context.ts`, `src/marks.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `readSettings(): Settings`, `resolveTheme(theme)`, `lastSaveDirectory(context)`, `rememberSaveDirectory(context, dir)`; `captureLines(editor)`, `currentSelectionRange(editor)`, `currentHighlightSpec(editor)`, `windowLines(editor)`, `workspaceRoot(uri)`, `outputDirectory(context, settings, uri)`, `buildRequest(context, editor, store, options)`; `class Marks { store, add(editor, kind, range), has(editor), clear(editor), dispose() }`.

- [ ] **Step 1: Settings**

<!-- write: extra/vscode/snipshot-vscode/src/settings.ts -->
```ts
import * as vscode from 'vscode';

export type Destination = 'clipboard' | 'ask' | 'projectSnipshot' | 'projectRoot' | 'custom';
export type ThemeSetting = 'auto' | 'dark' | 'light';

/** The `snipshot.*` settings, read fresh on every shot. */
export interface Settings {
  /** Empty = look the binary up (downloaded, then PATH). */
  executablePath: string;
  destination: Destination;
  /** Only used when destination is "custom". */
  customDirectory: string;
  /** Format of the plain Snipshot actions. */
  format: 'png' | 'svg';
  openAfterSave: boolean;
  theme: ThemeSetting;
  contextLines: number;
  /** 0 disables word wrap (--no-max-width). */
  maxWidth: number;
  /** 0 disables the row limit (--no-max-lines). */
  maxLines: number;
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('snipshot');
  return {
    executablePath: config.get<string>('executablePath', '').trim(),
    destination: config.get<Destination>('destination', 'clipboard'),
    customDirectory: config.get<string>('customDirectory', '').trim(),
    format: config.get<'png' | 'svg'>('format', 'png'),
    openAfterSave: config.get<boolean>('openAfterSave', false),
    theme: config.get<ThemeSetting>('theme', 'auto'),
    contextLines: config.get<number>('contextLines', 3),
    maxWidth: config.get<number>('maxWidth', 800),
    maxLines: config.get<number>('maxLines', 70),
  };
}

/** "auto" resolves against the active color theme. */
export function resolveTheme(theme: ThemeSetting): 'dark' | 'light' {
  if (theme !== 'auto') return theme;
  const kind = vscode.window.activeColorTheme.kind;
  const light = kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
  return light ? 'light' : 'dark';
}

const LAST_SAVE_DIRECTORY = 'snipshot.lastSaveDirectory';

/** Folder the last image was saved into through the dialog, reused by it. */
export function lastSaveDirectory(context: vscode.ExtensionContext): string | undefined {
  return context.globalState.get<string>(LAST_SAVE_DIRECTORY);
}

export function rememberSaveDirectory(context: vscode.ExtensionContext, directory: string): Thenable<void> {
  return context.globalState.update(LAST_SAVE_DIRECTORY, directory);
}
```

- [ ] **Step 2: Editor context**

<!-- write: extra/vscode/snipshot-vscode/src/context.ts -->
```ts
import * as path from 'path';
import * as vscode from 'vscode';
import type { MarkStore } from './marksModel.js';
import {
  captureRanges, formatRange, formatRanges, selectionHighlightSpec, selectionRange,
  visibleRange, windowRangeCovering, type LineRange, type Selection,
} from './ranges.js';
import { defaultOutputName, mergeSpecs, type SnipshotRequest } from './request.js';
import { lastSaveDirectory, readSettings, resolveTheme, type Settings } from './settings.js';

/** Turns the state of an editor into a [SnipshotRequest]. */

function toSelection(selection: vscode.Selection): Selection {
  return {
    start: { line: selection.start.line, character: selection.start.character },
    end: { line: selection.end.line, character: selection.end.character },
  };
}

function visibleLines(editor: vscode.TextEditor): LineRange[] {
  return editor.visibleRanges.map(range => ({ start: range.start.line + 1, end: range.end.line + 1 }));
}

/** `--lines` for the plain actions: the selections, or the visible area. */
export function captureLines(editor: vscode.TextEditor): string {
  return formatRanges(captureRanges(editor.selections.map(toSelection), visibleLines(editor)));
}

/** The primary selection's lines, or the caret line. */
export function currentSelectionRange(editor: vscode.TextEditor): LineRange {
  return selectionRange(toSelection(editor.selection));
}

/** The primary selection as a highlight spec (column box inside one line). */
export function currentHighlightSpec(editor: vscode.TextEditor): string {
  const selection = toSelection(editor.selection);
  return selectionHighlightSpec(selection, editor.document.lineAt(selection.start.line).text);
}

/** `--lines` for "Snipshot this": the visible window, widened to cover the selection. */
export function windowLines(editor: vscode.TextEditor): string {
  return formatRange(windowRangeCovering(visibleRange(visibleLines(editor)), currentSelectionRange(editor)));
}

export function workspaceRoot(uri: vscode.Uri): string | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

/** Where images are written, per the destination setting. */
export function outputDirectory(context: vscode.ExtensionContext, settings: Settings, file: vscode.Uri): string {
  const base = workspaceRoot(file) ?? path.dirname(file.fsPath);
  switch (settings.destination) {
    case 'custom': return settings.customDirectory || base;
    case 'projectRoot': return base;
    case 'projectSnipshot': return path.join(base, '.snipshot');
    // Ask and clipboard: where the dialog will open, and what the options
    // panel pre-fills.
    default: return lastSaveDirectory(context) || base;
  }
}

export interface RequestOptions {
  svg: boolean;
  /** Defaults to the selections (or the visible area). */
  lines?: string;
  /** One-shot specs merged on top of the marks. */
  extraRed?: string;
  extraGreen?: string;
}

/** Builds a request from the editor, the stored marks and the settings. */
export function buildRequest(
  context: vscode.ExtensionContext,
  editor: vscode.TextEditor,
  marks: MarkStore,
  options: RequestOptions,
): SnipshotRequest {
  const settings = readSettings();
  const file = editor.document.uri;
  const filePath = file.fsPath;
  const lines = options.lines ?? captureLines(editor);
  return {
    filePath,
    lines,
    red: mergeSpecs(marks.spec(filePath, 'red'), options.extraRed ?? ''),
    green: mergeSpecs(marks.spec(filePath, 'green'), options.extraGreen ?? ''),
    folds: marks.spec(filePath, 'fold'),
    theme: resolveTheme(settings.theme),
    contextLines: settings.contextLines,
    maxWidth: settings.maxWidth,
    maxLines: settings.maxLines,
    svg: options.svg,
    outputPath: path.join(outputDirectory(context, settings, file), defaultOutputName(filePath, lines, options.svg)),
    rootPath: workspaceRoot(file),
  };
}
```

- [ ] **Step 3: Marks with their editor tint**

<!-- write: extra/vscode/snipshot-vscode/src/marks.ts -->
```ts
import * as vscode from 'vscode';
import { MarkStore, type MarkKind } from './marksModel.js';
import type { LineRange } from './ranges.js';

const KINDS: MarkKind[] = ['red', 'green', 'fold'];

/** The plugin's tints: light theme / dark theme. */
const TINTS: Record<MarkKind, { light: string; dark: string }> = {
  red: { light: '#FFDCDC', dark: '#5A2D30' },
  green: { light: '#D8F3D8', dark: '#28502D' },
  fold: { light: '#E8E8EA', dark: '#373C44' },
};

/**
 * The marks plus their tint in the editor, so what you see is what the next
 * shot will carry. Ranges follow edits, and go away with the document.
 */
export class Marks implements vscode.Disposable {
  readonly store = new MarkStore();
  private readonly decorations: Record<MarkKind, vscode.TextEditorDecorationType>;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.decorations = {
      red: tint('red'),
      green: tint('green'),
      fold: tint('fold'),
    };
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => this.onEdit(event)),
      vscode.window.onDidChangeVisibleTextEditors(editors => editors.forEach(editor => this.paint(editor))),
      vscode.workspace.onDidCloseTextDocument(document => this.store.clear(document.uri.fsPath)),
    );
  }

  add(editor: vscode.TextEditor, kind: MarkKind, range: LineRange): void {
    this.store.add(editor.document.uri.fsPath, { kind, range });
    this.paintAll(editor.document);
  }

  has(editor: vscode.TextEditor): boolean {
    return this.store.has(editor.document.uri.fsPath);
  }

  clear(editor: vscode.TextEditor): void {
    this.store.clear(editor.document.uri.fsPath);
    this.paintAll(editor.document);
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    KINDS.forEach(kind => this.decorations[kind].dispose());
  }

  private onEdit(event: vscode.TextDocumentChangeEvent): void {
    const file = event.document.uri.fsPath;
    if (!this.store.has(file)) return;
    // Changes arrive bottom-up, each in the coordinates of the original
    // document, so applying them in order keeps every shift correct.
    for (const change of event.contentChanges) {
      this.store.applyEdit(file, {
        startLine: change.range.start.line,
        endLine: change.range.end.line,
        endAtLineStart: change.range.end.character === 0,
        newLineCount: change.text.split('\n').length,
      });
    }
    this.paintAll(event.document);
  }

  private paintAll(document: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === document) this.paint(editor);
    }
  }

  private paint(editor: vscode.TextEditor): void {
    const file = editor.document.uri.fsPath;
    const lastLine = Math.max(0, editor.document.lineCount - 1);
    const clamp = (line: number) => Math.min(Math.max(line, 0), lastLine);
    for (const kind of KINDS) {
      const ranges = this.store.ranges(file, kind)
        .map(r => new vscode.Range(clamp(r.start - 1), 0, clamp(r.end - 1), 0));
      editor.setDecorations(this.decorations[kind], ranges);
    }
  }
}

function tint(kind: MarkKind): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    light: { backgroundColor: TINTS[kind].light, overviewRulerColor: TINTS[kind].light },
    dark: { backgroundColor: TINTS[kind].dark, overviewRulerColor: TINTS[kind].dark },
    overviewRulerLane: vscode.OverviewRulerLane.Center,
  });
}
```

- [ ] **Step 4: Compile**

Run: `npm run compile` — Expected: no errors.

---

### Task 7: Processes, binary resolution and the runner

**Files:**
- Create: `src/process.ts`, `src/downloader.ts`, `src/runner.ts`

**Interfaces:**
- Consumes: `toCommandArgs`, `SnipshotRequest` (Task 3); `findInPath`, `releaseTarget`, `downloadUrl` (Task 5); `readSettings` (Task 6).
- Produces: `spawnCapture(command, args, options)`, `isFile(path)`; `downloadedBinary(context)`, `downloadBinary(context)`, `probeVersion(binary)`; `resolveExecutable(context)`, `runSnipshot(executable, request)`, `run(context, request, onSuccess?)`, `notifySaved(file, message?, warning?)`, `notifyMissingExecutable()`.

- [ ] **Step 1: Processes**

<!-- write: extra/vscode/snipshot-vscode/src/process.ts -->
```ts
import { spawn } from 'child_process';
import * as fs from 'fs';

export interface ProcessOutput {
  /** Null when the process could not start or was killed. */
  code: number | null;
  stdout: string;
  stderr: string;
  /** Why it did not run to completion. */
  error?: string;
}

export interface SpawnOptions {
  cwd?: string;
  timeoutMs: number;
  /** Written to stdin, which is closed either way. */
  input?: Buffer;
  /**
   * For tools that fork to keep serving the clipboard (xclip, wl-copy): their
   * pipes never close, so resolve on exit and do not read the output.
   */
  ignoreOutput?: boolean;
}

export function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Runs a command to completion and captures its output; never throws. */
export function spawnCapture(command: string, args: string[], options: SpawnOptions): Promise<ProcessOutput> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (output: ProcessOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(output);
    };

    // npm's Windows shim is a .cmd, which only cmd.exe can run.
    const shim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
    const child = shim
      ? spawn('cmd.exe', ['/d', '/s', '/c', `"${[command, ...args].map(quoteForCmd).join(' ')}"`], {
        cwd: options.cwd, windowsVerbatimArguments: true, windowsHide: true,
      })
      : spawn(command, args, {
        cwd: options.cwd, windowsHide: true,
        stdio: options.ignoreOutput ? ['pipe', 'ignore', 'ignore'] : 'pipe',
      });

    const timer = setTimeout(() => {
      child.kill();
      finish({ code: null, stdout, stderr, error: `timed out after ${options.timeoutMs / 1000}s` });
    }, options.timeoutMs);

    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', err => finish({ code: null, stdout, stderr, error: err.message }));
    child.on(options.ignoreOutput ? 'exit' : 'close', code => finish({ code, stdout, stderr }));
    child.stdin?.on('error', () => { /* the tool may exit before reading */ });
    child.stdin?.end(options.input);
  });
}

function quoteForCmd(arg: string): string {
  return `"${arg.replace(/"/g, '\\"')}"`;
}
```

- [ ] **Step 2: Downloader**

<!-- write: extra/vscode/snipshot-vscode/src/downloader.ts -->
```ts
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
```

- [ ] **Step 3: Runner**

<!-- write: extra/vscode/snipshot-vscode/src/runner.ts -->
```ts
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
```

- [ ] **Step 4: Compile**

Run: `npm run compile` — Expected: no errors.

---

### Task 8: Clipboard and delivery

**Files:**
- Create: `src/clipboard.ts`, `src/output.ts`

**Interfaces:**
- Consumes: Task 5 strategy/platform, Task 7 process/runner, Task 6 settings.
- Produces: `copyImageToClipboard(file): Promise<string | undefined>` (undefined = success); `send(context, request)`, `sendToClipboard(context, request)`.

- [ ] **Step 1: Clipboard**

<!-- write: extra/vscode/snipshot-vscode/src/clipboard.ts -->
```ts
import * as fs from 'fs';
import * as vscode from 'vscode';
import { chooseClipboardStrategy, type ClipboardStrategy } from './clipboardStrategy.js';
import { findInPath, isWslHost } from './platform.js';
import { isFile, spawnCapture, type ProcessOutput } from './process.js';

/**
 * Puts a PNG on the clipboard. VS Code's clipboard API is text-only, so the
 * image is handed to a platform tool: PowerShell on Windows (and, through
 * interop, from inside WSL, where a Linux clipboard never reaches Windows
 * applications), osascript on macOS, wl-copy or xclip on Linux.
 */

const TIMEOUT_MS = 20_000;

const POWERSHELL_FALLBACKS = [
  '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  '/mnt/c/Windows/system32/WindowsPowerShell/v1.0/powershell.exe',
];

/**
 * Set once the WSL bridge has failed. Interop does not come back mid-session,
 * and retrying costs a PowerShell spawn on every single shot.
 */
let wslUnavailable: string | undefined;

function procVersion(): string {
  try {
    return fs.readFileSync('/proc/version', 'utf8');
  } catch {
    return '';
  }
}

export function currentStrategy(): ClipboardStrategy {
  return chooseClipboardStrategy({
    platform: process.platform,
    remoteName: vscode.env.remoteName,
    isWsl: isWslHost(process.platform, process.env, procVersion()),
    waylandDisplay: process.env.WAYLAND_DISPLAY,
    hasCommand: name => findInPath(process.env.PATH, isFile, [name]) !== undefined,
  });
}

/** Copies the PNG at [file]. Returns undefined on success, else why not. */
export async function copyImageToClipboard(file: string): Promise<string | undefined> {
  const strategy = currentStrategy();
  switch (strategy.kind) {
    case 'unreachable':
      return strategy.reason;
    case 'powershell':
      return powershellCopy('powershell.exe', file);
    case 'wsl':
      return wslCopy(file);
    case 'osascript':
      return failureOf(await spawnCapture('osascript', [
        '-e', `set the clipboard to (read (POSIX file "${file.replace(/"/g, '\\"')}") as «class PNGf»)`,
      ], { timeoutMs: TIMEOUT_MS }));
    case 'wl-copy':
      return failureOf(await spawnCapture('wl-copy', ['--type', 'image/png'], {
        timeoutMs: TIMEOUT_MS, input: await fs.promises.readFile(file), ignoreOutput: true,
      }));
    case 'xclip':
      return failureOf(await spawnCapture('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-i', file], {
        timeoutMs: TIMEOUT_MS, ignoreOutput: true,
      }));
  }
}

function failureOf(output: ProcessOutput): string | undefined {
  if (output.error) return output.error;
  if (output.code === 0) return undefined;
  return output.stderr.trim() || `exit code ${output.code}`;
}

/**
 * One line on purpose: multi-line arguments do not survive the WSL interop
 * layer intact. SetDataObject(.., $true) is what keeps the image on the
 * clipboard once this PowerShell process exits; SetImage alone would lose
 * it. ErrorActionPreference plus the catch turn a .NET exception into a
 * non-zero exit code, which would otherwise stay 0.
 */
async function powershellCopy(powershell: string, windowsPath: string): Promise<string | undefined> {
  const script = [
    "$ErrorActionPreference='Stop';",
    'try {',
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
    `$img=[System.Drawing.Image]::FromFile('${windowsPath.replace(/'/g, "''")}');`,
    '[System.Windows.Forms.Clipboard]::SetDataObject($img,$true);',
    '$img.Dispose()',
    '} catch { Write-Error $_; exit 1 }',
  ].join(' ');
  return failureOf(await spawnCapture(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], { timeoutMs: TIMEOUT_MS }));
}

async function wslCopy(file: string): Promise<string | undefined> {
  if (wslUnavailable) return wslUnavailable;

  const powershell = await findPowershell();
  if (!powershell) return remember('powershell.exe not found, WSL interop looks disabled');

  const translated = await spawnCapture('wslpath', ['-w', file], { timeoutMs: TIMEOUT_MS });
  const windowsPath = translated.code === 0 ? translated.stdout.trim() : '';
  if (!windowsPath) return remember(`could not translate ${file} to a Windows path`);

  const failure = await powershellCopy(powershell, windowsPath);
  return failure ? remember(failure) : undefined;
}

function remember(reason: string): string {
  wslUnavailable = reason;
  return reason;
}

async function findPowershell(): Promise<string | undefined> {
  const probe = await spawnCapture('powershell.exe', ['-NoProfile', '-Command', 'exit 0'], { timeoutMs: TIMEOUT_MS });
  if (probe.code === 0) return 'powershell.exe';
  return POWERSHELL_FALLBACKS.find(isFile);
}
```

- [ ] **Step 2: Output**

<!-- write: extra/vscode/snipshot-vscode/src/output.ts -->
```ts
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
    await notifySaved(
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
```

- [ ] **Step 3: Compile**

Run: `npm run compile` — Expected: no errors.

---

### Task 9: The "Snipshot…" options panel

**Files:**
- Create: `src/optionsPanel.ts`

**Interfaces:**
- Consumes: `SnipshotRequest`, `retargetExtension` (Task 3).
- Produces: `showOptionsPanel(initial, onSubmit)`.

- [ ] **Step 1: Implement**

<!-- write: extra/vscode/snipshot-vscode/src/optionsPanel.ts -->
```ts
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
```

- [ ] **Step 2: Compile**

Run: `npm run compile` — Expected: no errors.

---

### Task 10: Commands (entry point)

**Files:**
- Modify: `src/extension.ts` (replace the placeholder)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Implement**

<!-- write: extra/vscode/snipshot-vscode/src/extension.ts -->
```ts
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
```

- [ ] **Step 2: Compile and test, then package once by hand**

Run: `npm test && npx vsce package --out /tmp/snipshot-test.vsix && unzip -l /tmp/snipshot-test.vsix`
Expected: tests pass; the vsix lists `extension/out/src/*.js`, `extension/package.json`, `extension/README.md`, `extension/LICENSE`, and no `src/`, `test/` or `.map` files.

---

### Task 11: Build script, root scripts, CI and release

**Files:**
- Create: `scripts/build-vscode.mjs`
- Modify: `package.json` (root, `scripts`), `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: Build script**

<!-- write: scripts/build-vscode.mjs -->
```js
#!/usr/bin/env node

/**
 * Build the VS Code extension and drop the installable .vsix next to the
 * standalone binaries, as standalone/vscode/snipshot-vscode-extension.vsix.
 *
 * The extension is versioned from package.json like the IntelliJ plugin: its
 * own manifest is brought in line first, so a locally built .vsix matches
 * what a release of the same version ships. The unit tests run as part of
 * the build, since the CI job for the extension is this script.
 *
 * Usage:
 *   npm run build:vscode
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const extensionDir = join(root, 'extra', 'vscode', 'snipshot-vscode');
const outDir = join(root, 'standalone', 'vscode');
const outFile = join(outDir, 'snipshot-vscode-extension.vsix');

const isWindows = process.platform === 'win32';
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** vsce needs Node 20; the unit tests use `node --test` globs, Node 21. */
function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    fail(`Node ${process.versions.node} is too old to build the extension (needs 22 or newer).`);
  }
  console.log(`  Node ${process.versions.node} — ok`);
}

/** Rewrites the version in a JSON manifest, keeping everything else as is. */
function syncVersion(file, update) {
  const source = readFileSync(file, 'utf-8');
  const updated = update(source);
  if (updated !== source) {
    writeFileSync(file, updated);
    console.log(`  ${file.slice(root.length + 1)} → version ${version}`);
  }
}

function run(command, args) {
  execFileSync(command, args, { cwd: extensionDir, stdio: 'inherit', shell: isWindows });
}

if (!existsSync(extensionDir)) {
  fail(`Extension sources not found at ${extensionDir}`);
}

console.log(`Building the VS Code extension (version ${version})...`);
checkNode();

// package.json: the top-level "version"; package-lock.json: the top-level one
// and the root package entry, which npm keeps in sync with it.
syncVersion(join(extensionDir, 'package.json'), s =>
  s.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`));
syncVersion(join(extensionDir, 'package-lock.json'), s =>
  s.replace(/^(  "version":\s*")[^"]*(")/m, `$1${version}$2`)
    .replace(/^(    "": \{\n(?:.*\n)*?      "version":\s*")[^"]*(")/m, `$1${version}$2`));

if (process.env.CI || !existsSync(join(extensionDir, 'node_modules'))) {
  run('npm', ['ci', '--no-audit', '--no-fund']);
}

// Compiles, then runs the unit tests.
run('npm', ['test']);

mkdirSync(outDir, { recursive: true });
run(join(extensionDir, 'node_modules', '.bin', isWindows ? 'vsce.cmd' : 'vsce'), ['package', '--out', outFile]);

const sizeKb = (statSync(outFile).size / 1024).toFixed(0);
console.log('\n' + '='.repeat(50));
console.log(`  standalone/vscode/snipshot-vscode-extension.vsix  (${sizeKb} KB)\n`);
console.log('Install it in VS Code with:');
console.log('  Extensions view | ... menu | Install from VSIX...');
```

- [ ] **Step 2: Root package.json script**

In the root `package.json` `scripts`, after `"build:plugin"`, add:

```json
    "build:vscode": "node scripts/build-vscode.mjs",
```

- [ ] **Step 3: CI job**

Append to `.github/workflows/ci.yml`:

```yaml

  # Same reason as the plugin: the extension is built at release time, so a
  # compile or test break must not wait until then to surface.
  vscode:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: extra/vscode/snipshot-vscode/package-lock.json

      # Goes through the npm script, so a break in it fails here too.
      - name: Build the VS Code extension
        run: npm run build:vscode
```

- [ ] **Step 4: Release workflow**

In `.github/workflows/release.yml`: switch both `node-version: 20` to `22` (Node 20 reached end of life in April 2026, and the extension's tests need 22), add the job-level secrets env, build the extension after the plugin, copy the `.vsix` into `release/`, and add the opt-in publish steps. The resulting file:

<!-- write: .github/workflows/release.yml -->
```yaml
name: Release

# Builds the standalone binaries for every platform and attaches them to a
# GitHub Release when a version tag (v*) is pushed. Can also be run manually
# (workflow_dispatch) to produce the archives as workflow artifacts without
# publishing a release.

on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  contents: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Test
        run: npm test

  build-and-release:
    needs: test
    runs-on: ubuntu-latest
    env:
      # Marketplace publishing is opt-in: each store is published to only when
      # its token exists as a repository secret (Settings | Secrets | Actions).
      VSCE_PAT: ${{ secrets.VSCE_PAT }}
      OVSX_PAT: ${{ secrets.OVSX_PAT }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: oven-sh/setup-bun@v2

      - uses: actions/setup-java@v4
        with:
          # Runs Gradle and satisfies the plugin's Java 17 toolchain.
          distribution: temurin
          java-version: 17

      - uses: gradle/actions/setup-gradle@v4

      - name: Install dependencies
        run: npm ci

      # Bun cross-compiles all four targets from Linux; the build script
      # downloads each platform's native Skia addon via npm pack.
      - name: Build standalone binaries (all platforms)
        run: node scripts/build-standalone.mjs

      # The plugin zip installs straight from disk in the IDE, so it ships
      # with the same version as the release it belongs to.
      - name: Build the IntelliJ plugin
        run: npm run build:plugin

      # Same for the VS Code extension: an installable .vsix, versioned from
      # package.json, tested on the way.
      - name: Build the VS Code extension
        run: npm run build:vscode

      - name: Package archives
        run: |
          set -euo pipefail
          mkdir -p release

          # Archive names carry no version on purpose: it keeps
          # /releases/latest/download/<name> a stable URL, which is what the
          # IntelliJ plugin and the VS Code extension download from. The
          # version is on the release itself.

          # Unix platforms: tar.gz preserving the executable bit
          chmod 755 standalone/linux/snipshot standalone/mac-intel/snipshot standalone/mac-arm/snipshot
          tar -czf release/snipshot-linux-x64.tar.gz    -C standalone/linux     snipshot
          tar -czf release/snipshot-macos-x64.tar.gz    -C standalone/mac-intel snipshot
          tar -czf release/snipshot-macos-arm64.tar.gz  -C standalone/mac-arm   snipshot

          # Windows: zip
          (cd standalone/win && zip -9 ../../release/snipshot-windows-x64.zip snipshot.exe)

          # IntelliJ plugin, installable through Plugins | Install Plugin from Disk
          cp standalone/intellij/snipshot-intellij-plugin.zip release/

          # VS Code extension, installable through Extensions | Install from VSIX
          cp standalone/vscode/snipshot-vscode-extension.vsix release/

          ls -lh release/

      - name: Upload archives as workflow artifacts
        uses: actions/upload-artifact@v4
        with:
          name: snipshot-binaries
          path: release/*
          if-no-files-found: error

      - name: Create GitHub Release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: release/*
          generate_release_notes: true

      - name: Publish to the Visual Studio Marketplace
        if: startsWith(github.ref, 'refs/tags/') && env.VSCE_PAT != ''
        working-directory: extra/vscode/snipshot-vscode
        run: npx vsce publish --packagePath ../../../standalone/vscode/snipshot-vscode-extension.vsix

      - name: Publish to Open VSX
        if: startsWith(github.ref, 'refs/tags/') && env.OVSX_PAT != ''
        working-directory: extra/vscode/snipshot-vscode
        run: npx --yes ovsx publish ../../../standalone/vscode/snipshot-vscode-extension.vsix --pat "$OVSX_PAT"
```

- [ ] **Step 5: Run the build end to end**

Run (root): `npm run build:vscode && unzip -l standalone/vscode/snipshot-vscode-extension.vsix`
Expected: tests pass, the vsix exists and lists only the compiled sources, manifest, README and LICENSE.

---

### Task 12: Documentation

**Files:**
- Create: `VSCODE.md` (root, user docs, the counterpart of `PLUGIN.md`), `extra/vscode/snipshot-vscode/README.md` (Marketplace page), `extra/vscode/snipshot-vscode/DEVELOPMENT.md`
- Modify: `README.md` (features bullet, "VS Code extension" section next to the IntelliJ one, development and releasing notes), `.gitignore` comment for `.snipshot/`

- [ ] **Step 1: Write the three documents** (content in the execution; VSCODE.md mirrors PLUGIN.md section by section: Install, The snipshot binary, Usage table with the VS Code shortcuts, Point at something in its context, Marking several regions, What gets captured, Settings, Notes on the clipboard per platform and under WSL / remotes, Errors).

- [ ] **Step 2: README** — add the bullet `**VS Code extension** — right-click a selection in VS Code ([VSCODE.md](VSCODE.md))`, a "VS Code extension" section after the IntelliJ one with the build command, and `npm run build:vscode` in Development; mention the `.vsix` in Releasing.

- [ ] **Step 3: Read every document once end to end** for stale statements (shortcut for Fold, clipboard notes).

---

## Self-review

- Spec coverage: capture ranges (T2/T6), "Snipshot this" (T2/T10), marks with tint and edit tracking (T4/T6), request (T3), destinations and save dialog (T8), runner and notifications (T7), clipboard per platform and keep-as-file (T5/T8), binary resolution and download (T7), theme auto (T6), options panel (T9), commands, menu, keybindings, settings (T1/T10), build script, CI, release, optional publishing (T11), docs (T12). Out-of-scope items untouched.
- Type consistency: `MarkStore` API (`add`, `ranges`, `spec`, `has`, `clear`, `applyEdit`) used identically in T6 and T10; `buildRequest(context, editor, store, options)` in T6/T10; `run(context, request, onSuccess?)` in T7/T8/T10; `notifySaved(file, message?, warning?)` in T7/T8.
