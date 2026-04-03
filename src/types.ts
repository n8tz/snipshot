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
  lineRange: LineRange;
  highlights: HighlightSpec[];
  outputPath: string;
  rootPath?: string;
}
