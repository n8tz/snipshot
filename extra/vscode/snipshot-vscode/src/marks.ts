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
