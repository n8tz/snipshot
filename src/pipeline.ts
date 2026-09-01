import { readSourceFile, detectLanguage, findProjectRoot, getRelativePath } from './reader.js';
import { tokenizeCode } from './highlighter.js';
import { renderCode } from './renderer.js';
import { renderAnsi } from './ansi.js';
import { renderSvg } from './svg.js';
import { resolveTheme, type Theme } from './themes.js';
import type { CodeShotOptions, TokenizedLine, LineRange } from './types.js';
import { writeFileSync } from 'fs';
import { resolve, basename, extname } from 'path';

interface PreparedSnippet {
  tokenizedLines: TokenizedLine[];
  theme: Theme;
  relativePath: string;
  startLine: number;
  endLine: number;
  folds: LineRange[] | undefined;
  maxLines: number | null;
}

/** Sort ranges by start and merge the ones that overlap or touch. */
function normalizeRanges(ranges: LineRange[]): LineRange[] {
  if (ranges.length === 0) {
    throw new Error('At least one line range is required (e.g. --lines 42-56).');
  }
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: LineRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end + 1) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

/** Shared front half of all outputs: read, tokenize, validate, expand context. */
async function prepareSnippet(options: CodeShotOptions): Promise<PreparedSnippet> {
  const { filePath, rootPath } = options;

  const ranges = normalizeRanges(options.lineRanges);

  // Resolve theme (defaults to dark)
  const theme = resolveTheme(options.theme);

  // Read file
  const code = readSourceFile(filePath);
  const lang = detectLanguage(filePath);

  // Resolve relative path for header
  const root = findProjectRoot(filePath, rootPath);
  const relativePath = getRelativePath(filePath, root);

  // Tokenize full file
  const tokenizedLines = await tokenizeCode(code, lang, theme);

  // Validate the requested line ranges
  const totalLines = tokenizedLines.length;
  for (const r of ranges) {
    if (r.start < 1 || r.end > totalLines) {
      throw new Error(
        `Line range ${r.start}-${r.end} is out of bounds (file has ${totalLines} lines).`
      );
    }
  }

  const first = ranges[0];
  const last = ranges[ranges.length - 1];

  // Expand by context lines for readability, clamped to the file bounds.
  const context = Math.max(0, options.contextLines ?? 3);
  const startLine = Math.max(1, first.start - context);
  const endLine = Math.min(totalLines, last.end + context);

  // With several ranges, fold the gaps between them (keeping each range's
  // context lines visible). Gaps hiding fewer than 2 lines are just shown.
  const autoFolds: LineRange[] = [];
  for (let i = 0; i < ranges.length - 1; i++) {
    const gapStart = ranges[i].end + context + 1;
    const gapEnd = ranges[i + 1].start - context - 1;
    if (gapEnd - gapStart + 1 >= 2) {
      autoFolds.push({ start: gapStart, end: gapEnd });
    }
  }
  const folds = autoFolds.length > 0 ? [...(options.folds ?? []), ...autoFolds] : options.folds;

  // Row limit (folds excluded, wraps included). null disables it; default 70.
  const maxLines = options.maxLines === undefined ? 70 : options.maxLines;

  return { tokenizedLines, theme, relativePath, startLine, endLine, folds, maxLines };
}

export async function generateCodeShot(options: CodeShotOptions): Promise<string> {
  const { filePath, highlights } = options;

  // Resolve output path
  const outputPath = options.outputPath || defaultOutputPath(filePath, options.lineRanges);

  const prep = await prepareSnippet(options);

  // Render
  const pngBuffer = await renderCode({
    tokenizedLines: prep.tokenizedLines,
    startLine: prep.startLine,
    endLine: prep.endLine,
    relativePath: prep.relativePath,
    highlights,
    maxWidth: options.maxWidth,
    folds: prep.folds,
    theme: prep.theme,
    maxLines: prep.maxLines,
  });

  // Save
  const resolvedOutput = resolve(outputPath);
  writeFileSync(resolvedOutput, pngBuffer);

  return resolvedOutput;
}

/**
 * Same pipeline as {@link generateCodeShot}, but renders the snippet as
 * ANSI-colored text (for terminal output) instead of a PNG. Returns the
 * colored string; the caller decides where to print or save it.
 */
export async function generateCodeShotAnsi(options: CodeShotOptions): Promise<string> {
  const prep = await prepareSnippet(options);

  return renderAnsi({
    tokenizedLines: prep.tokenizedLines,
    startLine: prep.startLine,
    endLine: prep.endLine,
    relativePath: prep.relativePath,
    highlights: options.highlights,
    folds: prep.folds,
    theme: prep.theme,
    maxLines: prep.maxLines,
  });
}

/**
 * Same pipeline as {@link generateCodeShot}, but renders the snippet as an
 * SVG document instead of a PNG. Writes the file and returns its path.
 */
export async function generateCodeShotSvg(options: CodeShotOptions): Promise<string> {
  const { filePath } = options;

  const outputPath = options.outputPath || defaultOutputPath(filePath, options.lineRanges, 'svg');

  const prep = await prepareSnippet(options);

  const svg = renderSvg({
    tokenizedLines: prep.tokenizedLines,
    startLine: prep.startLine,
    endLine: prep.endLine,
    relativePath: prep.relativePath,
    highlights: options.highlights,
    maxWidth: options.maxWidth,
    folds: prep.folds,
    theme: prep.theme,
    maxLines: prep.maxLines,
  });

  const resolvedOutput = resolve(outputPath);
  writeFileSync(resolvedOutput, svg);

  return resolvedOutput;
}

function defaultOutputPath(filePath: string, ranges: LineRange[], ext = 'png'): string {
  const name = basename(filePath, extname(filePath));
  const label = normalizeRanges(ranges).map(r => `${r.start}-${r.end}`).join('+');
  return `${name}_L${label}.${ext}`;
}
