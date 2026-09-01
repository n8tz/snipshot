import type { TokenizedLine, HighlightSpec, TokenInfo } from './types.js';
import { THEMES, type Theme } from './themes.js';

const RESET = '\x1b[0m';
const UNDERLINE = '\x1b[4m';
const NO_UNDERLINE = '\x1b[24m';
const DEFAULT_BG = '\x1b[49m';

type Rgb = [number, number, number];

// Alpha boosts: theme highlight backgrounds are tuned for a filled PNG canvas;
// on a terminal (where only highlighted lines get a background) they need to
// be stronger to stay visible.
const LINE_HL_MIN_ALPHA = 0.25;
const COL_HL_MIN_ALPHA = 0.45;

function parseColor(color: string): { rgb: Rgb; alpha: number } {
  const hex = color.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff], alpha: 1 };
  }
  const rgba = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/);
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  return { rgb: [128, 128, 128], alpha: 1 };
}

/** Composite a (possibly translucent) color over an opaque base, as the canvas would. */
function blendOver(color: string, baseHex: string, minAlpha = 0): Rgb {
  const top = parseColor(color);
  const base = parseColor(baseHex);
  const a = Math.max(top.alpha, minAlpha);
  return [0, 1, 2].map(i => Math.round(a * top.rgb[i] + (1 - a) * base.rgb[i])) as Rgb;
}

function fg(color: string): string {
  const { rgb } = parseColor(color);
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
}

function bg(rgb: Rgb): string {
  return `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
}

export interface AnsiRenderInput {
  tokenizedLines: TokenizedLine[];
  startLine: number;
  endLine: number;
  relativePath: string;
  highlights: HighlightSpec[];
  folds?: { start: number; end: number }[];
  theme?: Theme;
  /** Max rendered rows allowed; `null`/undefined disables the check. */
  maxLines?: number | null;
}

interface AnsiRow {
  lineNum: number;
  tokens: TokenInfo[]; // tab-expanded
  isFold?: boolean;
  foldCount?: number;
}

/**
 * Render the snippet as ANSI-colored text (24-bit truecolor) for terminal
 * output. Mirrors the PNG renderer: header path, line-number gutter, fold
 * rows, red/green line highlights (tinted background + left bar) and column
 * highlights (underlined, stronger tint). Lines are not wrapped — the
 * terminal handles that.
 */
export function renderAnsi(input: AnsiRenderInput): string {
  const { tokenizedLines, startLine, endLine, relativePath, highlights, folds } = input;
  const theme = input.theme ?? THEMES.dark;
  const visibleLines = tokenizedLines.slice(startLine - 1, endLine);

  // Build a set of folded line numbers for fast lookup
  const foldedLines = new Set<number>();
  const foldStarts = new Map<number, number>();
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

  // Build rows (folds collapse to a single indicator row)
  const rows: AnsiRow[] = [];
  for (let i = 0; i < visibleLines.length; i++) {
    const lineNum = startLine + i;
    if (foldedLines.has(lineNum)) {
      if (foldStarts.has(lineNum)) {
        rows.push({ lineNum, tokens: [], isFold: true, foldCount: foldStarts.get(lineNum) });
      }
      continue;
    }
    rows.push({
      lineNum,
      tokens: visibleLines[i].map(t => ({ text: t.text.replace(/\t/g, '    '), color: t.color })),
    });
  }

  const maxLines = input.maxLines;
  if (maxLines != null && rows.length > maxLines) {
    throw new Error(
      `Snippet would be ${rows.length} lines, over the ${maxLines}-line limit.\n` +
      `  Narrow --lines, collapse sections with --fold, or pass --no-max-lines to allow it.`
    );
  }

  // Split highlights into full-line and column specs, indexed by line number
  const lineHl = new Map<number, 'red' | 'green'>();
  const colHls = new Map<number, { start: number; end: number; color: 'red' | 'green' }[]>();
  for (const hl of highlights) {
    for (let line = hl.lineStart; line <= hl.lineEnd; line++) {
      if (line < startLine || line > endLine) continue;
      if (hl.colStart !== undefined && hl.colEnd !== undefined) {
        if (!colHls.has(line)) colHls.set(line, []);
        colHls.get(line)!.push({ start: hl.colStart - 1, end: hl.colEnd, color: hl.color });
      } else {
        lineHl.set(line, hl.color);
      }
    }
  }

  const gutterWidth = `${endLine}`.length;

  // Rule width: fit the longest row (or the header path), clamped to sane bounds
  let maxContentChars = relativePath.length;
  for (const row of rows) {
    const len = row.isFold
      ? `··· ${row.foldCount} lines folded ···`.length
      : row.tokens.reduce((n, t) => n + t.text.length, 0);
    maxContentChars = Math.max(maxContentChars, len);
  }
  const ruleWidth = Math.min(Math.max(1 + gutterWidth + 3 + maxContentChars, 20), 120);

  const out: string[] = [];

  // Header: file path + separator rule
  out.push(fg(theme.headerTextColor) + relativePath + RESET);
  out.push(fg(theme.gutterSepColor) + '─'.repeat(ruleWidth) + RESET);

  for (const row of rows) {
    // Fold indicator row
    if (row.isFold) {
      out.push(
        ' ' + fg(theme.foldTextColor) + '⋮'.padStart(gutterWidth) +
        fg(theme.gutterSepColor) + ' │ ' +
        fg(theme.foldTextColor) + `••• ${row.foldCount} lines folded •••` + RESET
      );
      continue;
    }

    const hlColor = lineHl.get(row.lineNum);
    const lineColHls = colHls.get(row.lineNum) ?? [];
    const decorated = hlColor !== undefined || lineColHls.length > 0;
    const baseBg = hlColor ? bg(blendOver(theme.highlight[hlColor].bg, theme.bg, LINE_HL_MIN_ALPHA)) : '';

    let line = '';

    // Gutter: left bar (highlighted lines only) + line number + separator
    if (hlColor) {
      line += baseBg + fg(theme.highlight[hlColor].border) + '▎';
    } else {
      line += ' ';
    }
    line += baseBg + fg(theme.lineNumColor) + `${row.lineNum}`.padStart(gutterWidth);
    line += fg(theme.gutterSepColor) + ' │ ';

    // Code: emit runs of identical (fg, bg, underline) attributes
    const cells: { ch: string; color: string }[] = [];
    for (const t of row.tokens) {
      for (const ch of t.text) cells.push({ ch, color: t.color });
    }

    let prevAttr: string | null = null;
    for (let i = 0; i < cells.length; i++) {
      const inCol = lineColHls.find(h => i >= h.start && i < h.end);
      let attr: string;
      if (!decorated) {
        attr = fg(cells[i].color);
      } else if (inCol) {
        attr = bg(blendOver(theme.highlight[inCol.color].bg, theme.bg, COL_HL_MIN_ALPHA)) +
          UNDERLINE + fg(cells[i].color);
      } else {
        attr = (baseBg || DEFAULT_BG) + NO_UNDERLINE + fg(cells[i].color);
      }
      if (attr !== prevAttr) {
        line += attr;
        prevAttr = attr;
      }
      line += cells[i].ch;
    }

    // Extend the tinted band across the row, like the PNG full-width background
    if (hlColor) {
      const used = 1 + gutterWidth + 3 + cells.length;
      if (used < ruleWidth) {
        line += (baseBg + NO_UNDERLINE) + ' '.repeat(ruleWidth - used);
      }
    }

    out.push(line + RESET);
  }

  return out.join('\n') + '\n';
}
