import { describe, it, expect } from 'vitest';
import { parseLineRange, parseHighlightSpec } from '../src/parser.js';

describe('parseLineRange', () => {
  it('parses "42-56" into start=42, end=56', () => {
    expect(parseLineRange('42-56')).toEqual({ start: 42, end: 56 });
  });

  it('parses single line "42" into start=42, end=42', () => {
    expect(parseLineRange('42')).toEqual({ start: 42, end: 42 });
  });

  it('throws on invalid input "abc"', () => {
    expect(() => parseLineRange('abc')).toThrow();
  });

  it('throws when start > end', () => {
    expect(() => parseLineRange('56-42')).toThrow();
  });
});

describe('parseHighlightSpec', () => {
  it('parses single line "47" as full-line highlight', () => {
    expect(parseHighlightSpec('47', 'red')).toEqual({
      color: 'red',
      lineStart: 47,
      lineEnd: 47,
    });
  });

  it('parses line range "47-50" as multi-line highlight', () => {
    expect(parseHighlightSpec('47-50', 'green')).toEqual({
      color: 'green',
      lineStart: 47,
      lineEnd: 50,
    });
  });

  it('parses column range "47:12-38" as column highlight', () => {
    expect(parseHighlightSpec('47:12-38', 'red')).toEqual({
      color: 'red',
      lineStart: 47,
      lineEnd: 47,
      colStart: 12,
      colEnd: 38,
    });
  });

  it('throws on invalid spec "abc"', () => {
    expect(() => parseHighlightSpec('abc', 'red')).toThrow();
  });
});
