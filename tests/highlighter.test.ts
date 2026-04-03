import { describe, it, expect } from 'vitest';
import { tokenizeCode } from '../src/highlighter.js';

describe('tokenizeCode', () => {
  it('tokenizes Java code into colored tokens per line', async () => {
    const code = `public class Hello {\n    public static void main(String[] args) {\n    }\n}`;
    const tokens = await tokenizeCode(code, 'java');

    expect(tokens).toHaveLength(4);
    expect(tokens[0].length).toBeGreaterThan(0);
    expect(tokens[0][0]).toHaveProperty('text');
    expect(tokens[0][0]).toHaveProperty('color');
  });

  it('tokenizes TypeScript code', async () => {
    const code = `const x: number = 42;\nconsole.log(x);`;
    const tokens = await tokenizeCode(code, 'typescript');

    expect(tokens).toHaveLength(2);
    expect(tokens[0].some(t => t.text.includes('const'))).toBe(true);
  });

  it('preserves all text content across tokens', async () => {
    const code = `function hello() { return "world"; }`;
    const tokens = await tokenizeCode(code, 'javascript');

    const reconstructed = tokens[0].map(t => t.text).join('');
    expect(reconstructed).toBe(code);
  });

  it('returns valid hex colors for tokens', async () => {
    const code = `const x = 1;`;
    const tokens = await tokenizeCode(code, 'javascript');

    for (const token of tokens[0]) {
      expect(token.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
