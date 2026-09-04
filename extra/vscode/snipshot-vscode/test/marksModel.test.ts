import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { MarkStore, shiftRange, type LineEdit } from '../src/marksModel.js';

// 0-based edit geometry, like VS Code's content changes.
const edit = (startLine: number, endLine: number, endAtLineStart: boolean, newLineCount: number): LineEdit =>
  ({ startLine, endLine, endAtLineStart, newLineCount });

describe('shiftRange', () => {
  const mark = { start: 10, end: 12 }; // lines 10-12, 0-based 9-11

  it('shifts a mark below an insertion', () => {
    assert.deepEqual(shiftRange(mark, edit(2, 2, true, 3)), { start: 12, end: 14 });
  });

  it('shifts a mark up when lines above it are deleted', () => {
    assert.deepEqual(shiftRange(mark, edit(2, 5, true, 1)), { start: 7, end: 9 });
  });

  it('leaves a mark above an edit alone', () => {
    assert.deepEqual(shiftRange(mark, edit(20, 25, false, 1)), mark);
  });

  it('keeps a mark whose lines are only typed on', () => {
    assert.deepEqual(shiftRange(mark, edit(10, 10, false, 1)), mark);
  });

  it('grows a mark when lines are inserted inside it', () => {
    assert.deepEqual(shiftRange(mark, edit(10, 10, false, 3)), { start: 10, end: 14 });
  });

  it('shrinks a mark when a newline inside it is deleted', () => {
    assert.deepEqual(shiftRange(mark, edit(9, 10, true, 1)), { start: 10, end: 11 });
  });

  it('follows the join when the newline before the mark is deleted', () => {
    assert.deepEqual(shiftRange({ start: 10, end: 10 }, edit(8, 9, true, 1)), { start: 9, end: 9 });
  });

  it('drops a mark whose lines are deleted outright', () => {
    assert.equal(shiftRange(mark, edit(9, 12, true, 1)), null);
    assert.equal(shiftRange({ start: 10, end: 10 }, edit(9, 10, true, 1)), null);
  });

  it('clips a mark cut from the middle to below', () => {
    assert.deepEqual(shiftRange(mark, edit(10, 15, false, 1)), { start: 10, end: 11 });
  });
});

describe('MarkStore', () => {
  it('keeps marks per file, sorted, and spells them as CLI specs', () => {
    const store = new MarkStore();
    store.add('/a.ts', { kind: 'red', range: { start: 47, end: 47 } });
    store.add('/a.ts', { kind: 'green', range: { start: 52, end: 55 } });
    store.add('/a.ts', { kind: 'red', range: { start: 13, end: 18 } });
    store.add('/b.ts', { kind: 'fold', range: { start: 1, end: 9 } });

    assert.equal(store.spec('/a.ts', 'red'), '13-18,47');
    assert.equal(store.spec('/a.ts', 'green'), '52-55');
    assert.equal(store.spec('/a.ts', 'fold'), '');
    assert.equal(store.spec('/b.ts', 'fold'), '1-9');
    assert.equal(store.has('/a.ts'), true);
    assert.equal(store.has('/c.ts'), false);
  });

  it('clears one file only', () => {
    const store = new MarkStore();
    store.add('/a.ts', { kind: 'red', range: { start: 1, end: 1 } });
    store.add('/b.ts', { kind: 'red', range: { start: 1, end: 1 } });
    store.clear('/a.ts');
    assert.equal(store.has('/a.ts'), false);
    assert.equal(store.has('/b.ts'), true);
  });

  it('moves marks with edits and forgets deleted ones', () => {
    const store = new MarkStore();
    store.add('/a.ts', { kind: 'red', range: { start: 10, end: 12 } });
    store.add('/a.ts', { kind: 'green', range: { start: 30, end: 30 } });
    store.applyEdit('/a.ts', edit(0, 0, true, 2));      // one line inserted at the top
    store.applyEdit('/a.ts', edit(30, 31, true, 1));    // the (shifted) green line deleted
    assert.equal(store.spec('/a.ts', 'red'), '11-13');
    assert.equal(store.spec('/a.ts', 'green'), '');
  });
});
