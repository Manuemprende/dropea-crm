import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfirmation } from '../server/landing-flow.js';

test('parseConfirmation recognizes option numbers like 1, 2, pedido 1, confirmo 2', () => {
  assert.deepEqual(parseConfirmation('1'), { action: 'CONFIRMO', code: null, optionIndex: 1 });
  assert.deepEqual(parseConfirmation('2'), { action: 'CONFIRMO', code: null, optionIndex: 2 });
  assert.deepEqual(parseConfirmation('pedido 1'), { action: 'CONFIRMO', code: null, optionIndex: 1 });
  assert.deepEqual(parseConfirmation('confirmo 2'), { action: 'CONFIRMO', code: null, optionIndex: 2 });
  assert.deepEqual(parseConfirmation('si 1'), { action: 'CONFIRMO', code: null, optionIndex: 1 });
  assert.deepEqual(parseConfirmation('cancelar 1'), { action: 'CANCELAR', code: null, optionIndex: 1 });
});

test('parseConfirmation recognizes standalone hex codes like #78F13CA9', () => {
  assert.deepEqual(parseConfirmation('#78F13CA9'), { action: 'CONFIRMO', code: '78F13CA9', optionIndex: null });
  assert.deepEqual(parseConfirmation('78f13ca9'), { action: 'CONFIRMO', code: '78F13CA9', optionIndex: null });
  assert.deepEqual(parseConfirmation('confirmo #78F13CA9'), { action: 'CONFIRMO', code: '78F13CA9', optionIndex: null });
  assert.deepEqual(parseConfirmation('cancelar #78F13CA9'), { action: 'CANCELAR', code: '78F13CA9', optionIndex: null });
});
