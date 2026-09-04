import { formatRanges, type LineRange } from './ranges.js';

export type MarkKind = 'red' | 'green' | 'fold';

export interface Mark {
  kind: MarkKind;
  range: LineRange;
}

/**
 * A document edit reduced to its line geometry, 0-based. [endLine] is the
 * last line the replaced range reaches; when the range ends at column 0 of
 * that line ([endAtLineStart]) the line's own text is untouched.
 * [newLineCount] is how many lines the inserted text spans (1 = no newline).
 */
export interface LineEdit {
  startLine: number;
  endLine: number;
  endAtLineStart: boolean;
  newLineCount: number;
}

/**
 * Where a marked range ends up after [edit], or null when the edit deleted
 * the marked lines outright. Marks above the edit stay put, marks below shift
 * by the line delta, and a mark the edit runs into keeps its start and grows
 * or shrinks with it — the way an editor highlighter follows the text.
 */
export function shiftRange(range: LineRange, edit: LineEdit): LineRange | null {
  const markStart = range.start - 1;
  const markEnd = range.end - 1;
  const { startLine, endLine, newLineCount } = edit;
  const delta = (newLineCount - 1) - (endLine - startLine);
  // The last line whose content the edit touched.
  const lastTouched = edit.endAtLineStart && endLine > startLine ? endLine - 1 : endLine;

  if (lastTouched < markStart) {
    return { start: range.start + delta, end: range.end + delta };
  }
  if (startLine > markEnd) return range;

  const markLines = markEnd - markStart + 1;
  if (startLine <= markStart && lastTouched >= markEnd && -delta >= markLines) return null;

  const start = Math.min(markStart, startLine);
  const end = Math.max(start, endLine <= markEnd ? markEnd + delta : startLine + newLineCount - 1);
  return { start: start + 1, end: end + 1 };
}

export function applyEdit(marks: Mark[], edit: LineEdit): Mark[] {
  const moved: Mark[] = [];
  for (const mark of marks) {
    const range = shiftRange(mark.range, edit);
    if (range) moved.push({ kind: mark.kind, range });
  }
  return moved;
}

/**
 * Remembers which lines the user marked red / green / folded, per file.
 * Marks are session-only on purpose: they describe one screenshot in
 * progress, not a property of the file.
 */
export class MarkStore {
  private readonly byFile = new Map<string, Mark[]>();

  add(file: string, mark: Mark): void {
    const marks = this.byFile.get(file) ?? [];
    marks.push(mark);
    this.byFile.set(file, marks);
  }

  /** Marked ranges of one kind, sorted by start line. */
  ranges(file: string, kind: MarkKind): LineRange[] {
    return (this.byFile.get(file) ?? [])
      .filter(m => m.kind === kind)
      .map(m => m.range)
      .sort((a, b) => a.start - b.start);
  }

  /** The same ranges as a comma-separated CLI spec, e.g. "13,15-18". */
  spec(file: string, kind: MarkKind): string {
    return formatRanges(this.ranges(file, kind));
  }

  has(file: string): boolean {
    return (this.byFile.get(file)?.length ?? 0) > 0;
  }

  clear(file: string): void {
    this.byFile.delete(file);
  }

  applyEdit(file: string, edit: LineEdit): void {
    const marks = this.byFile.get(file);
    if (!marks) return;
    this.byFile.set(file, applyEdit(marks, edit));
  }
}
