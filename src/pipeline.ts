import { readSourceFile, detectLanguage, findProjectRoot, getRelativePath } from './reader.js';
import { tokenizeCode } from './highlighter.js';
import { renderCode } from './renderer.js';
import type { CodeShotOptions } from './types.js';
import { writeFileSync } from 'fs';
import { resolve, basename, extname } from 'path';

export async function generateCodeShot(options: CodeShotOptions): Promise<string> {
  const { filePath, lineRange, highlights, rootPath } = options;

  // Resolve output path
  const outputPath = options.outputPath || defaultOutputPath(filePath, lineRange.start, lineRange.end);

  // Read file
  const code = readSourceFile(filePath);
  const lang = detectLanguage(filePath);

  // Resolve relative path for header
  const root = findProjectRoot(filePath, rootPath);
  const relativePath = getRelativePath(filePath, root);

  // Tokenize full file
  const tokenizedLines = await tokenizeCode(code, lang);

  // Validate line range
  const totalLines = tokenizedLines.length;
  if (lineRange.start < 1 || lineRange.end > totalLines) {
    throw new Error(
      `Line range ${lineRange.start}-${lineRange.end} is out of bounds (file has ${totalLines} lines)`
    );
  }

  // Render
  const pngBuffer = await renderCode({
    tokenizedLines,
    startLine: lineRange.start,
    endLine: lineRange.end,
    relativePath,
    highlights,
    maxWidth: options.maxWidth,
  });

  // Save
  const resolvedOutput = resolve(outputPath);
  writeFileSync(resolvedOutput, pngBuffer);

  return resolvedOutput;
}

function defaultOutputPath(filePath: string, start: number, end: number): string {
  const name = basename(filePath, extname(filePath));
  return `${name}_L${start}-${end}.png`;
}
