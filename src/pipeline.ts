import { readSourceFile, detectLanguage, findProjectRoot, getRelativePath } from './reader.js';
import { tokenizeCode } from './highlighter.js';
import { renderCode } from './renderer.js';
import { renderAnsi } from './ansi.js';
import { renderSvg } from './svg.js';
import { resolveTheme, type Theme } from './themes.js';
import type { CodeShotOptions, TokenizedLine } from './types.js';
import { writeFileSync } from 'fs';
import { resolve, basename, extname } from 'path';

interface PreparedSnippet {
  tokenizedLines: TokenizedLine[];
  theme: Theme;
  relativePath: string;
  startLine: number;
  endLine: number;
  maxLines: number | null;
}

/** Shared front half of both outputs: read, tokenize, validate, expand context. */
async function prepareSnippet(options: CodeShotOptions): Promise<PreparedSnippet> {
  const { filePath, lineRange, rootPath } = options;

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

  // Validate the requested line range
  const totalLines = tokenizedLines.length;
  if (lineRange.start < 1 || lineRange.end > totalLines) {
    throw new Error(
      `Line range ${lineRange.start}-${lineRange.end} is out of bounds (file has ${totalLines} lines).`
    );
  }

  // Expand by context lines for readability, clamped to the file bounds.
  const context = Math.max(0, options.contextLines ?? 3);
  const startLine = Math.max(1, lineRange.start - context);
  const endLine = Math.min(totalLines, lineRange.end + context);

  // Row limit (folds excluded, wraps included). null disables it; default 70.
  const maxLines = options.maxLines === undefined ? 70 : options.maxLines;

  return { tokenizedLines, theme, relativePath, startLine, endLine, maxLines };
}

export async function generateCodeShot(options: CodeShotOptions): Promise<string> {
  const { filePath, lineRange, highlights } = options;

  // Resolve output path
  const outputPath = options.outputPath || defaultOutputPath(filePath, lineRange.start, lineRange.end);

  const prep = await prepareSnippet(options);

  // Render
  const pngBuffer = await renderCode({
    tokenizedLines: prep.tokenizedLines,
    startLine: prep.startLine,
    endLine: prep.endLine,
    relativePath: prep.relativePath,
    highlights,
    maxWidth: options.maxWidth,
    folds: options.folds,
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
    folds: options.folds,
    theme: prep.theme,
    maxLines: prep.maxLines,
  });
}

/**
 * Same pipeline as {@link generateCodeShot}, but renders the snippet as an
 * SVG document instead of a PNG. Writes the file and returns its path.
 */
export async function generateCodeShotSvg(options: CodeShotOptions): Promise<string> {
  const { filePath, lineRange } = options;

  const outputPath = options.outputPath || defaultOutputPath(filePath, lineRange.start, lineRange.end, 'svg');

  const prep = await prepareSnippet(options);

  const svg = renderSvg({
    tokenizedLines: prep.tokenizedLines,
    startLine: prep.startLine,
    endLine: prep.endLine,
    relativePath: prep.relativePath,
    highlights: options.highlights,
    maxWidth: options.maxWidth,
    folds: options.folds,
    theme: prep.theme,
    maxLines: prep.maxLines,
  });

  const resolvedOutput = resolve(outputPath);
  writeFileSync(resolvedOutput, svg);

  return resolvedOutput;
}

function defaultOutputPath(filePath: string, start: number, end: number, ext = 'png'): string {
  const name = basename(filePath, extname(filePath));
  return `${name}_L${start}-${end}.${ext}`;
}
