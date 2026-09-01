import { describe, it, expect, afterEach } from 'vitest';
import { generateCodeShotAnsi, generateCodeShotSvg } from '../src/pipeline.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_TS = join(__dirname, 'fixtures/sample.ts'); // 25 lines

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('multiple --lines ranges', () => {
  it('captures several ranges and folds the gap between them', async () => {
    const out = stripAnsi(await generateCodeShotAnsi({
      filePath: FIXTURE_TS,
      lineRanges: [{ start: 1, end: 3 }, { start: 20, end: 22 }],
      highlights: [],
      outputPath: '',
      contextLines: 0,
    }));

    // Both ranges are visible
    expect(out).toContain('interface User');
    expect(out).toContain('const response');
    // The 16-line gap (4-19) is folded
    expect(out).toContain('16 lines folded');
    expect(out).not.toContain('validateUser');
    // Line numbers from both ranges
    expect(out).toContain(' 1 │ ');
    expect(out).toContain('22 │ ');
  });

  it('keeps context lines around each range', async () => {
    const out = stripAnsi(await generateCodeShotAnsi({
      filePath: FIXTURE_TS,
      lineRanges: [{ start: 1, end: 3 }, { start: 20, end: 22 }],
      highlights: [],
      outputPath: '',
      contextLines: 2,
    }));

    // Context after the first range (lines 4-5) and before the second (18-19)
    expect(out).toContain(' 5 │ ');
    expect(out).toContain('19 │ ');
    // The remaining gap (6-17) is folded
    expect(out).toContain('12 lines folded');
    // Context after the last range (23-24)
    expect(out).toContain('24 │ ');
  });

  it('merges overlapping and unsorted ranges, showing tiny gaps instead of folding them', async () => {
    const out = stripAnsi(await generateCodeShotAnsi({
      filePath: FIXTURE_TS,
      lineRanges: [{ start: 10, end: 12 }, { start: 1, end: 5 }, { start: 4, end: 8 }],
      highlights: [],
      outputPath: '',
      contextLines: 0,
    }));

    // 1-5 and 4-8 merge into 1-8; the single-line gap (9) is shown, not folded
    expect(out).toContain(' 9 │ ');
    expect(out).not.toContain('folded');
    expect(out).toContain('12 │ ');
  });

  it('throws when any range is out of bounds', async () => {
    await expect(generateCodeShotAnsi({
      filePath: FIXTURE_TS,
      lineRanges: [{ start: 1, end: 3 }, { start: 30, end: 40 }],
      highlights: [],
      outputPath: '',
    })).rejects.toThrow(/30-40 is out of bounds/);
  });

  it('throws when no range is given', async () => {
    await expect(generateCodeShotAnsi({
      filePath: FIXTURE_TS,
      lineRanges: [],
      highlights: [],
      outputPath: '',
    })).rejects.toThrow(/At least one line range/);
  });

  describe('default output filename', () => {
    const outputs: string[] = [];

    afterEach(() => {
      for (const f of outputs) {
        if (existsSync(f)) unlinkSync(f);
      }
      outputs.length = 0;
    });

    it('joins the ranges with "+" for multi-range captures', async () => {
      const result = await generateCodeShotSvg({
        filePath: FIXTURE_TS,
        lineRanges: [{ start: 1, end: 3 }, { start: 20, end: 22 }],
        highlights: [],
        outputPath: '',
      });
      outputs.push(result);

      expect(result.endsWith('sample_L1-3+20-22.svg')).toBe(true);
      expect(existsSync(result)).toBe(true);
    });
  });
});
