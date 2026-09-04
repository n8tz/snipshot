import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  captureRanges, expandedColumn, formatRange, formatRanges, selectionHighlightSpec,
  selectionLines, selectionRange, visibleRange, windowRangeCovering, type Selection,
} from '../src/ranges.js';

const sel = (l1: number, c1: number, l2: number, c2: number): Selection =>
  ({ start: { line: l1, character: c1 }, end: { line: l2, character: c2 } });

describe('formatRange', () => {
  it('spells a single line and a range the way the CLI wants them', () => {
    assert.equal(formatRange({ start: 47, end: 47 }), '47');
    assert.equal(formatRange({ start: 47, end: 50 }), '47-50');
    assert.equal(formatRanges([{ start: 3, end: 5 }, { start: 39, end: 42 }]), '3-5,39-42');
  });
});

describe('selectionLines', () => {
  it('converts 0-based lines to 1-based', () => {
    assert.deepEqual(selectionLines(sel(9, 4, 12, 7)), { start: 10, end: 13 });
  });

  it('stops on the previous line when the selection ends at column 0', () => {
    assert.deepEqual(selectionLines(sel(9, 0, 12, 0)), { start: 10, end: 12 });
  });

  it('never ends before it starts', () => {
    assert.deepEqual(selectionLines(sel(9, 0, 10, 0)), { start: 10, end: 10 });
  });
});

describe('selectionRange', () => {
  it('is the caret line when nothing is selected', () => {
    assert.deepEqual(selectionRange(sel(4, 8, 4, 8)), { start: 5, end: 5 });
  });

  it('is the selected lines otherwise', () => {
    assert.deepEqual(selectionRange(sel(4, 8, 6, 1)), { start: 5, end: 7 });
  });
});

describe('captureRanges', () => {
  const visible = [{ start: 20, end: 60 }];

  it('gives one range per non-empty selection, sorted by start', () => {
    const ranges = captureRanges([sel(40, 0, 43, 5), sel(10, 0, 12, 0), sel(50, 3, 50, 3)], visible);
    assert.deepEqual(ranges, [{ start: 11, end: 12 }, { start: 41, end: 44 }]);
  });

  it('falls back to the visible area, merged across split views', () => {
    assert.deepEqual(captureRanges([sel(1, 1, 1, 1)], [{ start: 20, end: 30 }, { start: 40, end: 60 }]), [{ start: 20, end: 60 }]);
  });

  it('is line 1 with nothing visible at all', () => {
    assert.deepEqual(visibleRange([]), { start: 1, end: 1 });
  });
});

describe('windowRangeCovering', () => {
  it('widens the visible area to keep the selection in frame', () => {
    assert.deepEqual(windowRangeCovering({ start: 20, end: 60 }, { start: 58, end: 70 }), { start: 20, end: 70 });
    assert.deepEqual(windowRangeCovering({ start: 20, end: 60 }, { start: 30, end: 31 }), { start: 20, end: 60 });
  });
});

describe('expandedColumn', () => {
  it('counts each tab as four columns, as the CLI expands them', () => {
    assert.equal(expandedColumn('\t\tfoo', 2), 8);
    assert.equal(expandedColumn('\t\tfoo', 4), 10);
    assert.equal(expandedColumn('abc', 2), 2);
  });
});

describe('selectionHighlightSpec', () => {
  it('is empty without a selection', () => {
    assert.equal(selectionHighlightSpec(sel(46, 3, 46, 3), 'anything'), '');
  });

  it('boxes the characters of a selection inside one line, 1-based inclusive', () => {
    // characters 11..37 (0-based, end exclusive) → columns 12-38
    assert.equal(selectionHighlightSpec(sel(46, 11, 46, 38), 'x'.repeat(60)), '47:12-38');
  });

  it('shifts the columns past tabs', () => {
    assert.equal(selectionHighlightSpec(sel(0, 1, 0, 4), '\tfoo bar'), '1:5-7');
  });

  it('is the line when the selection covers it', () => {
    assert.equal(selectionHighlightSpec(sel(46, 0, 46, 5), 'hello'), '47');
  });

  it('is the line range when the selection spans lines', () => {
    assert.equal(selectionHighlightSpec(sel(46, 3, 48, 0), 'first line'), '47-48');
  });
});
