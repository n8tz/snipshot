import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { TokenizedLine, HighlightSpec, TokenInfo } from './types.js';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Support both ESM (import.meta.url) and CJS (__dirname) for standalone bundle
let __dname: string;
try {
  __dname = dirname(fileURLToPath(import.meta.url));
} catch {
  __dname = __dirname;
}

// Register font — check env var (standalone), then multiple relative paths (dev/npm)
const fontCandidates = [
  process.env.SNIPSHOT_FONT_PATH,
  join(__dname, '..', 'assets', 'JetBrainsMono-Regular.ttf'),
  join(__dname, 'assets', 'JetBrainsMono-Regular.ttf'),
  join(__dname, 'JetBrainsMono-Regular.ttf'),
].filter(Boolean) as string[];
const fontPath = fontCandidates.find(p => existsSync(p)) || fontCandidates[0];
GlobalFonts.registerFromPath(fontPath, 'JetBrains Mono');

// Constants
const FONT_SIZE = 14;
const LINE_HEIGHT = 22;
const PADDING_X = 16;
const PADDING_Y = 12;
const HEADER_HEIGHT = 36;
const GUTTER_PADDING = 12;
const GUTTER_SEPARATOR_WIDTH = 1;
const WRAP_INDENT_CHARS = 4;
const BG_COLOR = '#282c34';
const HEADER_BG = '#21252b';
const HEADER_BORDER = '#181a1f';
const LINE_NUM_COLOR = '#636d83';
const HEADER_TEXT_COLOR = '#9da5b4';
const GUTTER_SEP_COLOR = '#3b4048';
const WRAP_INDICATOR_COLOR = '#4b5263';
const FOLD_BG = '#2c313a';
const FOLD_TEXT_COLOR = '#5c6370';
const FOLD_BORDER_COLOR = '#3b4048';

const HIGHLIGHT_COLORS = {
  red: {
    bg: 'rgba(255, 60, 60, 0.12)',
    border: '#ff4444',
  },
  green: {
    bg: 'rgba(60, 255, 60, 0.12)',
    border: '#44ff44',
  },
};

interface RenderInput {
  tokenizedLines: TokenizedLine[];
  startLine: number;
  endLine: number;
  relativePath: string;
  highlights: HighlightSpec[];
  maxWidth?: number;
  folds?: { start: number; end: number }[];
}

// A visual row produced by wrapping a source line
interface VisualRow {
  tokens: TokenInfo[];
  sourceLineIndex: number;
  sourceLineNum: number;
  isFirstRow: boolean;
  charStart: number; // 0-based start position in original expanded line text
  charEnd: number;   // 0-based end position (exclusive)
  isFold?: boolean;  // true = fold indicator row
  foldCount?: number; // number of folded lines
}

function wrapTokens(
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

export async function renderCode(input: RenderInput): Promise<Buffer> {
  const { tokenizedLines, startLine, endLine, relativePath, highlights, maxWidth, folds } = input;
  const visibleLines = tokenizedLines.slice(startLine - 1, endLine);

  // Build a set of folded line numbers for fast lookup
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

  // Measure context
  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${FONT_SIZE}px "JetBrains Mono"`;

  // Monospace character width — single source of truth for all positioning
  const charWidth = measureCtx.measureText('M').width;

  // Gutter width
  const maxLineNumStr = `${endLine}`;
  const gutterWidth = charWidth * maxLineNumStr.length + GUTTER_PADDING * 2;

  const wrapIndentWidth = charWidth * WRAP_INDENT_CHARS;
  const wrapIndicatorWidth = measureCtx.measureText('\u21B3 ').width;
  const totalWrapIndent = wrapIndentWidth + wrapIndicatorWidth;

  // Build visual rows
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

  // Calculate total width
  let totalWidth: number;
  if (maxWidth) {
    totalWidth = maxWidth;
  } else {
    let maxLineChars = 0;
    for (const line of visibleLines) {
      const lineText = line.map(t => t.text).join('').replace(/\t/g, '    ');
      maxLineChars = Math.max(maxLineChars, lineText.length);
    }
    const maxLineWidth = charWidth * maxLineChars;
    const headerWidth = charWidth * relativePath.length;
    const minContentWidth = Math.max(maxLineWidth, headerWidth);
    totalWidth = Math.ceil(gutterWidth + GUTTER_SEPARATOR_WIDTH + PADDING_X + minContentWidth + PADDING_X);
  }

  const totalHeight = Math.ceil(HEADER_HEIGHT + visualRows.length * LINE_HEIGHT + PADDING_Y);

  // Create canvas
  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Header
  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(0, 0, totalWidth, HEADER_HEIGHT);
  ctx.fillStyle = HEADER_BORDER;
  ctx.fillRect(0, HEADER_HEIGHT - 1, totalWidth, 1);

  // Header text (truncate if too long)
  ctx.font = `${FONT_SIZE}px "JetBrains Mono"`;
  ctx.fillStyle = HEADER_TEXT_COLOR;
  ctx.textBaseline = 'middle';
  const maxHeaderWidth = totalWidth - PADDING_X * 2;
  let headerText = relativePath;
  if (measureCtx.measureText(headerText).width > maxHeaderWidth) {
    while (headerText.length > 3 && measureCtx.measureText('...' + headerText).width > maxHeaderWidth) {
      headerText = headerText.substring(1);
    }
    headerText = '...' + headerText;
  }
  ctx.fillText(headerText, PADDING_X, HEADER_HEIGHT / 2);

  // Gutter separator
  ctx.fillStyle = GUTTER_SEP_COLOR;
  ctx.fillRect(gutterWidth, HEADER_HEIGHT, GUTTER_SEPARATOR_WIDTH, totalHeight - HEADER_HEIGHT);

  const codeStartY = HEADER_HEIGHT;
  const codeStartX = gutterWidth + GUTTER_SEPARATOR_WIDTH + PADDING_X;

  // Map source line index → visual row indices
  const lineToVisualRows = new Map<number, number[]>();
  for (let r = 0; r < visualRows.length; r++) {
    const idx = visualRows[r].sourceLineIndex;
    if (!lineToVisualRows.has(idx)) lineToVisualRows.set(idx, []);
    lineToVisualRows.get(idx)!.push(r);
  }

  // Draw highlights
  for (const hl of highlights) {
    const colors = HIGHLIGHT_COLORS[hl.color];
    for (let line = hl.lineStart; line <= hl.lineEnd; line++) {
      if (line < startLine || line > endLine) continue;
      const lineIndex = line - startLine;
      const vRowIndices = lineToVisualRows.get(lineIndex) || [];

      if (hl.colStart !== undefined && hl.colEnd !== undefined) {
        // Column range highlight — find which visual rows intersect
        const hlStart = hl.colStart - 1; // 0-based inclusive
        const hlEnd = hl.colEnd;         // 0-based exclusive

        for (const vrIdx of vRowIndices) {
          const vRow = visualRows[vrIdx];

          // Check intersection with this visual row's character range
          if (hlStart >= vRow.charEnd || hlEnd <= vRow.charStart) continue;

          // Visible portion within this row (character counts)
          const visStart = Math.max(hlStart, vRow.charStart) - vRow.charStart;
          const visEnd = Math.min(hlEnd, vRow.charEnd) - vRow.charStart;

          const y = codeStartY + vrIdx * LINE_HEIGHT;
          let xOffset = codeStartX;
          if (!vRow.isFirstRow) xOffset += totalWrapIndent;

          // Use charWidth * charCount for pixel-perfect alignment
          const xStart = xOffset + charWidth * visStart;
          const hlWidth = charWidth * (visEnd - visStart);

          ctx.strokeStyle = colors.border;
          ctx.lineWidth = 2;
          ctx.strokeRect(xStart - 2, y + 1, hlWidth + 4, LINE_HEIGHT - 2);
        }
      } else {
        // Full line highlight — spans all visual rows
        for (const vrIdx of vRowIndices) {
          const y = codeStartY + vrIdx * LINE_HEIGHT;
          ctx.fillStyle = colors.bg;
          ctx.fillRect(0, y, totalWidth, LINE_HEIGHT);

          if (vrIdx === vRowIndices[0]) {
            ctx.fillStyle = colors.border;
            ctx.fillRect(0, y, 3, LINE_HEIGHT);
          }
        }
      }
    }
  }

  // Draw visual rows
  ctx.font = `${FONT_SIZE}px "JetBrains Mono"`;
  ctx.textBaseline = 'top';

  for (let r = 0; r < visualRows.length; r++) {
    const vRow = visualRows[r];
    const y = codeStartY + r * LINE_HEIGHT;
    const textY = y + (LINE_HEIGHT - FONT_SIZE) / 2;

    // Fold indicator row
    if (vRow.isFold) {
      // Background
      ctx.fillStyle = FOLD_BG;
      ctx.fillRect(0, y, totalWidth, LINE_HEIGHT);
      // Top and bottom border lines
      ctx.fillStyle = FOLD_BORDER_COLOR;
      ctx.fillRect(gutterWidth + GUTTER_SEPARATOR_WIDTH, y, totalWidth - gutterWidth - GUTTER_SEPARATOR_WIDTH, 1);
      ctx.fillRect(gutterWidth + GUTTER_SEPARATOR_WIDTH, y + LINE_HEIGHT - 1, totalWidth - gutterWidth - GUTTER_SEPARATOR_WIDTH, 1);
      // Dots in gutter
      ctx.fillStyle = FOLD_TEXT_COLOR;
      ctx.textAlign = 'right';
      ctx.fillText('\u22EE', gutterWidth - GUTTER_PADDING, textY);
      // Fold label
      ctx.textAlign = 'left';
      const label = `\u2022\u2022\u2022  ${vRow.foldCount} lines folded  \u2022\u2022\u2022`;
      ctx.fillText(label, codeStartX, textY);
      continue;
    }

    if (vRow.isFirstRow) {
      ctx.fillStyle = LINE_NUM_COLOR;
      ctx.textAlign = 'right';
      ctx.fillText(`${vRow.sourceLineNum}`, gutterWidth - GUTTER_PADDING, textY);
    }

    ctx.textAlign = 'left';
    let x = codeStartX;

    if (!vRow.isFirstRow) {
      x += wrapIndentWidth;
      ctx.fillStyle = WRAP_INDICATOR_COLOR;
      ctx.fillText('\u21B3 ', codeStartX, textY);
      x += wrapIndicatorWidth;
    }

    for (const token of vRow.tokens) {
      ctx.fillStyle = token.color;
      ctx.fillText(token.text, x, textY);
      x += charWidth * token.text.length;
    }
  }

  return Buffer.from(canvas.toBuffer('image/png'));
}
