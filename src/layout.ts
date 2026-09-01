import type { TokenizedLine, TokenInfo } from './types.js';

// Shared layout constants — single source of truth for the PNG and SVG renderers.
export const FONT_SIZE = 14;
export const LINE_HEIGHT = 22;
export const PADDING_X = 16;
export const PADDING_Y = 12;
export const HEADER_HEIGHT = 36;
export const GUTTER_PADDING = 12;
export const GUTTER_SEPARATOR_WIDTH = 1;
export const WRAP_INDENT_CHARS = 4;

// A visual row produced by wrapping a source line
export interface VisualRow {
  tokens: TokenInfo[];
  sourceLineIndex: number;
  sourceLineNum: number;
  isFirstRow: boolean;
  charStart: number; // 0-based start position in original expanded line text
  charEnd: number;   // 0-based end position (exclusive)
  isFold?: boolean;  // true = fold indicator row
  foldCount?: number; // number of folded lines
}

export function buildFoldMaps(
  folds: { start: number; end: number }[] | undefined,
  startLine: number,
  endLine: number,
): { foldedLines: Set<number>; foldStarts: Map<number, number> } {
  const foldedLines = new Set<number>();
  const foldStarts = new Map<number, number>(); // foldStartLine → count of folded lines
  if (folds) {
    for (const fold of folds) {
      const fStart = Math.max(fold.start, startLine);
      const fEnd = Math.min(fold.end, endLine);
      if (fStart > fEnd) continue;
      foldStarts.set(fStart, fEnd - fStart + 1);
      for (let l = fStart; l <= fEnd; l++) {
        foldedLines.add(l);
      }
    }
  }
  return { foldedLines, foldStarts };
}

export function wrapTokens(
  tokens: TokenInfo[],
  availableWidth: number,
  wrapIndentWidth: number,
  cw: number, // charWidth
): { tokens: TokenInfo[]; charStart: number; charEnd: number }[] {
  // Expand tabs
  const expanded: TokenInfo[] = tokens.map(t => ({
    text: t.text.replace(/\t/g, '    '),
    color: t.color,
  }));

  const totalChars = expanded.reduce((n, t) => n + t.text.length, 0);
  if (cw * totalChars <= availableWidth) {
    return [{ tokens: expanded, charStart: 0, charEnd: totalChars }];
  }

  const rows: { tokens: TokenInfo[]; charStart: number; charEnd: number }[] = [];
  let currentRow: TokenInfo[] = [];
  let currentChars = 0;
  let isFirstRow = true;
  let globalCharPos = 0;
  let rowCharStart = 0;

  const remaining = [...expanded];

  while (remaining.length > 0) {
    const maxChars = Math.floor((isFirstRow ? availableWidth : availableWidth - wrapIndentWidth) / cw);
    const token = remaining.shift()!;

    if (currentChars + token.text.length <= maxChars) {
      currentRow.push(token);
      currentChars += token.text.length;
      globalCharPos += token.text.length;
    } else {
      let text = token.text;

      while (text.length > 0) {
        const rowMaxChars = Math.floor((isFirstRow ? availableWidth : availableWidth - wrapIndentWidth) / cw);
        const spaceLeft = rowMaxChars - currentChars;

        const fitCount = Math.max(0, Math.min(spaceLeft, text.length));

        if (fitCount > 0) {
          currentRow.push({ text: text.substring(0, fitCount), color: token.color });
          currentChars += fitCount;
          globalCharPos += fitCount;
          text = text.substring(fitCount);
        }

        if (text.length > 0) {
          rows.push({ tokens: currentRow, charStart: rowCharStart, charEnd: globalCharPos });
          isFirstRow = false;
          currentRow = [];
          currentChars = 0;
          rowCharStart = globalCharPos;

          if (fitCount === 0) {
            currentRow.push({ text: text[0], color: token.color });
            currentChars = 1;
            globalCharPos += 1;
            text = text.substring(1);
          }
        }
      }
    }
  }

  if (currentRow.length > 0) {
    rows.push({ tokens: currentRow, charStart: rowCharStart, charEnd: globalCharPos });
  }

  return rows.length > 0 ? rows : [{ tokens: [], charStart: 0, charEnd: 0 }];
}

export function buildVisualRows(params: {
  visibleLines: TokenizedLine[];
  startLine: number;
  foldedLines: Set<number>;
  foldStarts: Map<number, number>;
  maxWidth?: number;
  gutterWidth: number;
  totalWrapIndent: number;
  charWidth: number;
}): VisualRow[] {
  const { visibleLines, startLine, foldedLines, foldStarts, maxWidth, gutterWidth, totalWrapIndent, charWidth } = params;
  const visualRows: VisualRow[] = [];

  for (let i = 0; i < visibleLines.length; i++) {
    const lineNum = startLine + i;

    // Skip folded lines, but insert a fold indicator at the fold start
    if (foldedLines.has(lineNum)) {
      if (foldStarts.has(lineNum)) {
        visualRows.push({
          tokens: [],
          sourceLineIndex: i,
          sourceLineNum: lineNum,
          isFirstRow: true,
          charStart: 0,
          charEnd: 0,
          isFold: true,
          foldCount: foldStarts.get(lineNum),
        });
      }
      continue;
    }

    if (maxWidth) {
      const availableContentWidth = maxWidth - gutterWidth - GUTTER_SEPARATOR_WIDTH - PADDING_X * 2;
      const wrappedRows = wrapTokens(visibleLines[i], availableContentWidth, totalWrapIndent, charWidth);

      for (let r = 0; r < wrappedRows.length; r++) {
        visualRows.push({
          tokens: wrappedRows[r].tokens,
          sourceLineIndex: i,
          sourceLineNum: lineNum,
          isFirstRow: r === 0,
          charStart: wrappedRows[r].charStart,
          charEnd: wrappedRows[r].charEnd,
        });
      }
    } else {
      const expanded = visibleLines[i].map(t => ({ text: t.text.replace(/\t/g, '    '), color: t.color }));
      const totalChars = expanded.reduce((n, t) => n + t.text.length, 0);
      visualRows.push({
        tokens: expanded,
        sourceLineIndex: i,
        sourceLineNum: lineNum,
        isFirstRow: true,
        charStart: 0,
        charEnd: totalChars,
      });
    }
  }

  return visualRows;
}
