import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { defaultOutputName, mergeSpecs, retargetExtension, toCommandArgs, type SnipshotRequest } from '../src/request.js';

const base: SnipshotRequest = {
  filePath: '/work/src/App.java',
  lines: '40-60',
  red: '',
  green: '',
  folds: '',
  theme: 'dark',
  contextLines: 3,
  maxWidth: 800,
  maxLines: 70,
  svg: false,
  outputPath: '/work/App_L40-60.png',
  rootPath: '/work',
};

describe('toCommandArgs', () => {
  it('mirrors the plugin flag for flag, in the same order', () => {
    assert.deepEqual(toCommandArgs({ ...base, red: '47', green: '52-55', folds: '1-10' }), [
      '/work/src/App.java', '--lines', '40-60',
      '--highlight-red', '47', '--highlight-green', '52-55', '--fold', '1-10',
      '--theme', 'dark', '--context', '3', '--max-width', '800', '--max-lines', '70',
      '--root', '/work', '--output', '/work/App_L40-60.png',
    ]);
  });

  it('omits empty specs and the root, and spells zero limits as --no-* flags', () => {
    assert.deepEqual(toCommandArgs({ ...base, maxWidth: 0, maxLines: 0, svg: true, rootPath: undefined }), [
      '/work/src/App.java', '--lines', '40-60',
      '--theme', 'dark', '--context', '3', '--no-max-width', '--no-max-lines', '--svg',
      '--output', '/work/App_L40-60.png',
    ]);
  });
});

describe('mergeSpecs', () => {
  it('joins the non-blank specs with commas', () => {
    assert.equal(mergeSpecs('13,15-18', '', '  ', '47:12-38'), '13,15-18,47:12-38');
    assert.equal(mergeSpecs('', ''), '');
  });
});

describe('defaultOutputName', () => {
  it('is <name>_L<ranges>.<ext>, with + between ranges like the CLI', () => {
    assert.equal(defaultOutputName('/work/src/App.java', '40-60', false), 'App_L40-60.png');
    assert.equal(defaultOutputName('/work/src/App.java', '3-5,39-42', true), 'App_L3-5+39-42.svg');
  });
});

describe('retargetExtension', () => {
  it('swaps the extension when the format changes and leaves other paths alone', () => {
    assert.equal(retargetExtension('/x/shot.png', true), '/x/shot.svg');
    assert.equal(retargetExtension('/x/shot.SVG', false), '/x/shot.png');
    assert.equal(retargetExtension('/x/shot.png', false), '/x/shot.png');
    assert.equal(retargetExtension('/x/custom.out', true), '/x/custom.out');
  });
});
