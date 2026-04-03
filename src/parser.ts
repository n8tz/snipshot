import type { LineRange, HighlightSpec } from './types.js';

export function parseLineRange(input: string): LineRange {
  const singleMatch = input.match(/^(\d+)$/);
  if (singleMatch) {
    const line = parseInt(singleMatch[1], 10);
    return { start: line, end: line };
  }

  const rangeMatch = input.match(/^(\d+)-(\d+)$/);
  if (!rangeMatch) {
    throw new Error(`Invalid line range: "${input}". Expected format: <start>-<end> or <line>`);
  }

  const start = parseInt(rangeMatch[1], 10);
  const end = parseInt(rangeMatch[2], 10);

  if (start > end) {
    throw new Error(`Invalid line range: start (${start}) must be <= end (${end})`);
  }

  return { start, end };
}

export function parseHighlightSpec(input: string, color: 'red' | 'green'): HighlightSpec {
  // Column range: "47:12-38"
  const colMatch = input.match(/^(\d+):(\d+)-(\d+)$/);
  if (colMatch) {
    return {
      color,
      lineStart: parseInt(colMatch[1], 10),
      lineEnd: parseInt(colMatch[1], 10),
      colStart: parseInt(colMatch[2], 10),
      colEnd: parseInt(colMatch[3], 10),
    };
  }

  // Line range: "47-50"
  const rangeMatch = input.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const lineStart = parseInt(rangeMatch[1], 10);
    const lineEnd = parseInt(rangeMatch[2], 10);
    if (lineStart > lineEnd) {
      throw new Error(`Invalid highlight range: start (${lineStart}) must be <= end (${lineEnd})`);
    }
    return { color, lineStart, lineEnd };
  }

  // Single line: "47"
  const singleMatch = input.match(/^(\d+)$/);
  if (singleMatch) {
    const line = parseInt(singleMatch[1], 10);
    return { color, lineStart: line, lineEnd: line };
  }

  throw new Error(`Invalid highlight spec: "${input}". Expected: <line>, <start>-<end>, or <line>:<colStart>-<colEnd>`);
}
