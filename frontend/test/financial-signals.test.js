import test from 'node:test';
import assert from 'node:assert/strict';
import { signalForDelta } from '../src/utils/financialSignals.js';

test('financial signals include color class and textual meaning', () => {
  assert.deepEqual(signalForDelta(10), { className: 'positive', label: 'miglioramento' });
  assert.deepEqual(signalForDelta(0), { className: 'neutral', label: 'invariato' });
  assert.deepEqual(signalForDelta(10, { inverse: true }), { className: 'negative', label: 'peggioramento' });
});
