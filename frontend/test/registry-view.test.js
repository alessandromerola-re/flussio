import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCategoryRows, filterRegistryItems } from '../src/utils/registryView.js';

test('buildCategoryRows preserves an arbitrary-depth hierarchy', () => {
  const rows = buildCategoryRows([
    { id: 3, name: 'Manutenzione ordinaria', parent_id: 2 },
    { id: 1, name: 'Immobili', parent_id: null },
    { id: 2, name: 'Costi', parent_id: 1 },
  ]);

  assert.deepEqual(rows.map(({ id, depth, path }) => ({ id, depth, path })), [
    { id: 1, depth: 0, path: 'Immobili' },
    { id: 2, depth: 1, path: 'Immobili / Costi' },
    { id: 3, depth: 2, path: 'Immobili / Costi / Manutenzione ordinaria' },
  ]);
});

test('filterRegistryItems searches references and filters inactive records', () => {
  const items = [
    { id: 1, name: 'Appartamento Centro', external_id: 'IMM-000001', contact_id: 9, is_active: true },
    { id: 2, name: 'Box', external_id: 'IMM-000002', is_active: false },
  ];
  const contacts = [{ id: 9, name: 'Mario Rossi' }];

  assert.deepEqual(filterRegistryItems({ items, tab: 'properties', search: 'rossi', contacts }).map((item) => item.id), [1]);
  assert.deepEqual(filterRegistryItems({ items, tab: 'properties', status: 'inactive' }).map((item) => item.id), [2]);
});
