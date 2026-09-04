import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { renderCode } from '../src/renderer.js';
import { HEADER_HEIGHT, LINE_HEIGHT } from '../src/layout.js';
import type { TokenizedLine, HighlightSpec } from '../src/types.js';

/** Vertical midpoint of the bright pixels in one column of a PNG. */
async function inkMiddle(png: Buffer, x: number, top: number, height: number): Promise<number> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(x, top, 1, height).data;
  // Ink = anything that is not the background this column starts with.
  const background = data[0];
  const ink: number[] = [];
  for (let i = 0; i < height; i++) if (Math.abs(data[i * 4] - background) > 40) ink.push(i);
  expect(ink.length).toBeGreaterThan(8);
  return top + (ink[0] + ink[ink.length - 1]) / 2;
}

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

  it('centres text in its row the way the header is centred (and the SVG is)', async () => {
    // The same full-block glyph in the header (drawn centred) and in a code
    // row must sit at the same offset from its row's centre; otherwise the
    // highlight bands look shifted against the text.
    const buf = await renderCode({
      tokenizedLines: [[{ text: '\u2588', color: '#ffffff' }]],
      startLine: 1,
      endLine: 1,
      relativePath: '\u2588',
      highlights: [],
    });

    // Header glyph starts at PADDING_X (16); the code glyph after the gutter
    // (8.4 + 24) + separator (1) + padding (16) = 49.4. Sample mid-glyph.
    const headerOffset = await inkMiddle(buf, 20, 0, HEADER_HEIGHT) - HEADER_HEIGHT / 2;
    const rowOffset = await inkMiddle(buf, 53, HEADER_HEIGHT, LINE_HEIGHT) - (HEADER_HEIGHT + LINE_HEIGHT / 2);
    // Anchoring at the top of the em box put the glyphs 1.4px high; centred
    // text agrees with the header to the pixel.
    expect(Math.abs(rowOffset - headerOffset)).toBeLessThanOrEqual(0.5);
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
