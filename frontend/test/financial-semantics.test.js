import test from 'node:test';
import assert from 'node:assert/strict';
import { financialDeltaClass, financialDeltaLabel } from '../src/utils/financialSemantics.js';

test('income increase is favorable and decrease is unfavorable', () => {
  assert.match(financialDeltaClass(5), /positive/);
  assert.match(financialDeltaLabel(5, '+5.0%'), /favorevole/);
  assert.match(financialDeltaClass(-5), /negative/);
});

test('expense increase is economically unfavorable', () => {
  assert.match(financialDeltaClass(5, true), /negative/);
  assert.match(financialDeltaLabel(5, '+5.0%', true), /sfavorevole/);
  assert.match(financialDeltaClass(-5, true), /positive/);
});

test('neutral and unavailable states are explicit', () => {
  assert.match(financialDeltaClass(0), /neutral/);
  assert.match(financialDeltaLabel(0, '0.0%'), /Invariato/);
  assert.equal(financialDeltaLabel(null, '—'), 'Confronto non disponibile');
});
