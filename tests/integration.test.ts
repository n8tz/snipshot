import { describe, it, expect, afterEach } from 'vitest';
import { generateCodeShot } from '../src/pipeline.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_JAVA = join(__dirname, 'fixtures/sample.java');
const FIXTURE_TS = join(__dirname, 'fixtures/sample.ts');

describe('generateCodeShot', () => {
  const outputs: string[] = [];

  afterEach(() => {
    for (const f of outputs) {
      if (existsSync(f)) unlinkSync(f);
    }
    outputs.length = 0;
  });

  it('generates a PNG from a Java file', async () => {
    const output = join(__dirname, 'test-output-java.png');
    outputs.push(output);

    const result = await generateCodeShot({
      filePath: FIXTURE_JAVA,
      lineRange: { start: 6, end: 14 },
      highlights: [],
      outputPath: output,
    });

    expect(existsSync(result)).toBe(true);
    const buf = readFileSync(result);
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
  });

  it('generates a PNG from a TypeScript file with highlights', async () => {
    const output = join(__dirname, 'test-output-ts.png');
    outputs.push(output);

    const result = await generateCodeShot({
      filePath: FIXTURE_TS,
      lineRange: { start: 1, end: 10 },
      highlights: [
        { color: 'red', lineStart: 3, lineEnd: 3 },
        { color: 'green', lineStart: 7, lineEnd: 7, colStart: 3, colEnd: 20 },
      ],
      outputPath: output,
    });

    expect(existsSync(result)).toBe(true);
    const buf = readFileSync(result);
    expect(buf.length).toBeGreaterThan(500);
  });

  it('throws on out-of-bounds line range', async () => {
    const output = join(__dirname, 'test-output-oob.png');
    outputs.push(output);

    await expect(
      generateCodeShot({
        filePath: FIXTURE_JAVA,
        lineRange: { start: 1, end: 9999 },
        highlights: [],
        outputPath: output,
      })
    ).rejects.toThrow('out of bounds');
  });
});
