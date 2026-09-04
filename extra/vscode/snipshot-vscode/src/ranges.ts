/** A 1-based, inclusive line range, spelled the way the snipshot CLI expects. */
export interface LineRange {
  start: number;
  end: number;
}

export function formatRange(range: LineRange): string {
  return range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`;
}

/** Comma-separated, as `--lines` and the highlight flags take them. */
export function formatRanges(ranges: LineRange[]): string {
  return ranges.map(formatRange).join(',');
}

/** A 0-based editor position, as VS Code counts them. */
export interface Position {
  line: number;
  character: number;
}

/** An ordered selection: start never comes after end. */
export interface Selection {
  start: Position;
  end: Position;
}

export function isEmpty(selection: Selection): boolean {
  return selection.start.line === selection.end.line &&
    selection.start.character === selection.end.character;
}

/**
 * The lines a selection covers, 1-based. A selection ending at column 0 of a
 * later line stops on the previous line: the trailing newline was selected,
 * not the line after it.
 */
export function selectionLines(selection: Selection): LineRange {
  const start = selection.start.line + 1;
  let endLine = selection.end.line;
  if (endLine > selection.start.line && selection.end.character === 0) endLine -= 1;
  return { start, end: Math.max(start, endLine + 1) };
}

/** The range covered by the selection, or the caret line. */
export function selectionRange(selection: Selection): LineRange {
  if (isEmpty(selection)) {
    const line = selection.start.line + 1;
    return { start: line, end: line };
  }
  return selectionLines(selection);
}

/** The first and last line currently scrolled into view, over every split. */
export function visibleRange(visible: LineRange[]): LineRange {
  if (visible.length === 0) return { start: 1, end: 1 };
  return {
    start: Math.min(...visible.map(v => v.start)),
    end: Math.max(...visible.map(v => v.end)),
  };
}

/**
 * The lines to capture: one range per selection (multiple cursors give
 * multiple ranges, which snipshot folds the gaps between). With no selection
 * at all, capture what is currently visible on screen.
 */
export function captureRanges(selections: Selection[], visible: LineRange[]): LineRange[] {
  const ranges = selections
    .filter(s => !isEmpty(s))
    .map(selectionLines)
    .sort((a, b) => a.start - b.start);
  if (ranges.length > 0) return ranges;
  return [visibleRange(visible)];
}

/**
 * The visible area, widened if needed so [selection] is inside the shot.
 * Keeps "shoot the window, point at this" from producing an image whose
 * annotation is off-screen.
 */
export function windowRangeCovering(visible: LineRange, selection: LineRange): LineRange {
  return {
    start: Math.min(visible.start, selection.start),
    end: Math.max(visible.end, selection.end),
  };
}

/** A column as the CLI counts it: 0-based, with every tab expanded to 4 spaces. */
export function expandedColumn(lineText: string, character: number): number {
  let column = 0;
  for (let i = 0; i < character && i < lineText.length; i++) {
    column += lineText[i] === '\t' ? 4 : 1;
  }
  return column + Math.max(0, character - lineText.length);
}

/**
 * The selection as a snipshot highlight spec. A selection sitting inside a
 * single line becomes a column box ("47:12-38") so only those characters are
 * outlined; anything else becomes a line range.
 */
export function selectionHighlightSpec(selection: Selection, lineText: string): string {
  if (isEmpty(selection)) return '';

  const range = selectionLines(selection);
  if (selection.start.line !== selection.end.line) return formatRange(range);

  const startColumn = expandedColumn(lineText, selection.start.character);
  const endColumn = expandedColumn(lineText, selection.end.character);
  if (endColumn <= startColumn) return formatRange(range);

  const coversWholeLine = selection.start.character === 0 && selection.end.character >= lineText.length;
  if (coversWholeLine) return formatRange(range);

  // snipshot columns are 1-based and inclusive; the selection end is exclusive.
  return `${range.start}:${startColumn + 1}-${endColumn}`;
}
