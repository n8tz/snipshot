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
