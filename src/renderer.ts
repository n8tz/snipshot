import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { TokenizedLine, HighlightSpec } from './types.js';
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
const BG_COLOR = '#282c34';
const HEADER_BG = '#21252b';
const HEADER_BORDER = '#181a1f';
const LINE_NUM_COLOR = '#636d83';
const HEADER_TEXT_COLOR = '#9da5b4';
const GUTTER_SEP_COLOR = '#3b4048';

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
}

export async function renderCode(input: RenderInput): Promise<Buffer> {
  const { tokenizedLines, startLine, endLine, relativePath, highlights } = input;
  const visibleLines = tokenizedLines.slice(startLine - 1, endLine);
  const lineCount = visibleLines.length;

  // Measure text to calculate dimensions
  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${FONT_SIZE}px "JetBrains Mono"`;

  // Gutter width based on max line number
  const maxLineNumStr = `${endLine}`;
  const gutterTextWidth = measureCtx.measureText(maxLineNumStr).width;
  const gutterWidth = gutterTextWidth + GUTTER_PADDING * 2;

  // Find longest line width
  let maxLineWidth = 0;
  for (const line of visibleLines) {
    const lineText = line.map(t => t.text).join('').replace(/\t/g, '    ');
    const measured = measureCtx.measureText(lineText).width;
    maxLineWidth = Math.max(maxLineWidth, measured);
  }

  // Also measure the header path
  const headerWidth = measureCtx.measureText(relativePath).width;
  const minContentWidth = Math.max(maxLineWidth, headerWidth);

  const totalWidth = Math.ceil(gutterWidth + GUTTER_SEPARATOR_WIDTH + PADDING_X + minContentWidth + PADDING_X);
  const totalHeight = Math.ceil(HEADER_HEIGHT + lineCount * LINE_HEIGHT + PADDING_Y);

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

  // Header text
  ctx.font = `${FONT_SIZE}px "JetBrains Mono"`;
  ctx.fillStyle = HEADER_TEXT_COLOR;
  ctx.textBaseline = 'middle';
  ctx.fillText(relativePath, PADDING_X, HEADER_HEIGHT / 2);

  // Gutter separator line
  ctx.fillStyle = GUTTER_SEP_COLOR;
  ctx.fillRect(gutterWidth, HEADER_HEIGHT, GUTTER_SEPARATOR_WIDTH, totalHeight - HEADER_HEIGHT);

  const codeStartY = HEADER_HEIGHT;
  const codeStartX = gutterWidth + GUTTER_SEPARATOR_WIDTH + PADDING_X;

  // Draw line highlights (behind text)
  for (const hl of highlights) {
    const colors = HIGHLIGHT_COLORS[hl.color];
    for (let line = hl.lineStart; line <= hl.lineEnd; line++) {
      if (line < startLine || line > endLine) continue;
      const lineIndex = line - startLine;
      const y = codeStartY + lineIndex * LINE_HEIGHT;

      if (hl.colStart !== undefined && hl.colEnd !== undefined) {
        // Column range highlight
        const lineTokens = visibleLines[lineIndex] || [];
        const fullText = lineTokens.map(t => t.text).join('').replace(/\t/g, '    ');
        const beforeText = fullText.substring(0, hl.colStart - 1);
        const highlightText = fullText.substring(hl.colStart - 1, hl.colEnd);

        const xStart = codeStartX + measureCtx.measureText(beforeText).width;
        const hlWidth = measureCtx.measureText(highlightText).width;

        // Border rectangle
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 2;
        ctx.strokeRect(xStart - 2, y + 1, hlWidth + 4, LINE_HEIGHT - 2);
      } else {
        // Full line highlight
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, y, totalWidth, LINE_HEIGHT);

        // Left accent border
        ctx.fillStyle = colors.border;
        ctx.fillRect(0, y, 3, LINE_HEIGHT);
      }
    }
  }

  // Draw lines
  ctx.font = `${FONT_SIZE}px "JetBrains Mono"`;
  ctx.textBaseline = 'top';

  for (let i = 0; i < visibleLines.length; i++) {
    const lineNum = startLine + i;
    const y = codeStartY + i * LINE_HEIGHT;
    const textY = y + (LINE_HEIGHT - FONT_SIZE) / 2;

    // Line number (right-aligned in gutter)
    ctx.fillStyle = LINE_NUM_COLOR;
    ctx.textAlign = 'right';
    ctx.fillText(`${lineNum}`, gutterWidth - GUTTER_PADDING, textY);

    // Tokens
    ctx.textAlign = 'left';
    let x = codeStartX;
    for (const token of visibleLines[i]) {
      const text = token.text.replace(/\t/g, '    ');
      ctx.fillStyle = token.color;
      ctx.fillText(text, x, textY);
      x += measureCtx.measureText(text).width;
    }
  }

  return Buffer.from(canvas.toBuffer('image/png'));
}
