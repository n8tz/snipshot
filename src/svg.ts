import type { TokenizedLine, HighlightSpec } from './types.js';
import { THEMES, type Theme } from './themes.js';
import {
  FONT_SIZE, LINE_HEIGHT, PADDING_X, PADDING_Y, HEADER_HEIGHT,
  GUTTER_PADDING, GUTTER_SEPARATOR_WIDTH, WRAP_INDENT_CHARS,
  buildFoldMaps, buildVisualRows, type VisualRow,
} from './layout.js';

// JetBrains Mono advance width is 600/1000 em — no canvas needed to measure.
const CHAR_WIDTH = FONT_SIZE * 0.6;

const FONT_FAMILY = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(2);
}

export interface SvgRenderInput {
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

/**
 * Render the snippet as an SVG document. Mirrors the PNG renderer's layout
 * exactly (header, gutter, folds, wrapping, highlights) but outputs a
 * scalable vector file. The font is not embedded; text uses a monospace
 * fallback stack with per-token `textLength` so alignment stays exact even
 * when JetBrains Mono is not installed.
 */
export function renderSvg(input: SvgRenderInput): string {
  const { tokenizedLines, startLine, endLine, relativePath, highlights, maxWidth, folds } = input;
  const visibleLines = tokenizedLines.slice(startLine - 1, endLine);
  const theme = input.theme ?? THEMES.dark;

  const { foldedLines, foldStarts } = buildFoldMaps(folds, startLine, endLine);

  const charWidth = CHAR_WIDTH;

  // Gutter width
  const gutterWidth = charWidth * `${endLine}`.length + GUTTER_PADDING * 2;

  const wrapIndentWidth = charWidth * WRAP_INDENT_CHARS;
  const wrapIndicatorWidth = charWidth * 2; // '↳ '
  const totalWrapIndent = wrapIndentWidth + wrapIndicatorWidth;

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

  const maxLines = input.maxLines;
  if (maxLines != null && visualRows.length > maxLines) {
    throw new Error(
      `Screenshot would be ${visualRows.length} lines, over the ${maxLines}-line limit.\n` +
      `  Narrow --lines, collapse sections with --fold, or pass --no-max-lines to allow it.`
    );
  }

  // Calculate total width (same rules as the PNG renderer)
  let totalWidth: number;
  if (maxWidth) {
    totalWidth = maxWidth;
  } else {
    let maxLineChars = 0;
    for (const line of visibleLines) {
      const lineText = line.map(t => t.text).join('').replace(/\t/g, '    ');
      maxLineChars = Math.max(maxLineChars, lineText.length);
    }
    const minContentWidth = charWidth * Math.max(maxLineChars, relativePath.length);
    totalWidth = Math.ceil(gutterWidth + GUTTER_SEPARATOR_WIDTH + PADDING_X + minContentWidth + PADDING_X);
  }

  const totalHeight = Math.ceil(HEADER_HEIGHT + visualRows.length * LINE_HEIGHT + PADDING_Y);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" ` +
    `viewBox="0 0 ${totalWidth} ${totalHeight}" font-family="${FONT_FAMILY}" ` +
    `font-size="${FONT_SIZE}" xml:space="preserve">`
  );

  // Background
  parts.push(`<rect width="${totalWidth}" height="${totalHeight}" fill="${theme.bg}"/>`);

  // Header
  parts.push(`<rect width="${totalWidth}" height="${HEADER_HEIGHT}" fill="${theme.headerBg}"/>`);
  parts.push(`<rect y="${HEADER_HEIGHT - 1}" width="${totalWidth}" height="1" fill="${theme.headerBorder}"/>`);

  // Header text (truncate if too long)
  const maxHeaderChars = Math.floor((totalWidth - PADDING_X * 2) / charWidth);
  let headerText = relativePath;
  if (headerText.length > maxHeaderChars) {
    headerText = '...' + headerText.substring(headerText.length - Math.max(0, maxHeaderChars - 3));
  }
  parts.push(
    `<text x="${PADDING_X}" y="${HEADER_HEIGHT / 2}" fill="${theme.headerTextColor}" ` +
    `dominant-baseline="central">${esc(headerText)}</text>`
  );

  // Gutter separator
  parts.push(
    `<rect x="${fmt(gutterWidth)}" y="${HEADER_HEIGHT}" width="${GUTTER_SEPARATOR_WIDTH}" ` +
    `height="${totalHeight - HEADER_HEIGHT}" fill="${theme.gutterSepColor}"/>`
  );

  const codeStartY = HEADER_HEIGHT;
  const codeStartX = gutterWidth + GUTTER_SEPARATOR_WIDTH + PADDING_X;

  // Map source line index → visual row indices
  const lineToVisualRows = new Map<number, number[]>();
  for (let r = 0; r < visualRows.length; r++) {
    const idx = visualRows[r].sourceLineIndex;
    if (!lineToVisualRows.has(idx)) lineToVisualRows.set(idx, []);
    lineToVisualRows.get(idx)!.push(r);
  }

  // Highlights (drawn under the text, like the PNG renderer)
  for (const hl of highlights) {
    const colors = theme.highlight[hl.color];
    for (let line = hl.lineStart; line <= hl.lineEnd; line++) {
      if (line < startLine || line > endLine) continue;
      const lineIndex = line - startLine;
      const vRowIndices = lineToVisualRows.get(lineIndex) || [];

      if (hl.colStart !== undefined && hl.colEnd !== undefined) {
        const hlStart = hl.colStart - 1;
        const hlEnd = hl.colEnd;

        for (const vrIdx of vRowIndices) {
          const vRow = visualRows[vrIdx];
          if (hlStart >= vRow.charEnd || hlEnd <= vRow.charStart) continue;

          const visStart = Math.max(hlStart, vRow.charStart) - vRow.charStart;
          const visEnd = Math.min(hlEnd, vRow.charEnd) - vRow.charStart;

          const y = codeStartY + vrIdx * LINE_HEIGHT;
          let xOffset = codeStartX;
          if (!vRow.isFirstRow) xOffset += totalWrapIndent;

          const xStart = xOffset + charWidth * visStart;
          const hlWidth = charWidth * (visEnd - visStart);

          parts.push(
            `<rect x="${fmt(xStart - 2)}" y="${y + 1}" width="${fmt(hlWidth + 4)}" ` +
            `height="${LINE_HEIGHT - 2}" fill="none" stroke="${colors.border}" stroke-width="2"/>`
          );
        }
      } else {
        for (const vrIdx of vRowIndices) {
          const y = codeStartY + vrIdx * LINE_HEIGHT;
          parts.push(`<rect y="${y}" width="${totalWidth}" height="${LINE_HEIGHT}" fill="${colors.bg}"/>`);
          if (vrIdx === vRowIndices[0]) {
            parts.push(`<rect y="${y}" width="3" height="${LINE_HEIGHT}" fill="${colors.border}"/>`);
          }
        }
      }
    }
  }

  // Rows
  for (let r = 0; r < visualRows.length; r++) {
    const vRow = visualRows[r];
    const y = codeStartY + r * LINE_HEIGHT;
    const textY = y + LINE_HEIGHT / 2;

    // Fold indicator row
    if (vRow.isFold) {
      parts.push(`<rect y="${y}" width="${totalWidth}" height="${LINE_HEIGHT}" fill="${theme.foldBg}"/>`);
      const foldX = fmt(gutterWidth + GUTTER_SEPARATOR_WIDTH);
      const foldW = fmt(totalWidth - gutterWidth - GUTTER_SEPARATOR_WIDTH);
      parts.push(`<rect x="${foldX}" y="${y}" width="${foldW}" height="1" fill="${theme.foldBorderColor}"/>`);
      parts.push(`<rect x="${foldX}" y="${y + LINE_HEIGHT - 1}" width="${foldW}" height="1" fill="${theme.foldBorderColor}"/>`);
      parts.push(
        `<text x="${fmt(gutterWidth - GUTTER_PADDING)}" y="${textY}" fill="${theme.foldTextColor}" ` +
        `text-anchor="end" dominant-baseline="central">⋮</text>`
      );
      parts.push(
        `<text x="${fmt(codeStartX)}" y="${textY}" fill="${theme.foldTextColor}" ` +
        `dominant-baseline="central">•••  ${vRow.foldCount} lines folded  •••</text>`
      );
      continue;
    }

    // Line number (first visual row of each source line only)
    if (vRow.isFirstRow) {
      parts.push(
        `<text x="${fmt(gutterWidth - GUTTER_PADDING)}" y="${textY}" fill="${theme.lineNumColor}" ` +
        `text-anchor="end" dominant-baseline="central">${vRow.sourceLineNum}</text>`
      );
    }

    let x = codeStartX;

    if (!vRow.isFirstRow) {
      x += wrapIndentWidth;
      parts.push(
        `<text x="${fmt(codeStartX + wrapIndentWidth)}" y="${textY}" fill="${theme.wrapIndicatorColor}" ` +
        `dominant-baseline="central">↳</text>`
      );
      x += wrapIndicatorWidth;
    }

    for (const token of vRow.tokens) {
      const width = charWidth * token.text.length;
      // Draw only the trimmed core: leading/trailing spaces advance the cursor
      // but must not take part in textLength, or renderers stretch the glyphs.
      const core = token.text.trim();
      if (core.length > 0) {
        const lead = token.text.length - token.text.trimStart().length;
        parts.push(
          `<text x="${fmt(x + lead * charWidth)}" y="${textY}" fill="${token.color}" dominant-baseline="central" ` +
          `textLength="${fmt(core.length * charWidth)}" lengthAdjust="spacingAndGlyphs">${esc(core)}</text>`
        );
      }
      x += width;
    }
  }

  parts.push('</svg>');
  return parts.join('\n') + '\n';
}
