import { describe, it, expect } from 'vitest';
import { renderAnsi } from '../src/ansi.js';
import { generateCodeShotAnsi } from '../src/pipeline.js';
import { THEMES } from '../src/themes.js';
import type { TokenizedLine } from '../src/types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_TS = join(__dirname, 'fixtures/sample.ts');

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, '');

describe('renderAnsi', () => {
  const sampleTokens: TokenizedLine[] = [
    [{ text: 'public ', color: '#c678dd' }, { text: 'class ', color: '#c678dd' }, { text: 'Hello', color: '#e5c07b' }],
    [{ text: '    ', color: '#abb2bf' }, { text: 'int', color: '#c678dd' }, { text: ' x = ', color: '#abb2bf' }, { text: '42', color: '#d19a66' }, { text: ';', color: '#abb2bf' }],
    [{ text: '}', color: '#abb2bf' }],
  ];

  it('renders the code text with ANSI colors, line numbers and header', () => {
    const out = renderAnsi({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
    });

    // Contains truecolor escapes
    expect(out).toContain('\x1b[38;2;');
    const plain = stripAnsi(out);
    expect(plain).toContain('src/Hello.java');
    expect(plain).toContain('public class Hello');
    expect(plain).toContain('1 │ ');
    expect(plain).toContain('3 │ ');
    // Every line resets its attributes
    for (const line of out.trimEnd().split('\n')) {
      expect(line.endsWith('\x1b[0m')).toBe(true);
    }
  });

  it('numbers lines from the original file', () => {
    const out = stripAnsi(renderAnsi({
      tokenizedLines: sampleTokens,
      startLine: 2,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
    }));

    expect(out).toContain('2 │ ');
    expect(out).toContain('3 │ ');
    expect(out).not.toContain('1 │ ');
  });

  it('applies a background to full-line highlights', () => {
    const out = renderAnsi({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [{ color: 'red', lineStart: 2, lineEnd: 2 }],
    });

    expect(out).toContain('\x1b[48;2;'); // background escape
    expect(stripAnsi(out)).toContain('▎'); // left bar on the highlighted line
  });

  it('underlines column highlights', () => {
    const out = renderAnsi({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [{ color: 'green', lineStart: 2, lineEnd: 2, colStart: 5, colEnd: 7 }],
    });

    expect(out).toContain('\x1b[4m');   // underline on
    expect(out).toContain('\x1b[48;2;'); // tinted background
  });

  it('collapses folded ranges into a single indicator row', () => {
    const out = stripAnsi(renderAnsi({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
      folds: [{ start: 1, end: 2 }],
    }));

    expect(out).toContain('2 lines folded');
    expect(out).not.toContain('public class Hello');
    expect(out).toContain('}');
  });

  it('expands tabs to 4 spaces', () => {
    const out = stripAnsi(renderAnsi({
      tokenizedLines: [[{ text: '\tfoo', color: '#abb2bf' }]],
      startLine: 1,
      endLine: 1,
      relativePath: 'x.txt',
      highlights: [],
    }));

    expect(out).toContain('    foo');
    expect(out).not.toContain('\t');
  });

  it('enforces the max rendered-rows limit', () => {
    expect(() => renderAnsi({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
      maxLines: 2,
    })).toThrow(/over the 2-line limit/);
  });

  it('respects the light theme colors', () => {
    const out = renderAnsi({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
      theme: THEMES.light,
    });

    // Light header text color (#696c77 → 105;108;119)
    expect(out).toContain('\x1b[38;2;105;108;119m');
  });
});

describe('generateCodeShotAnsi', () => {
  it('renders a fixture file end-to-end with syntax colors', async () => {
    const out = await generateCodeShotAnsi({
      filePath: FIXTURE_TS,
      lineRange: { start: 1, end: 10 },
      highlights: [{ color: 'red', lineStart: 3, lineEnd: 3 }],
      outputPath: '',
    });

    expect(out).toContain('\x1b[38;2;');
    expect(out).toContain('\x1b[48;2;');
    expect(stripAnsi(out)).toContain('sample.ts');
  });

  it('throws on out-of-bounds line range', async () => {
    await expect(generateCodeShotAnsi({
      filePath: FIXTURE_TS,
      lineRange: { start: 1, end: 99999 },
      highlights: [],
      outputPath: '',
    })).rejects.toThrow(/out of bounds/);
  });
});
