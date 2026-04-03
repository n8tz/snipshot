import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { TokenizedLine, HighlightSpec, TokenInfo } from './types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Register font
const fontPath = join(__dirname, '..', 'assets', 'JetBrainsMono-Regular.ttf');
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
  sourceLineIndex: number; // index within visibleLines
  sourceLineNum: number;   // actual line number in file
  isFirstRow: boolean;     // true = show line number, false = continuation
}

function wrapTokens(
  tokens: TokenInfo[],
  availableWidth: number,
  wrapIndentWidth: number,
  measureCtx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
): TokenInfo[][] {
  // Expand tabs in all tokens first
  const expanded: TokenInfo[] = tokens.map(t => ({
    text: t.text.replace(/\t/g, '    '),
    color: t.color,
  }));

  const fullWidth = expanded.reduce((w, t) => w + measureCtx.measureText(t.text).width, 0);
  if (fullWidth <= availableWidth) {
    return [expanded];
  }

  const rows: TokenInfo[][] = [];
  let currentRow: TokenInfo[] = [];
  let currentWidth = 0;
  let isFirstRow = true;

  const remaining = [...expanded];

  while (remaining.length > 0) {
    const maxRowWidth = isFirstRow ? availableWidth : availableWidth - wrapIndentWidth;
    const token = remaining.shift()!;
    const tokenWidth = measureCtx.measureText(token.text).width;

    if (currentWidth + tokenWidth <= maxRowWidth) {
      currentRow.push(token);
      currentWidth += tokenWidth;
    } else {
      // Need to split this token character by character
      let text = token.text;

      while (text.length > 0) {
        const rowMax = isFirstRow ? availableWidth : availableWidth - wrapIndentWidth;
        const spaceLeft = rowMax - currentWidth;

        // Find how many chars fit
        let fitCount = 0;
        for (let i = 1; i <= text.length; i++) {
          if (measureCtx.measureText(text.substring(0, i)).width > spaceLeft) break;
          fitCount = i;
        }

        if (fitCount > 0) {
          currentRow.push({ text: text.substring(0, fitCount), color: token.color });
          currentWidth += measureCtx.measureText(text.substring(0, fitCount)).width;
          text = text.substring(fitCount);
        }

        if (text.length > 0) {
          // Push current row, start new one
          rows.push(currentRow);
          isFirstRow = false;
          currentRow = [];
          currentWidth = 0;

          // Force at least 1 char if nothing fit (extremely narrow canvas)
          if (fitCount === 0) {
            currentRow.push({ text: text[0], color: token.color });
            currentWidth = measureCtx.measureText(text[0]).width;
            text = text.substring(1);
          }
        }
      }
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows.length > 0 ? rows : [[]];
}

export async function renderCode(input: RenderInput): Promise<Buffer> {
  const { tokenizedLines, startLine, endLine, relativePath, highlights, maxWidth } = input;
  const visibleLines = tokenizedLines.slice(startLine - 1, endLine);

  // Measure text to calculate dimensions
  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${FONT_SIZE}px "JetBrains Mono"`;

  // Gutter width based on max line number
  const maxLineNumStr = `${endLine}`;
  const gutterTextWidth = measureCtx.measureText(maxLineNumStr).width;
  const gutterWidth = gutterTextWidth + GUTTER_PADDING * 2;

  const wrapIndentWidth = measureCtx.measureText(' '.repeat(WRAP_INDENT_CHARS)).width;
  const wrapIndicatorWidth = measureCtx.measureText('\u21B3 ').width;
  const totalWrapIndent = wrapIndentWidth + wrapIndicatorWidth;

  // Build visual rows (with wrapping if maxWidth is set)
  const visualRows: VisualRow[] = [];

  for (let i = 0; i < visibleLines.length; i++) {
    const lineNum = startLine + i;

    if (maxWidth) {
      const availableContentWidth = maxWidth - gutterWidth - GUTTER_SEPARATOR_WIDTH - PADDING_X * 2;
      const wrappedRows = wrapTokens(visibleLines[i], availableContentWidth, totalWrapIndent, measureCtx);

      for (let r = 0; r < wrappedRows.length; r++) {
        visualRows.push({
          tokens: wrappedRows[r],
          sourceLineIndex: i,
          sourceLineNum: lineNum,
          isFirstRow: r === 0,
        });
      }
    } else {
      visualRows.push({
        tokens: visibleLines[i].map(t => ({ text: t.text.replace(/\t/g, '    '), color: t.color })),
        sourceLineIndex: i,
        sourceLineNum: lineNum,
        isFirstRow: true,
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

  // Header text (truncate if needed)
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

  // Gutter separator line
  ctx.fillStyle = GUTTER_SEP_COLOR;
  ctx.fillRect(gutterWidth, HEADER_HEIGHT, GUTTER_SEPARATOR_WIDTH, totalHeight - HEADER_HEIGHT);

  const codeStartY = HEADER_HEIGHT;
  const codeStartX = gutterWidth + GUTTER_SEPARATOR_WIDTH + PADDING_X;

  // Build a map: sourceLineIndex → list of visual row indices (for highlights)
  const lineToVisualRows = new Map<number, number[]>();
  for (let r = 0; r < visualRows.length; r++) {
    const idx = visualRows[r].sourceLineIndex;
    if (!lineToVisualRows.has(idx)) lineToVisualRows.set(idx, []);
    lineToVisualRows.get(idx)!.push(r);
  }

  // Draw highlights (behind text)
  for (const hl of highlights) {
    const colors = HIGHLIGHT_COLORS[hl.color];
    for (let line = hl.lineStart; line <= hl.lineEnd; line++) {
      if (line < startLine || line > endLine) continue;
      const lineIndex = line - startLine;
      const vRows = lineToVisualRows.get(lineIndex) || [];

      if (hl.colStart !== undefined && hl.colEnd !== undefined) {
        // Column range highlight — only on first visual row (simplification)
        const firstVRow = vRows[0];
        if (firstVRow === undefined) continue;
        const y = codeStartY + firstVRow * LINE_HEIGHT;

        const lineTokens = visibleLines[lineIndex] || [];
        const fullText = lineTokens.map(t => t.text).join('').replace(/\t/g, '    ');
        const beforeText = fullText.substring(0, hl.colStart - 1);
        const highlightText = fullText.substring(hl.colStart - 1, hl.colEnd);

        const xStart = codeStartX + measureCtx.measureText(beforeText).width;
        const hlWidth = measureCtx.measureText(highlightText).width;

        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 2;
        ctx.strokeRect(xStart - 2, y + 1, hlWidth + 4, LINE_HEIGHT - 2);
      } else {
        // Full line highlight — spans all visual rows of this source line
        for (const vr of vRows) {
          const y = codeStartY + vr * LINE_HEIGHT;
          ctx.fillStyle = colors.bg;
          ctx.fillRect(0, y, totalWidth, LINE_HEIGHT);

          // Left accent border only on first row
          if (vr === vRows[0]) {
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

    // Line number (only on first visual row of a source line)
    if (vRow.isFirstRow) {
      ctx.fillStyle = LINE_NUM_COLOR;
      ctx.textAlign = 'right';
      ctx.fillText(`${vRow.sourceLineNum}`, gutterWidth - GUTTER_PADDING, textY);
    }

    // Tokens
    ctx.textAlign = 'left';
    let x = codeStartX;

    if (!vRow.isFirstRow) {
      // Continuation: add indent + wrap indicator
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
