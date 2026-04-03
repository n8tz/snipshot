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

// Register font — check multiple locations (dev vs standalone bundle)
const fontCandidates = [
  join(__dname, '..', 'assets', 'JetBrainsMono-Regular.ttf'),
  join(__dname, 'assets', 'JetBrainsMono-Regular.ttf'),
  join(__dname, 'JetBrainsMono-Regular.ttf'),
];
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
}

// A visual row produced by wrapping a source line
interface VisualRow {
  tokens: TokenInfo[];
  sourceLineIndex: number;
  sourceLineNum: number;
  isFirstRow: boolean;
  charStart: number; // 0-based start position in original expanded line text
  charEnd: number;   // 0-based end position (exclusive)
}

type MeasureCtx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function wrapTokens(
  tokens: TokenInfo[],
  availableWidth: number,
  wrapIndentWidth: number,
  measureCtx: MeasureCtx,
): { tokens: TokenInfo[]; charStart: number; charEnd: number }[] {
  // Expand tabs
  const expanded: TokenInfo[] = tokens.map(t => ({
    text: t.text.replace(/\t/g, '    '),
    color: t.color,
  }));

  const fullWidth = expanded.reduce((w, t) => w + measureCtx.measureText(t.text).width, 0);
  if (fullWidth <= availableWidth) {
    const totalChars = expanded.reduce((n, t) => n + t.text.length, 0);
    return [{ tokens: expanded, charStart: 0, charEnd: totalChars }];
  }

  const rows: { tokens: TokenInfo[]; charStart: number; charEnd: number }[] = [];
  let currentRow: TokenInfo[] = [];
  let currentWidth = 0;
  let isFirstRow = true;
  let globalCharPos = 0;
  let rowCharStart = 0;

  const remaining = [...expanded];

  while (remaining.length > 0) {
    const maxRowWidth = isFirstRow ? availableWidth : availableWidth - wrapIndentWidth;
    const token = remaining.shift()!;
    const tokenWidth = measureCtx.measureText(token.text).width;

    if (currentWidth + tokenWidth <= maxRowWidth) {
      currentRow.push(token);
      currentWidth += tokenWidth;
      globalCharPos += token.text.length;
    } else {
      let text = token.text;

      while (text.length > 0) {
        const rowMax = isFirstRow ? availableWidth : availableWidth - wrapIndentWidth;
        const spaceLeft = rowMax - currentWidth;

        let fitCount = 0;
        for (let i = 1; i <= text.length; i++) {
          if (measureCtx.measureText(text.substring(0, i)).width > spaceLeft) break;
          fitCount = i;
        }

        if (fitCount > 0) {
          currentRow.push({ text: text.substring(0, fitCount), color: token.color });
          currentWidth += measureCtx.measureText(text.substring(0, fitCount)).width;
          globalCharPos += fitCount;
          text = text.substring(fitCount);
        }

        if (text.length > 0) {
          rows.push({ tokens: currentRow, charStart: rowCharStart, charEnd: globalCharPos });
          isFirstRow = false;
          currentRow = [];
          currentWidth = 0;
          rowCharStart = globalCharPos;

          if (fitCount === 0) {
            currentRow.push({ text: text[0], color: token.color });
            currentWidth = measureCtx.measureText(text[0]).width;
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
  const { tokenizedLines, startLine, endLine, relativePath, highlights, maxWidth } = input;
  const visibleLines = tokenizedLines.slice(startLine - 1, endLine);

  // Measure context
  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${FONT_SIZE}px "JetBrains Mono"`;

  // Gutter width
  const maxLineNumStr = `${endLine}`;
  const gutterTextWidth = measureCtx.measureText(maxLineNumStr).width;
  const gutterWidth = gutterTextWidth + GUTTER_PADDING * 2;

  const wrapIndentWidth = measureCtx.measureText(' '.repeat(WRAP_INDENT_CHARS)).width;
  const wrapIndicatorWidth = measureCtx.measureText('\u21B3 ').width;
  const totalWrapIndent = wrapIndentWidth + wrapIndicatorWidth;

  // Build visual rows
  const visualRows: VisualRow[] = [];

  for (let i = 0; i < visibleLines.length; i++) {
    const lineNum = startLine + i;

    if (maxWidth) {
      const availableContentWidth = maxWidth - gutterWidth - GUTTER_SEPARATOR_WIDTH - PADDING_X * 2;
      const wrappedRows = wrapTokens(visibleLines[i], availableContentWidth, totalWrapIndent, measureCtx);

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
    let maxLineWidth = 0;
    for (const line of visibleLines) {
      const lineText = line.map(t => t.text).join('').replace(/\t/g, '    ');
      maxLineWidth = Math.max(maxLineWidth, measureCtx.measureText(lineText).width);
    }
    const headerWidth = measureCtx.measureText(relativePath).width;
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

          // Visible portion within this row
          const visStart = Math.max(hlStart, vRow.charStart) - vRow.charStart;
          const visEnd = Math.min(hlEnd, vRow.charEnd) - vRow.charStart;

          const rowText = vRow.tokens.map(t => t.text).join('');
          const beforeText = rowText.substring(0, visStart);
          const highlightText = rowText.substring(visStart, visEnd);

          const y = codeStartY + vrIdx * LINE_HEIGHT;
          let xOffset = codeStartX;
          if (!vRow.isFirstRow) xOffset += totalWrapIndent;

          const xStart = xOffset + measureCtx.measureText(beforeText).width;
          const hlWidth = measureCtx.measureText(highlightText).width;

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
      x += measureCtx.measureText(token.text).width;
    }
  }

  return Buffer.from(canvas.toBuffer('image/png'));
}
