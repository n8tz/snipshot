import { test } from 'node:test';
import * as assert from 'node:assert/strict';

test('the test runner runs compiled tests', () => {
  assert.equal(1 + 1, 2);
});
