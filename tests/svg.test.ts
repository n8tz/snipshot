import { describe, it, expect, afterEach } from 'vitest';
import { renderSvg } from '../src/svg.js';
import { generateCodeShotSvg } from '../src/pipeline.js';
import { THEMES } from '../src/themes.js';
import type { TokenizedLine } from '../src/types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_TS = join(__dirname, 'fixtures/sample.ts');

describe('renderSvg', () => {
  const sampleTokens: TokenizedLine[] = [
    [{ text: 'public ', color: '#c678dd' }, { text: 'class ', color: '#c678dd' }, { text: 'Hello', color: '#e5c07b' }],
    [{ text: '    ', color: '#abb2bf' }, { text: 'int', color: '#c678dd' }, { text: ' x = ', color: '#abb2bf' }, { text: '42', color: '#d19a66' }, { text: ';', color: '#abb2bf' }],
    [{ text: '}', color: '#abb2bf' }],
  ];

  it('produces a valid SVG document with header, line numbers and code', () => {
    const out = renderSvg({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
    });

    expect(out).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(out.trimEnd()).toMatch(/<\/svg>$/);
    expect(out).toContain('src/Hello.java');
    expect(out).toContain('Hello</text>');
    expect(out).toContain('>1</text>');
    expect(out).toContain('>3</text>');
    // Theme background
    expect(out).toContain(`fill="${THEMES.dark.bg}"`);
  });

  it('escapes XML special characters', () => {
    const out = renderSvg({
      tokenizedLines: [[{ text: 'if (a < b && c > d)', color: '#abb2bf' }]],
      startLine: 1,
      endLine: 1,
      relativePath: 'x.ts',
      highlights: [],
    });

    expect(out).toContain('a &lt; b &amp;&amp; c &gt; d');
  });

  it('draws full-line highlights as background rects with a left bar', () => {
    const out = renderSvg({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [{ color: 'red', lineStart: 2, lineEnd: 2 }],
    });

    expect(out).toContain(`fill="${THEMES.dark.highlight.red.bg}"`);
    expect(out).toContain(`fill="${THEMES.dark.highlight.red.border}"`);
  });

  it('draws column highlights as stroked boxes', () => {
    const out = renderSvg({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [{ color: 'green', lineStart: 2, lineEnd: 2, colStart: 5, colEnd: 7 }],
    });

    expect(out).toContain(`stroke="${THEMES.dark.highlight.green.border}"`);
  });

  it('collapses folded ranges into a single indicator row', () => {
    const out = renderSvg({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
      folds: [{ start: 1, end: 2 }],
    });

    expect(out).toContain('2 lines folded');
    expect(out).not.toContain('Hello</text>');
  });

  it('wraps long lines at maxWidth with a continuation indicator', () => {
    const longLine: TokenizedLine = [{ text: 'x'.repeat(300), color: '#abb2bf' }];
    const out = renderSvg({
      tokenizedLines: [longLine],
      startLine: 1,
      endLine: 1,
      relativePath: 'x.ts',
      highlights: [],
      maxWidth: 400,
    });

    expect(out).toContain('↳');
    expect(out).toContain('width="400"');
  });

  it('enforces the max rendered-rows limit', () => {
    expect(() => renderSvg({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
      maxLines: 2,
    })).toThrow(/over the 2-line limit/);
  });
});

describe('generateCodeShotSvg', () => {
  const outputs: string[] = [];

  afterEach(() => {
    for (const f of outputs) {
      if (existsSync(f)) unlinkSync(f);
    }
    outputs.length = 0;
  });

  it('writes an SVG file end-to-end', async () => {
    const output = join(__dirname, 'test-output.svg');
    outputs.push(output);

    const result = await generateCodeShotSvg({
      filePath: FIXTURE_TS,
      lineRanges: [{ start: 1, end: 10 }],
      highlights: [{ color: 'red', lineStart: 3, lineEnd: 3 }],
      outputPath: output,
    });

    expect(existsSync(result)).toBe(true);
    const content = readFileSync(result, 'utf-8');
    expect(content).toContain('<svg');
    expect(content).toContain('sample.ts');
  });
});
