import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPage, previousPageAfterDelete } from '../src/utils/pagination.js';

for (const [count, visible, hasNext] of [[29, 29, false], [30, 30, false], [31, 30, true], [60, 30, true]]) {
  test(`pagination handles ${count} fetched rows`, () => {
    const page = splitPage(Array.from({ length: count }, (_, id) => ({ id })), 30);
    assert.equal(page.rows.length, visible);
    assert.equal(page.hasNext, hasNext);
  });
}

test('a deletion that empties the last page returns to the previous offset', () => {
  assert.equal(previousPageAfterDelete({ offset: 30, pageSize: 30, remainingRows: 0 }), 0);
  assert.equal(previousPageAfterDelete({ offset: 30, pageSize: 30, remainingRows: 2 }), 30);
});
