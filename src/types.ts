export interface HighlightSpec {
  color: 'red' | 'green';
  lineStart: number;
  lineEnd: number;
  colStart?: number;
  colEnd?: number;
}

export interface LineRange {
  start: number;
  end: number;
}

export interface TokenInfo {
  text: string;
  color: string;
}

export type TokenizedLine = TokenInfo[];

export interface CodeShotOptions {
  filePath: string;
  /**
   * Line ranges to capture (1-based, inclusive). With several ranges, the
   * snippet spans from the first to the last; the gaps between ranges
   * (beyond each range's context lines) are automatically folded.
   */
  lineRanges: LineRange[];
  highlights: HighlightSpec[];
  outputPath: string;
  rootPath?: string;
  maxWidth?: number;
  folds?: LineRange[];
  theme?: string;
  /** Extra lines rendered before/after the captured range (clamped to file bounds). Default 3. */
  contextLines?: number;
  /**
   * Max number of rendered rows allowed (folds collapse to one row, wrapped
   * lines count each row). Throws if exceeded. `null` disables the limit.
   * Default 70.
   */
  maxLines?: number | null;
}
