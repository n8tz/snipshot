import type { TokenizedLine, HighlightSpec } from './types.js';
import { THEMES, type Theme } from './themes.js';
import {
  FONT_SIZE, LINE_HEIGHT, PADDING_X, PADDING_Y, HEADER_HEIGHT,
  GUTTER_PADDING, GUTTER_SEPARATOR_WIDTH, WRAP_INDENT_CHARS,
  buildFoldMaps, buildVisualRows, type VisualRow,
} from './layout.js';

// JetBrains Mono advance width is 600/1000 em — no canvas needed to measure.
const CHAR_WIDTH = FONT_SIZE * 0.6;

/**
 * Distance from the vertical centre of a row down to the alphabetic baseline,
 * for JetBrains Mono (ascender 1020, descender -300, per 1000 em): the
 * "central" baseline sits (1020 - 300) / 2 = 360 units above the alphabetic
 * one. Text is placed on the alphabetic baseline explicitly rather than with
 * `dominant-baseline="central"`, which the Office renderer ignores.
 */
const BASELINE_SHIFT = FONT_SIZE * 0.36;

const FONT_FAMILY = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2);
}

/**
 * `fill` attribute(s) for a theme color. The themes express translucent
 * colors as `rgba()`, which browsers accept but Word, Excel and PowerPoint do
 * not (SVG 1.1 has no rgba; Office drops the fill entirely, so highlighted
 * rows come out blank). Those become a hex fill plus `fill-opacity`, which
 * every renderer understands.
 */
function fillAttrs(color: string): string {
  const match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (!match) return `fill="${color}"`;
  const hex = [match[1], match[2], match[3]]
    .map(c => Number(c).toString(16).padStart(2, '0'))
    .join('');
  const alpha = match[4];
  return alpha === undefined || Number(alpha) >= 1
    ? `fill="#${hex}"`
    : `fill="#${hex}" fill-opacity="${Number(alpha)}"`;
}

/**
 * One `<text>` element per run of text, each at its own absolute x, so
 * alignment never depends on `xml:space="preserve"`: Office ignores it and
 * collapses consecutive spaces, so a run stops wherever two or more spaces
 * meet (a single space inside a run is safe). Leading and trailing spaces
 * only advance the cursor. [y] is the alphabetic baseline. With [exact], each
 * run also carries `textLength` so a fallback font keeps the monospace grid.
 */
function textRuns(x: number, y: number, color: string, text: string, exact: boolean): string[] {
  const out: string[] = [];
  const runs = text.matchAll(/\S(?:\S| (?=\S))*/g);
  for (const run of runs) {
    const runX = x + run.index * CHAR_WIDTH;
    const length = exact
      ? ` textLength="${fmt(run[0].length * CHAR_WIDTH)}" lengthAdjust="spacingAndGlyphs"`
      : '';
    out.push(`<text x="${fmt(runX)}" y="${fmt(y)}" fill="${color}"${length}>${esc(run[0])}</text>`);
  }
  return out;
}

/** Text whose right edge sits at [rightX]: monospace, so the start is computable. */
function textRightAligned(rightX: number, y: number, color: string, text: string): string[] {
  return textRuns(rightX - text.length * CHAR_WIDTH, y, color, text, false);
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
 *
 * The output sticks to the SVG 1.1 subset that the Microsoft Office renderer
 * honours: hex colors with `fill-opacity` rather than `rgba()`, explicit
 * baselines and x positions rather than `dominant-baseline` / `text-anchor`,
 * and no run of spaces inside a `<text>` (see the helpers above).
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
    `font-size="${FONT_SIZE}">`
  );

  // Background
  parts.push(`<rect width="${totalWidth}" height="${totalHeight}" ${fillAttrs(theme.bg)}/>`);

  // Header
  parts.push(`<rect width="${totalWidth}" height="${HEADER_HEIGHT}" ${fillAttrs(theme.headerBg)}/>`);
  parts.push(`<rect y="${HEADER_HEIGHT - 1}" width="${totalWidth}" height="1" ${fillAttrs(theme.headerBorder)}/>`);

  // Header text (truncate if too long)
  const maxHeaderChars = Math.floor((totalWidth - PADDING_X * 2) / charWidth);
  let headerText = relativePath;
  if (headerText.length > maxHeaderChars) {
    headerText = '...' + headerText.substring(headerText.length - Math.max(0, maxHeaderChars - 3));
  }
  parts.push(...textRuns(PADDING_X, HEADER_HEIGHT / 2 + BASELINE_SHIFT, theme.headerTextColor, headerText, false));

  // Gutter separator
  parts.push(
    `<rect x="${fmt(gutterWidth)}" y="${HEADER_HEIGHT}" width="${GUTTER_SEPARATOR_WIDTH}" ` +
    `height="${totalHeight - HEADER_HEIGHT}" ${fillAttrs(theme.gutterSepColor)}/>`
  );

  const codeStartY = HEADER_HEIGHT;
  const codeStartX = gutterWidth + GUTTER_SEPARATOR_WIDTH + PADDING_X;
  const gutterTextRight = gutterWidth - GUTTER_PADDING;

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
          parts.push(`<rect y="${y}" width="${totalWidth}" height="${LINE_HEIGHT}" ${fillAttrs(colors.bg)}/>`);
          if (vrIdx === vRowIndices[0]) {
            parts.push(`<rect y="${y}" width="3" height="${LINE_HEIGHT}" ${fillAttrs(colors.border)}/>`);
          }
        }
      }
    }
  }

  // Rows
  for (let r = 0; r < visualRows.length; r++) {
    const vRow = visualRows[r];
    const y = codeStartY + r * LINE_HEIGHT;
    const baseline = y + LINE_HEIGHT / 2 + BASELINE_SHIFT;

    // Fold indicator row
    if (vRow.isFold) {
      parts.push(`<rect y="${y}" width="${totalWidth}" height="${LINE_HEIGHT}" ${fillAttrs(theme.foldBg)}/>`);
      const foldX = fmt(gutterWidth + GUTTER_SEPARATOR_WIDTH);
      const foldW = fmt(totalWidth - gutterWidth - GUTTER_SEPARATOR_WIDTH);
      parts.push(`<rect x="${foldX}" y="${y}" width="${foldW}" height="1" ${fillAttrs(theme.foldBorderColor)}/>`);
      parts.push(`<rect x="${foldX}" y="${y + LINE_HEIGHT - 1}" width="${foldW}" height="1" ${fillAttrs(theme.foldBorderColor)}/>`);
      parts.push(...textRightAligned(gutterTextRight, baseline, theme.foldTextColor, '⋮'));
      parts.push(...textRuns(codeStartX, baseline, theme.foldTextColor, `•••  ${vRow.foldCount} lines folded  •••`, false));
      continue;
    }

    // Line number (first visual row of each source line only)
    if (vRow.isFirstRow) {
      parts.push(...textRightAligned(gutterTextRight, baseline, theme.lineNumColor, `${vRow.sourceLineNum}`));
    }

    let x = codeStartX;

    if (!vRow.isFirstRow) {
      x += wrapIndentWidth;
      parts.push(...textRuns(codeStartX + wrapIndentWidth, baseline, theme.wrapIndicatorColor, '↳', false));
      x += wrapIndicatorWidth;
    }

    for (const token of vRow.tokens) {
      // Spaces advance the cursor; only the non-space runs are drawn, each at
      // its own x, so neither xml:space nor textLength has to account for them.
      parts.push(...textRuns(x, baseline, token.color, token.text, true));
      x += charWidth * token.text.length;
    }
  }

  parts.push('</svg>');
  return parts.join('\n') + '\n';
}
