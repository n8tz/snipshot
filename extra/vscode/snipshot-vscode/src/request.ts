import * as path from 'path';

/** Everything one snipshot invocation needs. Mirrors the CLI flags one-for-one. */
export interface SnipshotRequest {
  filePath: string;
  /** `--lines` spec: one or more comma-separated ranges. */
  lines: string;
  red: string;
  green: string;
  folds: string;
  theme: 'dark' | 'light';
  contextLines: number;
  /** 0 = --no-max-width. */
  maxWidth: number;
  /** 0 = --no-max-lines. */
  maxLines: number;
  svg: boolean;
  outputPath: string;
  rootPath?: string;
}

/** The command line, in the same order as the IntelliJ plugin builds it. */
export function toCommandArgs(request: SnipshotRequest): string[] {
  const args = [request.filePath, '--lines', request.lines];
  if (request.red.trim()) args.push('--highlight-red', request.red);
  if (request.green.trim()) args.push('--highlight-green', request.green);
  if (request.folds.trim()) args.push('--fold', request.folds);
  args.push('--theme', request.theme, '--context', String(request.contextLines));
  if (request.maxWidth <= 0) args.push('--no-max-width');
  else args.push('--max-width', String(request.maxWidth));
  if (request.maxLines <= 0) args.push('--no-max-lines');
  else args.push('--max-lines', String(request.maxLines));
  if (request.svg) args.push('--svg');
  if (request.rootPath) args.push('--root', request.rootPath);
  args.push('--output', request.outputPath);
  return args;
}

/** Joins non-empty CLI specs, e.g. marks plus a one-shot selection. */
export function mergeSpecs(...specs: string[]): string {
  return specs.map(s => s.trim()).filter(s => s !== '').join(',');
}

/** `<name>_L<ranges>.<ext>`, with "+" between ranges like the CLI. */
export function defaultOutputName(filePath: string, lines: string, svg: boolean): string {
  const base = path.basename(filePath, path.extname(filePath));
  return `${base}_L${lines.replace(/,/g, '+')}.${svg ? 'svg' : 'png'}`;
}

/** Keeps the output extension in sync when the format is switched. */
export function retargetExtension(outputPath: string, svg: boolean): string {
  const wanted = svg ? '.svg' : '.png';
  const other = svg ? '.png' : '.svg';
  return outputPath.toLowerCase().endsWith(other)
    ? outputPath.slice(0, -other.length) + wanted
    : outputPath;
}
