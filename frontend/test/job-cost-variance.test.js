import test from 'node:test';
import assert from 'node:assert/strict';
import { getCostVariancePresentation } from '../src/utils/jobCostVariance.js';

test('positive cost variance is an unfavorable overrun', () => {
  assert.deepEqual(getCostVariancePresentation(100), { className: 'negative', icon: '▲', label: 'Sforamento costi' });
});

test('negative cost variance is a favorable saving', () => {
  assert.deepEqual(getCostVariancePresentation(-100), { className: 'positive', icon: '▼', label: 'Risparmio sui costi' });
});

test('zero cost variance is neutral and explicit', () => {
  assert.deepEqual(getCostVariancePresentation(0), { className: 'neutral', icon: '●', label: 'Costi in linea con il previsto' });
});
