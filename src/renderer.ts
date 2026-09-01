import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { TokenizedLine, HighlightSpec } from './types.js';
import { THEMES, type Theme } from './themes.js';
import {
  FONT_SIZE, LINE_HEIGHT, PADDING_X, PADDING_Y, HEADER_HEIGHT,
  GUTTER_PADDING, GUTTER_SEPARATOR_WIDTH, WRAP_INDENT_CHARS,
  buildFoldMaps, buildVisualRows, type VisualRow,
} from './layout.js';
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

interface RenderInput {
  tokenizedLines: TokenizedLine[];
  startLine: number;
  endLine: number;
  relativePath: string;
  highlights: HighlightSpec[];
  maxWidth?: number;
  folds?: { start: number; end: number }[];
  theme?: Theme;
  /** Max rendered rows allowed; `null`/undefined disables the check. */
  maxLines?: number | null;
}

export async function renderCode(input: RenderInput): Promise<Buffer> {
  const { tokenizedLines, startLine, endLine, relativePath, highlights, maxWidth, folds } = input;
  const visibleLines = tokenizedLines.slice(startLine - 1, endLine);

  // Theme colors (defaults to the dark theme).
  const theme = input.theme ?? THEMES.dark;
  const BG_COLOR = theme.bg;
  const HEADER_BG = theme.headerBg;
  const HEADER_BORDER = theme.headerBorder;
  const LINE_NUM_COLOR = theme.lineNumColor;
  const HEADER_TEXT_COLOR = theme.headerTextColor;
  const GUTTER_SEP_COLOR = theme.gutterSepColor;
  const WRAP_INDICATOR_COLOR = theme.wrapIndicatorColor;
  const FOLD_BG = theme.foldBg;
  const FOLD_TEXT_COLOR = theme.foldTextColor;
  const FOLD_BORDER_COLOR = theme.foldBorderColor;
  const HIGHLIGHT_COLORS = theme.highlight;

  // Build a set of folded line numbers for fast lookup
  const { foldedLines, foldStarts } = buildFoldMaps(folds, startLine, endLine);

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
  const wrapIndicatorWidth = measureCtx.measureText('↳ ').width;
  const totalWrapIndent = wrapIndentWidth + wrapIndicatorWidth;

  // Build visual rows
  const visualRows: VisualRow[] = buildVisualRows({
    visibleLines,
    startLine,
    foldedLines,
    foldStarts,
    maxWidth,
    gutterWidth,
    totalWrapIndent,
    charWidth,
  });

  // Enforce the max rendered-rows limit (folds already collapsed to one row,
  // wrapped lines already counted as separate rows). Keeps the image short
  // enough to fit on a single page.
  const maxLines = input.maxLines;
  if (maxLines != null && visualRows.length > maxLines) {
    throw new Error(
      `Screenshot would be ${visualRows.length} lines, over the ${maxLines}-line limit.\n` +
      `  Narrow --lines, collapse sections with --fold, or pass --no-max-lines to allow it.`
    );
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
      ctx.fillText('⋮', gutterWidth - GUTTER_PADDING, textY);
      // Fold label
      ctx.textAlign = 'left';
      const label = `•••  ${vRow.foldCount} lines folded  •••`;
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
      ctx.fillText('↳ ', codeStartX, textY);
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
