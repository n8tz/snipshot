import { describe, it, expect } from 'vitest';
import { renderCode } from '../src/renderer.js';
import type { TokenizedLine, HighlightSpec } from '../src/types.js';

describe('renderCode', () => {
  const sampleTokens: TokenizedLine[] = [
    [{ text: 'public ', color: '#c678dd' }, { text: 'class ', color: '#c678dd' }, { text: 'Hello', color: '#e5c07b' }],
    [{ text: '    ', color: '#abb2bf' }, { text: 'int', color: '#c678dd' }, { text: ' x = ', color: '#abb2bf' }, { text: '42', color: '#d19a66' }, { text: ';', color: '#abb2bf' }],
    [{ text: '}', color: '#abb2bf' }],
  ];

  it('returns a PNG buffer', async () => {
    const buf = await renderCode({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
    });

    expect(buf).toBeInstanceOf(Buffer);
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it('produces a buffer with non-zero size', async () => {
    const buf = await renderCode({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights: [],
    });

    expect(buf.length).toBeGreaterThan(100);
  });

  it('handles highlights without crashing', async () => {
    const highlights: HighlightSpec[] = [
      { color: 'red', lineStart: 1, lineEnd: 1 },
      { color: 'green', lineStart: 2, lineEnd: 2, colStart: 5, colEnd: 8 },
    ];

    const buf = await renderCode({
      tokenizedLines: sampleTokens,
      startLine: 1,
      endLine: 3,
      relativePath: 'src/Hello.java',
      highlights,
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(100);
  });

  it('handles empty lines', async () => {
    const tokensWithEmpty: TokenizedLine[] = [
      [{ text: 'line1', color: '#abb2bf' }],
      [],
      [{ text: 'line3', color: '#abb2bf' }],
    ];

    const buf = await renderCode({
      tokenizedLines: tokensWithEmpty,
      startLine: 10,
      endLine: 12,
      relativePath: 'test.ts',
      highlights: [],
    });

    expect(buf).toBeInstanceOf(Buffer);
  });
});
